from typing import Annotated

from pydantic import BaseModel, Field

from app.schemas.inventory import Quantity
from app.schemas.product import Price


class SaleItemCreate(BaseModel):
    product_id: int
    quantity: Quantity
    # Defaults to the product's current sale price.
    unit_price: Price | None = None


class SaleCreate(BaseModel):
    items: Annotated[list[SaleItemCreate], Field(min_length=1, max_length=200)]
