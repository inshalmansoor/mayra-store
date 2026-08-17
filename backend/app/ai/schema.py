"""
The structured-output contract between the agent and the provider. One
shared dict feeds Gemini's responseSchema so the model is constrained to
this shape at generation time (not just checked after the fact) — see
plans/09 §2, §11.

NOTE: the Gemini REST API's Schema type uses uppercase type-enum strings
(STRING/OBJECT/ARRAY/...) per the documented Generative Language API. This
has not been exercised against a live key yet (no GEMINI_API_KEY was
available while building this) — if Gemini rejects the schema shape, this
is the first thing to check.
"""

QUESTION_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "id": {"type": "STRING"},
        "text": {"type": "STRING"},
        "blocking": {"type": "BOOLEAN"},
        "choices": {"type": "ARRAY", "items": {"type": "STRING"}},
    },
    "required": ["id", "text", "blocking"],
}

OPTION_VALUE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "valueId": {"type": "STRING"},
        "label": {"type": "STRING"},
    },
    "required": ["valueId", "label"],
}

OPTION_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "key": {"type": "STRING"},
        "label": {"type": "STRING"},
        "values": {"type": "ARRAY", "items": OPTION_VALUE_SCHEMA},
    },
    "required": ["key", "label", "values"],
}

VARIANT_PLAN_ENTRY_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        # One valueId per option, in the same order as `draft.options` —
        # the frontend joins these into a real variant_key. The agent NEVER
        # emits the joined string itself. See plans/09 §6.
        "values": {"type": "ARRAY", "items": {"type": "STRING"}},
        "state": {"type": "STRING", "enum": ["made", "not_made"]},
        "stock": {"type": "INTEGER"},
        "sku": {"type": "STRING"},
    },
    "required": ["values", "state"],
}

DRAFT_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "name": {"type": "STRING", "nullable": True},
        "slug": {"type": "STRING", "nullable": True},
        "category": {"type": "STRING", "nullable": True},
        "collection": {"type": "STRING", "nullable": True},
        "blurb": {"type": "STRING", "nullable": True},
        "care": {"type": "ARRAY", "items": {"type": "STRING"}},
        "sku": {"type": "STRING", "nullable": True},
        "alt": {"type": "STRING", "nullable": True},
        "basePrice": {"type": "INTEGER", "nullable": True},
        "material": {"type": "STRING", "nullable": True},
        "options": {"type": "ARRAY", "items": OPTION_SCHEMA},
        "variantPlan": {"type": "ARRAY", "items": VARIANT_PLAN_ENTRY_SCHEMA},
    },
    "required": ["care", "options", "variantPlan"],
}

SUGGESTION_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "field": {"type": "STRING"},
        "reason": {"type": "STRING"},
    },
    "required": ["field", "reason"],
}

AGENT_TURN_RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        # Structured visual read of the photo, extracted once on turn 1 and
        # echoed back unchanged on every later turn so the image bytes are
        # never re-sent. See plans/09 §2.
        "visualFacts": {"type": "STRING"},
        "message": {"type": "STRING"},
        "questions": {"type": "ARRAY", "items": QUESTION_SCHEMA},
        "draft": DRAFT_SCHEMA,
        # One entry per suggested (non-asked) field — plans/09 §1. Gemini's
        # structured-output schema has no free-key-object support, hence a
        # list of {field, reason} instead of a field->reason map.
        "suggestions": {"type": "ARRAY", "items": SUGGESTION_SCHEMA},
        # fieldName list — which fields were auto-decided because the owner
        # delegated ("you decide"). Rendered as a visible "auto" badge.
        "autoDecided": {"type": "ARRAY", "items": {"type": "STRING"}},
        "done": {"type": "BOOLEAN"},
    },
    "required": ["visualFacts", "message", "questions", "draft", "done"],
}
