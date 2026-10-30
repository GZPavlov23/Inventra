"""Business rules for sales: stock leaves the store from the batch that expires first."""

from datetime import date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, DomainError, InsufficientStockError, NotFoundError
from app.models.batch import Batch
from app.models.inventory_movement import InventoryMovement, MovementType
from app.models.product import Product
from app.models.sale import Sale, SaleItem
from app.repositories.inventory_repository import InventoryRepository
from app.repositories.product_repository import ProductRepository
from app.repositories.sale_repository import SaleRepository
from app.schemas.sale import SaleCreate, SaleItemCreate, SaleSummary
from app.services.inventory_service import ensure_whole_pieces


def start_of_day(day: date | None) -> datetime | None:
    # astimezone: the day is the server's local day, the same one date.today() gives.
    return None if day is None else datetime.combine(day, time.min).astimezone()


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
        start, end = self._period(date_from, date_to)
        return self.sales.search(store_id, start=start, end=end, limit=limit, offset=offset)

    def summarize(
        self, store_id: int, *, date_from: date | None, date_to: date | None
    ) -> SaleSummary:
        start, end = self._period(date_from, date_to)
        sales, revenue, cost = self.sales.summarize(store_id, start=start, end=end)
        return SaleSummary(sales=sales, revenue=revenue, cost=cost, profit=revenue - cost)

    def get_sale(self, store_id: int, sale_id: int) -> Sale:
        sale = self.sales.get(store_id, sale_id)
        if sale is None:
            raise NotFoundError(f"Sale {sale_id} was not found")
        return sale

    def record(self, store_id: int, actor_id: int, data: SaleCreate) -> Sale:
        """Records a whole sale or nothing: one impossible line cancels all of them."""
        sale = Sale(store_id=store_id, actor_id=actor_id)
        self.sales.add(sale)
        try:
            # Always the same order: two sales of the same products in opposite order would
            # otherwise each hold a lock the other one waits for, forever (a deadlock).
            for line in sorted(data.items, key=lambda item: item.product_id):
                self._sell(sale, line)
        except DomainError:
            self.session.rollback()
            raise
        self.session.commit()
        return sale

    @staticmethod
    def _period(date_from: date | None, date_to: date | None) -> tuple[datetime | None, ...]:
        # date_to counts as a whole day, so the period ends where the next day starts.
        next_day = None if date_to is None else date_to + timedelta(days=1)
        return start_of_day(date_from), start_of_day(next_day)

    def _sell(self, sale: Sale, line: SaleItemCreate) -> None:
        product = self.products.get(sale.store_id, line.product_id)
        if product is None:
            raise NotFoundError(f"Product {line.product_id} was not found")
        if not product.active:
            raise ConflictError(f"'{product.name}' is archived. Restore it before selling it")
        ensure_whole_pieces(product, line.quantity)

        batches = self.inventory.lock_sellable_batches(sale.store_id, product.id, date.today())
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
