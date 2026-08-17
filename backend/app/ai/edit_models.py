"""
Pydantic parse/validation for the product-edit chat — the after-the-fact
check on what Gemini returned, same split as models.py vs schema.py.
"""
from pydantic import Field

from ..schemas import CamelModel


class ProductPatch(CamelModel):
    name: str | None = None
    category: str | None = None
    collection: str | None = None
    collection_changed: bool = False
    base_price: int | None = None
    material: str | None = None
    blurb: str | None = None
    care: list[str] | None = None
    is_featured: bool | None = None
    is_active: bool | None = None


class VariantPatch(CamelModel):
    variant_id: str
    stock: int | None = None
    sku: str | None = None


class NewVariant(CamelModel):
    values: list[str] = Field(default_factory=list)
    stock: int = 0
    sku: str | None = None


class EditProposal(CamelModel):
    product_patch: ProductPatch = Field(default_factory=ProductPatch)
    variant_patches: list[VariantPatch] = Field(default_factory=list)
    new_variants: list[NewVariant] = Field(default_factory=list)
    summary: list[str] = Field(default_factory=list)


class EditTurnOut(CamelModel):
    message: str
    proposal: EditProposal = Field(default_factory=EditProposal)


class EditChatMessage(CamelModel):
    role: str  # "user" | "assistant"
    content: str


class EditTurnIn(CamelModel):
    """Stateless like the draft agent (plans/09 §8) — the browser resends
    the whole chat history each turn; nothing is kept server-side."""

    message: str
    history: list[EditChatMessage] = Field(default_factory=list)
