"""Demand forecasts for a store: reads its history and asks a model about the next days."""

from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.money import to_cents
from app.core.period import period_bounds
from app.forecasting.backtest import MIN_HISTORY_DAYS, BacktestResult, backtest
from app.forecasting.learned import learned_forecast
from app.forecasting.models import (
    NEVER_SOLD_OUT,
    Case,
    Model,
    Series,
    next_days,
    one_by_one,
    recent_average,
    seasonal_average,
)
from app.forecasting.ordering import StockBatch, plan_stock, round_order
from app.repositories.forecast_repository import ForecastRepository
from app.repositories.report_repository import ReportRepository
from app.schemas.forecast import (
    AccuracyReport,
    ForecastDay,
    ForecastReport,
    ModelAccuracy,
    OrderLine,
    OrderReport,
    ProductForecast,
)

# Enough for the accuracy check: four weeks of tests, each with history behind it.
HISTORY_DAYS = 120

# The buffer follows the forecast's measured error, within limits: a very accurate forecast still
# needs some reserve, and a very poor one shouldn't fill the shelf with goods that may go to waste.
MIN_BUFFER_SHARE = Decimal("0.10")
MAX_BUFFER_SHARE = Decimal("0.50")
# Used until the error can be measured.
DEFAULT_BUFFER_SHARE = Decimal("0.25")

# The first one is used when nothing can be measured yet, because weekdays usually do matter.
MODELS: dict[str, Model] = {
    "Same weekday, last 4 weeks": one_by_one(seasonal_average),
    "Average of the last 7 days": one_by_one(recent_average),
    "Machine learning": learned_forecast,
}


class ForecastService:
    def __init__(self, session: Session) -> None:
        self.forecasts = ForecastRepository(session)
        self.reports = ReportRepository(session)

    def forecast(self, store_id: int, horizon: int) -> ForecastReport:
        today = date.today()
        products = {product.id: product for product in self.forecasts.active_products(store_id)}
        last_day = today - timedelta(days=1)
        history = self._history(store_id, last_day, set(products))
        sold_out = self._sold_out(store_id, last_day)
        stock = self.reports.sellable_stock(store_id, today)
        measured = self._measure(history, last_day, sold_out)
        method = self._best(measured)
        model = MODELS[method]

        ready = []
        not_enough_history = 0
        for product_id, product in products.items():
            series = history.get(product_id, {})
            if len(series) >= MIN_HISTORY_DAYS:
                ready.append(product)
            elif series:
                # Only products that have sold at all count as waiting for more history.
                not_enough_history += 1

        cases = [
            Case(history[product.id], today, sold_out.get(product.id, NEVER_SOLD_OUT))
            for product in ready
        ]
        forecasts = model(cases, horizon) if cases else []

        items = []
        for product, forecast in zip(ready, forecasts, strict=True):
            quantities = [Decimal(str(round(quantity, 2))) for quantity in forecast]
            total = sum(quantities, Decimal(0))
            left = stock.get(product.id, Decimal(0))
            items.append(
                ProductForecast(
                    product=product,
                    history_days=len(history[product.id]),
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

    def orders(self, store_id: int, days: int) -> OrderReport:
        today = date.today()
        forecast = self.forecast(store_id, days)
        share = self._buffer_share(self.accuracy(store_id))
        products = {product.id: product for product in self.forecasts.active_products(store_id)}
        on_the_way = self.forecasts.on_the_way(store_id)

        batches: dict[int, list[StockBatch]] = {}
        for batch in self.reports.sellable_batches(store_id, today):
            stock = StockBatch(float(batch.remaining_quantity), batch.expiry_date)
            batches.setdefault(batch.product_id, []).append(stock)

        items = []
        for item in forecast.items:
            demand = [float(day.quantity) for day in item.days]
            plan = plan_stock(batches.get(item.product.id, []), demand, today)
            expected = sum(demand)
            buffer = expected * float(share)
            coming = float(on_the_way.get(item.product.id, 0))
            needed = expected + buffer - plan.served - plan.left_over - coming
            order = round_order(needed, item.product.unit) if needed > 0 else 0.0
            if order == 0:
                continue

            product = products[item.product.id]
            unit_cost = product.purchase_price
            amount = _decimal(order)
            items.append(
                OrderLine(
                    product=item.product,
                    supplier=product.supplier,
                    expected=_decimal(expected),
                    from_stock=_decimal(plan.served),
                    expiring_unsold=_decimal(plan.expiring_unsold),
                    left_over=_decimal(plan.left_over),
                    on_the_way=_decimal(coming),
                    buffer=_decimal(buffer),
                    order=amount,
                    unit_cost=unit_cost,
                    cost=to_cents(amount * unit_cost),
                )
            )

        items.sort(key=lambda line: (-line.cost, line.product.name))
        return OrderReport(
            days=days,
            method=forecast.method,
            buffer_share=share,
            items=items,
            total_cost=sum((line.cost for line in items), Decimal(0)),
            products_checked=len(forecast.items),
        )

    @staticmethod
    def _buffer_share(accuracy: AccuracyReport) -> Decimal:
        chosen = next(model for model in accuracy.models if model.method == accuracy.chosen)
        if chosen.weekly_wape is None:
            return DEFAULT_BUFFER_SHARE
        return min(max(chosen.weekly_wape, MIN_BUFFER_SHARE), MAX_BUFFER_SHARE)

    def accuracy(self, store_id: int) -> AccuracyReport:
        last_day = date.today() - timedelta(days=1)
        ids = {product.id for product in self.forecasts.active_products(store_id)}
        history = self._history(store_id, last_day, ids)
        measured = self._measure(history, last_day, self._sold_out(store_id, last_day))
        return AccuracyReport(
            chosen=self._best(measured),
            models=[self._accuracy(name, result) for name, result in measured.items()],
        )

    @staticmethod
    def _measure(
        history: dict[int, Series], last_day: date, sold_out: dict[int, frozenset[date]]
    ) -> dict[str, BacktestResult]:
        return {
            name: backtest(history, model, last_day, sold_out) for name, model in MODELS.items()
        }

    @staticmethod
    def _best(measured: dict[str, BacktestResult]) -> str:
        # min keeps the first model on a tie, and when nothing could be measured yet.
        return min(
            measured,
            key=lambda name: (
                measured[name].weekly_wape if measured[name].weekly_wape is not None else 0
            ),
        )

    def _sold_out(self, store_id: int, last_day: date) -> dict[int, frozenset[date]]:
        """The days each product ended with nothing left, from the stock history.

        Days before a product's first stock movement are unknown, not sold out: imported old
        sales have no stock history behind them.
        """
        _, end = period_bounds(None, last_day)
        changes: dict[int, dict[date, Decimal]] = {}
        for product_id, day, change in self.forecasts.stock_changes(store_id, end=end):
            changes.setdefault(product_id, {})[day] = change

        sold_out = {}
        for product_id, by_day in changes.items():
            stock = Decimal(0)
            empty = set()
            day = min(by_day)
            while day <= last_day:
                stock += by_day.get(day, Decimal(0))
                if stock <= 0:
                    empty.add(day)
                day += timedelta(days=1)
            sold_out[product_id] = frozenset(empty)
        return sold_out

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


def _decimal(quantity: float) -> Decimal:
    return Decimal(str(round(quantity, 3)))


def _rounded(share: float | None) -> Decimal | None:
    return None if share is None else Decimal(str(round(share, 4)))
