"""Business rules for stock, tested on the service against the real test database."""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import (
    ConflictError,
    InsufficientStockError,
    InvalidQuantityError,
    InvalidReceiptError,
    NotFoundError,
    StockChangedError,
)
from app.models import Batch, InventoryMovement, MovementType, Product, ProductUnit, Store, User
from app.repositories.inventory_repository import InventoryRepository
from app.schemas.inventory import AdjustmentCreate, ReceiptCreate, WasteCreate, WasteReason
from app.services.inventory_service import InventoryService

TOMORROW = date.today() + timedelta(days=1)


@pytest.fixture
def service(db: Session) -> InventoryService:
    return InventoryService(db)


def make_product(db: Session, store: Store, **overrides: object) -> Product:
    fields = {
        "store_id": store.id,
        "name": "Milk",
        "unit": ProductUnit.PIECE,
        "purchase_price": Decimal("1.10"),
        "sale_price": Decimal("1.59"),
        **overrides,
    }
    product = Product(**fields)
    db.add(product)
    db.flush()
    return product


@pytest.fixture
def milk(db: Session, store: Store) -> Product:
    return make_product(db, store)


def receive(
    service: InventoryService, store: Store, owner: User, product: Product, quantity: str = "50"
) -> Batch:
    return service.receive(
        store.id,
        owner.id,
        ReceiptCreate(product_id=product.id, quantity=Decimal(quantity), expiry_date=TOMORROW),
    )


def movements(db: Session, batch: Batch) -> list[InventoryMovement]:
    stmt = select(InventoryMovement).where(InventoryMovement.batch_id == batch.id)
    return list(db.scalars(stmt.order_by(InventoryMovement.id)))


# Receiving goods


def test_receipt_creates_a_batch_and_its_history_line(
    service: InventoryService, db: Session, store: Store, owner: User, milk: Product
) -> None:
    batch = receive(service, store, owner, milk)

    assert batch.received_quantity == batch.remaining_quantity == Decimal("50")
    assert batch.expiry_date == TOMORROW
    assert batch.purchase_price == Decimal("1.10")  # taken from the product

    [movement] = movements(db, batch)
    assert movement.type == MovementType.RECEIPT
    assert movement.quantity_delta == Decimal("50")
    assert movement.actor_id == owner.id


def test_receipt_can_have_its_own_purchase_price(
    service: InventoryService, store: Store, owner: User, milk: Product
) -> None:
    data = ReceiptCreate(product_id=milk.id, quantity=Decimal("5"), purchase_price=Decimal("0"))
    assert service.receive(store.id, owner.id, data).purchase_price == Decimal("0")


def test_goods_without_an_expiry_date_are_allowed(
    service: InventoryService, store: Store, owner: User, milk: Product
) -> None:
    data = ReceiptCreate(product_id=milk.id, quantity=Decimal("5"))
    assert service.receive(store.id, owner.id, data).expiry_date is None


def test_goods_expiring_today_are_accepted_but_not_already_expired(
    service: InventoryService, store: Store, owner: User, milk: Product
) -> None:
    today = ReceiptCreate(product_id=milk.id, quantity=Decimal("5"), expiry_date=date.today())
    assert service.receive(store.id, owner.id, today).id > 0

    yesterday = today.model_copy(update={"expiry_date": date.today() - timedelta(days=1)})
    with pytest.raises(InvalidReceiptError):
        service.receive(store.id, owner.id, yesterday)


def test_archived_product_cannot_receive_stock(
    service: InventoryService, db: Session, store: Store, owner: User
) -> None:
    archived = make_product(db, store, active=False)
    with pytest.raises(ConflictError):
        receive(service, store, owner, archived)


def test_product_of_another_store_cannot_receive_stock(
    service: InventoryService, db: Session, store: Store, owner: User
) -> None:
    other_store = Store(name="Someone else's store")
    db.add(other_store)
    db.flush()
    foreign = make_product(db, other_store)
    with pytest.raises(NotFoundError):
        receive(service, store, owner, foreign)


# Whole pieces and weighed goods


def test_pieces_must_be_whole_but_weighed_goods_may_not_be(
    service: InventoryService, db: Session, store: Store, owner: User, milk: Product
) -> None:
    with pytest.raises(InvalidQuantityError):
        receive(service, store, owner, milk, "1.5")

    bananas = make_product(db, store, name="Bananas", unit=ProductUnit.KILOGRAM)
    assert receive(service, store, owner, bananas, "1.250").remaining_quantity == Decimal("1.250")


# Waste


def test_waste_reduces_stock_and_records_the_reason(
    service: InventoryService, db: Session, store: Store, owner: User, milk: Product
) -> None:
    batch = receive(service, store, owner, milk)
    data = WasteCreate(quantity=Decimal("3"), reason=WasteReason.DAMAGED)
    service.write_off(store.id, owner.id, batch.id, data)

    assert batch.remaining_quantity == Decimal("47")
    waste = movements(db, batch)[-1]
    assert waste.type == MovementType.WASTE
    assert waste.quantity_delta == Decimal("-3")
    assert waste.reason == "damaged"


def test_cannot_remove_more_than_there_is(
    service: InventoryService, db: Session, store: Store, owner: User, milk: Product
) -> None:
    batch = receive(service, store, owner, milk, "5")
    data = WasteCreate(quantity=Decimal("6"), reason=WasteReason.EXPIRED)

    with pytest.raises(InsufficientStockError) as error:
        service.write_off(store.id, owner.id, batch.id, data)

    assert "Only 5 left" in error.value.message
    db.refresh(batch)
    assert batch.remaining_quantity == Decimal("5")
    assert len(movements(db, batch)) == 1  # no history line for a refused change


def test_exactly_all_the_stock_can_be_removed(
    service: InventoryService, store: Store, owner: User, milk: Product
) -> None:
    batch = receive(service, store, owner, milk, "5")
    data = WasteCreate(quantity=Decimal("5"), reason=WasteReason.EXPIRED)
    assert service.write_off(store.id, owner.id, batch.id, data).remaining_quantity == 0


def test_batch_of_another_store_cannot_be_changed(
    service: InventoryService, db: Session, store: Store, owner: User, milk: Product
) -> None:
    batch = receive(service, store, owner, milk)
    other_store = Store(name="Someone else's store")
    db.add(other_store)
    db.flush()
    data = WasteCreate(quantity=Decimal("1"), reason=WasteReason.OTHER)
    with pytest.raises(NotFoundError):
        service.write_off(other_store.id, owner.id, batch.id, data)


# Corrections


def test_adjustment_can_add_and_remove_stock(
    service: InventoryService, store: Store, owner: User, milk: Product
) -> None:
    batch = receive(service, store, owner, milk, "10")
    up = AdjustmentCreate(quantity_delta=Decimal("2"), reason="Found on the shelf")
    down = AdjustmentCreate(quantity_delta=Decimal("-5"), reason="Stocktaking")

    assert service.adjust(store.id, owner.id, batch.id, up).remaining_quantity == Decimal("12")
    assert service.adjust(store.id, owner.id, batch.id, down).remaining_quantity == Decimal("7")


def test_adjustment_cannot_go_below_zero_or_be_zero(
    service: InventoryService, store: Store, owner: User, milk: Product
) -> None:
    batch = receive(service, store, owner, milk, "3")
    too_much = AdjustmentCreate(quantity_delta=Decimal("-4"), reason="Stocktaking")
    with pytest.raises(InsufficientStockError):
        service.adjust(store.id, owner.id, batch.id, too_much)

    zero = AdjustmentCreate(quantity_delta=Decimal("0"), reason="Stocktaking")
    with pytest.raises(InvalidQuantityError):
        service.adjust(store.id, owner.id, batch.id, zero)


def test_correction_based_on_an_old_number_is_refused(
    service: InventoryService, db: Session, store: Store, owner: User, milk: Product
) -> None:
    batch = receive(service, store, owner, milk, "10")
    # Someone counted 8 while the screen showed 10, so the correction is -2...
    counted = AdjustmentCreate(
        quantity_delta=Decimal("-2"), reason="Count", expected_quantity=Decimal("10")
    )
    # ...but a colleague threw away one item first.
    waste = WasteCreate(quantity=Decimal("1"), reason=WasteReason.DAMAGED)
    service.write_off(store.id, owner.id, batch.id, waste)

    with pytest.raises(StockChangedError) as error:
        service.adjust(store.id, owner.id, batch.id, counted)

    assert "it now has 9" in error.value.message
    db.refresh(batch)
    assert batch.remaining_quantity == Decimal("9")
    assert len(movements(db, batch)) == 2  # no history line for a refused change


def test_correction_based_on_the_current_number_works(
    service: InventoryService, store: Store, owner: User, milk: Product
) -> None:
    batch = receive(service, store, owner, milk, "10")
    data = AdjustmentCreate(
        quantity_delta=Decimal("-2"), reason="Count", expected_quantity=Decimal("10.000")
    )
    assert service.adjust(store.id, owner.id, batch.id, data).remaining_quantity == Decimal("8")


# The rule everything else relies on


def test_remaining_quantity_always_equals_the_sum_of_the_history(
    service: InventoryService, db: Session, store: Store, owner: User, milk: Product
) -> None:
    batch = receive(service, store, owner, milk, "50")
    service.write_off(
        store.id, owner.id, batch.id, WasteCreate(quantity=Decimal("3"), reason=WasteReason.EXPIRED)
    )
    service.adjust(
        store.id, owner.id, batch.id, AdjustmentCreate(quantity_delta=Decimal("4"), reason="Count")
    )
    service.adjust(
        store.id, owner.id, batch.id, AdjustmentCreate(quantity_delta=Decimal("-1"), reason="Count")
    )

    assert batch.remaining_quantity == Decimal("50")
    assert InventoryRepository(db).movements_total(batch.id) == batch.remaining_quantity


# Rules the database enforces by itself, even if application code has a bug


def test_database_refuses_negative_stock(
    service: InventoryService, db: Session, store: Store, owner: User, milk: Product
) -> None:
    batch = receive(service, store, owner, milk)
    batch.remaining_quantity = Decimal("-1")
    with pytest.raises(IntegrityError):
        db.flush()


@pytest.mark.parametrize(
    ("movement_type", "delta", "reason"),
    [
        (MovementType.RECEIPT, "-1", None),  # a receipt can't reduce stock
        (MovementType.WASTE, "1", "expired"),  # waste can't add stock
        (MovementType.WASTE, "-1", None),  # waste needs a reason
        (MovementType.ADJUSTMENT, "1", None),  # a correction needs a reason
        (MovementType.ADJUSTMENT, "0", "count"),  # nothing happened
    ],
)
def test_database_refuses_nonsense_history_lines(
    service: InventoryService,
    db: Session,
    store: Store,
    owner: User,
    milk: Product,
    movement_type: MovementType,
    delta: str,
    reason: str | None,
) -> None:
    batch = receive(service, store, owner, milk)
    db.add(
        InventoryMovement(
            store_id=store.id,
            product_id=milk.id,
            batch_id=batch.id,
            actor_id=owner.id,
            type=movement_type,
            quantity_delta=Decimal(delta),
            reason=reason,
        )
    )
    with pytest.raises(IntegrityError):
        db.flush()
