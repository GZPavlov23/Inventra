from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Numeric, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Sale(Base):
    """One customer's purchase. Which batches the goods came from is in the stock history."""

    __tablename__ = "sales"
    __table_args__ = (
        # Sales of a period: the query behind every report and the demand forecast.
        Index("ix_sales_store_id_sold_at", "store_id", "sold_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id", ondelete="CASCADE"), index=True)
    actor_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    sold_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    items: Mapped[list["SaleItem"]] = relationship(order_by="SaleItem.id")


class SaleItem(Base):
    """One line of a sale."""

    __tablename__ = "sale_items"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("unit_price >= 0", name="unit_price_non_negative"),
        # How much of a product a store sold: what the demand forecast learns from.
        Index("ix_sale_items_store_id_product_id", "store_id", "product_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # Also deletes the lines directly with the store: if they waited for their sale to be
    # deleted first, PostgreSQL would refuse to delete the store's products before that.
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id", ondelete="CASCADE"))
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)

    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3))
    # The price of this sale; the product's price may change later.
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
