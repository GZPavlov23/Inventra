from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

from app.models.delivery import DeliveryStatus

# received: goods arrived (by hand, or from a delivery); sold: the day's sales of it, added up;
# written_off: thrown away; corrected: a count that didn't match; ordered: put on a delivery.
EventKind = Literal["received", "sold", "written_off", "corrected", "ordered"]


class StoryEvent(BaseModel):
    kind: EventKind
    # When it happened. For a day's sales: the last sale of that day.
    at: datetime
    # How much. Positive, except a count correction, which keeps its direction.
    quantity: Decimal
    # sold: how many sales it took.
    sales: int | None = None
    # written_off and corrected: the reason given; received, written_off, corrected: who.
    reason: str | None = None
    actor: str | None = None
    # received from a delivery, and ordered.
    supplier: str | None = None
    delivery_id: int | None = None
    # received: the batch.
    expiry_date: date | None = None
    lot_code: str | None = None
    # ordered: when it is expected, and where the delivery stands now.
    expected_on: date | None = None
    status: DeliveryStatus | None = None


class StoryDay(BaseModel):
    day: date
    # The newest first.
    events: list[StoryEvent]


class ExpiredOnShelf(BaseModel):
    batch_id: int
    quantity: Decimal
    expiry_date: date


class LateDelivery(BaseModel):
    delivery_id: int
    supplier: str
    phone: str | None
    expected_on: date


class StoryAttention(BaseModel):
    """What needs doing about this product right now, whatever stretch of the story is shown."""

    expired: list[ExpiredOnShelf]
    late: list[LateDelivery]


class ProductStory(BaseModel):
    """One product's life in the store, day by day, the newest day first. Quantities only."""

    days: list[StoryDay]
    # Ask again with until=this to see the next older stretch that has something in it.
    # None when there is nothing older.
    earlier: date | None
    attention: StoryAttention
