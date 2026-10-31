"""Read-only queries behind the dashboard's reports."""

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.batch import Batch
from app.models.inventory_movement import InventoryMovement, MovementType
from app.models.product import Product
from app.models.sale import Sale, SaleItem
from app.repositories.sale_repository import LINE_REVENUE, cost_per_line, in_period


class ReportRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def waste(
        self, store_id: int, *, start: datetime | None, end: datetime | None
    ) -> list[tuple[str, Decimal, int]]:
        """Reason, value at the batches' purchase prices and number of write-offs."""
        value = func.sum(-InventoryMovement.quantity_delta * Batch.purchase_price)
        stmt = (
            select(InventoryMovement.reason, value, func.count())
            .join(Batch, InventoryMovement.batch_id == Batch.id)
            .where(
                InventoryMovement.store_id == store_id,
                InventoryMovement.type == MovementType.WASTE,
                InventoryMovement.occurred_at >= start,
                InventoryMovement.occurred_at < end,
            )
            .group_by(InventoryMovement.reason)
            .order_by(value.desc())
        )
        return [tuple(row) for row in self.session.execute(stmt)]

    def sold_quantities(
        self, store_id: int, *, start: datetime | None, end: datetime | None
    ) -> list[tuple[Product, Decimal]]:
        """How much of each active product was sold in the period."""
        stmt = (
            select(Product, func.sum(SaleItem.quantity))
            .join(SaleItem, SaleItem.product_id == Product.id)
            .join(Sale, SaleItem.sale_id == Sale.id)
            .where(*in_period(store_id, start, end), Product.active)
            .group_by(Product.id)
        )
        return [tuple(row) for row in self.session.execute(stmt)]

    def sellable_stock(self, store_id: int, today: date) -> dict[int, Decimal]:
        """Stock per product, without expired goods: those can't be sold anymore."""
        stmt = (
            select(Batch.product_id, func.sum(Batch.remaining_quantity))
            .where(
                Batch.store_id == store_id,
                Batch.remaining_quantity > 0,
                or_(Batch.expiry_date.is_(None), Batch.expiry_date >= today),
            )
            .group_by(Batch.product_id)
        )
        return {product_id: stock for product_id, stock in self.session.execute(stmt)}

    def sellable_batches(self, store_id: int, today: date) -> list[Batch]:
        stmt = select(Batch).where(
            Batch.store_id == store_id,
            Batch.remaining_quantity > 0,
            or_(Batch.expiry_date.is_(None), Batch.expiry_date >= today),
        )
        return list(self.session.scalars(stmt))

    def top_products(
        self, store_id: int, *, start: datetime | None, end: datetime | None, limit: int
    ) -> list[tuple[Product, Decimal, Decimal, Decimal]]:
        """Product, quantity sold, revenue and cost, the most profitable first."""
        costs = cost_per_line(store_id)
        revenue = func.sum(LINE_REVENUE)
        cost = func.sum(costs.c.cost)
        stmt = (
            select(Product, func.sum(SaleItem.quantity), revenue, cost)
            .join(SaleItem, SaleItem.product_id == Product.id)
            .join(Sale, SaleItem.sale_id == Sale.id)
            .join(costs, costs.c.sale_item_id == SaleItem.id)
            .where(*in_period(store_id, start, end))
            .group_by(Product.id)
            .order_by((revenue - cost).desc(), Product.id)
            .limit(limit)
        )
        return [tuple(row) for row in self.session.execute(stmt)]

    def categories(
        self, store_id: int, *, start: datetime | None, end: datetime | None
    ) -> list[tuple[str | None, Decimal, Decimal]]:
        """Category, revenue and cost, the biggest revenue first."""
        costs = cost_per_line(store_id)
        revenue = func.sum(LINE_REVENUE)
        stmt = (
            select(Product.category, revenue, func.sum(costs.c.cost))
            .select_from(SaleItem)
            .join(Product, SaleItem.product_id == Product.id)
            .join(Sale, SaleItem.sale_id == Sale.id)
            .join(costs, costs.c.sale_item_id == SaleItem.id)
            .where(*in_period(store_id, start, end))
            .group_by(Product.category)
            .order_by(revenue.desc())
        )
        return [tuple(row) for row in self.session.execute(stmt)]
