"""
Shipping rate resolution and settings — the DB-touching half of the
shipping feature. pricing.py takes the resolved objects this module
produces and does pure money math with them. See plans/09 §15-20.
"""
import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from .models import Setting, ShippingRate
from .pricing import ShippingRule

_SETTING_KEYS = ("shipping_multiple_rates_enabled", "shipping_free_all", "shipping_free_threshold")


def get_shipping_rule(db: Session) -> ShippingRule:
    rows = {r.key: r.value for r in db.query(Setting).filter(Setting.key.in_(_SETTING_KEYS))}
    try:
        threshold = int(rows.get("shipping_free_threshold", "0"))
    except ValueError:
        threshold = 0
    return ShippingRule(
        multiple_rates_enabled=rows.get("shipping_multiple_rates_enabled", "false") == "true",
        free_all=rows.get("shipping_free_all", "false") == "true",
        free_threshold=threshold,
    )


def get_default_rate(db: Session) -> ShippingRate | None:
    return (
        db.query(ShippingRate)
        .filter(ShippingRate.is_active.is_(True), ShippingRate.is_default.is_(True))
        .first()
    )


def get_active_rates(db: Session) -> list[ShippingRate]:
    return (
        db.query(ShippingRate)
        .filter(ShippingRate.is_active.is_(True))
        .order_by(ShippingRate.sort_order)
        .all()
    )


def resolve_rate_for_order(db: Session, client_rate_id: str | None, rule: ShippingRule) -> ShippingRate:
    """The server never trusts the client's shipping choice — plans/09 §20.
    In single-rate mode the client's choice is ignored outright; the default
    rate is charged regardless of what (if anything) was posted."""
    if not rule.multiple_rates_enabled or not client_rate_id:
        rate = get_default_rate(db)
        if rate is None:
            raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "No active shipping rate is configured.")
        return rate

    try:
        rate_uuid = uuid.UUID(client_rate_id)
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid shipping option.")

    rate = db.query(ShippingRate).filter(ShippingRate.id == rate_uuid, ShippingRate.is_active.is_(True)).first()
    if rate is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "That shipping option is no longer available. Please choose another."
        )
    return rate


def shipping_label_for(rate: ShippingRate) -> str:
    return f"{rate.label} · {rate.delivery_estimate}" if rate.delivery_estimate else rate.label
