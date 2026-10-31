"""Business rules for sales, tested on the service against the real test database."""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import (
    ConflictError,
    InsufficientStockError,
    InvalidQuantityError,
    NotFoundError,
)
from app.models import (
    Batch,
    InventoryMovement,
    MovementType,
    Product,
    ProductUnit,
    Sale,
    SaleItem,
    Store,
    User,
)
from app.repositories.inventory_repository import InventoryRepository
from app.schemas.inventory import ReceiptCreate
from app.schemas.sale import SaleCreate, SaleItemCreate
from app.services.inventory_service import InventoryService
from app.services.sale_service import SaleService


def in_days(days: int) -> date:
    return date.today() + timedelta(days=days)


@pytest.fixture
def service(db: Session) -> SaleService:
    return SaleService(db)


def make_product(db: Session, store: Store, name: str = "Milk", **overrides: object) -> Product:
    fields = {
        "store_id": store.id,
        "name": name,
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
    db: Session, store: Store, owner: User, product: Product, quantity: str, days: int | None = 30
) -> Batch:
    return InventoryService(db).receive(
        store.id,
        owner.id,
        ReceiptCreate(
            product_id=product.id,
            quantity=Decimal(quantity),
            expiry_date=None if days is None else in_days(days),
        ),
    )


def expire(db: Session, batch: Batch) -> None:
    # The app refuses expired goods at the door, so a batch has to age in the database.
    batch.expiry_date = in_days(-1)
    db.flush()


def sale_of(*lines: tuple[Product, str]) -> SaleCreate:
    return SaleCreate(
        items=[
            SaleItemCreate(product_id=product.id, quantity=Decimal(quantity))
            for product, quantity in lines
        ]
    )


def sale_movements(db: Session) -> list[InventoryMovement]:
    stmt = select(InventoryMovement).where(InventoryMovement.type == MovementType.SALE)
    return list(db.scalars(stmt.order_by(InventoryMovement.id)))


def count(db: Session, model: type) -> int:
    return len(list(db.scalars(select(model))))


# Which goods leave the shelf


def test_stock_leaves_from_the_batch_that_expires_first(
    service: SaleService, db: Session, store: Store, owner: User, milk: Product
) -> None:
    later = receive(db, store, owner, milk, "10", days=20)
    sooner = receive(db, store, owner, milk, "10", days=2)

    service.record(store.id, owner.id, sale_of((milk, "3")))

    assert sooner.remaining_quantity == Decimal("7")
    assert later.remaining_quantity == Decimal("10")


def test_a_sale_continues_into_the_next_batch(
    service: SaleService, db: Session, store: Store, owner: User, milk: Product
) -> None:
    first = receive(db, store, owner, milk, "4", days=2)
    second = receive(db, store, owner, milk, "10", days=9)
    third = receive(db, store, owner, milk, "10", days=30)

    service.record(store.id, owner.id, sale_of((milk, "6")))

    assert first.remaining_quantity == 0
    assert second.remaining_quantity == Decimal("8")
    assert third.remaining_quantity == Decimal("10")
    assert [(line.batch_id, line.quantity_delta) for line in sale_movements(db)] == [
        (first.id, Decimal("-4")),
        (second.id, Decimal("-2")),
    ]


def test_goods_without_an_expiry_date_go_last(
    service: SaleService, db: Session, store: Store, owner: User, milk: Product
) -> None:
    no_expiry = receive(db, store, owner, milk, "5", days=None)
    dated = receive(db, store, owner, milk, "5", days=300)

    service.record(store.id, owner.id, sale_of((milk, "1")))

    assert dated.remaining_quantity == Decimal("4")
    assert no_expiry.remaining_quantity == Decimal("5")


def test_expired_goods_are_never_sold(
    service: SaleService, db: Session, store: Store, owner: User, milk: Product
) -> None:
    expired = receive(db, store, owner, milk, "10", days=1)
    expire(db, expired)
    fresh = receive(db, store, owner, milk, "3", days=30)

    with pytest.raises(InsufficientStockError) as error:
        service.record(store.id, owner.id, sale_of((milk, "4")))
    assert "Only 3 of 'Milk' can be sold" in error.value.message

    service.record(store.id, owner.id, sale_of((milk, "3")))
    assert fresh.remaining_quantity == 0
    assert expired.remaining_quantity == Decimal("10")


def test_goods_expiring_today_can_still_be_sold(
    service: SaleService, db: Session, store: Store, owner: User, milk: Product
) -> None:
    today = receive(db, store, owner, milk, "2", days=0)
    service.record(store.id, owner.id, sale_of((milk, "2")))
    assert today.remaining_quantity == 0


# All or nothing


def test_one_impossible_line_cancels_the_whole_sale(
    service: SaleService, db: Session, store: Store, owner: User, milk: Product
) -> None:
    bread = make_product(db, store, "Bread")
    milk_batch = receive(db, store, owner, milk, "10")
    receive(db, store, owner, bread, "1")

    with pytest.raises(InsufficientStockError):
        service.record(store.id, owner.id, sale_of((milk, "2"), (bread, "5")))

    db.refresh(milk_batch)
    assert milk_batch.remaining_quantity == Decimal("10")
    assert count(db, Sale) == 0
    assert count(db, SaleItem) == 0
    assert sale_movements(db) == []


def test_exactly_all_the_stock_can_be_sold(
    service: SaleService, db: Session, store: Store, owner: User, milk: Product
) -> None:
    batch = receive(db, store, owner, milk, "5")
    service.record(store.id, owner.id, sale_of((milk, "5")))
    assert batch.remaining_quantity == 0
    assert milk.stock == 0


def test_the_same_product_on_two_lines_counts_twice(
    service: SaleService, db: Session, store: Store, owner: User, milk: Product
) -> None:
    batch = receive(db, store, owner, milk, "5")

    with pytest.raises(InsufficientStockError):
        service.record(store.id, owner.id, sale_of((milk, "3"), (milk, "3")))
    db.refresh(batch)
    assert batch.remaining_quantity == Decimal("5")

    service.record(store.id, owner.id, sale_of((milk, "2"), (milk, "3")))
    assert batch.remaining_quantity == 0


# Prices


def test_price_comes_from_the_product_and_stays_with_the_sale(
    service: SaleService, db: Session, store: Store, owner: User, milk: Product
) -> None:
    receive(db, store, owner, milk, "5")
    sale = service.record(store.id, owner.id, sale_of((milk, "1")))

    milk.sale_price = Decimal("9.99")
    db.flush()

    assert sale.items[0].unit_price == Decimal("1.59")


def test_a_sale_can_have_its_own_price(
    service: SaleService, db: Session, store: Store, owner: User, milk: Product
) -> None:
    receive(db, store, owner, milk, "5")
    data = SaleCreate(
        items=[SaleItemCreate(product_id=milk.id, quantity=Decimal("1"), unit_price=Decimal("0"))]
    )
    assert service.record(store.id, owner.id, data).items[0].unit_price == 0


# Refused sales


def test_pieces_must_be_whole_but_weighed_goods_may_not_be(
    service: SaleService, db: Session, store: Store, owner: User, milk: Product
) -> None:
    receive(db, store, owner, milk, "5")
    with pytest.raises(InvalidQuantityError):
        service.record(store.id, owner.id, sale_of((milk, "1.5")))

    bananas = make_product(db, store, "Bananas", unit=ProductUnit.KILOGRAM)
    batch = receive(db, store, owner, bananas, "2.000")
    service.record(store.id, owner.id, sale_of((bananas, "0.750")))
    assert batch.remaining_quantity == Decimal("1.250")


def test_archived_product_cannot_be_sold(
    service: SaleService, db: Session, store: Store, owner: User, milk: Product
) -> None:
    receive(db, store, owner, milk, "5")
    milk.active = False
    db.flush()
    with pytest.raises(ConflictError):
        service.record(store.id, owner.id, sale_of((milk, "1")))
    assert count(db, Sale) == 0


def test_product_of_another_store_cannot_be_sold(
    service: SaleService, db: Session, store: Store, owner: User
) -> None:
    other_store = Store(name="Someone else's store")
    db.add(other_store)
    db.flush()
    foreign = make_product(db, other_store)
    with pytest.raises(NotFoundError):
        service.record(store.id, owner.id, sale_of((foreign, "1")))


def test_product_without_stock_cannot_be_sold(
    service: SaleService, store: Store, owner: User, milk: Product
) -> None:
    with pytest.raises(InsufficientStockError) as error:
        service.record(store.id, owner.id, sale_of((milk, "1")))
    assert "Only 0 of 'Milk'" in error.value.message


# History


def test_every_batch_keeps_matching_its_history(
    service: SaleService, db: Session, store: Store, owner: User, milk: Product
) -> None:
    first = receive(db, store, owner, milk, "4", days=2)
    second = receive(db, store, owner, milk, "10", days=9)

    sale = service.record(store.id, owner.id, sale_of((milk, "6")))

    repository = InventoryRepository(db)
    assert repository.movements_total(first.id) == first.remaining_quantity
    assert repository.movements_total(second.id) == second.remaining_quantity
    db.refresh(milk)
    assert milk.stock == Decimal("8")
    assert {line.sale_item_id for line in sale_movements(db)} == {sale.items[0].id}
    assert {line.actor_id for line in sale_movements(db)} == {owner.id}


def test_a_store_with_sales_can_still_be_deleted(
    service: SaleService, db: Session, store: Store, owner: User, milk: Product
) -> None:
    receive(db, store, owner, milk, "5")
    service.record(store.id, owner.id, sale_of((milk, "1")))

    db.execute(delete(Store).where(Store.id == store.id))

    assert count(db, Sale) == 0
    assert count(db, SaleItem) == 0
    assert count(db, InventoryMovement) == 0


# Rules the database enforces by itself, even if application code has a bug


@pytest.mark.parametrize(
    ("movement_type", "delta", "has_item"),
    [
        (MovementType.SALE, "1", True),  # a sale can't add stock
        (MovementType.SALE, "-1", False),  # a sale line must point to what was sold
        (MovementType.WASTE, "-1", True),  # only sales point to sale lines
    ],
)
def test_database_refuses_nonsense_sale_lines(
    service: SaleService,
    db: Session,
    store: Store,
    owner: User,
    milk: Product,
    movement_type: MovementType,
    delta: str,
    has_item: bool,
) -> None:
    batch = receive(db, store, owner, milk, "5")
    sale = service.record(store.id, owner.id, sale_of((milk, "1")))
    db.add(
        InventoryMovement(
            store_id=store.id,
            product_id=milk.id,
            batch_id=batch.id,
            actor_id=owner.id,
            type=movement_type,
            quantity_delta=Decimal(delta),
            reason="expired" if movement_type == MovementType.WASTE else None,
            sale_item_id=sale.items[0].id if has_item else None,
        )
    )
    with pytest.raises(IntegrityError):
        db.flush()
