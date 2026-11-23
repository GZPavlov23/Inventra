from datetime import date
from decimal import Decimal

from pydantic import BaseModel

from app.schemas.inventory import BatchProduct, WasteReason


class SalesTrend(BaseModel):
    product_id: int
    # One number per finished day, the oldest first.
    quantities: list[Decimal]
    total: Decimal


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


class ExpiringBatch(BaseModel):
    batch_id: int
    product: BatchProduct
    lot_code: str | None
    remaining_quantity: Decimal
    # What is left, at this batch's own purchase price, rounded to cents.
    value: Decimal


class ExpiryDay(BaseModel):
    day: date
    # The sum of its batches' values, so the days add up to the total exactly.
    value: Decimal
    batches: list[ExpiringBatch]


class ExpiryCalendar(BaseModel):
    """What leaves the shelf on which day, at the purchase prices of the batches."""

    # Only the days on which something expires, the earliest first.
    days: list[ExpiryDay]
    total: Decimal
    # Already expired before the calendar starts and still not written off: it would fall
    # off the front of the calendar, so it is listed on its own.
    overdue: list[ExpiringBatch]
    overdue_value: Decimal


class CategorySales(BaseModel):
    # None for products without a category.
    category: str | None
    revenue: Decimal
    profit: Decimal
