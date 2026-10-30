"""Two requests at the same moment. Needs real commits, so it doesn't use the rollback session."""

from collections.abc import Callable, Iterator
from datetime import date
from decimal import Decimal
from threading import Barrier, Thread

import pytest
from sqlalchemy import Connection, create_engine, delete, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import InsufficientStockError
from app.core.security import hash_password
from app.models import Batch, Product, ProductUnit, Store, User, UserRole
from app.schemas.inventory import ReceiptCreate, WasteCreate, WasteReason
from app.schemas.sale import SaleCreate, SaleItemCreate
from app.schemas.sale_import import SalesImportRequest
from app.services.inventory_service import InventoryService
from app.services.sale_import_service import SaleImportService
from app.services.sale_service import SaleService


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


def in_parallel(*tasks: Callable[[], None]) -> None:
    """Runs the tasks at the same moment, and fails the test if one of them crashed."""
    barrier = Barrier(len(tasks))
    errors: list[Exception] = []

    def run(task: Callable[[], None]) -> None:
        barrier.wait()
        try:
            task()
        except Exception as error:  # noqa: BLE001
            errors.append(error)

    threads = [Thread(target=run, args=(task,)) for task in tasks]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert errors == []


@pytest.fixture
def shelf(engine: Engine, stock: tuple[int, int, int]) -> tuple[int, int, int, int]:
    """Adds a second batch of 10 to the milk, and a bread with 10; returns the ids."""
    store_id, user_id, batch_id = stock
    with Session(engine) as session:
        milk = session.get(Batch, batch_id).product_id
        bread = Product(
            store_id=store_id,
            name="Bread",
            unit=ProductUnit.PIECE,
            purchase_price=Decimal("1"),
            sale_price=Decimal("2"),
        )
        session.add(bread)
        session.commit()
        bread_id = bread.id
        service = InventoryService(session)
        for product_id in (milk, bread_id):
            data = ReceiptCreate(product_id=product_id, quantity=Decimal("10"))
            service.receive(store_id, user_id, data)
    return store_id, user_id, milk, bread_id


def sell(
    engine: Engine, store_id: int, user_id: int, lines: list[tuple[int, str]], outcomes: list[str]
) -> None:
    data = SaleCreate(
        items=[
            SaleItemCreate(product_id=product_id, quantity=Decimal(quantity))
            for product_id, quantity in lines
        ]
    )
    with Session(engine) as session:
        try:
            SaleService(session).record(store_id, user_id, data)
            outcomes.append("sold")
        except InsufficientStockError:
            outcomes.append("refused")


def total_stock(engine: Engine, product_id: int) -> Decimal:
    with Session(engine) as session:
        stmt = select(Batch.remaining_quantity).where(Batch.product_id == product_id)
        return sum(session.scalars(stmt), Decimal(0))


def test_two_simultaneous_sales_cannot_sell_the_same_goods(
    engine: Engine, shelf: tuple[int, int, int, int]
) -> None:
    store_id, user_id, milk, _ = shelf
    outcomes: list[str] = []

    # 12 of the 20 pieces each, spread over two batches: only one sale can succeed.
    def sale() -> None:
        sell(engine, store_id, user_id, [(milk, "12")], outcomes)

    in_parallel(sale, sale)

    assert sorted(outcomes) == ["refused", "sold"]
    assert total_stock(engine, milk) == Decimal("8")


def test_sales_of_the_same_products_in_opposite_order_do_not_block_each_other(
    engine: Engine, shelf: tuple[int, int, int, int]
) -> None:
    store_id, user_id, milk, bread = shelf
    outcomes: list[str] = []

    def milk_then_bread() -> None:
        sell(engine, store_id, user_id, [(milk, "1"), (bread, "1")], outcomes)

    def bread_then_milk() -> None:
        sell(engine, store_id, user_id, [(bread, "1"), (milk, "1")], outcomes)

    # Repeated, because a deadlock needs unlucky timing.
    for _ in range(5):
        in_parallel(milk_then_bread, bread_then_milk)

    assert outcomes == ["sold"] * 10
    assert total_stock(engine, milk) == Decimal("10")
    assert total_stock(engine, bread) == Decimal("0")


def receipts_csv(day: str, *lines: tuple[str, str]) -> str:
    rows = [f"{receipt};{day};Milk;{quantity}" for receipt, quantity in lines]
    return "\n".join(["receipt;date;product;quantity", *rows])


def test_the_same_file_uploaded_twice_at_once_counts_once(
    engine: Engine, shelf: tuple[int, int, int, int]
) -> None:
    store_id, user_id, milk, _ = shelf
    today = date.today().isoformat()
    data = SalesImportRequest(
        mode="current", content=receipts_csv(today, ("R-1", "3")), dry_run=False
    )
    applied: list[bool] = []

    def upload() -> None:
        with Session(engine) as session:
            report = SaleImportService(session).import_sales(store_id, user_id, data)
            applied.append(report.applied)

    in_parallel(upload, upload)

    assert sorted(applied) == [False, True]
    assert total_stock(engine, milk) == Decimal("17")


def test_an_import_and_live_sales_do_not_block_each_other(
    engine: Engine, shelf: tuple[int, int, int, int]
) -> None:
    store_id, user_id, milk, bread = shelf
    today = date.today().isoformat()
    outcomes: list[str] = []

    for run in range(5):
        content = "\n".join(
            [
                "receipt;date;product;quantity",
                f"BREAD-{run};{today};Bread;1",
                f"MILK-{run};{today};Milk;1",
            ]
        )
        data = SalesImportRequest(mode="current", content=content, dry_run=False)

        def upload(request: SalesImportRequest = data) -> None:
            with Session(engine) as session:
                SaleImportService(session).import_sales(store_id, user_id, request)

        def live_sale() -> None:
            sell(engine, store_id, user_id, [(milk, "1"), (bread, "1")], outcomes)

        in_parallel(upload, live_sale)

    assert outcomes == ["sold"] * 5
    assert total_stock(engine, milk) == Decimal("10")
    assert total_stock(engine, bread) == Decimal("0")
