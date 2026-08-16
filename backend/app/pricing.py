"""
The money maths. One module, so there is exactly one place a price is
computed server-side. Mirrors lib/pricing.ts on the frontend exactly —
if you change a rule here, change it there too, or the cart will show one
total and the confirmation email a different one.
See plans/03-backend-fastapi.md §4.3.
"""
from dataclasses import dataclass

from .config import settings
from .models import Product, ProductVariant


@dataclass
class PricedLine:
    product: Product
    variant: ProductVariant
    selection_label: str
    unit_price: int
    qty: int

    @property
    def line_total(self) -> int:
        return self.unit_price * self.qty


@dataclass
class Totals:
    subtotal: int
    discount_amount: int
    delivery_fee: int
    total: int


def unit_price_for_variant(product: Product, variant_key: str) -> int:
    """base_price + sum of price_delta for every option value selected in
    this variant_key. The key encodes the selection positionally, in the
    same order product_options.position sorts to — see plans/02 §4."""
    price = product.base_price
    if variant_key == "default" or not product.options:
        return price

    parts = variant_key.split("|")
    ordered_options = sorted(product.options, key=lambda o: o.position)
    for opt, chosen_value_id in zip(ordered_options, parts, strict=False):
        for val in opt.values:
            if val.value_id == chosen_value_id:
                price += val.price_delta
                break
    return price


def selection_label_for_variant(product: Product, variant_key: str) -> str:
    if variant_key == "default" or not product.options:
        return ""
    parts = variant_key.split("|")
    ordered_options = sorted(product.options, key=lambda o: o.position)
    labels = []
    for opt, chosen_value_id in zip(ordered_options, parts, strict=False):
        for val in opt.values:
            if val.value_id == chosen_value_id:
                labels.append(val.label)
                break
    return " · ".join(labels)


def code_is_valid(code: str | None) -> bool:
    return bool(code) and code.strip().upper() == settings.DISCOUNT_CODE.upper()


def compute_totals(lines: list[PricedLine], discount_code: str | None) -> Totals:
    subtotal = sum(line.line_total for line in lines)
    percent = settings.DISCOUNT_PERCENT if code_is_valid(discount_code) else 0
    discount = round(subtotal * percent / 100)
    payable = subtotal - discount
    delivery = 0 if payable >= settings.FREE_DELIVERY_THRESHOLD or subtotal == 0 else settings.DELIVERY_FEE
    return Totals(
        subtotal=subtotal,
        discount_amount=discount,
        delivery_fee=delivery,
        total=payable + delivery,
    )
