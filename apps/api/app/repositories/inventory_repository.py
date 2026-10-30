"""Data access for batches and the stock history."""

from decimal import Decimal

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models.batch import Batch
from app.models.inventory_movement import InventoryMovement


class InventoryRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get_batch(self, store_id: int, batch_id: int) -> Batch | None:
        stmt = select(Batch).where(Batch.store_id == store_id, Batch.id == batch_id)
        return self.session.scalars(stmt).first()

    def add(self, entity: Batch | InventoryMovement) -> None:
        self.session.add(entity)
        self.session.flush()

    def change_remaining(self, batch: Batch, delta: Decimal) -> bool:
        """Adds delta to the stock of a batch, only if the result isn't negative.

        Checking and changing happen in one SQL statement. PostgreSQL locks the row while it
        runs, so two simultaneous requests can't both use the same last items. Returns False
        when there wasn't enough stock.
        """
        stmt = (
            update(Batch)
            .where(Batch.id == batch.id, Batch.remaining_quantity + delta >= 0)
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
