from datetime import date
from decimal import Decimal
from enum import StrEnum

from pydantic import BaseModel, ConfigDict

from app.schemas.inventory import BatchProduct


class NoteKind(StrEnum):
    EXPIRED = "expired"  # expired goods still in stock
    EXPIRES_UNSOLD = "expires_unsold"  # will expire before the forecast says it sells
    RUNS_OUT = "runs_out"  # sells out before any delivery comes
    LATE_DELIVERY = "late_delivery"
    ABOVE_FORECAST = "above_forecast"  # sold clearly more last week than was expected


class NoteSupplier(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    name: str
    phone: str | None


class BriefingNote(BaseModel):
    """One thing worth the owner's attention, as facts: the words are up to each client."""

    kind: NoteKind
    # The money involved, which decides the order: goods to lose, sales to miss, an order late.
    at_stake: Decimal
    product: BatchProduct | None = None
    supplier: NoteSupplier | None = None
    # A supplier late with several deliveries gets one note: the most overdue one, and how many.
    delivery_id: int | None = None
    deliveries: int | None = None
    # What the note is about: goods that expire unsold, sales that will be missed, sold last week.
    quantity: Decimal | None = None
    # The forecast's number, next to what really sold.
    expected: Decimal | None = None
    # How many batches have expired.
    batches: int | None = None
    # When it happens: the first loss, the day it runs out, the day a delivery was expected.
    day: date | None = None
    # A delivery that is coming, but only after the product runs out.
    delivery_day: date | None = None


class Briefing(BaseModel):
    # All of them, the most money first. Clients decide how many to show at once.
    notes: list[BriefingNote]
    # The forecast model the notes rely on.
    method: str
