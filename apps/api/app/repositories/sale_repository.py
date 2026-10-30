"""Data access for sales."""

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import ColumnElement, Subquery, distinct, func, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.batch import Batch
from app.models.inventory_movement import InventoryMovement, MovementType
from app.models.sale import Sale, SaleItem

# Everything a sale's response needs, loaded at once instead of one query per line.
WITH_DETAILS = (
    joinedload(Sale.actor),
    selectinload(Sale.items).options(
        joinedload(SaleItem.product),
        selectinload(SaleItem.movements).joinedload(InventoryMovement.batch),
    ),
)


# Rounded line by line, exactly as SaleItem does, so totals always equal the sum of the sales.
LINE_REVENUE = func.round(SaleItem.quantity * SaleItem.unit_price, 2)


def cost_per_line(store_id: int) -> Subquery:
    return (
        select(
            InventoryMovement.sale_item_id.label("sale_item_id"),
            func.round(func.sum(-InventoryMovement.quantity_delta * Batch.purchase_price), 2).label(
                "cost"
            ),
        )
        .join(Batch, InventoryMovement.batch_id == Batch.id)
        .where(
            InventoryMovement.store_id == store_id,
            InventoryMovement.type == MovementType.SALE,
        )
        .group_by(InventoryMovement.sale_item_id)
        .subquery()
    )


def in_period(
    store_id: int, start: datetime | None, end: datetime | None
) -> list[ColumnElement[bool]]:
    conditions = [Sale.store_id == store_id]
    if start is not None:
        conditions.append(Sale.sold_at >= start)
    if end is not None:
        conditions.append(Sale.sold_at < end)
    return conditions


class SaleRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, entity: Sale | SaleItem) -> None:
        self.session.add(entity)
        self.session.flush()

    def get(self, store_id: int, sale_id: int) -> Sale | None:
        stmt = (
            select(Sale).options(*WITH_DETAILS).where(Sale.store_id == store_id, Sale.id == sale_id)
        )
        return self.session.scalars(stmt).first()

    def search(
        self,
        store_id: int,
        *,
        start: datetime | None,
        end: datetime | None,
        limit: int,
        offset: int,
    ) -> tuple[list[Sale], int]:
        conditions = in_period(store_id, start, end)
        total = self.session.scalar(select(func.count()).select_from(Sale).where(*conditions))
        stmt = (
            select(Sale)
            .options(*WITH_DETAILS)
            .where(*conditions)
            .order_by(Sale.sold_at.desc(), Sale.id.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(self.session.scalars(stmt)), total or 0

    def summarize(
        self, store_id: int, *, start: datetime | None, end: datetime | None
    ) -> tuple[int, Decimal, Decimal]:
        """Number of sales, revenue and cost of a period."""
        costs = cost_per_line(store_id)
        stmt = (
            select(
                func.count(distinct(Sale.id)),
                func.coalesce(func.sum(LINE_REVENUE), 0),
                func.coalesce(func.sum(costs.c.cost), 0),
            )
            .select_from(Sale)
            .join(SaleItem, SaleItem.sale_id == Sale.id)
            .join(costs, costs.c.sale_item_id == SaleItem.id)
            .where(*in_period(store_id, start, end))
        )
        sales, revenue, cost = self.session.execute(stmt).one()
        return sales, revenue, cost

    def daily(
        self, store_id: int, *, start: datetime, end: datetime
    ) -> list[tuple[date, int, Decimal, Decimal]]:
        """Day, number of sales, revenue and cost, only for days that had sales."""
        costs = cost_per_line(store_id)
        # PostgreSQL's time zone decides where a day ends; locally it is the computer's own.
        day = func.date(Sale.sold_at)
        stmt = (
            select(
                day,
                func.count(distinct(Sale.id)),
                func.sum(LINE_REVENUE),
                func.sum(costs.c.cost),
            )
            .select_from(Sale)
            .join(SaleItem, SaleItem.sale_id == Sale.id)
            .join(costs, costs.c.sale_item_id == SaleItem.id)
            .where(*in_period(store_id, start, end))
            .group_by(day)
            .order_by(day)
        )
        return [tuple(row) for row in self.session.execute(stmt)]
