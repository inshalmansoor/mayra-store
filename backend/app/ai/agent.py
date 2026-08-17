"""
Conversation orchestration for the AI product agent — plans/09 §1-13.

Stateless by design (§8): the frontend resends visualFacts + the current
draft + the previous turn's questions each round; nothing is kept in a
session on the server. This module's job is building the right request for
whichever turn it is, and validating what comes back before it ever reaches
the admin's screen.
"""
import re
import uuid

from sqlalchemy.orm import Session

from ..models import Product, ProductVariant
from .models import AgentTurnOut, ProductDraft
from .provider import generate_turn, image_part, text_part

CATEGORIES = ["necklaces", "bracelets", "rings", "earrings"]

# Mirrors the three lines hardcoded in frontend/app/admin/products/new/page.tsx
# — the only care claims the agent may make without being told otherwise.
# See plans/09 §4.
HOUSE_CARE = [
    "Remove before showering or swimming",
    "Keep away from perfume and lotion",
    "Store dry, in the pouch it arrives in",
]

# The column default in models.py and what every seeded product uses. The
# ONE thing the agent may fall back to on delegation without it being a
# claim about *this* object — see plans/09 §1 "When the owner delegates".
STORE_DEFAULT_MATERIAL = "18k gold-plated stainless steel"


def _price_stats(db: Session, category: str | None) -> str:
    q = db.query(Product.base_price).filter(Product.is_active.is_(True))
    if category:
        q = q.filter(Product.category == category)
    prices = sorted(p[0] for p in q.all())
    if not prices:
        return "no comparable products yet — there is no basis for a price range"
    lo, hi = prices[0], prices[-1]
    median = prices[len(prices) // 2]
    return f"Rs {lo}-{hi}, median Rs {median}, across {len(prices)} active product(s)"


def _price_median(db: Session, category: str | None) -> int | None:
    q = db.query(Product.base_price).filter(Product.is_active.is_(True))
    if category:
        q = q.filter(Product.category == category)
    prices = sorted(p[0] for p in q.all())
    if not prices:
        return None
    return prices[len(prices) // 2]


def existing_collections(db: Session) -> list[str]:
    rows = db.query(Product.collection).filter(Product.collection.isnot(None)).distinct().all()
    return sorted({r[0] for r in rows if r[0]})


def _sku_examples(db: Session) -> list[str]:
    rows = db.query(ProductVariant.sku).order_by(ProductVariant.sku.desc()).limit(5).all()
    return [r[0] for r in rows]


SYSTEM_PROMPT = """You are the product-listing agent for Mayra Store, a small jewellery shop admin panel. An owner uploads one photo and a short description; your job is to turn that into a complete, ready-to-review product draft through a short conversation, asking only about what a photo genuinely cannot tell you.

## What you decide yourself (suggest, with a one-line reason each)
name, slug, category, collection, blurb, care, sku, alt text, and the product's option axes (e.g. "colour", "size") and their values. Every suggestion needs a `reason` entry explaining it in one sentence — never fill these silently.

## What you must ASK the owner about — never invent these
- **basePrice** — a margin decision only the owner can make. Ground the question in real data: {price_stats}.
- **stock**, per variant combination — physically uncountable from a photo. Ask how many of each exists.
- **material** — a photo cannot distinguish plating from solid metal. This is a claim a customer relies on; never infer it from the image, no matter how confident you are.
- Whether the product has more than one variant (colour, size, etc.) — ask in plain language, e.g. "does this come in more than one size?" Do NOT ask the owner to write a variant_key or any joined string — you only ever collect axis names and their values (e.g. colour: gold, silver), never a joined key.

Ask blocking questions only for these. Everything else is a suggestion the owner can silently override in the review form — do not ask about it.

## When the owner delegates ("I don't know", "you decide", "whatever you think", "skip it", "up to you", etc.)
Recognise this in natural language for ANY field, not just an exact phrase. When it happens: decide immediately and move on — never ask the same question again. Apply exactly these rules, and add the field name to `autoDecided`:
- name/slug/blurb/care/alt/sku/category: use your own best suggestion (you already have one).
- collection: use null. A wrong guess fragments the shop's filtering; absence is always safe.
- variant axes: assume a single "default" variant with no options at all.
- basePrice: use exactly {price_median} — the median of comparable active products. Do not compute your own number.
- stock: use exactly 1. The one piece in the photo demonstrably exists; this caps overselling risk at a single item, and 0 would make the product look broken and unbuyable.
- **material: use exactly "{default_material}"** (the store's documented default) — this is the one field where delegation still must NOT come from the image. Falling back to the store's own stated default is a fact about the business; inferring a material from a photo is a claim about this specific object that nothing in your input supports. Never blend these two.

## Hard constraints (a violation means your whole response gets discarded)
- `category` must be exactly one of: {categories}.
- `collection` must be exactly one of the shop's existing collections, or null. Existing collections: {collections}. Never invent a new collection name — if you think a new one is warranted, ASK instead of deciding.
- `care` may only contain lines from the house list below, plus at most ONE additional line drawn from the owner's own words. Never invent a care claim from the image alone.
  House care list:
{care_list}
- Never emit a joined variant key (no "gold|18" style strings, ever). `draft.options` holds only axis/value definitions; `draft.variantPlan` entries hold a `values` array of raw valueIds in the same order as `draft.options` — the application code joins these, not you.
- `slug` is a suggestion only — the backend will deduplicate it against existing products before the owner ever sees it, so don't worry about collisions.
- Recent SKU examples in this shop, for pattern matching: {sku_examples}.

## Output shape
Every turn, return the FULL current draft (not a diff) — the caller replaces its copy of the draft with whatever you return. `visualFacts` should be set once (turn 1, from the photo) and echoed back UNCHANGED on every later turn — you will not see the image again after turn 1. Set `done: true` only once every blocking question (price, stock, material, and variant structure if relevant) has been answered or explicitly delegated. Keep `message` conversational and brief — one or two sentences, plus your question(s) if any remain.
"""


def build_system_prompt(db: Session, category_hint: str | None = None) -> str:
    return SYSTEM_PROMPT.format(
        categories=", ".join(CATEGORIES),
        care_list="\n".join(f"  - {c}" for c in HOUSE_CARE),
        default_material=STORE_DEFAULT_MATERIAL,
        collections=", ".join(existing_collections(db)) or "(none yet — any collection name would be new)",
        price_stats=_price_stats(db, category_hint),
        price_median=_price_median(db, category_hint) or 2000,
        sku_examples=", ".join(_sku_examples(db)) or "MYR-XX-01",
    )


async def run_first_turn(db: Session, description: str, image_bytes: bytes, mime_type: str) -> AgentTurnOut:
    system = build_system_prompt(db)
    contents = [
        {
            "role": "user",
            "parts": [
                image_part(image_bytes, mime_type),
                text_part(
                    "New product photo just uploaded. Owner's description: "
                    f"{description.strip() or '(no description given — go entirely on the photo)'}\n\n"
                    "This is turn 1: extract visualFacts from the photo (form, finish, colour, apparent "
                    "components, anything that looks variant-worthy), then draft every field you can and "
                    "ask about what you genuinely cannot know."
                ),
            ],
        }
    ]
    raw = await generate_turn(system, contents)
    return AgentTurnOut.model_validate(raw)


async def run_next_turn(
    db: Session,
    visual_facts: str,
    draft: dict,
    pending_questions: list[dict],
    answer: str,
    turn_count: int,
    max_turns: int,
) -> AgentTurnOut:
    category_hint = draft.get("category")
    system = build_system_prompt(db, category_hint)
    if turn_count >= max_turns:
        system += (
            "\n\nTURN LIMIT REACHED. You must set done=true in this response. For any blocking field still "
            "unanswered, apply the delegation defaults above yourself and add it to autoDecided — do not ask "
            "another question."
        )
    contents = [
        {
            "role": "user",
            "parts": [
                text_part(
                    "Continuing an existing draft — you will not see the photo again; visualFacts below is "
                    "your only reference to it. Do not ask about the photo again.\n\n"
                    f"visualFacts: {visual_facts}\n\n"
                    f"Current draft (JSON, return the full updated version): {draft}\n\n"
                    f"Questions you asked last turn (JSON): {pending_questions}\n\n"
                    f"Owner's reply: {answer.strip()}"
                )
            ],
        }
    ]
    raw = await generate_turn(system, contents)
    out = AgentTurnOut.model_validate(raw)
    if not out.visual_facts:
        out.visual_facts = visual_facts  # never let a later turn blank this out
    return out


def validate_draft_constraints(db: Session, draft: ProductDraft) -> list[str]:
    """Whole-turn rejection criteria — plans/09 §11. Empty list = OK."""
    problems: list[str] = []
    if draft.category is not None and draft.category not in CATEGORIES:
        problems.append(f"category {draft.category!r} is not one of {CATEGORIES}")
    if draft.collection:
        existing = existing_collections(db)
        if draft.collection not in existing:
            problems.append(f"collection {draft.collection!r} is not an existing collection")
    house = set(HOUSE_CARE)
    invented = [c for c in draft.care if c not in house]
    if len(invented) > 1:
        problems.append("care has more than one line outside the house list")
    return problems


_SLUG_RE = re.compile(r"[^a-z0-9]+")


def slugify(name: str) -> str:
    base = _SLUG_RE.sub("-", name.lower()).strip("-")
    return base or f"p-{uuid.uuid4().hex[:8]}"


REGENERATE_COPY_PROMPT = """You are improving the customer-facing COPY on an existing Mayra Store product listing — nothing else. You may only touch `name`, `blurb`, and `alt`.

You will NOT be asked about, and must NOT change: price, stock, material, slug, category, collection, care, options, or variants. If you're tempted to comment on any of those, don't — leave them out of your response entirely; the application ignores anything outside name/blurb/alt from this endpoint regardless of what you send, as a safety backstop.

Existing listing:
- Current name: {name}
- Category: {category}
- Material: {material}
- Current blurb: {blurb}

Look at the product photo and propose improved name, blurb, and alt text. Give each a one-sentence reason in `suggestions`. Set done=true and questions=[] always — this is a single-shot suggestion, not a conversation."""


async def run_regenerate_copy(
    product: Product, image_bytes: bytes | None, mime_type: str
) -> AgentTurnOut:
    system = REGENERATE_COPY_PROMPT.format(
        name=product.name,
        category=product.category,
        material=product.material,
        blurb=product.blurb or "(none yet)",
    )
    parts = []
    if image_bytes:
        parts.append(image_part(image_bytes, mime_type))
    parts.append(text_part("Propose improved name, blurb, and alt text for this listing."))
    contents = [{"role": "user", "parts": parts}]
    raw = await generate_turn(system, contents)
    out = AgentTurnOut.model_validate(raw)
    # Defense in depth: only copy fields survive, no matter what the model
    # actually returned. See plans/09 §13.
    copy_only = ProductDraft(name=out.draft.name, blurb=out.draft.blurb, alt=out.draft.alt)
    out.draft = copy_only
    out.questions = []
    out.done = True
    return out


def dedupe_slug(db: Session, proposed: str | None, name: str | None) -> str:
    """The form calls slug 'permanent' and create_product 400s on a
    duplicate — so the slug shown to the owner must already be free.
    See plans/09 §5."""
    base = slugify(proposed or name or "new-piece")
    candidate = base
    n = 2
    while db.query(Product).filter(Product.slug == candidate).first() is not None:
        candidate = f"{base}-{n}"
        n += 1
    return candidate
