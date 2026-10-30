"""Data access for batches and the stock history."""

from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session, contains_eager, joinedload

from app.models.batch import EXPIRING_SOON_DAYS, Batch
from app.models.inventory_movement import InventoryMovement
from app.repositories.product_repository import matches_search
from app.schemas.inventory import BatchStatus


class InventoryRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get_batch(self, store_id: int, batch_id: int) -> Batch | None:
        stmt = select(Batch).where(Batch.store_id == store_id, Batch.id == batch_id)
        return self.session.scalars(stmt).first()

    def search(
        self,
        store_id: int,
        *,
        product_id: int | None,
        status: BatchStatus,
        search: str | None,
        limit: int,
        offset: int,
    ) -> tuple[list[Batch], int]:
        conditions = [Batch.store_id == store_id]
        if product_id is not None:
            conditions.append(Batch.product_id == product_id)
        if status != "all":
            conditions.append(Batch.remaining_quantity > 0)

        today = date.today()
        if status == "expiring":
            soon = today + timedelta(days=EXPIRING_SOON_DAYS)
            conditions.append(Batch.expiry_date.between(today, soon))
        elif status == "expired":
            conditions.append(Batch.expiry_date < today)

        if search:
            conditions.append(
                or_(matches_search(search), Batch.lot_code.icontains(search, autoescape=True))
            )

        total = self.session.scalar(
            select(func.count()).select_from(Batch).join(Batch.product).where(*conditions)
        )
        # First expired, first out: the batch that must leave the shelf first comes first.
        stmt = (
            select(Batch)
            .join(Batch.product)
            .options(contains_eager(Batch.product))
            .where(*conditions)
            .order_by(Batch.expiry_date.asc().nulls_last(), Batch.received_at, Batch.id)
            .limit(limit)
            .offset(offset)
        )
        return list(self.session.scalars(stmt)), total or 0

    def list_movements(
        self, batch_id: int, *, limit: int, offset: int
    ) -> tuple[list[InventoryMovement], int]:
        total = self.session.scalar(
            select(func.count())
            .select_from(InventoryMovement)
            .where(InventoryMovement.batch_id == batch_id)
        )
        stmt = (
            select(InventoryMovement)
            .options(joinedload(InventoryMovement.actor))
            .where(InventoryMovement.batch_id == batch_id)
            .order_by(InventoryMovement.id.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(self.session.scalars(stmt)), total or 0

    def add(self, entity: Batch | InventoryMovement) -> None:
        self.session.add(entity)
        self.session.flush()

    def change_remaining(
        self, batch: Batch, delta: Decimal, expected: Decimal | None = None
    ) -> bool:
        """Adds delta to the stock of a batch, only if the result isn't negative.

        Checking and changing happen in one SQL statement. PostgreSQL locks the row while it
        runs, so two simultaneous requests can't both use the same last items. Returns False
        when there wasn't enough stock, or when the stock isn't the expected one anymore.
        """
        conditions = [Batch.id == batch.id, Batch.remaining_quantity + delta >= 0]
        if expected is not None:
            conditions.append(Batch.remaining_quantity == expected)
        stmt = (
            update(Batch)
            .where(*conditions)
            .values(remaining_quantity=Batch.remaining_quantity + delta)
        )
        changed = self.session.execute(stmt).rowcount == 1
        if changed:
            self.session.refresh(batch)
        return changed

    def movements_total(self, batch_id: int) -> Decimal:
        stmt = select(func.coalesce(func.sum(InventoryMovement.quantity_delta), 0)).where(
            InventoryMovement.batch_id == batch_id
        )
        return self.session.scalar(stmt)
