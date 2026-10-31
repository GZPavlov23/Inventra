"""Demand forecasts for a store: reads its history and asks a model about the next days."""

from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.period import period_bounds
from app.forecasting.backtest import MIN_HISTORY_DAYS, BacktestResult, backtest
from app.forecasting.models import Model, Series, next_days, recent_average, seasonal_average
from app.repositories.forecast_repository import ForecastRepository
from app.repositories.report_repository import ReportRepository
from app.schemas.forecast import (
    AccuracyReport,
    ForecastDay,
    ForecastReport,
    ModelAccuracy,
    ProductForecast,
)

# Enough for the accuracy check: four weeks of tests, each with history behind it.
HISTORY_DAYS = 120

# The first one is used when nothing can be measured yet, because weekdays usually do matter.
MODELS: dict[str, Model] = {
    "Same weekday, last 4 weeks": seasonal_average,
    "Average of the last 7 days": recent_average,
}


class ForecastService:
    def __init__(self, session: Session) -> None:
        self.forecasts = ForecastRepository(session)
        self.reports = ReportRepository(session)

    def forecast(self, store_id: int, horizon: int) -> ForecastReport:
        today = date.today()
        products = {product.id: product for product in self.forecasts.active_products(store_id)}
        history = self._history(store_id, today - timedelta(days=1), set(products))
        stock = self.reports.sellable_stock(store_id, today)
        measured = self._measure(history, today - timedelta(days=1))
        method = self._best(measured)
        model = MODELS[method]

        items = []
        not_enough_history = 0
        for product_id, product in products.items():
            series = history.get(product_id, {})
            if len(series) < MIN_HISTORY_DAYS:
                # Only products that have sold at all count as waiting for more history.
                not_enough_history += 1 if series else 0
                continue

            quantities = [
                Decimal(str(round(quantity, 2))) for quantity in model(series, today, horizon)
            ]
            total = sum(quantities, Decimal(0))
            left = stock.get(product_id, Decimal(0))
            items.append(
                ProductForecast(
                    product=product,
                    history_days=len(series),
                    total=total,
                    stock=left,
                    shortage=max(total - left, Decimal(0)),
                    days=[
                        ForecastDay(day=day, quantity=quantity)
                        for day, quantity in zip(next_days(today, horizon), quantities, strict=True)
                    ],
                )
            )

        items.sort(key=lambda item: (-item.shortage, -item.total, item.product.name))
        return ForecastReport(
            horizon=horizon,
            method=method,
            items=items,
            not_enough_history=not_enough_history,
        )

    def accuracy(self, store_id: int) -> AccuracyReport:
        last_day = date.today() - timedelta(days=1)
        ids = {product.id for product in self.forecasts.active_products(store_id)}
        measured = self._measure(self._history(store_id, last_day, ids), last_day)
        return AccuracyReport(
            chosen=self._best(measured),
            models=[self._accuracy(name, result) for name, result in measured.items()],
        )

    @staticmethod
    def _measure(history: dict[int, Series], last_day: date) -> dict[str, BacktestResult]:
        return {name: backtest(history, model, last_day) for name, model in MODELS.items()}

    @staticmethod
    def _best(measured: dict[str, BacktestResult]) -> str:
        # min keeps the first model on a tie, and when nothing could be measured yet.
        return min(
            measured,
            key=lambda name: (
                measured[name].weekly_wape if measured[name].weekly_wape is not None else 0
            ),
        )

    def _history(self, store_id: int, last_day: date, products: set[int]) -> dict[int, Series]:
        """Every product's days, from its first known sale up to last_day, without gaps."""
        first_day = last_day - timedelta(days=HISTORY_DAYS - 1)
        start, end = period_bounds(first_day, last_day)

        known: dict[int, Series] = {}
        for product_id, day, quantity in self.forecasts.imported_per_day(
            store_id, first_day=first_day, last_day=last_day
        ):
            known.setdefault(product_id, {})[day] = float(quantity)
        # Real sales come second: where both exist for a day, they are the better record.
        for product_id, day, quantity in self.forecasts.sold_per_day(
            store_id, start=start, end=end
        ):
            known.setdefault(product_id, {})[day] = float(quantity)

        return {
            product_id: self._without_gaps(series, last_day)
            for product_id, series in known.items()
            if product_id in products
        }

    @staticmethod
    def _without_gaps(series: Series, last_day: date) -> Series:
        first = min(series)
        length = (last_day - first).days + 1
        days = (first + timedelta(days=offset) for offset in range(length))
        return {day: series.get(day, 0.0) for day in days}

    @staticmethod
    def _accuracy(method: str, result: BacktestResult) -> ModelAccuracy:
        return ModelAccuracy(
            method=method,
            daily_wape=_rounded(result.daily_wape),
            weekly_wape=_rounded(result.weekly_wape),
            bias=Decimal(str(round(result.bias, 2))),
            days=result.days,
            products=result.products,
        )


def _rounded(share: float | None) -> Decimal | None:
    return None if share is None else Decimal(str(round(share, 4)))
