from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.inventory import BatchProduct, MovementActor, Quantity
from app.schemas.product import Price


class SaleItemCreate(BaseModel):
    product_id: int
    quantity: Quantity
    # Defaults to the product's current sale price.
    unit_price: Price | None = None


class SaleCreate(BaseModel):
    items: Annotated[list[SaleItemCreate], Field(min_length=1, max_length=200)]


class SoldBatch(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    lot_code: str | None
    expiry_date: date | None
    purchase_price: Decimal


class SaleItemSource(BaseModel):
    """How much of a sale line came from one batch."""

    model_config = ConfigDict(from_attributes=True)

    quantity_delta: Decimal
    batch: SoldBatch


class SaleItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product: BatchProduct
    quantity: Decimal
    unit_price: Decimal
    total: Decimal
    cost: Decimal
    movements: list[SaleItemSource]


class SaleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sold_at: datetime
    actor: MovementActor
    total: Decimal
    cost: Decimal
    profit: Decimal
    items: list[SaleItemRead]


class SalePage(BaseModel):
    items: list[SaleRead]
    total: int
    limit: int
    offset: int


class SaleSummary(BaseModel):
    """Totals of a whole period, not only of the page being shown."""

    sales: int
    revenue: Decimal
    cost: Decimal
    profit: Decimal
