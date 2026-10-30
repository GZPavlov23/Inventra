from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Numeric, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.money import to_cents
from app.db.base import Base
from app.models.inventory_movement import InventoryMovement
from app.models.product import Product
from app.models.user import User


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

    actor: Mapped[User] = relationship()
    items: Mapped[list["SaleItem"]] = relationship(order_by="SaleItem.id")

    @property
    def total(self) -> Decimal:
        return sum((item.total for item in self.items), Decimal(0))

    @property
    def cost(self) -> Decimal:
        return sum((item.cost for item in self.items), Decimal(0))

    @property
    def profit(self) -> Decimal:
        return self.total - self.cost


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

    product: Mapped[Product] = relationship()
    # One per batch the goods came from.
    movements: Mapped[list[InventoryMovement]] = relationship(order_by="InventoryMovement.id")

    # Each line is rounded to cents, so a sale's lines always add up to its total.
    @property
    def total(self) -> Decimal:
        return to_cents(self.quantity * self.unit_price)

    # What these goods really cost: each batch has its own purchase price.
    @property
    def cost(self) -> Decimal:
        batches = ((-line.quantity_delta, line.batch) for line in self.movements)
        return to_cents(sum((amount * b.purchase_price for amount, b in batches), Decimal(0)))
