"""
Gemini responseSchema for the product-edit chat (plans/09 companion feature:
"update an existing product by chatting with it"). Same uppercase-type-enum
contract as schema.py — see that file's note on the Generative Language API
shape.
"""

PRODUCT_PATCH_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "name": {"type": "STRING", "nullable": True},
        "category": {"type": "STRING", "nullable": True},
        "collection": {"type": "STRING", "nullable": True},
        # Distinguishes "owner didn't mention collection" (collection=null,
        # collectionChanged=false) from "owner asked to clear it"
        # (collection=null, collectionChanged=true) — collection is the only
        # product field that's legitimately nullable in the domain model.
        "collectionChanged": {"type": "BOOLEAN"},
        "basePrice": {"type": "INTEGER", "nullable": True},
        "material": {"type": "STRING", "nullable": True},
        "blurb": {"type": "STRING", "nullable": True},
        "care": {"type": "ARRAY", "items": {"type": "STRING"}, "nullable": True},
        "isFeatured": {"type": "BOOLEAN", "nullable": True},
        "isActive": {"type": "BOOLEAN", "nullable": True},
    },
}

VARIANT_PATCH_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        # Must be one of the existing variant ids given in the grounding
        # context — never a fabricated id. Validated server-side.
        "variantId": {"type": "STRING"},
        "stock": {"type": "INTEGER", "nullable": True},
        "sku": {"type": "STRING", "nullable": True},
    },
    "required": ["variantId"],
}

NEW_VARIANT_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        # One existing valueId per option axis, in the SAME order as the
        # product's options list given in context — mirrors draft.variantPlan
        # in schema.py. The agent never invents a new axis or a new value;
        # it only picks among values that already exist on the product.
        "values": {"type": "ARRAY", "items": {"type": "STRING"}},
        "stock": {"type": "INTEGER"},
        "sku": {"type": "STRING", "nullable": True},
    },
    "required": ["values"],
}

EDIT_PROPOSAL_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "productPatch": PRODUCT_PATCH_SCHEMA,
        "variantPatches": {"type": "ARRAY", "items": VARIANT_PATCH_SCHEMA},
        "newVariants": {"type": "ARRAY", "items": NEW_VARIANT_SCHEMA},
        # One plain-language line per actual change, for the confirm screen.
        # Empty when this turn is only a clarifying question.
        "summary": {"type": "ARRAY", "items": {"type": "STRING"}},
    },
    "required": ["productPatch", "variantPatches", "newVariants", "summary"],
}

EDIT_TURN_RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "message": {"type": "STRING"},
        "proposal": EDIT_PROPOSAL_SCHEMA,
    },
    "required": ["message", "proposal"],
}
