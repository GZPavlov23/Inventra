"""Business rules for deliveries: goods are ordered, then received into batches or cancelled."""

from datetime import UTC, date, datetime

from sqlalchemy.orm import Session

from app.core.exceptions import (
    ConflictError,
    DeliveryClosedError,
    DomainError,
    InvalidReceiptError,
    NotFoundError,
    SupplierArchivedError,
)
from app.models.delivery import Delivery, DeliveryItem, DeliveryStatus
from app.repositories.delivery_repository import DeliveryRepository
from app.repositories.product_repository import ProductRepository
from app.repositories.supplier_repository import SupplierRepository
from app.schemas.delivery import (
    DeliveryCreate,
    DeliveryItemCreate,
    DeliveryReceipt,
    OrderDeliveries,
)
from app.schemas.inventory import ReceiptCreate
from app.services.inventory_service import InventoryService, ensure_whole_pieces


class DeliveryService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.deliveries = DeliveryRepository(session)
        self.products = ProductRepository(session)
        self.suppliers = SupplierRepository(session)
        self.inventory = InventoryService(session)

    def list_deliveries(
        self, store_id: int, *, status: DeliveryStatus | None, limit: int, offset: int
    ) -> tuple[list[Delivery], int]:
        return self.deliveries.search(store_id, status=status, limit=limit, offset=offset)

    def get_delivery(self, store_id: int, delivery_id: int) -> Delivery:
        delivery = self.deliveries.get(store_id, delivery_id)
        if delivery is None:
            raise NotFoundError(f"Delivery {delivery_id} was not found")
        return delivery

    def create(self, store_id: int, actor_id: int, data: DeliveryCreate) -> Delivery:
        """Records what was ordered. Nothing is in the store yet, so stock doesn't change."""
        try:
            delivery = self._add_delivery(
                store_id, actor_id, data.supplier_id, data.expected_on, data.items
            )
        except DomainError:
            self.session.rollback()
            raise
        self.session.commit()
        return self.get_delivery(store_id, delivery.id)

    def create_from_order(
        self, store_id: int, actor_id: int, data: OrderDeliveries
    ) -> list[Delivery]:
        """Splits an order by supplier: one delivery for each, all of them or none."""
        try:
            by_supplier = self._split_by_supplier(store_id, data.items)
            deliveries = [
                self._add_delivery(store_id, actor_id, supplier_id, data.expected_on, lines)
                for supplier_id, lines in by_supplier.items()
            ]
        except DomainError:
            self.session.rollback()
            raise
        self.session.commit()
        return [self.get_delivery(store_id, delivery.id) for delivery in deliveries]

    def _split_by_supplier(
        self, store_id: int, lines: list[DeliveryItemCreate]
    ) -> dict[int, list[DeliveryItemCreate]]:
        by_supplier: dict[int, list[DeliveryItemCreate]] = {}
        for line in lines:
            product = self.products.get(store_id, line.product_id)
            if product is None:
                raise NotFoundError(f"Product {line.product_id} was not found")
            if product.supplier_id is None:
                raise ConflictError(f"'{product.name}' has no supplier")
            by_supplier.setdefault(product.supplier_id, []).append(line)
        return by_supplier

    def _add_delivery(
        self,
        store_id: int,
        actor_id: int,
        supplier_id: int,
        expected_on: date | None,
        lines: list[DeliveryItemCreate],
    ) -> Delivery:
        supplier = self.suppliers.get(store_id, supplier_id)
        if supplier is None:
            raise NotFoundError(f"Supplier {supplier_id} was not found")
        if not supplier.active:
            raise SupplierArchivedError(f"'{supplier.name}' is archived")
        if expected_on is not None and expected_on < date.today():
            raise InvalidReceiptError("The expected date is in the past")

        delivery = Delivery(
            store_id=store_id,
            supplier_id=supplier.id,
            actor_id=actor_id,
            expected_on=expected_on,
        )
        self.deliveries.add(delivery)
        for line in lines:
            self._add_line(delivery, line)
        return delivery

    def _add_line(self, delivery: Delivery, line: DeliveryItemCreate) -> None:
        product = self.products.get(delivery.store_id, line.product_id)
        if product is None:
            raise NotFoundError(f"Product {line.product_id} was not found")
        if not product.active:
            raise ConflictError(f"'{product.name}' is archived. Restore it before ordering it")
        ensure_whole_pieces(product, line.quantity)
        self.deliveries.add(
            DeliveryItem(
                store_id=delivery.store_id,
                delivery_id=delivery.id,
                product_id=product.id,
                ordered_quantity=line.quantity,
                unit_cost=product.purchase_price if line.unit_cost is None else line.unit_cost,
            )
        )

    def receive(
        self, store_id: int, actor_id: int, delivery_id: int, data: DeliveryReceipt
    ) -> Delivery:
        """Turns everything that arrived into batches: the whole delivery or nothing."""
        delivery = self._lock_open(store_id, delivery_id)
        try:
            self._receive_lines(delivery, actor_id, data)
        except DomainError:
            self.session.rollback()
            raise
        delivery.status = DeliveryStatus.RECEIVED
        delivery.received_at = datetime.now(UTC)
        delivery.invoice_number = data.invoice_number or None
        self.session.commit()
        return self.get_delivery(store_id, delivery.id)

    def _receive_lines(self, delivery: Delivery, actor_id: int, data: DeliveryReceipt) -> None:
        lines = {line.item_id: line for line in data.items}
        if len(lines) != len(data.items) or lines.keys() != {i.id for i in delivery.items}:
            raise InvalidReceiptError("Every line of the delivery must be listed once")
        if not any(line.quantity for line in data.items):
            raise InvalidReceiptError("Nothing arrived. Cancel the delivery instead")

        for item in delivery.items:
            line = lines[item.id]
            if line.quantity:
                item.batch = self.inventory.add_receipt(
                    delivery.store_id,
                    actor_id,
                    ReceiptCreate(
                        product_id=item.product_id,
                        quantity=line.quantity,
                        expiry_date=line.expiry_date,
                        lot_code=line.lot_code,
                        purchase_price=(
                            item.unit_cost if line.unit_cost is None else line.unit_cost
                        ),
                    ),
                    reason=f"Delivery #{delivery.id}",
                )
            # After the batch: the database refuses arrived goods without one.
            item.received_quantity = line.quantity

    def cancel(self, store_id: int, delivery_id: int) -> Delivery:
        delivery = self._lock_open(store_id, delivery_id)
        delivery.status = DeliveryStatus.CANCELLED
        self.session.commit()
        return self.get_delivery(store_id, delivery.id)

    def _lock_open(self, store_id: int, delivery_id: int) -> Delivery:
        delivery = self.deliveries.lock(store_id, delivery_id)
        if delivery is None:
            raise NotFoundError(f"Delivery {delivery_id} was not found")
        if delivery.status != DeliveryStatus.ORDERED:
            status = delivery.status.value
            # Ends the transaction, which also releases the lock.
            self.session.rollback()
            raise DeliveryClosedError(f"This delivery was already {status}")
        return delivery
