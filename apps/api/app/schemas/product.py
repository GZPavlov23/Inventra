from datetime import datetime
from decimal import Decimal
from typing import Annotated, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.core.barcode import is_valid_gtin
from app.models.product import ProductUnit

ProductName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
OptionalText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] | None
Price = Annotated[Decimal, Field(ge=0, max_digits=10, decimal_places=2)]


def normalize_barcode(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    if not value:
        return None
    if not is_valid_gtin(value):
        raise ValueError("Barcode must be a valid EAN-8, UPC-A, EAN-13 or GTIN-14 code")
    return value


def empty_to_none(value: str | None) -> str | None:
    return value or None


class ProductCreate(BaseModel):
    name: ProductName
    brand: OptionalText = None
    barcode: str | None = None
    category: OptionalText = None
    unit: ProductUnit = ProductUnit.PIECE
    purchase_price: Price
    sale_price: Price

    _check_barcode = field_validator("barcode")(normalize_barcode)
    _clean_text = field_validator("brand", "category")(empty_to_none)


class ProductUpdate(BaseModel):
    """PATCH body: only the fields the client actually sends are changed."""

    name: ProductName | None = None
    brand: OptionalText = None
    barcode: str | None = None
    category: OptionalText = None
    unit: ProductUnit | None = None
    purchase_price: Price | None = None
    sale_price: Price | None = None
    active: bool | None = None

    _check_barcode = field_validator("barcode")(normalize_barcode)
    _clean_text = field_validator("brand", "category")(empty_to_none)

    @model_validator(mode="after")
    def required_fields_not_null(self) -> Self:
        required = {"name", "unit", "purchase_price", "sale_price", "active"}
        for field in required & self.model_fields_set:
            if getattr(self, field) is None:
                raise ValueError(f"'{field}' cannot be null")
        return self


class ProductRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    brand: str | None
    barcode: str | None
    category: str | None
    unit: ProductUnit
    purchase_price: Decimal
    sale_price: Decimal
    active: bool
    created_at: datetime
    updated_at: datetime


class ProductPage(BaseModel):
    items: list[ProductRead]
    total: int
    limit: int
    offset: int
