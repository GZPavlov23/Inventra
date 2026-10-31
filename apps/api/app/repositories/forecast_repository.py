"""The sales history forecasts learn from."""

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.demand_day import DemandDay
from app.models.product import Product
from app.models.sale import Sale, SaleItem
from app.repositories.sale_repository import in_period


class ForecastRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def active_products(self, store_id: int) -> list[Product]:
        stmt = select(Product).where(Product.store_id == store_id, Product.active)
        return list(self.session.scalars(stmt))

    def sold_per_day(
        self, store_id: int, *, start: datetime, end: datetime
    ) -> list[tuple[int, date, Decimal]]:
        """Product, day and quantity of the real sales."""
        # PostgreSQL's time zone decides where a day ends; locally it is the computer's own.
        day = func.date(Sale.sold_at)
        stmt = (
            select(SaleItem.product_id, day, func.sum(SaleItem.quantity))
            .join(Sale, SaleItem.sale_id == Sale.id)
            .where(*in_period(store_id, start, end))
            .group_by(SaleItem.product_id, day)
        )
        return [tuple(row) for row in self.session.execute(stmt)]

    def imported_per_day(
        self, store_id: int, *, first_day: date, last_day: date
    ) -> list[tuple[int, date, Decimal]]:
        """Product, day and quantity of the imported old history."""
        stmt = select(DemandDay.product_id, DemandDay.day, DemandDay.quantity).where(
            DemandDay.store_id == store_id,
            DemandDay.day >= first_day,
            DemandDay.day <= last_day,
        )
        return [tuple(row) for row in self.session.execute(stmt)]
