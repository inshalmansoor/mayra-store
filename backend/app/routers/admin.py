"""
Admin API — everything behind the password. See plans/03-backend-fastapi.md §5
and plans/05-admin-panel.md.

Split into two routers on purpose:
  - `auth_router`  (login/logout) has NO auth dependency — it's how you get one.
  - `router`       carries `dependencies=[Depends(get_current_admin)]` at
                    ROUTER level, so any endpoint added later is protected by
                    default rather than by remembering a per-route decorator.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session, selectinload

from ..config import settings
from ..db import get_db
from ..email.sender import send_order_emails
from ..models import (
    NotifyRequest,
    Order,
    Product,
    ProductImage,
    ProductOption,
    ProductOptionValue,
    ProductVariant,
    Setting,
    ShippingRate,
)
from ..schemas import (
    AdminLoginIn,
    OptionsReplaceIn,
    OrderStatusUpdateIn,
    ProductCreateIn,
    ProductUpdateIn,
    ShippingRateCreateIn,
    ShippingRateUpdateIn,
    SettingUpdateIn,
    VariantCreateIn,
    VariantUpdateIn,
)
from ..security import check_password, clear_session_cookie, get_current_admin, issue_token, set_session_cookie
from ..storage import delete_product_image, upload_product_image

# --------------------------------------------------------------------- auth
auth_router = APIRouter(prefix="/api/admin", tags=["admin-auth"])


@auth_router.post("/login")
def login(payload: AdminLoginIn, response: Response):
    if not check_password(payload.password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect password.")
    set_session_cookie(response, issue_token())
    return {"ok": True}


@auth_router.post("/logout")
def logout(response: Response):
    clear_session_cookie(response)
    return {"ok": True}


# ------------------------------------------------------------------ protected
router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(get_current_admin)])


@router.get("/me")
def me(admin: str = Depends(get_current_admin)):
    return {"ok": True}


def _product_query(db: Session):
    return db.query(Product).options(
        selectinload(Product.options).selectinload(ProductOption.values),
        selectinload(Product.variants),
        selectinload(Product.images),
    )


def _uid(v: str) -> uuid.UUID:
    try:
        return uuid.UUID(v)
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid id.")


def _admin_product_dict(p: Product) -> dict:
    return {
        "id": str(p.id),
        "slug": p.slug,
        "name": p.name,
        "category": p.category,
        "collection": p.collection,
        "basePrice": p.base_price,
        "material": p.material,
        "blurb": p.blurb,
        "care": list(p.care or []),
        "isActive": p.is_active,
        "isFeatured": p.is_featured,
        "sortOrder": p.sort_order,
        "options": [
            {
                "id": str(o.id),
                "key": o.key,
                "label": o.label,
                "type": o.type,
                "position": o.position,
                "values": [
                    {
                        "id": str(v.id),
                        "valueId": v.value_id,
                        "label": v.label,
                        "hex": v.hex,
                        "priceDelta": v.price_delta,
                        "position": v.position,
                    }
                    for v in sorted(o.values, key=lambda v: v.position)
                ],
            }
            for o in sorted(p.options, key=lambda o: o.position)
        ],
        "variants": [
            {"id": str(v.id), "variantKey": v.variant_key, "sku": v.sku, "stock": v.stock}
            for v in p.variants
        ],
        "images": [
            {
                "id": str(i.id),
                "colourKey": i.colour_key,
                "url": i.url,
                "alt": i.alt,
                "position": i.position,
            }
            for i in sorted(p.images, key=lambda i: i.position)
        ],
    }


# --------------------------------------------------------------------- products
@router.get("/products")
def list_products(db: Session = Depends(get_db)):
    products = _product_query(db).order_by(Product.sort_order, Product.created_at).all()
    return [_admin_product_dict(p) for p in products]


@router.get("/products/{product_id}")
def get_product(product_id: str, db: Session = Depends(get_db)):
    p = _product_query(db).filter(Product.id == _uid(product_id)).first()
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found.")
    return _admin_product_dict(p)


@router.post("/products", status_code=status.HTTP_201_CREATED)
def create_product(payload: ProductCreateIn, db: Session = Depends(get_db)):
    if db.query(Product).filter(Product.slug == payload.slug).first():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That slug is already in use.")
    p = Product(**payload.model_dump())
    db.add(p)
    db.commit()
    db.refresh(p)
    return _admin_product_dict(p)


@router.patch("/products/{product_id}")
def update_product(product_id: str, payload: ProductUpdateIn, db: Session = Depends(get_db)):
    p = db.query(Product).filter(Product.id == _uid(product_id)).first()
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found.")
    updates = payload.model_dump(exclude_unset=True)
    if updates.get("is_featured"):
        featured_count = db.query(Product).filter(Product.is_featured.is_(True), Product.id != p.id).count()
        if featured_count >= 4:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Four products are already featured — the landing page shows exactly four.",
            )
    for field, value in updates.items():
        setattr(p, field, value)
    db.commit()
    db.refresh(p)
    return _admin_product_dict(p)


@router.delete("/products/{product_id}")
def deactivate_product(product_id: str, db: Session = Depends(get_db)):
    """Soft delete — is_active = false. Never a hard delete: order_items
    references products, and past orders must survive."""
    p = db.query(Product).filter(Product.id == _uid(product_id)).first()
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found.")
    p.is_active = False
    db.commit()
    return {"ok": True}


# --------------------------------------------------------------------- options
@router.put("/products/{product_id}/options")
def replace_options(product_id: str, payload: OptionsReplaceIn, db: Session = Depends(get_db)):
    """Rebuilds the option set. Because variant_key is built positionally
    from options (plans/02 §4), changing options invalidates every existing
    variant_key. This endpoint requires payload.confirm == true and, when not
    confirmed, returns a preview of the consequence instead of writing
    anything — see plans/05-admin-panel.md §5.3."""
    p = (
        db.query(Product)
        .options(selectinload(Product.options).selectinload(ProductOption.values), selectinload(Product.variants))
        .filter(Product.id == _uid(product_id))
        .first()
    )
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found.")

    old_keys = {v.variant_key: v for v in p.variants}
    old_option_keys_ordered = [o.key for o in sorted(p.options, key=lambda o: o.position)]
    new_option_keys_ordered = [o.key for o in sorted(payload.options, key=lambda o: o.position)]

    # A variant survives the rebuild only if the axis set is IDENTICAL — if an
    # axis was added or removed, every old key's positional meaning changes,
    # so there is nothing safe to remap it to.
    can_remap = old_option_keys_ordered == new_option_keys_ordered
    surviving = old_keys if can_remap else {}
    lost = [] if can_remap else [{"variantKey": k, "sku": v.sku, "stock": v.stock} for k, v in old_keys.items()]

    if not payload.confirm:
        return {
            "preview": True,
            "willRemoveCombinations": len(lost) if not can_remap else 0,
            "lostVariants": lost,
            "note": "POST again with confirm=true to apply. Existing variant stock/SKUs for combinations "
            "that no longer exist will be permanently removed from the editable set (past orders keep "
            "their own snapshot and are unaffected).",
        }

    # Replace options wholesale.
    for old_opt in list(p.options):
        db.delete(old_opt)
    db.flush()

    for opt_in in sorted(payload.options, key=lambda o: o.position):
        opt = ProductOption(product_id=p.id, key=opt_in.key, label=opt_in.label, type=opt_in.type, position=opt_in.position)
        db.add(opt)
        db.flush()
        for val_in in sorted(opt_in.values, key=lambda v: v.position):
            db.add(
                ProductOptionValue(
                    option_id=opt.id,
                    value_id=val_in.value_id,
                    label=val_in.label,
                    hex=val_in.hex,
                    price_delta=val_in.price_delta,
                    position=val_in.position,
                )
            )

    if not can_remap:
        for variant_key in old_keys:
            v = db.query(ProductVariant).filter(ProductVariant.id == old_keys[variant_key].id).first()
            if v:
                db.delete(v)

    db.commit()
    db.refresh(p)
    return _admin_product_dict(p)


# --------------------------------------------------------------------- variants
@router.post("/products/{product_id}/variants", status_code=status.HTTP_201_CREATED)
def add_variant(product_id: str, payload: VariantCreateIn, db: Session = Depends(get_db)):
    p = db.query(Product).filter(Product.id == _uid(product_id)).first()
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found.")
    if db.query(ProductVariant).filter(ProductVariant.sku == payload.sku).first():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That SKU is already in use.")
    existing = (
        db.query(ProductVariant)
        .filter(ProductVariant.product_id == p.id, ProductVariant.variant_key == payload.variant_key)
        .first()
    )
    if existing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That combination already exists.")
    v = ProductVariant(product_id=p.id, variant_key=payload.variant_key, sku=payload.sku, stock=payload.stock)
    db.add(v)
    db.commit()
    db.refresh(v)
    return {"id": str(v.id), "variantKey": v.variant_key, "sku": v.sku, "stock": v.stock}


@router.patch("/variants/{variant_id}")
def update_variant(variant_id: str, payload: VariantUpdateIn, db: Session = Depends(get_db)):
    v = db.query(ProductVariant).filter(ProductVariant.id == _uid(variant_id)).first()
    if not v:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Variant not found.")
    updates = payload.model_dump(exclude_unset=True)
    if "sku" in updates and updates["sku"] != v.sku:
        if db.query(ProductVariant).filter(ProductVariant.sku == updates["sku"]).first():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "That SKU is already in use.")
    for field, value in updates.items():
        setattr(v, field, value)
    db.commit()
    db.refresh(v)
    return {"id": str(v.id), "variantKey": v.variant_key, "sku": v.sku, "stock": v.stock}


@router.delete("/variants/{variant_id}")
def delete_variant(variant_id: str, db: Session = Depends(get_db)):
    """Removing a variant row means 'we never made this combination' — the
    storefront then shows the hatched state, not the struck-through sold-out
    state. To mark something sold out instead, PATCH stock to 0."""
    v = db.query(ProductVariant).filter(ProductVariant.id == _uid(variant_id)).first()
    if not v:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Variant not found.")
    db.delete(v)
    db.commit()
    return {"ok": True}


# --------------------------------------------------------------------- images
@router.post("/products/{product_id}/images", status_code=status.HTTP_201_CREATED)
async def upload_image(
    product_id: str,
    colour_key: str = "default",
    alt: str = "",
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    p = db.query(Product).filter(Product.id == _uid(product_id)).first()
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found.")
    url, storage_path = await upload_product_image(str(p.id), file)
    max_pos = db.query(ProductImage).filter(ProductImage.product_id == p.id).count()
    img = ProductImage(product_id=p.id, colour_key=colour_key or "default", url=url, storage_path=storage_path, alt=alt, position=max_pos)
    db.add(img)
    db.commit()
    db.refresh(img)
    return {"id": str(img.id), "colourKey": img.colour_key, "url": img.url, "alt": img.alt, "position": img.position}


@router.delete("/images/{image_id}")
async def delete_image(image_id: str, db: Session = Depends(get_db)):
    img = db.query(ProductImage).filter(ProductImage.id == _uid(image_id)).first()
    if not img:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Image not found.")
    await delete_product_image(img.storage_path)
    db.delete(img)
    db.commit()
    return {"ok": True}


# --------------------------------------------------------------------- orders
@router.get("/orders")
def list_orders(
    status_filter: str | None = None,
    page: int = 1,
    page_size: int = 25,
    db: Session = Depends(get_db),
):
    q = db.query(Order)
    if status_filter:
        q = q.filter(Order.status == status_filter)
    total = q.count()
    orders = q.order_by(Order.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "total": total,
        "page": page,
        "pageSize": page_size,
        "orders": [
            {
                "id": str(o.id),
                "orderNumber": o.order_number,
                "createdAt": o.created_at.isoformat(),
                "customerName": o.customer_name,
                "total": o.total,
                "paymentMethod": o.payment_method,
                "paymentStatus": o.payment_status,
                "status": o.status,
                "emailStatus": o.email_status,
            }
            for o in orders
        ],
    }


def _order_dict(o: Order) -> dict:
    return {
        "id": str(o.id),
        "orderNumber": o.order_number,
        "createdAt": o.created_at.isoformat(),
        "customerName": o.customer_name,
        "customerEmail": o.customer_email,
        "customerPhone": o.customer_phone,
        "address": o.address,
        "city": o.city,
        "postalCode": o.postal_code,
        "note": o.note,
        "paymentMethod": o.payment_method,
        "paymentStatus": o.payment_status,
        "status": o.status,
        "subtotal": o.subtotal,
        "discountCode": o.discount_code,
        "discountAmount": o.discount_amount,
        "deliveryFee": o.delivery_fee,
        "shippingLabel": o.shipping_label,
        "total": o.total,
        "emailStatus": o.email_status,
        "emailError": o.email_error,
        "items": [
            {
                "productName": i.product_name,
                "selectionLabel": i.selection_label,
                "sku": i.sku,
                "imageUrl": i.image_url,
                "unitPrice": i.unit_price,
                "qty": i.qty,
                "lineTotal": i.line_total,
            }
            for i in o.items
        ],
    }


@router.get("/orders/{order_id}")
def get_order(order_id: str, db: Session = Depends(get_db)):
    o = db.query(Order).options(selectinload(Order.items)).filter(Order.id == _uid(order_id)).first()
    if not o:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found.")
    return _order_dict(o)


@router.patch("/orders/{order_id}")
def update_order(order_id: str, payload: OrderStatusUpdateIn, db: Session = Depends(get_db)):
    o = db.query(Order).options(selectinload(Order.items)).filter(Order.id == _uid(order_id)).first()
    if not o:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found.")
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        if value is not None:
            setattr(o, field, value)
    db.commit()
    db.refresh(o)
    return _order_dict(o)


@router.post("/orders/{order_id}/resend-email")
def resend_email(order_id: str, db: Session = Depends(get_db)):
    o = db.query(Order).options(selectinload(Order.items)).filter(Order.id == _uid(order_id)).first()
    if not o:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found.")
    email_status, email_error = send_order_emails(o, [])
    o.email_status = email_status
    o.email_error = email_error
    db.commit()
    return {"emailStatus": o.email_status, "emailError": o.email_error}


# --------------------------------------------------------------------- notify-requests
@router.get("/notify-requests")
def list_notify_requests(db: Session = Depends(get_db)):
    rows = (
        db.query(NotifyRequest, Product)
        .join(Product, Product.id == NotifyRequest.product_id)
        .order_by(NotifyRequest.created_at.desc())
        .all()
    )
    return [
        {
            "id": str(n.id),
            "productSlug": p.slug,
            "productName": p.name,
            "email": n.email,
            "notified": n.notified,
            "createdAt": n.created_at.isoformat(),
        }
        for n, p in rows
    ]


# --------------------------------------------------------------------- settings
@router.get("/settings")
def get_settings_admin(db: Session = Depends(get_db)):
    rows = db.query(Setting).all()
    return {r.key: r.value for r in rows}


# -------------------------------------------------------------------- shipping
# Guardrails (plans/09 §21): at least one active rate must always exist,
# exactly one active rate is the default, and the default can never be
# deactivated without another being promoted first — is_default is not just
# the checkout pre-selection, it's the ONLY rate charged when
# shipping_multiple_rates_enabled is off.
def _shipping_rate_dict(r: ShippingRate) -> dict:
    return {
        "id": str(r.id),
        "label": r.label,
        "deliveryEstimate": r.delivery_estimate,
        "fee": r.fee,
        "isActive": r.is_active,
        "isDefault": r.is_default,
        "freeShippingEligible": r.free_shipping_eligible,
        "sortOrder": r.sort_order,
    }


def _guard_deactivation(db: Session, r: ShippingRate) -> None:
    if r.is_default:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "This is the default rate — set another rate as default before deactivating it.",
        )
    active_count = db.query(ShippingRate).filter(ShippingRate.is_active.is_(True)).count()
    if active_count <= 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "At least one active shipping rate must exist.")


@router.get("/shipping-rates")
def list_shipping_rates(db: Session = Depends(get_db)):
    rates = db.query(ShippingRate).order_by(ShippingRate.sort_order).all()
    return [_shipping_rate_dict(r) for r in rates]


@router.post("/shipping-rates", status_code=status.HTTP_201_CREATED)
def create_shipping_rate(payload: ShippingRateCreateIn, db: Session = Depends(get_db)):
    # The very first rate ever created must be active and default — there is
    # never a moment with a rate list but no default.
    is_first = db.query(ShippingRate).count() == 0
    make_default = payload.is_default or is_first
    if make_default:
        db.query(ShippingRate).filter(ShippingRate.is_default.is_(True)).update({"is_default": False})
    r = ShippingRate(
        label=payload.label,
        delivery_estimate=payload.delivery_estimate,
        fee=payload.fee,
        is_active=True,
        is_default=make_default,
        free_shipping_eligible=payload.free_shipping_eligible,
        sort_order=payload.sort_order,
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return _shipping_rate_dict(r)


@router.patch("/shipping-rates/{rate_id}")
def update_shipping_rate(rate_id: str, payload: ShippingRateUpdateIn, db: Session = Depends(get_db)):
    r = db.query(ShippingRate).filter(ShippingRate.id == _uid(rate_id)).first()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Shipping rate not found.")
    updates = payload.model_dump(exclude_unset=True)

    if updates.get("is_active") is False and r.is_active:
        _guard_deactivation(db, r)
    if updates.get("is_default") is False and r.is_default:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Every rate list needs a default — set another rate as default instead of clearing this one.",
        )
    if updates.get("is_default") is True and not r.is_default:
        db.query(ShippingRate).filter(ShippingRate.id != r.id, ShippingRate.is_default.is_(True)).update(
            {"is_default": False}
        )

    for field, value in updates.items():
        setattr(r, field, value)
    db.commit()
    db.refresh(r)
    return _shipping_rate_dict(r)


@router.delete("/shipping-rates/{rate_id}")
def deactivate_shipping_rate(rate_id: str, db: Session = Depends(get_db)):
    """Soft delete only — orders.shipping_rate_id references this row and
    past orders must survive, the same reason deactivate_product never hard-
    deletes."""
    r = db.query(ShippingRate).filter(ShippingRate.id == _uid(rate_id)).first()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Shipping rate not found.")
    if r.is_active:
        _guard_deactivation(db, r)
        r.is_active = False
        db.commit()
    return {"ok": True}


@router.patch("/settings/{key}")
def update_setting(key: str, payload: SettingUpdateIn, db: Session = Depends(get_db)):
    row = db.query(Setting).filter(Setting.key == key).first()
    if not row:
        row = Setting(key=key, value=payload.value)
        db.add(row)
    else:
        row.value = payload.value
    db.commit()
    return {"key": key, "value": payload.value}
