"""Read-only queries behind a product's story."""

from datetime import date, datetime

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session, joinedload

from app.models.batch import Batch
from app.models.delivery import Delivery, DeliveryItem, DeliveryStatus
from app.models.inventory_movement import InventoryMovement, MovementType
from app.models.sale import SaleItem
from app.models.supplier import Supplier


class StoryRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def movements(
        self, store_id: int, product_id: int, *, start: datetime, end: datetime
    ) -> list[tuple[InventoryMovement, int | None, str | None, int | None]]:
        """Each stock movement of the product in the period, the newest first, with the sale it
        belongs to (for sales) and the supplier and delivery it came with (for receipts)."""
        stmt = (
            select(InventoryMovement, SaleItem.sale_id, Supplier.name, Delivery.id)
            .outerjoin(SaleItem, SaleItem.id == InventoryMovement.sale_item_id)
            .outerjoin(
                DeliveryItem,
                and_(
                    DeliveryItem.batch_id == InventoryMovement.batch_id,
                    InventoryMovement.type == MovementType.RECEIPT,
                ),
            )
            .outerjoin(Delivery, Delivery.id == DeliveryItem.delivery_id)
            .outerjoin(Supplier, Supplier.id == Delivery.supplier_id)
            .options(joinedload(InventoryMovement.actor), joinedload(InventoryMovement.batch))
            .where(
                InventoryMovement.store_id == store_id,
                InventoryMovement.product_id == product_id,
                InventoryMovement.occurred_at >= start,
                InventoryMovement.occurred_at < end,
            )
            .order_by(InventoryMovement.occurred_at.desc(), InventoryMovement.id.desc())
        )
        return [tuple(row) for row in self.session.execute(stmt)]

    def orders(
        self, store_id: int, product_id: int, *, start: datetime, end: datetime
    ) -> list[tuple[Delivery, DeliveryItem]]:
        """Deliveries the product was put on in the period, with its line."""
        stmt = (
            select(Delivery, DeliveryItem)
            .join(DeliveryItem, DeliveryItem.delivery_id == Delivery.id)
            .options(joinedload(Delivery.supplier))
            .where(
                Delivery.store_id == store_id,
                DeliveryItem.product_id == product_id,
                Delivery.created_at >= start,
                Delivery.created_at < end,
            )
            .order_by(Delivery.created_at.desc(), Delivery.id.desc())
        )
        return [tuple(row) for row in self.session.execute(stmt)]

    def last_before(self, store_id: int, product_id: int, moment: datetime) -> datetime | None:
        """When something last happened to the product before this moment."""
        moved = select(func.max(InventoryMovement.occurred_at)).where(
            InventoryMovement.store_id == store_id,
            InventoryMovement.product_id == product_id,
            InventoryMovement.occurred_at < moment,
        )
        ordered = (
            select(func.max(Delivery.created_at))
            .join(DeliveryItem, DeliveryItem.delivery_id == Delivery.id)
            .where(
                Delivery.store_id == store_id,
                DeliveryItem.product_id == product_id,
                Delivery.created_at < moment,
            )
        )
        found = [m for m in (self.session.scalar(moved), self.session.scalar(ordered)) if m]
        return max(found, default=None)

    def expired_on_shelf(self, store_id: int, product_id: int, today: date) -> list[Batch]:
        stmt = (
            select(Batch)
            .where(
                Batch.store_id == store_id,
                Batch.product_id == product_id,
                Batch.remaining_quantity > 0,
                Batch.expiry_date < today,
            )
            .order_by(Batch.expiry_date, Batch.id)
        )
        return list(self.session.scalars(stmt))

    def late_deliveries(self, store_id: int, product_id: int, today: date) -> list[Delivery]:
        stmt = (
            select(Delivery)
            .join(DeliveryItem, DeliveryItem.delivery_id == Delivery.id)
            .options(joinedload(Delivery.supplier))
            .where(
                Delivery.store_id == store_id,
                DeliveryItem.product_id == product_id,
                Delivery.status == DeliveryStatus.ORDERED,
                Delivery.expected_on < today,
            )
            .order_by(Delivery.expected_on, Delivery.id)
        )
        return list(self.session.scalars(stmt).unique())
