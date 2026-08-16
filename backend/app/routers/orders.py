"""
POST /api/orders — the transaction that matters. See plans/03-backend-fastapi.md §4.

The browser proposes; the server decides (plans/01 §4). This endpoint accepts
only { items, customer, paymentMethod, discountCode } — no prices, no totals,
no card data — and recomputes everything from the database inside a single
locked transaction.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..email.sender import send_order_emails
from ..models import Order, OrderItem, Product, ProductVariant, order_number_seq
from ..pricing import PricedLine, compute_totals, selection_label_for_variant, unit_price_for_variant
from ..schemas import OrderCreateIn, OrderLineOut, OrderOut, OrderProblem

log = logging.getLogger("mayra.orders")

router = APIRouter(prefix="/api", tags=["orders"])

_PAYMENT_STATUS = {
    "cod": "pending",
    "bank": "awaiting_transfer",
    "card": "simulated",
}


def _first_product_image(product: Product) -> str | None:
    if not product.images:
        return None
    default_imgs = [i for i in product.images if i.colour_key == "default"]
    pool = default_imgs or list(product.images)
    return sorted(pool, key=lambda i: i.position)[0].url if pool else None


@router.post("/orders", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
def create_order(payload: OrderCreateIn, db: Session = Depends(get_db)):
    if not payload.items:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Your bag is empty.")

    slugs = {item.product_slug for item in payload.items}

    # Lock only the variant rows (FOR UPDATE OF), ordered by id, so two
    # concurrent buyers of the same last piece are serialised deterministically
    # rather than deadlocking on inconsistent lock order.
    rows = (
        db.query(Product, ProductVariant)
        .join(ProductVariant, ProductVariant.product_id == Product.id)
        .filter(Product.slug.in_(slugs))
        .order_by(ProductVariant.id)
        .with_for_update(of=ProductVariant)
        .all()
    )
    index: dict[tuple[str, str], tuple[Product, ProductVariant]] = {
        (product.slug, variant.variant_key): (product, variant) for product, variant in rows
    }

    # Collect every problem before failing once, so the cart can flag every
    # affected line in one round trip instead of a fix-resubmit-discover loop.
    problems: list[OrderProblem] = []
    resolved: list[tuple[Product, ProductVariant, int]] = []
    for item in payload.items:
        found = index.get((item.product_slug, item.variant_key))
        if found is None or not found[0].is_active:
            problems.append(
                OrderProblem(product_slug=item.product_slug, variant_key=item.variant_key, reason="unavailable")
            )
            continue
        product, variant = found
        if variant.stock < item.qty:
            problems.append(
                OrderProblem(
                    product_slug=item.product_slug,
                    variant_key=item.variant_key,
                    reason="insufficient",
                    available=variant.stock,
                )
            )
            continue
        resolved.append((product, variant, item.qty))

    if problems:
        # 409, not 400: the request was well-formed, the world changed
        # underneath it — see plans/03-backend-fastapi.md §4.2.
        raise HTTPException(status.HTTP_409_CONFLICT, detail={"problems": [p.model_dump(by_alias=True) for p in problems]})

    # Price from the database. The client's numbers, if it sent any, are ignored.
    priced_lines: list[PricedLine] = []
    for product, variant, qty in resolved:
        unit_price = unit_price_for_variant(product, variant.variant_key)
        label = selection_label_for_variant(product, variant.variant_key)
        priced_lines.append(
            PricedLine(product=product, variant=variant, selection_label=label, unit_price=unit_price, qty=qty)
        )

    totals = compute_totals(priced_lines, payload.discount_code)

    # Decrement stock, track anything that crosses the low-stock line for the owner email.
    low_stock_lines: list[str] = []
    for line in priced_lines:
        line.variant.stock -= line.qty
        if 0 < line.variant.stock <= settings.LOW_STOCK_AT:
            suffix = f" ({line.selection_label})" if line.selection_label else ""
            low_stock_lines.append(f"{line.product.name}{suffix} is down to {line.variant.stock} after this order.")

    order_number = f"MYR-{db.execute(select(order_number_seq.next_value())).scalar()}"

    order = Order(
        order_number=order_number,
        customer_name=payload.customer.name.strip(),
        customer_email=str(payload.customer.email),
        customer_phone=payload.customer.phone.strip(),
        address=payload.customer.address.strip(),
        city=payload.customer.city.strip(),
        postal_code=payload.customer.postal_code,
        note=payload.customer.note,
        payment_method=payload.payment_method,
        payment_status=_PAYMENT_STATUS[payload.payment_method],
        status="new",
        subtotal=totals.subtotal,
        discount_code=payload.discount_code if totals.discount_amount else None,
        discount_amount=totals.discount_amount,
        delivery_fee=totals.delivery_fee,
        total=totals.total,
        email_status="pending",
    )
    db.add(order)
    db.flush()  # get order.id without committing yet

    for line in priced_lines:
        db.add(
            OrderItem(
                order_id=order.id,
                product_id=line.product.id,
                variant_id=line.variant.id,
                product_name=line.product.name,
                selection_label=line.selection_label,
                sku=line.variant.sku,
                image_url=_first_product_image(line.product),
                unit_price=line.unit_price,
                qty=line.qty,
                line_total=line.line_total,
            )
        )

    db.commit()
    db.refresh(order)

    # Email is best-effort and deliberately OUTSIDE the write transaction —
    # an order that already succeeded must not be undone by a slow mail API.
    # See plans/03-backend-fastapi.md §4.4 and plans/06-email.md §6.
    try:
        email_status, email_error = send_order_emails(order, low_stock_lines)
    except Exception as e:  # noqa: BLE001 — never let email crash a completed order
        log.exception("send_order_emails raised for %s", order.order_number)
        email_status, email_error = "failed", str(e)[:2000]

    order.email_status = email_status
    order.email_error = email_error
    db.commit()
    db.refresh(order)

    return OrderOut(
        order_number=order.order_number,
        subtotal=order.subtotal,
        discount_amount=order.discount_amount,
        delivery_fee=order.delivery_fee,
        total=order.total,
        payment_method=order.payment_method,
        payment_status=order.payment_status,
        items=[
            OrderLineOut(
                product_name=i.product_name,
                selection_label=i.selection_label,
                sku=i.sku,
                image_url=i.image_url,
                unit_price=i.unit_price,
                qty=i.qty,
                line_total=i.line_total,
            )
            for i in order.items
        ],
    )
