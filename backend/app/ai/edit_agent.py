"""
Conversation orchestration for the "edit this product by chatting with it"
feature — a companion to agent.py's new-product flow, but for a product that
already exists. Same stateless design (plans/09 §8): the browser resends the
chat history each turn.

The safety model is different from the draft agent on purpose: drafting a
NEW product from a photo has fields nothing but the owner can know (price,
stock, material) and fields the model must never infer from an image (care
claims, material). Editing an EXISTING product is the owner directly
instructing changes in their own words — there's no photo involved and every
field is already a known, real value, so the risk isn't "the model invents a
fact," it's "the model changes something the owner didn't ask about" or
"the model targets a variant/option that doesn't actually exist." The
constraints below guard against exactly those two failure modes, and nothing
here is ever auto-applied — the admin UI always shows the proposal as a diff
the owner must explicitly confirm before any write happens.
"""
from sqlalchemy.orm import Session

from ..models import Product
from .agent import CATEGORIES, dedupe_sku, existing_collections
from .edit_models import EditProposal, EditTurnOut
from .edit_schema import EDIT_TURN_RESPONSE_SCHEMA
from .provider import generate_turn, text_part

SYSTEM_PROMPT = """You are helping the owner of Mayra Store, a small jewellery shop, edit ONE existing product listing by chatting in plain language. You are not drafting anything new — every field below already has a real, live value, and past orders already snapshot the old values, so nothing is destroyed by a change.

## The current product (ground truth — do not guess any of this)
- id: {product_id}
- name: {name}
- category: {category}
- collection: {collection}
- basePrice: Rs {base_price}
- material: {material}
- blurb: {blurb}
- care: {care}
- isFeatured: {is_featured}
- isActive: {is_active}
- options (axes, in order): {options}
- variants (existing — variantId, current values, sku, stock): {variants}

## Your job each turn
Read the owner's message and propose ONLY the changes they actually asked for. Never touch a field they didn't mention, even if you think it could be improved — this isn't a copy-editing pass, it's following instructions. If a message is genuinely ambiguous (e.g. "make it cheaper" with no number, "add a colour" with no colour named), do NOT guess a value — leave `proposal` fields empty/absent and ask exactly what you need in `message`.

## Hard constraints
- `category`, if changed, must be exactly one of: {categories}.
- `collection`, if changed, must be exactly one of the shop's existing collections: {collections} — or cleared entirely (set `collectionChanged: true` and `collection: null`) if the owner asks to remove it. Never invent a new collection name.
- `variantPatches[].variantId` must be exactly one of the existing variant ids listed above — never fabricate an id. Only include a variant here if its stock or sku is actually changing.
- `newVariants` — use this ONLY when the owner asks to add a new combination of values the product ALREADY has as option axes (e.g. product has a "colour" axis with gold/silver, owner says "add a rose gold option" — but only if "rose gold" is already one of the option's defined values; if it is not, tell the owner in `message` that a genuinely new value needs to be added via the Options section first, and propose nothing). Each entry's `values` array must have exactly one existing valueId per option axis, in the SAME order as the options list above. Never emit a joined string like "gold|18" — only the raw per-axis value ids.
- If the product has zero options (no axes at all), `newVariants` must stay empty — there is only ever the single "default" variant for such a product; adjust its stock/sku via `variantPatches` instead.
- Images are out of scope for this chat entirely — if asked to change a photo or alt text, say in `message` that photos are managed in the Images section below, and propose nothing.
- `summary` is a short list of plain-language bullet lines, one per actual change you're proposing (e.g. "Base price: Rs 799 → Rs 999"), so the owner can review before confirming. Leave it empty on a pure clarifying-question turn.

Keep `message` conversational and brief.
"""


def _fmt_options(product: Product) -> str:
    parts = []
    for o in sorted(product.options, key=lambda o: o.position):
        values = ", ".join(f"{v.value_id} ({v.label})" for v in sorted(o.values, key=lambda v: v.position))
        parts.append(f"{o.key}: [{values}]")
    return "; ".join(parts) if parts else "(none — this is a single-variant product)"


def _fmt_variants(product: Product) -> str:
    if not product.variants:
        return "(none yet)"
    return "; ".join(
        f"{{id: {v.id}, values: {v.variant_key}, sku: {v.sku}, stock: {v.stock}}}" for v in product.variants
    )


def build_system_prompt(db: Session, product: Product) -> str:
    return SYSTEM_PROMPT.format(
        product_id=product.id,
        name=product.name,
        category=product.category,
        collection=product.collection or "(none)",
        base_price=product.base_price,
        material=product.material,
        blurb=product.blurb or "(none)",
        care=product.care or [],
        is_featured=product.is_featured,
        is_active=product.is_active,
        options=_fmt_options(product),
        variants=_fmt_variants(product),
        categories=", ".join(CATEGORIES),
        collections=", ".join(existing_collections(db)) or "(none yet)",
    )


async def run_edit_turn(
    db: Session,
    product: Product,
    message: str,
    history: list[dict],
) -> EditTurnOut:
    system = build_system_prompt(db, product)
    contents = [
        {"role": "model" if h["role"] == "assistant" else "user", "parts": [text_part(h["content"])]}
        for h in history
    ]
    contents.append({"role": "user", "parts": [text_part(message)]})
    raw = await generate_turn(system, contents, EDIT_TURN_RESPONSE_SCHEMA)
    return EditTurnOut.model_validate(raw)


def validate_edit_proposal(db: Session, product: Product, proposal: EditProposal) -> list[str]:
    """Whole-turn rejection criteria, same posture as agent.py's
    validate_draft_constraints — a violation here means the model targeted
    something that doesn't exist or broke a hard rule, so the whole turn is
    discarded rather than partially applied."""
    problems: list[str] = []
    patch = proposal.product_patch

    if patch.category is not None and patch.category not in CATEGORIES:
        problems.append(f"category {patch.category!r} is not one of {CATEGORIES}")
    if patch.collection_changed and patch.collection is not None:
        existing = existing_collections(db)
        if patch.collection not in existing:
            problems.append(f"collection {patch.collection!r} is not an existing collection")

    existing_variant_ids = {str(v.id) for v in product.variants}
    for vp in proposal.variant_patches:
        if vp.variant_id not in existing_variant_ids:
            problems.append(f"variantId {vp.variant_id!r} is not one of this product's variants")

    option_axes = sorted(product.options, key=lambda o: o.position)
    valid_value_ids = [{v.value_id for v in o.values} for o in option_axes]
    existing_variant_keys = {v.variant_key for v in product.variants}
    seen_new_keys: set[str] = set()
    for nv in proposal.new_variants:
        if not option_axes:
            problems.append("newVariants proposed but this product has no option axes")
            break
        if len(nv.values) != len(option_axes):
            problems.append(f"newVariants entry has {len(nv.values)} values, expected {len(option_axes)}")
            continue
        for i, val in enumerate(nv.values):
            if val not in valid_value_ids[i]:
                problems.append(f"newVariants value {val!r} is not a defined value for axis {option_axes[i].key!r}")
        key = "|".join(nv.values) if nv.values else "default"
        if key in existing_variant_keys or key in seen_new_keys:
            problems.append(f"newVariants combination {key!r} already exists")
        seen_new_keys.add(key)

    return problems


def finalize_edit_proposal(db: Session, product: Product, out: EditTurnOut) -> EditTurnOut:
    """Drops no-op fields the model echoed unchanged, and dedupes any
    proposed SKUs against the whole catalogue — the exact same collision
    class agent.py's dedupe_sku fixed for new products (product_variants.sku
    is unique store-wide, not just within one product)."""
    patch = out.proposal.product_patch
    if patch.name == product.name:
        patch.name = None
    if patch.category == product.category:
        patch.category = None
    if patch.collection_changed and patch.collection == product.collection:
        patch.collection_changed = False
        patch.collection = None
    if patch.base_price == product.base_price:
        patch.base_price = None
    if patch.material == product.material:
        patch.material = None
    if patch.blurb == product.blurb:
        patch.blurb = None
    if patch.care == list(product.care or []):
        patch.care = None
    if patch.is_featured == product.is_featured:
        patch.is_featured = None
    if patch.is_active == product.is_active:
        patch.is_active = None

    variants_by_id = {str(v.id): v for v in product.variants}
    taken: set[str] = set()
    kept_patches = []
    for vp in out.proposal.variant_patches:
        current = variants_by_id[vp.variant_id]
        if vp.stock == current.stock:
            vp.stock = None
        if vp.sku == current.sku:
            vp.sku = None
        elif vp.sku:
            vp.sku = dedupe_sku(db, vp.sku, taken)
        if vp.stock is None and vp.sku is None:
            continue  # nothing actually changed on this variant
        kept_patches.append(vp)
    out.proposal.variant_patches = kept_patches

    for nv in out.proposal.new_variants:
        nv.sku = dedupe_sku(db, nv.sku, taken)

    return out
