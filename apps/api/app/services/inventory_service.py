"""Business rules for stock: receiving goods, writing off waste and correcting counts.

Every operation changes the batch and writes its history line in one database transaction, so
stock can't change without a record, and a record can't exist without the change.
"""

from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.exceptions import (
    ConflictError,
    InsufficientStockError,
    InvalidQuantityError,
    InvalidReceiptError,
    NotFoundError,
    StockChangedError,
)
from app.models.batch import Batch
from app.models.inventory_movement import InventoryMovement, MovementType
from app.models.product import Product, ProductUnit
from app.repositories.inventory_repository import InventoryRepository
from app.repositories.product_repository import ProductRepository
from app.schemas.inventory import AdjustmentCreate, BatchStatus, ReceiptCreate, WasteCreate


class InventoryService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.inventory = InventoryRepository(session)
        self.products = ProductRepository(session)

    def list_batches(
        self,
        store_id: int,
        *,
        product_id: int | None,
        status: BatchStatus,
        search: str | None,
        limit: int,
        offset: int,
    ) -> tuple[list[Batch], int]:
        return self.inventory.search(
            store_id,
            product_id=product_id,
            status=status,
            search=search,
            limit=limit,
            offset=offset,
        )

    def list_movements(
        self, store_id: int, batch_id: int, *, limit: int, offset: int
    ) -> tuple[list[InventoryMovement], int]:
        batch, _ = self._get_batch(store_id, batch_id)
        return self.inventory.list_movements(batch.id, limit=limit, offset=offset)

    def receive(self, store_id: int, actor_id: int, data: ReceiptCreate) -> Batch:
        product = self.products.get(store_id, data.product_id)
        if product is None:
            raise NotFoundError(f"Product {data.product_id} was not found")
        if not product.active:
            raise ConflictError(f"'{product.name}' is archived. Restore it before receiving stock")
        self._ensure_whole_pieces(product, data.quantity)
        if data.expiry_date is not None and data.expiry_date < date.today():
            raise InvalidReceiptError("The expiry date is in the past")

        batch = Batch(
            store_id=store_id,
            product_id=product.id,
            lot_code=data.lot_code or None,
            expiry_date=data.expiry_date,
            received_quantity=data.quantity,
            remaining_quantity=data.quantity,
            purchase_price=(
                product.purchase_price if data.purchase_price is None else data.purchase_price
            ),
        )
        self.inventory.add(batch)
        self._record(batch, actor_id, MovementType.RECEIPT, data.quantity, reason=None)
        self.session.commit()
        return batch

    def write_off(self, store_id: int, actor_id: int, batch_id: int, data: WasteCreate) -> Batch:
        batch, product = self._get_batch(store_id, batch_id)
        self._ensure_whole_pieces(product, data.quantity)
        return self._apply(batch, actor_id, MovementType.WASTE, -data.quantity, data.reason.value)

    def adjust(self, store_id: int, actor_id: int, batch_id: int, data: AdjustmentCreate) -> Batch:
        batch, product = self._get_batch(store_id, batch_id)
        if data.quantity_delta == 0:
            raise InvalidQuantityError("The correction can't be zero")
        self._ensure_whole_pieces(product, data.quantity_delta)
        return self._apply(
            batch,
            actor_id,
            MovementType.ADJUSTMENT,
            data.quantity_delta,
            data.reason,
            expected=data.expected_quantity,
        )

    def _apply(
        self,
        batch: Batch,
        actor_id: int,
        movement_type: MovementType,
        delta: Decimal,
        reason: str,
        expected: Decimal | None = None,
    ) -> Batch:
        if not self.inventory.change_remaining(batch, delta, expected):
            self.session.rollback()
            left = f"{batch.remaining_quantity.normalize():f}"
            if expected is not None and batch.remaining_quantity != expected:
                raise StockChangedError(f"This batch changed meanwhile, it now has {left}")
            raise InsufficientStockError(f"Only {left} left in this batch")
        self._record(batch, actor_id, movement_type, delta, reason)
        self.session.commit()
        return batch

    def _record(
        self,
        batch: Batch,
        actor_id: int,
        movement_type: MovementType,
        delta: Decimal,
        reason: str | None,
    ) -> None:
        self.inventory.add(
            InventoryMovement(
                store_id=batch.store_id,
                product_id=batch.product_id,
                batch_id=batch.id,
                actor_id=actor_id,
                type=movement_type,
                quantity_delta=delta,
                reason=reason,
            )
        )

    def _get_batch(self, store_id: int, batch_id: int) -> tuple[Batch, Product]:
        batch = self.inventory.get_batch(store_id, batch_id)
        if batch is None:
            raise NotFoundError(f"Batch {batch_id} was not found")
        return batch, self.products.get(store_id, batch.product_id)

    @staticmethod
    def _ensure_whole_pieces(product: Product, quantity: Decimal) -> None:
        if product.unit == ProductUnit.PIECE and quantity != quantity.to_integral_value():
            raise InvalidQuantityError(f"'{product.name}' is counted in whole pieces")
