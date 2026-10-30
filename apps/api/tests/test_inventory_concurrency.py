"""Two requests at the same moment. Needs real commits, so it doesn't use the rollback session."""

from collections.abc import Iterator
from decimal import Decimal
from threading import Barrier, Thread

import pytest
from sqlalchemy import Connection, create_engine, delete
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import InsufficientStockError
from app.core.security import hash_password
from app.models import Product, ProductUnit, Store, User, UserRole
from app.schemas.inventory import ReceiptCreate, WasteCreate, WasteReason
from app.services.inventory_service import InventoryService


@pytest.fixture
def engine(connection: Connection) -> Iterator[Engine]:
    # Depends on `connection` so the schema exists.
    engine = create_engine(get_settings().test_database_url)
    yield engine
    engine.dispose()


@pytest.fixture
def stock(engine: Engine) -> Iterator[tuple[int, int, int]]:
    """Commits a store with a batch of 10 items; returns store, user and batch ids."""
    with Session(engine) as session:
        store = Store(name="Concurrency test store")
        session.add(store)
        session.flush()
        user = User(
            store_id=store.id,
            email="concurrency@test-store.example",
            password_hash=hash_password("not-used-here"),
            full_name="Tester",
            role=UserRole.OWNER,
        )
        product = Product(
            store_id=store.id,
            name="Milk",
            unit=ProductUnit.PIECE,
            purchase_price=Decimal("1"),
            sale_price=Decimal("2"),
        )
        session.add_all([user, product])
        session.commit()
        store_id, user_id = store.id, user.id
        batch = InventoryService(session).receive(
            store_id, user_id, ReceiptCreate(product_id=product.id, quantity=Decimal("10"))
        )
        batch_id = batch.id

    yield store_id, user_id, batch_id

    with Session(engine) as session:
        session.execute(delete(Store).where(Store.id == store_id))
        session.commit()


def test_two_simultaneous_removals_cannot_both_use_the_same_stock(
    engine: Engine, stock: tuple[int, int, int]
) -> None:
    store_id, user_id, batch_id = stock
    barrier = Barrier(2)
    outcomes: list[str] = []

    def remove_six() -> None:
        with Session(engine) as session:
            service = InventoryService(session)
            barrier.wait()  # both threads continue at the same moment
            try:
                data = WasteCreate(quantity=Decimal("6"), reason=WasteReason.EXPIRED)
                service.write_off(store_id, user_id, batch_id, data)
                outcomes.append("removed")
            except InsufficientStockError:
                outcomes.append("refused")

    threads = [Thread(target=remove_six) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert sorted(outcomes) == ["refused", "removed"]
    with Session(engine) as session:
        batch = InventoryService(session).inventory.get_batch(store_id, batch_id)
        assert batch.remaining_quantity == Decimal("4")
        assert InventoryService(session).inventory.movements_total(batch_id) == Decimal("4")
