"""
Public catalogue API — no auth. See plans/03-backend-fastapi.md §3.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload

from ..config import settings
from ..db import get_db
from ..models import Category, NotifyRequest, Product, ProductOption, Setting
from ..pricing import code_is_valid
from ..schemas import (
    AnnouncementOut,
    BankOut,
    CategoryOut,
    DiscountValidateIn,
    DiscountValidateOut,
    NotifyMeIn,
    ProductOut,
    SettingsOut,
    ShippingRateOut,
)
from ..serializers import serialize_product
from ..shipping import get_active_rates, get_shipping_rule

router = APIRouter(prefix="/api", tags=["public"])


def _product_query(db: Session):
    return db.query(Product).options(
        selectinload(Product.options).selectinload(ProductOption.values),
        selectinload(Product.variants),
        selectinload(Product.images),
    )


@router.get("/products", response_model=list[ProductOut])
def list_products(db: Session = Depends(get_db)):
    products = (
        _product_query(db)
        .filter(Product.is_active.is_(True))
        .order_by(Product.sort_order, Product.created_at)
        .all()
    )
    return [serialize_product(p) for p in products]


@router.get("/products/{slug}", response_model=ProductOut)
def get_product(slug: str, db: Session = Depends(get_db)):
    p = _product_query(db).filter(Product.slug == slug, Product.is_active.is_(True)).first()
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That piece isn't available anymore.")
    return serialize_product(p)


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db)):
    cats = db.query(Category).order_by(Category.sort_order).all()
    return [CategoryOut(slug=c.slug, label=c.label) for c in cats]


def _setting(db: Session, key: str, default: str = "") -> str:
    row = db.query(Setting).filter(Setting.key == key).first()
    return row.value if row else default


@router.get("/settings", response_model=SettingsOut)
def get_settings_endpoint(db: Session = Depends(get_db)):
    rule = get_shipping_rule(db)
    return SettingsOut(
        store_name=settings.STORE_NAME,
        currency=settings.STORE_CURRENCY,
        whatsapp_number=settings.WHATSAPP_NUMBER,
        instagram_url=settings.INSTAGRAM_URL,
        low_stock_at=settings.LOW_STOCK_AT,
        discount_code=settings.DISCOUNT_CODE,
        discount_percent=settings.DISCOUNT_PERCENT,
        bank=BankOut(
            name=settings.BANK_NAME,
            account_title=settings.BANK_ACCOUNT_TITLE,
            account_number=settings.BANK_ACCOUNT_NUMBER,
            iban=settings.BANK_IBAN,
        ),
        announcement=AnnouncementOut(
            enabled=_setting(db, "announcement_enabled", "true") == "true",
            text=_setting(db, "announcement_text", ""),
        ),
        promo_popup_enabled=_setting(db, "promo_popup_enabled", "true") == "true",
        shipping_multiple_rates_enabled=rule.multiple_rates_enabled,
        shipping_free_all=rule.free_all,
        shipping_free_threshold=rule.free_threshold,
        shipping_rates=[
            ShippingRateOut(
                id=str(r.id),
                label=r.label,
                delivery_estimate=r.delivery_estimate,
                fee=r.fee,
                is_default=r.is_default,
                free_shipping_eligible=r.free_shipping_eligible,
            )
            for r in get_active_rates(db)
        ],
    )


@router.post("/discount/validate", response_model=DiscountValidateOut)
def validate_discount(payload: DiscountValidateIn):
    """Convenience only — POST /orders re-validates independently and never
    trusts that this endpoint was called."""
    if code_is_valid(payload.code):
        return DiscountValidateOut(valid=True, percent=settings.DISCOUNT_PERCENT)
    return DiscountValidateOut(valid=False, percent=0)


@router.post("/notify-me", status_code=status.HTTP_204_NO_CONTENT)
def notify_me(payload: NotifyMeIn, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.slug == payload.product_slug).first()
    if not product:
        # Return 204 regardless — do not leak which slugs exist.
        return
    existing = (
        db.query(NotifyRequest)
        .filter(NotifyRequest.product_id == product.id, NotifyRequest.email == payload.email)
        .first()
    )
    if not existing:
        db.add(NotifyRequest(product_id=product.id, email=payload.email))
        db.commit()
    return
