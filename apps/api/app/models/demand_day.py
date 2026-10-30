from datetime import date
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, ForeignKey, Numeric, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DemandDay(Base):
    """How much of a product sold on one day before the store started using Inventra.

    Imported history for the demand forecast, kept apart from real sales. It has no batches, so
    it has no real cost and doesn't belong in profit reports, and it never touches stock.
    """

    __tablename__ = "demand_history"
    __table_args__ = (
        # One row per product and day, so importing a file again replaces instead of adding up.
        UniqueConstraint("store_id", "product_id", "day"),
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("revenue >= 0", name="revenue_non_negative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id", ondelete="CASCADE"))
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    day: Mapped[date] = mapped_column(Date)
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3))
    revenue: Mapped[Decimal] = mapped_column(Numeric(12, 2))
