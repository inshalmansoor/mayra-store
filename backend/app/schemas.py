"""
Pydantic request/response models. Field names use camelCase aliases on the
wire (matching the prototype's JS object shape) while staying snake_case in
Python — see plans/03-backend-fastapi.md §3 for the exact product JSON shape
this has to produce.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


def _to_camel(s: str) -> str:
    head, *tail = s.split("_")
    return head + "".join(w.capitalize() for w in tail)


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)


# --------------------------------------------------------------------- catalogue (out)
class OptionValueOut(CamelModel):
    id: str
    label: str
    hex: str | None = None
    price_delta: int = 0


class ProductOptionOut(CamelModel):
    key: str
    label: str
    type: Literal["swatch", "segment"]
    values: list[OptionValueOut]


class VariantOut(CamelModel):
    sku: str
    stock: int


class ProductOut(CamelModel):
    id: str  # the slug
    name: str
    category: str
    collection: str | None
    base_price: int
    material: str
    blurb: str
    care: list[str]
    is_featured: bool
    images: dict[str, list[str]]
    options: list[ProductOptionOut]
    variants: dict[str, VariantOut]


class CategoryOut(CamelModel):
    slug: str
    label: str


class BankOut(CamelModel):
    name: str
    account_title: str
    account_number: str
    iban: str


class AnnouncementOut(CamelModel):
    enabled: bool
    text: str


class ShippingRateOut(CamelModel):
    id: str
    label: str
    delivery_estimate: str
    fee: int
    is_default: bool
    free_shipping_eligible: bool


class SettingsOut(CamelModel):
    store_name: str
    currency: str
    whatsapp_number: str
    instagram_url: str
    low_stock_at: int
    discount_code: str
    discount_percent: int
    bank: BankOut
    announcement: AnnouncementOut
    promo_popup_enabled: bool
    # --- shipping — plans/09 §16, §19. Replaces the old flat
    # free_delivery_threshold/delivery_fee env-sourced fields entirely. ---
    shipping_multiple_rates_enabled: bool
    shipping_free_all: bool
    shipping_free_threshold: int
    shipping_rates: list[ShippingRateOut]


# --------------------------------------------------------------------- discount / notify
class DiscountValidateIn(CamelModel):
    code: str


class DiscountValidateOut(CamelModel):
    valid: bool
    percent: int = 0


class NotifyMeIn(CamelModel):
    product_slug: str
    email: EmailStr


# --------------------------------------------------------------------- orders (in)
class OrderItemIn(CamelModel):
    product_slug: str
    variant_key: str
    qty: int = Field(gt=0, le=99)


class CustomerIn(CamelModel):
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    phone: str = Field(min_length=1, max_length=40)
    address: str = Field(min_length=1, max_length=1000)
    city: str = Field(min_length=1, max_length=120)
    postal_code: str | None = Field(default=None, max_length=20)
    note: str | None = Field(default=None, max_length=1000)

    @field_validator("phone")
    @classmethod
    def phone_has_digits(cls, v: str) -> str:
        digits = "".join(ch for ch in v if ch.isdigit())
        if len(digits) < 7:
            raise ValueError("Enter a phone number we can reach you on")
        return v


class CardIn(CamelModel):
    """Format-only. Never persisted, never logged, never emailed.
    See PLAN.md §3.3 — card details never leave the browser in a real sense;
    this model exists only so the API can validate a well-formed demo
    submission shape without ever writing the values anywhere."""

    pass


class OrderCreateIn(CamelModel):
    items: list[OrderItemIn] = Field(min_length=1)
    customer: CustomerIn
    payment_method: Literal["cod", "bank", "card"]
    discount_code: str | None = None
    # Ignored server-side when shipping_multiple_rates_enabled is off — the
    # default rate is charged regardless. See plans/09 §20.
    shipping_rate_id: str | None = None


# --------------------------------------------------------------------- orders (out)
class OrderLineOut(CamelModel):
    product_name: str
    selection_label: str
    sku: str
    image_url: str | None
    unit_price: int
    qty: int
    line_total: int


class OrderOut(CamelModel):
    order_number: str
    subtotal: int
    discount_amount: int
    delivery_fee: int
    shipping_label: str
    total: int
    payment_method: str
    payment_status: str
    items: list[OrderLineOut]


class OrderProblem(CamelModel):
    product_slug: str
    variant_key: str
    reason: Literal["unavailable", "insufficient"]
    available: int = 0


# --------------------------------------------------------------------- admin
class AdminLoginIn(CamelModel):
    password: str


class ProductCreateIn(CamelModel):
    slug: str
    name: str
    category: str
    collection: str | None = None
    base_price: int = Field(ge=0)
    material: str = "18k gold-plated stainless steel"
    blurb: str = ""
    care: list[str] = Field(default_factory=list)
    is_active: bool = True
    is_featured: bool = False
    sort_order: int = 0


class ProductUpdateIn(CamelModel):
    name: str | None = None
    category: str | None = None
    collection: str | None = None
    base_price: int | None = Field(default=None, ge=0)
    material: str | None = None
    blurb: str | None = None
    care: list[str] | None = None
    is_active: bool | None = None
    is_featured: bool | None = None
    sort_order: int | None = None


class OptionValueIn(CamelModel):
    value_id: str
    label: str
    hex: str | None = None
    price_delta: int = 0
    position: int = 0


class OptionIn(CamelModel):
    key: str
    label: str
    type: Literal["swatch", "segment"]
    position: int = 0
    values: list[OptionValueIn]


class OptionsReplaceIn(CamelModel):
    options: list[OptionIn]
    confirm: bool = False  # must be true to actually commit — see plans/05 §5.3


class VariantUpdateIn(CamelModel):
    stock: int | None = Field(default=None, ge=0)
    sku: str | None = None


class VariantCreateIn(CamelModel):
    variant_key: str
    sku: str
    stock: int = Field(default=0, ge=0)


class OrderStatusUpdateIn(CamelModel):
    status: str | None = None
    payment_status: str | None = None


class SettingUpdateIn(CamelModel):
    value: str


# --------------------------------------------------------------------- shipping (admin)
class ShippingRateCreateIn(CamelModel):
    label: str = Field(min_length=1)
    delivery_estimate: str = ""
    fee: int = Field(ge=0)
    is_default: bool = False
    free_shipping_eligible: bool = True
    sort_order: int = 0


class ShippingRateUpdateIn(CamelModel):
    label: str | None = Field(default=None, min_length=1)
    delivery_estimate: str | None = None
    fee: int | None = Field(default=None, ge=0)
    is_active: bool | None = None
    is_default: bool | None = None
    free_shipping_eligible: bool | None = None
    sort_order: int | None = None


class AdminShippingRateOut(CamelModel):
    id: str
    label: str
    delivery_estimate: str
    fee: int
    is_active: bool
    is_default: bool
    free_shipping_eligible: bool
    sort_order: int
