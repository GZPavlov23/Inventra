"""Data access for deliveries."""

from datetime import date

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

    def late(self, store_id: int, today: date) -> list[Delivery]:
        """Ordered deliveries whose expected day has passed, the longest overdue first."""
        stmt = (
            select(Delivery)
            .where(
                Delivery.store_id == store_id,
                Delivery.status == DeliveryStatus.ORDERED,
                Delivery.expected_on < today,
            )
            .options(*WITH_DETAILS)
            .order_by(Delivery.expected_on, Delivery.id)
        )
        return list(self.session.scalars(stmt))

    def next_arrivals(self, store_id: int) -> dict[int, date | None]:
        """For every product on its way, the earliest day it is expected.

        None means it is ordered without an expected day, which is not the same as not ordered.
        """
        stmt = (
            select(DeliveryItem.product_id, Delivery.expected_on)
            .join(Delivery, DeliveryItem.delivery_id == Delivery.id)
            .where(Delivery.store_id == store_id, Delivery.status == DeliveryStatus.ORDERED)
        )
        arrivals: dict[int, date | None] = {}
        for product_id, expected_on in self.session.execute(stmt):
            if product_id not in arrivals:
                arrivals[product_id] = expected_on
            elif expected_on is not None:
                known = arrivals[product_id]
                arrivals[product_id] = expected_on if known is None else min(known, expected_on)
        return arrivals

    def add(self, entity: Delivery | DeliveryItem) -> None:
        self.session.add(entity)
        self.session.flush()
