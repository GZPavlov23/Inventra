from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.money import to_cents
from app.db.base import Base, TimestampMixin
from app.models.batch import Batch
from app.models.product import Product
from app.models.supplier import Supplier
from app.models.user import User


class DeliveryStatus(StrEnum):
    ORDERED = "ordered"
    RECEIVED = "received"
    CANCELLED = "cancelled"


class Delivery(TimestampMixin, Base):
    """Goods ordered from a supplier. Stock changes only on the day they are received."""

    __tablename__ = "deliveries"
    __table_args__ = (
        CheckConstraint("(status = 'received') = (received_at IS NOT NULL)", name="received_dated"),
        Index("ix_deliveries_store_id_status", "store_id", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id", ondelete="CASCADE"))
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"), index=True)
    actor_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    status: Mapped[DeliveryStatus] = mapped_column(
        Enum(
            DeliveryStatus,
            name="delivery_status",
            native_enum=False,
            create_constraint=True,
            length=16,
            values_callable=lambda enum: [member.value for member in enum],
        ),
        default=DeliveryStatus.ORDERED,
    )
    expected_on: Mapped[date | None] = mapped_column(Date)
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # The number on the supplier's invoice, to find the paper again.
    invoice_number: Mapped[str | None] = mapped_column(String(64))

    supplier: Mapped[Supplier] = relationship()
    actor: Mapped[User] = relationship()
    items: Mapped[list["DeliveryItem"]] = relationship(order_by="DeliveryItem.id")

    @property
    def ordered_total(self) -> Decimal:
        return sum((item.ordered_total for item in self.items), Decimal(0))

    @property
    def received_total(self) -> Decimal | None:
        if self.status != DeliveryStatus.RECEIVED:
            return None
        return sum((item.received_total for item in self.items), Decimal(0))


class DeliveryItem(Base):
    """One product of a delivery: what was ordered and what really arrived."""

    __tablename__ = "delivery_items"
    __table_args__ = (
        # Two lines of one product couldn't be told apart when the goods arrive.
        UniqueConstraint("delivery_id", "product_id"),
        CheckConstraint("ordered_quantity > 0", name="ordered_quantity_positive"),
        CheckConstraint("unit_cost >= 0", name="unit_cost_non_negative"),
        CheckConstraint("received_quantity >= 0", name="received_quantity_not_negative"),
        # Goods that arrived always became a batch, and a batch always has goods behind it.
        CheckConstraint(
            "(batch_id IS NOT NULL) = (received_quantity IS NOT NULL AND received_quantity > 0)",
            name="received_goods_have_a_batch",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # Deleted with the store directly, for the same reason as sale_items.store_id.
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id", ondelete="CASCADE"))
    delivery_id: Mapped[int] = mapped_column(ForeignKey("deliveries.id", ondelete="CASCADE"))
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    batch_id: Mapped[int | None] = mapped_column(ForeignKey("batches.id"), index=True)

    ordered_quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3))
    # The price agreed when ordering. What was really paid is on the batch.
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    # Empty until the delivery is received. Zero means the goods never came.
    received_quantity: Mapped[Decimal | None] = mapped_column(Numeric(12, 3))

    product: Mapped[Product] = relationship()
    batch: Mapped[Batch | None] = relationship()

    # Each line is rounded to cents, so the lines always add up to the delivery's total.
    @property
    def ordered_total(self) -> Decimal:
        return to_cents(self.ordered_quantity * self.unit_cost)

    @property
    def received_total(self) -> Decimal:
        if self.batch is None:
            return Decimal(0)
        return to_cents(self.batch.received_quantity * self.batch.purchase_price)
