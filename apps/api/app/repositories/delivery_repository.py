"""Data access for deliveries."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.delivery import Delivery, DeliveryItem, DeliveryStatus

# Everything a delivery's response needs, loaded at once instead of one query per line.
WITH_DETAILS = (
    joinedload(Delivery.supplier),
    joinedload(Delivery.actor),
    selectinload(Delivery.items).options(
        joinedload(DeliveryItem.product),
        joinedload(DeliveryItem.batch),
    ),
)


class DeliveryRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self, store_id: int, delivery_id: int) -> Delivery | None:
        stmt = (
            select(Delivery)
            .where(Delivery.store_id == store_id, Delivery.id == delivery_id)
            .options(*WITH_DETAILS)
        )
        return self.session.scalars(stmt).first()

    def lock(self, store_id: int, delivery_id: int) -> Delivery | None:
        """Holds the row until the transaction ends, so a second click waits here and then sees
        the delivery already received, instead of bringing the same goods into stock twice.
        """
        stmt = (
            select(Delivery)
            .where(Delivery.store_id == store_id, Delivery.id == delivery_id)
            .with_for_update()
        )
        return self.session.scalars(stmt).first()

    def search(
        self, store_id: int, *, status: DeliveryStatus | None, limit: int, offset: int
    ) -> tuple[list[Delivery], int]:
        conditions = [Delivery.store_id == store_id]
        if status is not None:
            conditions.append(Delivery.status == status)

        total = self.session.scalar(select(func.count()).select_from(Delivery).where(*conditions))
        stmt = (
            select(Delivery)
            .where(*conditions)
            .options(*WITH_DETAILS)
            .order_by(Delivery.id.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(self.session.scalars(stmt)), total or 0

    def add(self, entity: Delivery | DeliveryItem) -> None:
        self.session.add(entity)
        self.session.flush()
