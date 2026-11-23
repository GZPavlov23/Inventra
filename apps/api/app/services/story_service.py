"""A product's story: everything that happened to it in the store, told day by day.

It is put together from what is already recorded (the stock history and the deliveries), so
there is nothing extra to keep in sync. Quantities only, no money, so everyone who can see the
product can see its story.
"""

from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.core.period import period_bounds, period_length
from app.models.inventory_movement import MovementType
from app.repositories.product_repository import ProductRepository
from app.repositories.story_repository import StoryRepository
from app.schemas.story import (
    ExpiredOnShelf,
    LateDelivery,
    ProductStory,
    StoryAttention,
    StoryDay,
    StoryEvent,
)

# Movements that are told one by one. Sales are added up per day instead: a busy product sells
# dozens of times a day, and the story would be nothing but sales.
TOLD_ONE_BY_ONE = {
    MovementType.RECEIPT: "received",
    MovementType.WASTE: "written_off",
    MovementType.ADJUSTMENT: "corrected",
}


def local_day(moment: datetime) -> date:
    # The server's local day, the same one the reports use.
    return moment.astimezone().date()


class StoryService:
    def __init__(self, session: Session) -> None:
        self.products = ProductRepository(session)
        self.story = StoryRepository(session)

    def product_story(
        self, store_id: int, product_id: int, *, until: date, days: int
    ) -> ProductStory:
        if self.products.get(store_id, product_id) is None:
            raise NotFoundError(f"Product {product_id} was not found")
        first_day = until - timedelta(days=days - 1)
        period_length(first_day, until)
        start, end = period_bounds(first_day, until)

        by_day: dict[date, list[StoryEvent]] = {}
        sold: dict[date, dict] = {}
        for movement, sale_id, supplier, delivery_id in self.story.movements(
            store_id, product_id, start=start, end=end
        ):
            day = local_day(movement.occurred_at)
            if movement.type == MovementType.SALE:
                # One sale can take from two batches: count the sale once, add both quantities.
                tally = sold.setdefault(
                    day, {"at": movement.occurred_at, "quantity": Decimal(0), "sales": set()}
                )
                tally["quantity"] += -movement.quantity_delta
                tally["sales"].add(sale_id)
                continue
            kind = TOLD_ONE_BY_ONE[movement.type]
            by_day.setdefault(day, []).append(
                StoryEvent(
                    kind=kind,
                    at=movement.occurred_at,
                    quantity=movement.quantity_delta
                    if kind == "corrected"
                    else abs(movement.quantity_delta),
                    reason=movement.reason,
                    actor=movement.actor.full_name,
                    supplier=supplier,
                    delivery_id=delivery_id,
                    expiry_date=movement.batch.expiry_date if kind == "received" else None,
                    lot_code=movement.batch.lot_code if kind == "received" else None,
                )
            )
        for day, tally in sold.items():
            by_day.setdefault(day, []).append(
                StoryEvent(
                    kind="sold",
                    at=tally["at"],
                    quantity=tally["quantity"],
                    sales=len(tally["sales"]),
                )
            )
        for delivery, line in self.story.orders(store_id, product_id, start=start, end=end):
            by_day.setdefault(local_day(delivery.created_at), []).append(
                StoryEvent(
                    kind="ordered",
                    at=delivery.created_at,
                    quantity=line.ordered_quantity,
                    supplier=delivery.supplier.name,
                    delivery_id=delivery.id,
                    expected_on=delivery.expected_on,
                    status=delivery.status,
                )
            )

        earlier = self.story.last_before(store_id, product_id, start)
        return ProductStory(
            days=[
                StoryDay(day=day, events=sorted(events, key=lambda e: e.at, reverse=True))
                for day, events in sorted(by_day.items(), reverse=True)
            ],
            earlier=None if earlier is None else local_day(earlier),
            attention=self._attention(store_id, product_id),
        )

    def _attention(self, store_id: int, product_id: int) -> StoryAttention:
        today = date.today()
        return StoryAttention(
            expired=[
                ExpiredOnShelf(
                    batch_id=batch.id,
                    quantity=batch.remaining_quantity,
                    expiry_date=batch.expiry_date,
                )
                for batch in self.story.expired_on_shelf(store_id, product_id, today)
            ],
            late=[
                LateDelivery(
                    delivery_id=delivery.id,
                    supplier=delivery.supplier.name,
                    phone=delivery.supplier.phone,
                    expected_on=delivery.expected_on,
                )
                for delivery in self.story.late_deliveries(store_id, product_id, today)
            ],
        )
