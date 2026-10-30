from datetime import date, datetime, timedelta
from decimal import Decimal
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.product import Product

EXPIRING_SOON_DAYS = 7


class ExpiryStatus(StrEnum):
    NONE = "none"  # goods that don't expire
    FRESH = "fresh"
    EXPIRING = "expiring"  # the last day counts: goods expiring today can still be sold
    EXPIRED = "expired"


class Batch(TimestampMixin, Base):
    """One delivery of one product: its quantity, cost and expiry date."""

    __tablename__ = "batches"
    __table_args__ = (
        CheckConstraint("received_quantity > 0", name="received_quantity_positive"),
        # The last line of defence: the database itself refuses negative stock.
        CheckConstraint("remaining_quantity >= 0", name="remaining_quantity_not_negative"),
        CheckConstraint("purchase_price >= 0", name="purchase_price_non_negative"),
        # Finding what expires soon, the query the dashboard and alerts will run most.
        Index("ix_batches_store_id_expiry_date", "store_id", "expiry_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)

    # The supplier's lot number, if the packaging has one.
    lot_code: Mapped[str | None] = mapped_column(String(64))
    # NULL for goods that don't expire.
    expiry_date: Mapped[date | None] = mapped_column(Date)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    # Three decimals, because goods sold by weight or volume aren't whole numbers (1.250 kg).
    received_quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3))
    # Always equals the sum of this batch's inventory movements.
    remaining_quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3))
    # What this delivery really cost; the product's price may change later.
    purchase_price: Mapped[Decimal] = mapped_column(Numeric(10, 2))

    product: Mapped["Product"] = relationship()

    @property
    def expiry_status(self) -> ExpiryStatus:
        if self.expiry_date is None:
            return ExpiryStatus.NONE
        today = date.today()
        if self.expiry_date < today:
            return ExpiryStatus.EXPIRED
        if self.expiry_date <= today + timedelta(days=EXPIRING_SOON_DAYS):
            return ExpiryStatus.EXPIRING
        return ExpiryStatus.FRESH
