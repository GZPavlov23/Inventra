"""Measures a model on the past: what would it have said, and what really happened?

At each moment the model sees only what was known then, and the next days are compared with the
real sales. WAPE is the error as a share of everything sold: 0.30 means the forecast was off by
30 units for every 100 sold. Unlike the average percent error, a slow product with one sale a week
can't blow it up.

It is measured twice. Per day it is high for any model, because one customer more or less is pure
chance for a small store. Per week the chance mostly cancels out, and a week's total is what an
order is based on, so that is the number models are compared by.
"""

from dataclasses import dataclass
from datetime import date, timedelta

from app.forecasting.models import Model, Series, known_before, next_days

BACKTEST_HORIZON = 7
BACKTEST_WEEKS = 4
# With less than this a model has nothing to learn from, so judging it would mean nothing.
MIN_HISTORY_DAYS = 14


@dataclass(frozen=True)
class BacktestResult:
    days: int
    products: int
    sold: float
    daily_error: float
    weekly_error: float
    # Above 0, the model predicted too much overall; below 0, too little.
    bias: float

    @property
    def daily_wape(self) -> float | None:
        return self.daily_error / self.sold if self.sold else None

    @property
    def weekly_wape(self) -> float | None:
        return self.weekly_error / self.sold if self.sold else None


def origins(last_day: date) -> list[date]:
    """The moments to forecast from, oldest first, so the last week ends on last_day."""
    return [
        last_day - timedelta(days=BACKTEST_HORIZON * weeks - 1)
        for weeks in range(BACKTEST_WEEKS, 0, -1)
    ]


def backtest(products: dict[int, Series], model: Model, last_day: date) -> BacktestResult:
    days = 0
    used: set[int] = set()
    sold = daily_error = weekly_error = bias = 0.0

    for product_id, series in products.items():
        for origin in origins(last_day):
            if len(known_before(series, origin)) < MIN_HISTORY_DAYS:
                continue
            forecast = model(series, origin, BACKTEST_HORIZON)
            week_error = 0.0
            for day, predicted in zip(next_days(origin, BACKTEST_HORIZON), forecast, strict=True):
                actual = series[day]
                days += 1
                used.add(product_id)
                sold += actual
                daily_error += abs(predicted - actual)
                week_error += predicted - actual
            weekly_error += abs(week_error)
            bias += week_error

    return BacktestResult(days, len(used), sold, daily_error, weekly_error, bias)
