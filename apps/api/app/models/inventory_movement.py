from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.batch import Batch
from app.models.user import User


class MovementType(StrEnum):
    RECEIPT = "receipt"
    ADJUSTMENT = "adjustment"
    WASTE = "waste"
    SALE = "sale"


class InventoryMovement(Base):
    """One line of the stock history. Rows are only ever added, never changed or deleted."""

    __tablename__ = "inventory_movements"
    __table_args__ = (
        CheckConstraint("quantity_delta <> 0", name="quantity_delta_not_zero"),
        CheckConstraint(
            "(type <> 'receipt' OR quantity_delta > 0) "
            "AND (type NOT IN ('waste', 'sale') OR quantity_delta < 0)",
            name="quantity_delta_matches_type",
        ),
        # Stock must never change without an explanation. Goods arriving or being sold explain
        # themselves; a sale's explanation is the sale line it points to.
        CheckConstraint(
            "type IN ('receipt', 'sale') OR reason IS NOT NULL", name="reason_required"
        ),
        CheckConstraint("(type = 'sale') = (sale_item_id IS NOT NULL)", name="sale_has_item"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    batch_id: Mapped[int] = mapped_column(ForeignKey("batches.id"), index=True)
    actor_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    sale_item_id: Mapped[int | None] = mapped_column(ForeignKey("sale_items.id"), index=True)

    type: Mapped[MovementType] = mapped_column(
        Enum(
            MovementType,
            name="movement_type",
            native_enum=False,
            create_constraint=True,
            length=16,
            values_callable=lambda enum: [member.value for member in enum],
        )
    )
    # Positive when stock grows, negative when it shrinks.
    quantity_delta: Mapped[Decimal] = mapped_column(Numeric(12, 3))
    reason: Mapped[str | None] = mapped_column(String(200))
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    actor: Mapped[User] = relationship()
    batch: Mapped[Batch] = relationship()
