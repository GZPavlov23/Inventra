from datetime import date
from decimal import Decimal
from enum import StrEnum
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints

from app.schemas.product import Price

# Above zero, with at most three decimals (grams or millilitres).
Quantity = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=3)]
Reason = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class WasteReason(StrEnum):
    EXPIRED = "expired"
    DAMAGED = "damaged"
    OTHER = "other"


class ReceiptCreate(BaseModel):
    """Goods arriving in the store: creates one new batch."""

    product_id: int
    quantity: Quantity
    expiry_date: date | None = None
    lot_code: Annotated[str, StringConstraints(strip_whitespace=True, max_length=64)] | None = None
    # Defaults to the product's current purchase price.
    purchase_price: Price | None = None


class WasteCreate(BaseModel):
    """Goods thrown away. Real waste, counted separately from any forecast."""

    quantity: Quantity
    reason: WasteReason


class AdjustmentCreate(BaseModel):
    """A correction after counting the shelf: positive adds stock, negative removes it."""

    quantity_delta: Annotated[Decimal, Field(max_digits=12, decimal_places=3)]
    reason: Reason
