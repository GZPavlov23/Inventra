"""The numbers behind the dashboard's reports. Everything here only reads."""

from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.money import to_cents
from app.core.period import period_bounds, period_length
from app.repositories.report_repository import ReportRepository
from app.schemas.report import (
    CategorySales,
    RunningOutProduct,
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

    def waste(self, store_id: int, *, date_from: date, date_to: date) -> WasteReport:
        period_length(date_from, date_to)
        start, end = period_bounds(date_from, date_to)
        reasons = [
            WasteByReason(reason=reason, value=to_cents(value), write_offs=write_offs)
            for reason, value, write_offs in self.reports.waste(store_id, start=start, end=end)
        ]
        return WasteReport(total=sum((r.value for r in reasons), Decimal(0)), reasons=reasons)

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
