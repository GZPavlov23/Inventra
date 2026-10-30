"""The demo data must obey the same rules as real data, because the jury will look at it."""

from datetime import date, datetime, time, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Batch, InventoryMovement, MovementType, Product, Sale, SaleItem, Store, User
from app.models.batch import ExpiryStatus
from app.repositories.inventory_repository import InventoryRepository
from scripts.seed_demo import (
    DEMO_SALES_WEEKS,
    delete_demo_stock,
    seed_batches,
    seed_products,
    seed_sales,
    seed_waste,
)


@pytest.fixture
def seeded(db: Session, store: Store, owner: User) -> Store:
    seed_products(db, store.id)
    seed_batches(db, store.id, owner.id)
    seed_sales(db, store.id, owner.id)
    seed_waste(db, store.id, owner.id)
    return store


def count(db: Session, model: type) -> int:
    return db.scalar(select(func.count()).select_from(model))


def test_every_batch_matches_its_history(db: Session, seeded: Store) -> None:
    repository = InventoryRepository(db)
    for batch in db.scalars(select(Batch)):
        assert repository.movements_total(batch.id) == batch.remaining_quantity
        stmt = select(InventoryMovement.quantity_delta).where(
            InventoryMovement.batch_id == batch.id, InventoryMovement.type == MovementType.RECEIPT
        )
        assert db.scalar(stmt) == batch.received_quantity


def test_sales_are_in_the_past_and_cover_the_whole_period(db: Session, seeded: Store) -> None:
    today_start = datetime.combine(date.today(), time.min).astimezone()
    first = db.scalar(select(func.min(Sale.sold_at)))
    last = db.scalar(select(func.max(Sale.sold_at)))

    assert last < today_start
    assert first.date() == date.today() - timedelta(weeks=DEMO_SALES_WEEKS)
    assert last.date() == date.today() - timedelta(days=1)


def test_sales_history_does_not_touch_todays_stock(db: Session, store: Store, owner: User) -> None:
    seed_products(db, store.id)
    seed_batches(db, store.id, owner.id)
    stock = {p.id: p.stock for p in db.scalars(select(Product))}

    seed_sales(db, store.id, owner.id)

    db.expire_all()
    assert {p.id: p.stock for p in db.scalars(select(Product))} == stock


def test_sold_quantities_respect_the_product_unit(db: Session, seeded: Store) -> None:
    for item in db.scalars(select(SaleItem).join(SaleItem.product)):
        assert item.quantity > 0
        if item.product.unit == "pcs":
            assert item.quantity == item.quantity.to_integral_value()


def test_sales_have_real_money_in_them(db: Session, seeded: Store) -> None:
    sale = db.scalars(select(Sale).limit(1)).first()
    assert sale.total > 0
    assert sale.cost > 0
    assert sale.profit == sale.total - sale.cost


def test_used_up_batches_do_not_show_as_expired_stock(db: Session, seeded: Store) -> None:
    summary = InventoryRepository(db).summarize(seeded.id, date.today())
    expired = db.scalars(
        select(Batch).where(Batch.remaining_quantity > 0, Batch.expiry_date < date.today())
    ).all()
    assert [batch.expiry_status for batch in expired] == [ExpiryStatus.EXPIRED]
    assert summary[2] == 1


def test_running_it_twice_adds_nothing(db: Session, seeded: Store, owner: User) -> None:
    sales, batches = count(db, Sale), count(db, Batch)
    seed_batches(db, seeded.id, owner.id)
    seed_sales(db, seeded.id, owner.id)
    seed_waste(db, seeded.id, owner.id)
    assert (count(db, Sale), count(db, Batch)) == (sales, batches)


def test_a_sale_made_today_does_not_stop_the_history(
    db: Session, store: Store, owner: User
) -> None:
    seed_products(db, store.id)
    db.add(Sale(store_id=store.id, actor_id=owner.id))
    db.flush()
    seed_sales(db, store.id, owner.id)
    assert count(db, Sale) > 1


def test_fresh_demo_replaces_everything_but_touches_no_other_store(
    db: Session, seeded: Store, owner: User
) -> None:
    other_store = Store(name="Someone else's store")
    db.add(other_store)
    db.flush()
    product = Product(
        store_id=other_store.id,
        name="X",
        purchase_price=Decimal("1"),
        sale_price=Decimal("2"),
    )
    db.add(product)
    db.flush()
    keep = Batch(
        store_id=other_store.id,
        product_id=product.id,
        received_quantity=Decimal("1"),
        remaining_quantity=Decimal("1"),
        purchase_price=Decimal("1"),
    )
    db.add(keep)
    db.flush()

    delete_demo_stock(db, seeded.id)

    assert count(db, Sale) == 0
    assert count(db, SaleItem) == 0
    assert list(db.scalars(select(Batch))) == [keep]
    assert count(db, InventoryMovement) == 0

    seed_batches(db, seeded.id, owner.id)
    seed_sales(db, seeded.id, owner.id)
    assert count(db, Sale) > 0
    stmt = select(InventoryMovement).where(InventoryMovement.type == MovementType.SALE)
    assert db.scalars(stmt).first() is not None


def test_waste_history_keeps_todays_stock_and_has_every_reason(
    db: Session, store: Store, owner: User
) -> None:
    seed_products(db, store.id)
    seed_batches(db, store.id, owner.id)
    stock = {p.id: p.stock for p in db.scalars(select(Product))}

    seed_waste(db, store.id, owner.id)

    db.expire_all()
    assert {p.id: p.stock for p in db.scalars(select(Product))} == stock
    stmt = select(InventoryMovement).where(InventoryMovement.type == MovementType.WASTE)
    waste = list(db.scalars(stmt))
    assert {line.reason for line in waste} == {"expired", "damaged", "other"}
    assert all(line.quantity_delta < 0 for line in waste)
    assert all(line.occurred_at.date() < date.today() for line in waste)
