"""
ORM models — mirrors plans/02-database.md §3 exactly. If you change a column
here, change the DDL in that doc too (and vice versa); they are meant to stay
in lockstep since the DDL is what you actually run against Supabase.
"""
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Integer,
    Sequence,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _uuid() -> uuid.UUID:
    return uuid.uuid4()


# --------------------------------------------------------------------- catalogue
class Category(Base):
    __tablename__ = "categories"

    slug: Mapped[str] = mapped_column(String, primary_key=True)
    label: Mapped[str] = mapped_column(String, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class Product(Base):
    __tablename__ = "products"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    slug: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[str] = mapped_column(ForeignKey("categories.slug"), nullable=False, index=True)
    collection: Mapped[str | None] = mapped_column(String, nullable=True)
    base_price: Mapped[int] = mapped_column(Integer, nullable=False)
    material: Mapped[str] = mapped_column(String, nullable=False, default="18k gold-plated stainless steel")
    blurb: Mapped[str] = mapped_column(Text, nullable=False, default="")
    care: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    is_featured: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    __table_args__ = (CheckConstraint("base_price >= 0", name="ck_products_base_price"),)

    options: Mapped[list["ProductOption"]] = relationship(
        back_populates="product", cascade="all, delete-orphan", order_by="ProductOption.position"
    )
    variants: Mapped[list["ProductVariant"]] = relationship(
        back_populates="product", cascade="all, delete-orphan"
    )
    images: Mapped[list["ProductImage"]] = relationship(
        back_populates="product", cascade="all, delete-orphan", order_by="ProductImage.position"
    )


class ProductOption(Base):
    __tablename__ = "product_options"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    key: Mapped[str] = mapped_column(String, nullable=False)  # 'colour'
    label: Mapped[str] = mapped_column(String, nullable=False)  # 'Colour'
    type: Mapped[str] = mapped_column(String, nullable=False)  # 'swatch' | 'segment'
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    __table_args__ = (
        UniqueConstraint("product_id", "key", name="uq_product_options_product_key"),
        CheckConstraint("type in ('swatch','segment')", name="ck_product_options_type"),
    )

    product: Mapped["Product"] = relationship(back_populates="options")
    values: Mapped[list["ProductOptionValue"]] = relationship(
        back_populates="option", cascade="all, delete-orphan", order_by="ProductOptionValue.position"
    )


class ProductOptionValue(Base):
    __tablename__ = "product_option_values"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    option_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("product_options.id", ondelete="CASCADE"), nullable=False)
    value_id: Mapped[str] = mapped_column(String, nullable=False)  # 'gold' — used in variant_key
    label: Mapped[str] = mapped_column(String, nullable=False)  # 'Gold'
    hex: Mapped[str | None] = mapped_column(String, nullable=True)
    price_delta: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    __table_args__ = (UniqueConstraint("option_id", "value_id", name="uq_option_values_option_value"),)

    option: Mapped["ProductOption"] = relationship(back_populates="values")


class ProductVariant(Base):
    """
    A row exists ONLY for combinations that are actually made.
    Absent row  = "never made"  -> hatched, "Not made in this combination."
    stock = 0   = "sold out"    -> struck through, "Sold out."
    """

    __tablename__ = "product_variants"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    variant_key: Mapped[str] = mapped_column(String, nullable=False)  # 'gold|18' or 'default'
    sku: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    stock: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    __table_args__ = (
        UniqueConstraint("product_id", "variant_key", name="uq_variants_product_key"),
        CheckConstraint("stock >= 0", name="ck_variants_stock"),
    )

    product: Mapped["Product"] = relationship(back_populates="variants")


class ProductImage(Base):
    __tablename__ = "product_images"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    colour_key: Mapped[str] = mapped_column(String, nullable=False, default="default")
    url: Mapped[str] = mapped_column(Text, nullable=False)
    storage_path: Mapped[str | None] = mapped_column(Text, nullable=True)  # null for external (seed) URLs
    alt: Mapped[str] = mapped_column(String, nullable=False, default="")
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    product: Mapped["Product"] = relationship(back_populates="images")


# ------------------------------------------------------------------------ orders
order_number_seq = Sequence("order_number_seq", start=1001)


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    order_number: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)

    customer_name: Mapped[str] = mapped_column(String, nullable=False)
    customer_email: Mapped[str] = mapped_column(String, nullable=False)
    customer_phone: Mapped[str] = mapped_column(String, nullable=False)
    address: Mapped[str] = mapped_column(Text, nullable=False)
    city: Mapped[str] = mapped_column(String, nullable=False)
    postal_code: Mapped[str | None] = mapped_column(String, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    payment_method: Mapped[str] = mapped_column(String, nullable=False)  # cod | bank | card
    payment_status: Mapped[str] = mapped_column(String, nullable=False)  # pending | awaiting_transfer | simulated | paid | refunded
    status: Mapped[str] = mapped_column(String, nullable=False, default="new", index=True)

    subtotal: Mapped[int] = mapped_column(Integer, nullable=False)
    discount_code: Mapped[str | None] = mapped_column(String, nullable=True)
    discount_amount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    delivery_fee: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total: Mapped[int] = mapped_column(Integer, nullable=False)

    email_status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    email_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), index=True)
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("payment_method in ('cod','bank','card')", name="ck_orders_payment_method"),
        CheckConstraint(
            "payment_status in ('pending','awaiting_transfer','simulated','paid','refunded')",
            name="ck_orders_payment_status",
        ),
        CheckConstraint(
            "status in ('new','confirmed','packed','shipped','delivered','cancelled')",
            name="ck_orders_status",
        ),
        CheckConstraint(
            "email_status in ('pending','sent','partial','failed')", name="ck_orders_email_status"
        ),
    )

    items: Mapped[list["OrderItem"]] = relationship(back_populates="order", cascade="all, delete-orphan")


class OrderItem(Base):
    """Denormalised on purpose — an order is a historical record and must not
    change when a product is later renamed, repriced, or deleted."""

    __tablename__ = "order_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("products.id", ondelete="SET NULL"), nullable=True)
    variant_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("product_variants.id", ondelete="SET NULL"), nullable=True)

    product_name: Mapped[str] = mapped_column(String, nullable=False)
    selection_label: Mapped[str] = mapped_column(String, nullable=False, default="")
    sku: Mapped[str] = mapped_column(String, nullable=False)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    unit_price: Mapped[int] = mapped_column(Integer, nullable=False)
    qty: Mapped[int] = mapped_column(Integer, nullable=False)
    line_total: Mapped[int] = mapped_column(Integer, nullable=False)

    __table_args__ = (CheckConstraint("qty > 0", name="ck_order_items_qty"),)

    order: Mapped["Order"] = relationship(back_populates="items")


# ------------------------------------------------------------------------ extras
class NotifyRequest(Base):
    __tablename__ = "notify_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    email: Mapped[str] = mapped_column(String, nullable=False)
    notified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (UniqueConstraint("product_id", "email", name="uq_notify_product_email"),)


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
