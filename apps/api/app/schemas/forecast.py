from datetime import date
from decimal import Decimal

from pydantic import BaseModel

from app.schemas.inventory import BatchProduct


class ForecastDay(BaseModel):
    day: date
    quantity: Decimal


class ProductForecast(BaseModel):
    product: BatchProduct
    history_days: int
    total: Decimal
    stock: Decimal
    # How much more the forecast needs than the stock that can still be sold.
    shortage: Decimal
    days: list[ForecastDay]


class ForecastReport(BaseModel):
    horizon: int
    method: str
    items: list[ProductForecast]
    # Products with too little history to say anything honest about them.
    not_enough_history: int


class ModelAccuracy(BaseModel):
    method: str
    # Error as a share of everything sold. Empty when nothing can be measured yet.
    daily_wape: Decimal | None
    weekly_wape: Decimal | None
    bias: Decimal
    days: int
    products: int


class AccuracyReport(BaseModel):
    # The one forecasts use: the most accurate on this store's own past.
    chosen: str
    models: list[ModelAccuracy]


class OrderLine(BaseModel):
    product: BatchProduct
    # The arithmetic behind the order, so nobody has to trust a number they can't follow.
    expected: Decimal
    from_stock: Decimal
    expiring_unsold: Decimal
    left_over: Decimal
    buffer: Decimal
    order: Decimal
    unit_cost: Decimal
    cost: Decimal


class OrderReport(BaseModel):
    days: int
    method: str
    # The extra on top of the forecast, as a share of it.
    buffer_share: Decimal
    # Only products that need ordering, the most expensive first.
    items: list[OrderLine]
    total_cost: Decimal
    # Products checked, including those that have enough.
    products_checked: int
