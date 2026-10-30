"""Business rules for sales: stock leaves the store from the batch that expires first."""

from datetime import date
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
from app.schemas.sale import SaleCreate, SaleItemCreate
from app.services.inventory_service import ensure_whole_pieces


class SaleService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.sales = SaleRepository(session)
        self.inventory = InventoryRepository(session)
        self.products = ProductRepository(session)

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
