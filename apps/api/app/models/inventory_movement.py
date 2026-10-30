from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class MovementType(StrEnum):
    RECEIPT = "receipt"
    ADJUSTMENT = "adjustment"
    WASTE = "waste"


class InventoryMovement(Base):
    """One line of the stock history. Rows are only ever added, never changed or deleted."""

    __tablename__ = "inventory_movements"
    __table_args__ = (
        CheckConstraint("quantity_delta <> 0", name="quantity_delta_not_zero"),
        CheckConstraint(
            "(type <> 'receipt' OR quantity_delta > 0) AND (type <> 'waste' OR quantity_delta < 0)",
            name="quantity_delta_matches_type",
        ),
        # Stock must never change without an explanation, except when goods arrive.
        CheckConstraint("type = 'receipt' OR reason IS NOT NULL", name="reason_required"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    batch_id: Mapped[int] = mapped_column(ForeignKey("batches.id"), index=True)
    actor_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

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
