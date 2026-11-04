"""The day's briefing: the few things a store owner should know, the most money first.

Nothing here guesses beyond the forecast. Every note is found in the store's own stock,
deliveries and sales, and carries the numbers behind it.
"""

from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.money import to_cents
from app.forecasting.ordering import StockBatch, plan_stock
from app.models.batch import Batch
from app.models.delivery import Delivery
from app.models.product import Product, ProductUnit
from app.repositories.delivery_repository import DeliveryRepository
from app.repositories.forecast_repository import ForecastRepository
from app.repositories.report_repository import ReportRepository
from app.schemas.briefing import Briefing, BriefingNote, NoteKind, NoteSupplier
from app.schemas.forecast import ProductForecast
from app.services.forecast_service import ForecastService

# How far ahead the notes look.
HORIZON_DAYS = 7
# Last week counts as a surprise when it sold this much more than expected...
ABOVE_FORECAST_SHARE = 1.3
# ...and the difference is at least this many units, so one extra loaf doesn't count.
ABOVE_FORECAST_UNITS = 3.0


def smallest_amount(unit: ProductUnit) -> float:
    """Below this, an expected loss or shortage is too small to mention."""
    return 1.0 if unit == ProductUnit.PIECE else 0.5


def amount(quantity: float) -> Decimal:
    return Decimal(str(round(quantity, 1)))


class BriefingService:
    def __init__(self, session: Session) -> None:
        self.forecast = ForecastService(session)
        self.forecasts = ForecastRepository(session)
        self.reports = ReportRepository(session)
        self.deliveries = DeliveryRepository(session)

    def briefing(self, store_id: int) -> Briefing:
        today = date.today()
        products = {product.id: product for product in self.forecasts.active_products(store_id)}
        forecast = self.forecast.forecast(store_id, HORIZON_DAYS)

        notes = [
            *self._expired(store_id, today),
            *self._late_deliveries(store_id, today),
            *self._stock_notes(store_id, today, forecast.items, products),
            *self._above_forecast(store_id),
        ]
        notes.sort(key=lambda note: note.at_stake, reverse=True)
        return Briefing(notes=notes, method=forecast.method)

    def _expired(self, store_id: int, today: date) -> list[BriefingNote]:
        batches = self.reports.expired_batches(store_id, today)
        if not batches:
            return []
        value = sum(
            (to_cents(batch.remaining_quantity * batch.purchase_price) for batch in batches),
            Decimal(0),
        )
        return [BriefingNote(kind=NoteKind.EXPIRED, at_stake=value, batches=len(batches))]

    def _late_deliveries(self, store_id: int, today: date) -> list[BriefingNote]:
        # One note per supplier: it is one phone call, however many deliveries are late.
        by_supplier: dict[int, list[Delivery]] = {}
        for delivery in self.deliveries.late(store_id, today):
            by_supplier.setdefault(delivery.supplier_id, []).append(delivery)

        notes = []
        for late in by_supplier.values():
            # The most overdue comes first: deliveries are listed by their expected day.
            first = late[0]
            notes.append(
                BriefingNote(
                    kind=NoteKind.LATE_DELIVERY,
                    at_stake=sum((delivery.ordered_total for delivery in late), Decimal(0)),
                    supplier=NoteSupplier.model_validate(first.supplier),
                    delivery_id=first.id,
                    deliveries=len(late),
                    day=first.expected_on,
                )
            )
        return notes

    def _stock_notes(
        self,
        store_id: int,
        today: date,
        forecasts: list[ProductForecast],
        products: dict[int, Product],
    ) -> list[BriefingNote]:
        batches: dict[int, list[Batch]] = {}
        for batch in self.reports.sellable_batches(store_id, today):
            batches.setdefault(batch.product_id, []).append(batch)
        coming = self.deliveries.next_arrivals(store_id)

        notes = []
        for item in forecasts:
            product = products[item.product.id]
            own = batches.get(product.id, [])
            stock = [StockBatch(float(b.remaining_quantity), b.expiry_date) for b in own]
            demand = [float(day.quantity) for day in item.days]
            least = smallest_amount(product.unit)

            plan = plan_stock(stock, demand, today)
            if plan.expiring_unsold >= least:
                notes.append(self._expires_unsold(item, own, plan.expiring_unsold, today))

            runs_out = self._runs_out_on(stock, demand, today, least)
            if runs_out is None:
                continue
            on_the_way = product.id in coming
            arrives = coming.get(product.id)
            # Ordered already, and in time (or without a date, so it can't be judged).
            if on_the_way and (arrives is None or arrives <= runs_out):
                continue
            until = HORIZON_DAYS if arrives is None else min((arrives - today).days, HORIZON_DAYS)
            missed = self._unserved(stock, demand[:until], today)
            notes.append(
                BriefingNote(
                    kind=NoteKind.RUNS_OUT,
                    at_stake=to_cents(Decimal(str(missed)) * product.sale_price),
                    product=item.product,
                    quantity=amount(missed),
                    day=runs_out,
                    delivery_day=arrives,
                )
            )
        return notes

    @staticmethod
    def _expires_unsold(
        item: ProductForecast, batches: list[Batch], lost: float, today: date
    ) -> BriefingNote:
        last_day = today + timedelta(days=HORIZON_DAYS - 1)
        expiring = [b for b in batches if b.expiry_date is not None and b.expiry_date <= last_day]
        quantity = sum((b.remaining_quantity for b in expiring), Decimal(0))
        # What these batches really cost, weighted by how much each one holds.
        cost = sum((b.remaining_quantity * b.purchase_price for b in expiring), Decimal(0))
        price = cost / quantity if quantity else Decimal(0)
        return BriefingNote(
            kind=NoteKind.EXPIRES_UNSOLD,
            at_stake=to_cents(Decimal(str(lost)) * price),
            product=item.product,
            quantity=amount(lost),
            day=min(b.expiry_date for b in expiring),
        )

    @staticmethod
    def _unserved(stock: list[StockBatch], demand: list[float], today: date) -> float:
        if not demand:
            return 0.0
        return sum(demand) - plan_stock(stock, demand, today).served

    def _runs_out_on(
        self, stock: list[StockBatch], demand: list[float], today: date, least: float
    ) -> date | None:
        """The first day by which the forecast wants noticeably more than the shelf has."""
        for days in range(1, len(demand) + 1):
            if self._unserved(stock, demand[:days], today) >= least:
                return today + timedelta(days=days - 1)
        return None

    def _above_forecast(self, store_id: int) -> list[BriefingNote]:
        notes = []
        for product, expected, sold in self.forecast.last_week(store_id):
            extra = sold - expected
            if sold < expected * ABOVE_FORECAST_SHARE or extra < ABOVE_FORECAST_UNITS:
                continue
            notes.append(
                BriefingNote(
                    kind=NoteKind.ABOVE_FORECAST,
                    at_stake=to_cents(Decimal(str(extra)) * product.sale_price),
                    product=product,
                    quantity=amount(sold),
                    expected=amount(expected),
                )
            )
        return notes
