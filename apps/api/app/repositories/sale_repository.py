"""Data access for sales."""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import ColumnElement, distinct, func, select
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
        """Number of sales, revenue and cost. Rounds line by line, exactly as SaleItem does."""
        cost_per_line = (
            select(
                InventoryMovement.sale_item_id.label("sale_item_id"),
                func.round(
                    func.sum(-InventoryMovement.quantity_delta * Batch.purchase_price), 2
                ).label("cost"),
            )
            .join(Batch, InventoryMovement.batch_id == Batch.id)
            .where(
                InventoryMovement.store_id == store_id,
                InventoryMovement.type == MovementType.SALE,
            )
            .group_by(InventoryMovement.sale_item_id)
            .subquery()
        )
        stmt = (
            select(
                func.count(distinct(Sale.id)),
                func.coalesce(func.sum(func.round(SaleItem.quantity * SaleItem.unit_price, 2)), 0),
                func.coalesce(func.sum(cost_per_line.c.cost), 0),
            )
            .select_from(Sale)
            .join(SaleItem, SaleItem.sale_id == Sale.id)
            .join(cost_per_line, cost_per_line.c.sale_item_id == SaleItem.id)
            .where(*in_period(store_id, start, end))
        )
        sales, revenue, cost = self.session.execute(stmt).one()
        return sales, revenue, cost
