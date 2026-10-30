from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.models.batch import ExpiryStatus
from app.models.inventory_movement import MovementType
from app.models.product import ProductUnit
from app.schemas.product import Price

# Which batches a list request returns.
BatchStatus = Literal["in_stock", "expiring", "expired", "all"]

# Far above any real delivery, but low enough to refuse a barcode scanned into the quantity field.
MAX_QUANTITY = 100_000

# Above zero, with at most three decimals (grams or millilitres).
Quantity = Annotated[Decimal, Field(gt=0, le=MAX_QUANTITY, max_digits=12, decimal_places=3)]
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

    quantity_delta: Annotated[
        Decimal, Field(ge=-MAX_QUANTITY, le=MAX_QUANTITY, max_digits=12, decimal_places=3)
    ]
    reason: Reason
    # The stock the client based its calculation on. If someone changed the batch in the
    # meantime, the correction is refused instead of being applied to a different number.
    expected_quantity: Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=3)] | None = (
        None
    )


class BatchProduct(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    barcode: str | None
    unit: ProductUnit


class BatchRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product: BatchProduct
    lot_code: str | None
    expiry_date: date | None
    expiry_status: ExpiryStatus
    received_at: datetime
    received_quantity: Decimal
    remaining_quantity: Decimal
    purchase_price: Decimal


class InventorySummary(BaseModel):
    """What the stock is worth at purchase prices, and how much of it needs attention."""

    stock_value: Decimal
    expired_value: Decimal
    expired_batches: int
    expiring_batches: int


class BatchPage(BaseModel):
    items: list[BatchRead]
    total: int
    limit: int
    offset: int


class MovementActor(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    full_name: str


class MovementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: MovementType
    quantity_delta: Decimal
    reason: str | None
    occurred_at: datetime
    actor: MovementActor


class MovementPage(BaseModel):
    items: list[MovementRead]
    total: int
    limit: int
    offset: int
