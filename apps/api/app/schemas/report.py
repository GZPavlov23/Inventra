from decimal import Decimal

from pydantic import BaseModel

from app.schemas.inventory import BatchProduct, WasteReason


class WasteByReason(BaseModel):
    reason: WasteReason
    value: Decimal
    write_offs: int


class WasteReport(BaseModel):
    """What thrown-away goods cost at the purchase prices of their batches."""

    total: Decimal
    reasons: list[WasteByReason]


class RunningOutProduct(BaseModel):
    product: BatchProduct
    stock: Decimal
    average_daily_sales: Decimal
    days_left: Decimal


class TopProduct(BaseModel):
    product: BatchProduct
    quantity: Decimal
    revenue: Decimal
    profit: Decimal


class CategorySales(BaseModel):
    # None for products without a category.
    category: str | None
    revenue: Decimal
    profit: Decimal
