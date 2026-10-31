from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.models.delivery import DeliveryStatus
from app.schemas.inventory import MAX_QUANTITY, BatchProduct, MovementActor, Quantity
from app.schemas.product import Price
from app.schemas.supplier import SupplierRef

MAX_DELIVERY_LINES = 200

# Which deliveries a list request returns.
DeliveryFilter = Literal["ordered", "received", "cancelled", "all"]

# Zero is allowed here: it means this product never came.
ArrivedQuantity = Annotated[Decimal, Field(ge=0, le=MAX_QUANTITY, max_digits=12, decimal_places=3)]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=64)] | None


class DeliveryItemCreate(BaseModel):
    product_id: int
    quantity: Quantity
    # Defaults to the product's current purchase price.
    unit_cost: Price | None = None


class OrderedProducts(BaseModel):
    items: Annotated[list[DeliveryItemCreate], Field(min_length=1, max_length=MAX_DELIVERY_LINES)]

    @model_validator(mode="after")
    def one_line_per_product(self) -> Self:
        products = [item.product_id for item in self.items]
        if len(products) != len(set(products)):
            raise ValueError("A product can be on a delivery only once")
        return self


class DeliveryCreate(OrderedProducts):
    supplier_id: int
    expected_on: date | None = None


class OrderDeliveries(OrderedProducts):
    """An order for many suppliers. Each product goes to the supplier set on it."""

    expected_on: date | None = None


class DeliveryItemReceipt(BaseModel):
    item_id: int
    quantity: ArrivedQuantity
    expiry_date: date | None = None
    lot_code: ShortText = None
    # Defaults to the price agreed when ordering.
    unit_cost: Price | None = None


class DeliveryReceipt(BaseModel):
    """What really arrived: every line of the delivery, once."""

    invoice_number: ShortText = None
    items: Annotated[list[DeliveryItemReceipt], Field(min_length=1, max_length=MAX_DELIVERY_LINES)]


class DeliveredBatch(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    lot_code: str | None
    expiry_date: date | None
    purchase_price: Decimal


class DeliveryItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product: BatchProduct
    ordered_quantity: Decimal
    unit_cost: Decimal
    received_quantity: Decimal | None
    batch: DeliveredBatch | None


class DeliveryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    supplier: SupplierRef
    actor: MovementActor
    status: DeliveryStatus
    expected_on: date | None
    received_at: datetime | None
    invoice_number: str | None
    ordered_total: Decimal
    received_total: Decimal | None
    created_at: datetime
    items: list[DeliveryItemRead]


class DeliveryPage(BaseModel):
    items: list[DeliveryRead]
    total: int
    limit: int
    offset: int
