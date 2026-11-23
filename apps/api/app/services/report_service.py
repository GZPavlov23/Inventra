"""The numbers behind the dashboard's reports. Everything here only reads."""

from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.money import to_cents
from app.core.period import period_bounds, period_length
from app.models.batch import Batch
from app.repositories.forecast_repository import ForecastRepository
from app.repositories.report_repository import ReportRepository
from app.schemas.report import (
    CategorySales,
    ExpiringBatch,
    ExpiryCalendar,
    ExpiryDay,
    RunningOutProduct,
    SalesTrend,
    TopProduct,
    WasteByReason,
    WasteReport,
)

# Average sales are taken from this many finished days. Today isn't over yet, so it would
# pull the average down. It is a plain average, not a forecast.
SALES_WINDOW_DAYS = 14
# A product counts as running out when its stock lasts this many days or less.
RUNNING_OUT_DAYS = 7


class ReportService:
    def __init__(self, session: Session) -> None:
        self.reports = ReportRepository(session)
        self.forecasts = ForecastRepository(session)

    def sales_trend(self, store_id: int, product_ids: set[int], days: int) -> list[SalesTrend]:
        """Sold per day over the last finished days, for small charts next to each product.

        The same history the forecast learns from: real sales, and imported old ones where
        there are no real sales for that day.
        """
        last_day = date.today() - timedelta(days=1)
        first_day = last_day - timedelta(days=days - 1)
        start, end = period_bounds(first_day, last_day)

        sold: dict[int, dict[date, Decimal]] = {}
        for product_id, day, quantity in self.forecasts.imported_per_day(
            store_id, first_day=first_day, last_day=last_day
        ):
            sold.setdefault(product_id, {})[day] = quantity
        for product_id, day, quantity in self.forecasts.sold_per_day(
            store_id, start=start, end=end
        ):
            sold.setdefault(product_id, {})[day] = quantity

        trends = []
        for product_id in sorted(product_ids):
            series = sold.get(product_id, {})
            quantities = [
                series.get(first_day + timedelta(days=offset), Decimal(0)) for offset in range(days)
            ]
            trends.append(
                SalesTrend(
                    product_id=product_id,
                    quantities=quantities,
                    total=sum(quantities, Decimal(0)),
                )
            )
        return trends

    def waste(self, store_id: int, *, date_from: date, date_to: date) -> WasteReport:
        period_length(date_from, date_to)
        start, end = period_bounds(date_from, date_to)
        reasons = [
            WasteByReason(reason=reason, value=to_cents(value), write_offs=write_offs)
            for reason, value, write_offs in self.reports.waste(store_id, start=start, end=end)
        ]
        return WasteReport(total=sum((r.value for r in reasons), Decimal(0)), reasons=reasons)

    def expiry_calendar(self, store_id: int, *, date_from: date, date_to: date) -> ExpiryCalendar:
        """Per day, what expires and what it cost: the shelf's calendar."""
        period_length(date_from, date_to)
        # "Overdue" means already expired, so a calendar that starts next week doesn't call
        # this week's goods overdue: they are still good today.
        overdue_until = min(date_from, date.today()) - timedelta(days=1)

        days: dict[date, list[ExpiringBatch]] = {}
        overdue: list[ExpiringBatch] = []
        for batch in self.reports.expiring_batches(store_id, until=date_to):
            if batch.expiry_date >= date_from:
                days.setdefault(batch.expiry_date, []).append(expiring(batch))
            elif batch.expiry_date <= overdue_until:
                overdue.append(expiring(batch))

        calendar = [
            ExpiryDay(day=day, value=sum((b.value for b in batches), Decimal(0)), batches=batches)
            for day, batches in days.items()
        ]
        return ExpiryCalendar(
            days=calendar,
            total=sum((day.value for day in calendar), Decimal(0)),
            overdue=overdue,
            overdue_value=sum((b.value for b in overdue), Decimal(0)),
        )

    def running_out(self, store_id: int) -> list[RunningOutProduct]:
        today = date.today()
        first_day = today - timedelta(days=SALES_WINDOW_DAYS)
        start, end = period_bounds(first_day, today - timedelta(days=1))
        stock = self.reports.sellable_stock(store_id, today)

        result = []
        for product, sold in self.reports.sold_quantities(store_id, start=start, end=end):
            average = sold / SALES_WINDOW_DAYS
            left = stock.get(product.id, Decimal(0))
            days_left = left / average
            if days_left <= RUNNING_OUT_DAYS:
                result.append(
                    RunningOutProduct(
                        product=product,
                        stock=left,
                        average_daily_sales=average.quantize(Decimal("0.001")),
                        days_left=days_left.quantize(Decimal("0.1")),
                    )
                )
        return sorted(result, key=lambda item: (item.days_left, item.product.name))

    def top_products(
        self, store_id: int, *, date_from: date, date_to: date, limit: int
    ) -> list[TopProduct]:
        period_length(date_from, date_to)
        start, end = period_bounds(date_from, date_to)
        rows = self.reports.top_products(store_id, start=start, end=end, limit=limit)
        return [
            TopProduct(product=product, quantity=quantity, revenue=revenue, profit=revenue - cost)
            for product, quantity, revenue, cost in rows
        ]

    def categories(self, store_id: int, *, date_from: date, date_to: date) -> list[CategorySales]:
        period_length(date_from, date_to)
        start, end = period_bounds(date_from, date_to)
        return [
            CategorySales(category=category, revenue=revenue, profit=revenue - cost)
            for category, revenue, cost in self.reports.categories(store_id, start=start, end=end)
        ]


def expiring(batch: Batch) -> ExpiringBatch:
    return ExpiringBatch(
        batch_id=batch.id,
        product=batch.product,
        lot_code=batch.lot_code,
        remaining_quantity=batch.remaining_quantity,
        value=to_cents(batch.remaining_quantity * batch.purchase_price),
    )
