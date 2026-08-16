"""
Loads the 12 prototype products into Postgres — transcribed verbatim from
reference/Mayra Store.dc.html lines 645-740, so the seeded store matches the
original design exactly (names, prices, blurbs, options, variant stock).
See plans/02-database.md §6.

Usage:
    python -m backend.app.seed            # idempotent — skips products that already exist
    python -m backend.app.seed --reset    # truncates catalogue tables first (never touches orders)
"""
import sys

from sqlalchemy import text

from .db import SessionLocal, engine
from .models import Base, Category, Product, ProductImage, ProductOption, ProductOptionValue, ProductVariant, Setting

CARE_DEFAULT = [
    "Remove before showering or swimming",
    "Keep away from perfume and lotion",
    "Store dry, in the pouch it arrives in",
]


def img(photo_id: str, w: int = 900) -> str:
    return f"https://images.unsplash.com/{photo_id}?auto=format&fit=crop&w={w}&q=80"


U = {
    "heart1": "photo-1623321673989-830eff0fd59f",
    "chainFine": "photo-1611107683227-e9060eccd846",
    "pendant": "photo-1569397288884-4d43d6738fbd",
    "celestial": "photo-1685970731194-e27b477e87ba",
    "layered": "photo-1620656798579-1984d9e87df7",
    "twoTone": "photo-1601121141461-920cb1993441",
    "studioBust": "photo-1722410180687-b05b50922362",
    "flat1": "photo-1722410180644-5955f83ec8b1",
    "stack": "photo-1611591437281-460bfbe1220a",
    "rope": "photo-1602173574767-37ac01994b2a",
    "everyday": "photo-1633810543462-77c4a3b13f07",
    "charm": "photo-1721206624492-3d05631471ea",
    "braceletPair": "photo-1679156271456-d6068c543ee7",
    "leaf": "photo-1689367436629-1d288f1e23b6",
    "slimBand": "photo-1655707063513-a08dad26440e",
    "stackingRing": "photo-1689367436442-76c859315008",
    "studs": "photo-1722410180681-9f5a22d7ebb6",
    "drop": "photo-1722410180670-b6d5a2e704fa",
}

CATEGORIES = [
    ("necklaces", "Necklaces", 1),
    ("bracelets", "Bracelets", 2),
    ("rings", "Rings", 3),
    ("earrings", "Earrings", 4),
]

GOLD = {"id": "gold", "label": "Gold", "hex": "#c8a24a"}
ROSE = {"id": "rose", "label": "Rose gold", "hex": "#d9a08c"}
SILVER = {"id": "steel", "label": "Silver", "hex": "#c8ccd0"}

# Featured on the landing page — exactly four, one per category, all with stock.
FEATURED_SLUGS = {"p-heart-charm", "p-celestial", "p-golden-essence-stack", "p-solitaire-studs"}

PRODUCTS = [
    dict(
        id="p-heart-charm", name="Heart Charm Necklace", category="necklaces", collection=None, basePrice=2400,
        blurb="A soft heart charm on a fine cable chain — simple, wearable, and easy to layer with anything else in the case.",
        images={"default": [U["heart1"], U["chainFine"]], "rose": [U["flat1"]], "steel": [U["twoTone"]]},
        options=[
            {"key": "colour", "label": "Colour", "type": "swatch", "values": [GOLD, ROSE, SILVER]},
            {"key": "length", "label": "Length", "type": "segment", "values": [
                {"id": "16", "label": '16"'}, {"id": "18", "label": '18"'}, {"id": "20", "label": '20"', "priceDelta": 200},
            ]},
        ],
        variants={
            "gold|16": {"sku": "MYR-HC-G16", "stock": 12}, "gold|18": {"sku": "MYR-HC-G18", "stock": 4},
            "gold|20": {"sku": "MYR-HC-G20", "stock": 0}, "rose|18": {"sku": "MYR-HC-R18", "stock": 2},
            "steel|16": {"sku": "MYR-HC-S16", "stock": 0}, "steel|18": {"sku": "MYR-HC-S18", "stock": 7},
        },
    ),
    dict(
        id="p-fine-chain", name="Fine Chain Necklace", category="necklaces", collection=None, basePrice=1900,
        blurb="A fine box chain that sits close to the neck — the everyday base layer for any stack.",
        images={"default": [U["chainFine"], U["pendant"]]},
        options=[
            {"key": "colour", "label": "Colour", "type": "swatch", "values": [GOLD, SILVER]},
            {"key": "length", "label": "Length", "type": "segment", "values": [{"id": "16", "label": '16"'}, {"id": "18", "label": '18"'}]},
        ],
        variants={
            "gold|16": {"sku": "MYR-FC-G16", "stock": 5}, "gold|18": {"sku": "MYR-FC-G18", "stock": 0},
            "steel|16": {"sku": "MYR-FC-S16", "stock": 3},
        },
    ),
    dict(
        id="p-pendant", name="Pendant Necklace", category="necklaces", collection=None, basePrice=2100,
        blurb="A gold-tone pendant on a delicate chain — quietly detailed, easy to wear alone.",
        images={"default": [U["pendant"], U["celestial"]]},
        options=[{"key": "length", "label": "Length", "type": "segment", "values": [
            {"id": "18", "label": '18"'}, {"id": "20", "label": '20"', "priceDelta": 150},
        ]}],
        variants={"18": {"sku": "MYR-PD-18", "stock": 10}, "20": {"sku": "MYR-PD-20", "stock": 0}},
    ),
    dict(
        id="p-celestial", name="Celestial Pendant Necklace", category="necklaces", collection=None, basePrice=2800,
        blurb="A celestial-motif pendant with a little more presence — a solo statement piece.",
        images={"default": [U["celestial"]], "rose": [U["layered"]]},
        options=[
            {"key": "colour", "label": "Colour", "type": "swatch", "values": [GOLD, ROSE]},
            {"key": "length", "label": "Length", "type": "segment", "values": [
                {"id": "16", "label": '16"'}, {"id": "18", "label": '18"'}, {"id": "20", "label": '20"', "priceDelta": 200},
            ]},
        ],
        variants={
            "gold|16": {"sku": "MYR-CE-G16", "stock": 8}, "gold|18": {"sku": "MYR-CE-G18", "stock": 5},
            "gold|20": {"sku": "MYR-CE-G20", "stock": 2}, "rose|20": {"sku": "MYR-CE-R20", "stock": 1},
        },
    ),
    dict(
        id="p-layered-set", name="Layered Necklace Set", category="necklaces", collection=None, basePrice=3400,
        blurb="Two chains, pre-layered at the perfect drop, so you never have to untangle them.",
        images={"default": [U["layered"], U["studioBust"]]},
        options=[],
        variants={"default": {"sku": "MYR-LS-01", "stock": 6}},
    ),
    dict(
        id="p-two-tone", name="Two-tone Necklace", category="necklaces", collection=None, basePrice=2600,
        blurb="Gold and silver-tone chains worn together — a two-tone piece that pairs with either metal in your stack.",
        images={"default": [U["twoTone"], U["flat1"]]},
        options=[
            {"key": "colour", "label": "Colour", "type": "swatch", "values": [
                GOLD, {"id": "silver", "label": "Silver", "hex": "#c8ccd0"}, {"id": "roseg", "label": "Rose gold", "hex": "#d9a08c"},
            ]},
            {"key": "length", "label": "Length", "type": "segment", "values": [{"id": "18", "label": '18"'}]},
        ],
        variants={"gold|18": {"sku": "MYR-TT-G18", "stock": 4}, "silver|18": {"sku": "MYR-TT-S18", "stock": 0}},
    ),
    dict(
        id="p-golden-essence-stack", name="Golden Essence Stack", category="bracelets", collection="golden-essence", basePrice=4500,
        blurb="Six chains layered to perfection — curb, box, rope, figaro, herringbone and paperclip in one stack.",
        images={"default": [U["stack"], U["rope"]]},
        options=[
            {"key": "colour", "label": "Colour", "type": "swatch", "values": [GOLD]},
            {"key": "size", "label": "Wrist size", "type": "segment", "values": [{"id": "S", "label": "S"}, {"id": "M", "label": "M"}, {"id": "L", "label": "L"}]},
        ],
        variants={
            "gold|S": {"sku": "MYR-GE-S", "stock": 10}, "gold|M": {"sku": "MYR-GE-M", "stock": 6}, "gold|L": {"sku": "MYR-GE-L", "stock": 0},
        },
    ),
    dict(
        id="p-rope-chain", name="Rope Chain Bracelet", category="bracelets", collection="golden-essence", basePrice=1800,
        blurb="A dense rope-weave chain with real weight on the wrist — a stack piece that can also stand alone.",
        images={"default": [U["rope"], U["stack"]]},
        options=[
            {"key": "colour", "label": "Colour", "type": "swatch", "values": [GOLD, ROSE]},
            {"key": "size", "label": "Wrist size", "type": "segment", "values": [{"id": "S", "label": "S"}, {"id": "M", "label": "M"}, {"id": "L", "label": "L"}]},
        ],
        variants={
            "gold|S": {"sku": "MYR-RC-GS", "stock": 5}, "gold|M": {"sku": "MYR-RC-GM", "stock": 3},
            "gold|L": {"sku": "MYR-RC-GL", "stock": 8}, "rose|M": {"sku": "MYR-RC-RM", "stock": 2},
        },
    ),
    dict(
        id="p-everyday-bracelet", name="Everyday Bracelet", category="bracelets", collection="golden-essence", basePrice=1600,
        blurb="A close-fitting curb chain sized to wear every day without a clasp.",
        images={"default": [U["everyday"]]},
        options=[],
        variants={"default": {"sku": "MYR-EB-01", "stock": 9}},
    ),
    dict(
        id="p-charm-bracelet", name="Charm Bracelet", category="bracelets", collection=None, basePrice=2000,
        blurb="A single charm on a fine curb chain — the next piece in this run, back soon.",
        images={"default": [U["charm"], U["braceletPair"]]},
        options=[
            {"key": "colour", "label": "Colour", "type": "swatch", "values": [GOLD]},
            {"key": "size", "label": "Wrist size", "type": "segment", "values": [{"id": "S", "label": "S"}, {"id": "M", "label": "M"}]},
        ],
        variants={"gold|S": {"sku": "MYR-CB-S", "stock": 0}, "gold|M": {"sku": "MYR-CB-M", "stock": 0}},
    ),
    dict(
        id="p-leaf-ring", name="Leaf Ring", category="rings", collection=None, basePrice=1500,
        blurb="An open leaf band that sits low on the finger — adjustable-feeling, easy to stack.",
        images={"default": [U["leaf"], U["stackingRing"]], "silver": [U["slimBand"]]},
        options=[
            {"key": "colour", "label": "Colour", "type": "swatch", "values": [GOLD, SILVER]},
            {"key": "size", "label": "Ring size", "type": "segment", "values": [{"id": "6", "label": "6"}, {"id": "7", "label": "7"}, {"id": "8", "label": "8"}]},
        ],
        variants={
            "gold|6": {"sku": "MYR-LR-G6", "stock": 4}, "gold|7": {"sku": "MYR-LR-G7", "stock": 1},
            "gold|8": {"sku": "MYR-LR-G8", "stock": 0}, "silver|7": {"sku": "MYR-LR-S7", "stock": 0},
        },
    ),
    dict(
        id="p-solitaire-studs", name="Solitaire Studs", category="earrings", collection=None, basePrice=1900,
        blurb="A round-cut solitaire stud — the everyday earring that goes with everything else here.",
        images={"default": [U["studs"], U["drop"]]},
        options=[{"key": "colour", "label": "Colour", "type": "swatch", "values": [GOLD, ROSE, SILVER]}],
        variants={"gold": {"sku": "MYR-SS-G", "stock": 7}, "rose": {"sku": "MYR-SS-R", "stock": 2}, "steel": {"sku": "MYR-SS-S", "stock": 0}},
    ),
]


def reset(db) -> None:
    """Truncates catalogue tables only — never touches orders/order_items."""
    db.execute(
        text(
            "truncate table product_images, product_variants, product_option_values, "
            "product_options, products restart identity cascade"
        )
    )
    db.commit()


def seed(db, *, do_reset: bool = False) -> None:
    Base.metadata.create_all(bind=engine)

    if do_reset:
        reset(db)

    for slug, label, sort_order in CATEGORIES:
        if not db.query(Category).filter(Category.slug == slug).first():
            db.add(Category(slug=slug, label=label, sort_order=sort_order))
    db.commit()

    default_settings = {
        "announcement_text": "Launch offer — 20% off everything with code MAYRA20",
        "announcement_enabled": "true",
        "promo_popup_enabled": "true",
        "about_intro": "",
    }
    for key, value in default_settings.items():
        if not db.query(Setting).filter(Setting.key == key).first():
            db.add(Setting(key=key, value=value))
    db.commit()

    created, skipped = 0, 0
    for p in PRODUCTS:
        if db.query(Product).filter(Product.slug == p["id"]).first():
            skipped += 1
            continue

        product = Product(
            slug=p["id"],
            name=p["name"],
            category=p["category"],
            collection=p["collection"],
            base_price=p["basePrice"],
            material="18k gold-plated stainless steel",
            blurb=p["blurb"],
            care=CARE_DEFAULT,
            is_active=True,
            is_featured=p["id"] in FEATURED_SLUGS,
            sort_order=0,
        )
        db.add(product)
        db.flush()

        for pos, opt in enumerate(p["options"]):
            option = ProductOption(product_id=product.id, key=opt["key"], label=opt["label"], type=opt["type"], position=pos)
            db.add(option)
            db.flush()
            for vpos, val in enumerate(opt["values"]):
                db.add(
                    ProductOptionValue(
                        option_id=option.id,
                        value_id=val["id"],
                        label=val["label"],
                        hex=val.get("hex"),
                        price_delta=val.get("priceDelta", 0),
                        position=vpos,
                    )
                )

        for variant_key, v in p["variants"].items():
            db.add(ProductVariant(product_id=product.id, variant_key=variant_key, sku=v["sku"], stock=v["stock"]))

        for colour_key, photo_ids in p["images"].items():
            for pos, photo_id in enumerate(photo_ids):
                db.add(
                    ProductImage(
                        product_id=product.id,
                        colour_key=colour_key,
                        url=img(photo_id, 900),
                        storage_path=None,  # external Unsplash URL — nothing to delete from Storage
                        alt=f"{p['name']} — 18k gold-plated stainless steel",
                        position=pos,
                    )
                )

        created += 1

    db.commit()
    print(f"Seed complete: {created} products created, {skipped} already existed and were skipped.")


if __name__ == "__main__":
    do_reset = "--reset" in sys.argv
    session = SessionLocal()
    try:
        seed(session, do_reset=do_reset)
    finally:
        session.close()
