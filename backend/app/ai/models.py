"""
Pydantic parse/validation for what the agent returns each turn. Separate
from schema.py (which is Gemini's generation-time constraint) — this is the
after-the-fact check per plans/09 §11: a draft that fails validation is
discarded whole, never half-applied.
"""
from typing import Literal

from pydantic import Field

from ..schemas import CamelModel


class QuestionOut(CamelModel):
    id: str
    text: str
    blocking: bool
    choices: list[str] | None = None


class OptionValueDraft(CamelModel):
    value_id: str
    label: str


class OptionDraft(CamelModel):
    key: str
    label: str
    values: list[OptionValueDraft] = Field(default_factory=list)


class VariantPlanEntry(CamelModel):
    # One valueId per option, in the same order as draft.options — the
    # frontend joins these into a real variant_key. Never a pre-joined
    # string; see plans/09 §6.
    values: list[str] = Field(default_factory=list)
    state: Literal["made", "not_made"] = "made"
    stock: int = 0
    sku: str | None = None


class ProductDraft(CamelModel):
    name: str | None = None
    slug: str | None = None
    category: str | None = None
    collection: str | None = None
    blurb: str | None = None
    care: list[str] = Field(default_factory=list)
    sku: str | None = None
    alt: str | None = None
    base_price: int | None = None
    material: str | None = None
    options: list[OptionDraft] = Field(default_factory=list)
    variant_plan: list[VariantPlanEntry] = Field(default_factory=list)


class SuggestionOut(CamelModel):
    field: str
    reason: str


class AgentTurnOut(CamelModel):
    visual_facts: str = ""
    message: str
    questions: list[QuestionOut] = Field(default_factory=list)
    draft: ProductDraft
    suggestions: list[SuggestionOut] = Field(default_factory=list)
    auto_decided: list[str] = Field(default_factory=list)
    done: bool = False


class ContinueTurnIn(CamelModel):
    """The whole conversation's state lives here, resent by the browser
    each turn — see plans/09 §8. No server-side session."""

    visual_facts: str
    draft: ProductDraft
    pending_questions: list[QuestionOut] = Field(default_factory=list)
    answer: str
    turn_count: int = 1
