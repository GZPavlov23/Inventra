"""Business rules for sales: stock leaves the store from the batch that expires first."""

from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.exceptions import (
    ConflictError,
    DomainError,
    InsufficientStockError,
    NotFoundError,
)
from app.core.period import period_bounds, period_length
from app.models.batch import Batch
from app.models.inventory_movement import InventoryMovement, MovementType
from app.models.product import Product
from app.models.sale import Sale, SaleItem
from app.repositories.inventory_repository import InventoryRepository
from app.repositories.product_repository import ProductRepository
from app.repositories.sale_repository import SaleRepository
from app.schemas.sale import DailySales, SaleCreate, SaleItemCreate, SaleSummary
from app.services.inventory_service import ensure_whole_pieces


class SaleService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.sales = SaleRepository(session)
        self.inventory = InventoryRepository(session)
        self.products = ProductRepository(session)

    def list_sales(
        self,
        store_id: int,
        *,
        date_from: date | None,
        date_to: date | None,
        limit: int,
        offset: int,
    ) -> tuple[list[Sale], int]:
        start, end = period_bounds(date_from, date_to)
        return self.sales.search(store_id, start=start, end=end, limit=limit, offset=offset)

    def summarize(
        self, store_id: int, *, date_from: date | None, date_to: date | None
    ) -> SaleSummary:
        start, end = period_bounds(date_from, date_to)
        sales, revenue, cost = self.sales.summarize(store_id, start=start, end=end)
        return SaleSummary(sales=sales, revenue=revenue, cost=cost, profit=revenue - cost)

    def daily(self, store_id: int, *, date_from: date, date_to: date) -> list[DailySales]:
        """Every day of the period, also those without sales, so a chart has no gaps."""
        days = period_length(date_from, date_to)
        start, end = period_bounds(date_from, date_to)
        rows = {row[0]: row for row in self.sales.daily(store_id, start=start, end=end)}

        result = []
        for offset in range(days):
            day = date_from + timedelta(days=offset)
            _, sales, revenue, cost = rows.get(day, (day, 0, Decimal(0), Decimal(0)))
            result.append(
                DailySales(day=day, sales=sales, revenue=revenue, cost=cost, profit=revenue - cost)
            )
        return result

    def get_sale(self, store_id: int, sale_id: int) -> Sale:
        sale = self.sales.get(store_id, sale_id)
        if sale is None:
            raise NotFoundError(f"Sale {sale_id} was not found")
        return sale

    def record(self, store_id: int, actor_id: int, data: SaleCreate) -> Sale:
        """Records a whole sale or nothing: one impossible line cancels all of them."""
        try:
            sale = self.add_sale(store_id, actor_id, data)
        except DomainError:
            self.session.rollback()
            raise
        self.session.commit()
        return sale

    def add_sale(
        self,
        store_id: int,
        actor_id: int,
        data: SaleCreate,
        *,
        sold_on: date | None = None,
        sold_at: datetime | None = None,
        external_id: str | None = None,
    ) -> Sale:
        """Adds a sale without committing, so an import can keep many in one transaction.

        An imported sale happened earlier: sold_on decides which goods had not expired yet.
        """
        sale = Sale(store_id=store_id, actor_id=actor_id, external_id=external_id)
        if sold_at is not None:
            sale.sold_at = sold_at
        self.sales.add(sale)
        # Always the same order: two sales of the same products in opposite order would
        # otherwise each hold a lock the other one waits for, forever (a deadlock).
        for line in sorted(data.items, key=lambda item: item.product_id):
            self._sell(sale, line, sold_on or date.today())
        return sale

    def _sell(self, sale: Sale, line: SaleItemCreate, day: date) -> None:
        product = self.products.get(sale.store_id, line.product_id)
        if product is None:
            raise NotFoundError(f"Product {line.product_id} was not found")
        if not product.active:
            raise ConflictError(f"'{product.name}' is archived. Restore it before selling it")
        ensure_whole_pieces(product, line.quantity)

        batches = self.inventory.lock_sellable_batches(sale.store_id, product.id, day)
        self._ensure_enough(product, batches, line.quantity)

        item = SaleItem(
            store_id=sale.store_id,
            sale_id=sale.id,
            product_id=product.id,
            quantity=line.quantity,
            unit_price=product.sale_price if line.unit_price is None else line.unit_price,
        )
        self.sales.add(item)

        left = line.quantity
        for batch in batches:
            taken = min(left, batch.remaining_quantity)
            # A plain assignment is safe here: these rows stay locked until the commit.
            batch.remaining_quantity -= taken
            self.inventory.add(
                InventoryMovement(
                    store_id=sale.store_id,
                    product_id=product.id,
                    batch_id=batch.id,
                    actor_id=sale.actor_id,
                    type=MovementType.SALE,
                    quantity_delta=-taken,
                    sale_item_id=item.id,
                    occurred_at=sale.sold_at,
                )
            )
            left -= taken
            if left == 0:
                break

    @staticmethod
    def _ensure_enough(product: Product, batches: list[Batch], quantity: Decimal) -> None:
        available = sum((batch.remaining_quantity for batch in batches), Decimal(0))
        if available < quantity:
            amount = f"{available.normalize():f}"
            raise InsufficientStockError(f"Only {amount} of '{product.name}' can be sold")
