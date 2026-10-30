"""API tests for /api/v1/reports."""

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Batch, InventoryMovement, MovementType, Sale, Store, User

URL = "/api/v1/reports"
PRODUCTS_URL = "/api/v1/products"
BATCHES_URL = "/api/v1/batches"
SALES_URL = "/api/v1/sales"


def in_days(days: int) -> date:
    return date.today() + timedelta(days=days)


def period(first: int = -29, last: int = 0) -> dict[str, str]:
    return {"date_from": in_days(first).isoformat(), "date_to": in_days(last).isoformat()}


def make_product(client: TestClient, name: str = "Milk", **overrides: object) -> dict:
    payload = {"name": name, "purchase_price": "1.00", "sale_price": "2.00", **overrides}
    response = client.post(PRODUCTS_URL, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def receive(client: TestClient, product: dict, quantity: str, **extra: object) -> dict:
    payload = {"product_id": product["id"], "quantity": quantity, **extra}
    response = client.post(BATCHES_URL, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def sell(client: TestClient, db: Session, product: dict, quantity: str, days_ago: int = 1) -> dict:
    response = client.post(
        SALES_URL, json={"items": [{"product_id": product["id"], "quantity": quantity}]}
    )
    assert response.status_code == 201, response.text
    sale = response.json()
    db.get(Sale, sale["id"]).sold_at = datetime.now(UTC) - timedelta(days=days_ago)
    db.flush()
    return sale


def write_off(client: TestClient, batch: dict, quantity: str, reason: str = "expired") -> None:
    response = client.post(
        f"{BATCHES_URL}/{batch['id']}/waste", json={"quantity": quantity, "reason": reason}
    )
    assert response.status_code == 200, response.text


@pytest.fixture
def other_store(db: Session, owner: User) -> Store:
    store = Store(name="Someone else's store")
    db.add(store)
    db.flush()
    return store


@pytest.mark.parametrize("path", ["waste", "running-out", "top-products", "categories"])
def test_every_report_requires_login(anon_client: TestClient, path: str) -> None:
    assert anon_client.get(f"{URL}/{path}", params=period()).status_code == 401


@pytest.mark.parametrize("path", ["waste", "top-products", "categories"])
def test_periods_must_make_sense(client: TestClient, path: str) -> None:
    response = client.get(f"{URL}/{path}", params=period(0, -1))
    assert (response.status_code, response.json()["code"]) == (422, "invalid_period")
    assert client.get(f"{URL}/{path}", params=period(-366, 0)).status_code == 422
    assert client.get(f"{URL}/{path}").status_code == 422


@pytest.mark.parametrize("path", ["waste", "running-out", "top-products", "categories"])
def test_reports_show_only_this_store(
    client: TestClient, db: Session, owner: User, other_store: Store, path: str
) -> None:
    product = make_product(client)
    batch = receive(client, product, "10")
    sell(client, db, product, "5")
    write_off(client, batch, "4")

    before = client.get(f"{URL}/{path}", params=period()).json()
    assert before not in ([], {"total": "0", "reasons": []})

    owner.store_id = other_store.id
    db.commit()
    after = client.get(f"{URL}/{path}", params=period()).json()
    assert after in ([], {"total": "0", "reasons": []})


# Waste


def test_empty_waste_report(client: TestClient) -> None:
    assert client.get(f"{URL}/waste", params=period()).json() == {"total": "0", "reasons": []}


def test_waste_is_valued_at_the_real_prices_of_its_batches(client: TestClient) -> None:
    milk = make_product(client)
    cheap = receive(client, milk, "10", purchase_price="1.00")
    dear = receive(client, milk, "10", purchase_price="3.00")
    write_off(client, cheap, "2", "expired")
    write_off(client, dear, "1", "expired")
    write_off(client, cheap, "1", "damaged")

    report = client.get(f"{URL}/waste", params=period()).json()

    assert report["total"] == "6.00"
    assert report["reasons"] == [
        {"reason": "expired", "value": "5.00", "write_offs": 2},
        {"reason": "damaged", "value": "1.00", "write_offs": 1},
    ]


def test_waste_counts_only_its_period_and_only_write_offs(client: TestClient, db: Session) -> None:
    milk = make_product(client)
    batch = receive(client, milk, "10")
    sell(client, db, milk, "1")
    adjustment = {"quantity_delta": "-1", "reason": "Count"}
    client.post(f"{BATCHES_URL}/{batch['id']}/adjustments", json=adjustment)
    write_off(client, batch, "2")

    stmt = select(InventoryMovement).where(InventoryMovement.type == MovementType.WASTE)
    db.scalars(stmt).one().occurred_at = datetime.now(UTC) - timedelta(days=3)
    db.flush()

    assert client.get(f"{URL}/waste", params=period(-5, 0)).json()["total"] == "2.00"
    assert client.get(f"{URL}/waste", params=period(-1, 0)).json()["total"] == "0"


# Running out


def test_running_out_shows_how_long_the_stock_lasts(client: TestClient, db: Session) -> None:
    milk = make_product(client)
    receive(client, milk, "31")
    # 28 sold in the last 14 days is 2 per day, and the 3 left last a day and a half.
    sell(client, db, milk, "28")

    [item] = client.get(f"{URL}/running-out").json()

    assert item["product"]["name"] == "Milk"
    assert Decimal(item["stock"]) == 3
    assert Decimal(item["average_daily_sales"]) == 2
    assert item["days_left"] == "1.5"


def test_running_out_is_soonest_first_and_leaves_out_what_lasts(
    client: TestClient, db: Session
) -> None:
    fast = make_product(client, "Fast")
    slow = make_product(client, "Slow")
    fine = make_product(client, "Fine")
    for product, stock in ((fast, "29"), (slow, "42"), (fine, "100")):
        receive(client, product, stock)
    sell(client, db, fast, "28")  # 1 left: half a day
    sell(client, db, slow, "28")  # 14 left: exactly 7 days, the last one that counts
    sell(client, db, fine, "14")  # 86 left: 86 days

    names = [item["product"]["name"] for item in client.get(f"{URL}/running-out").json()]
    assert names == ["Fast", "Slow"]


def test_sold_out_product_stays_on_the_list(client: TestClient, db: Session) -> None:
    milk = make_product(client)
    receive(client, milk, "14")
    sell(client, db, milk, "14")
    [item] = client.get(f"{URL}/running-out").json()
    assert Decimal(item["stock"]) == Decimal(item["days_left"]) == 0


def test_expired_goods_do_not_count_as_stock_that_lasts(client: TestClient, db: Session) -> None:
    milk = make_product(client)
    receive(client, milk, "28")
    sell(client, db, milk, "28")
    old = receive(client, milk, "100", expiry_date=in_days(1).isoformat())
    db.get(Batch, old["id"]).expiry_date = in_days(-1)
    db.flush()

    [item] = client.get(f"{URL}/running-out").json()
    assert Decimal(item["stock"]) == 0


def test_todays_sales_and_old_sales_do_not_change_the_average(
    client: TestClient, db: Session
) -> None:
    milk = make_product(client)
    receive(client, milk, "58")
    sell(client, db, milk, "14", days_ago=14)  # the oldest day of the window
    sell(client, db, milk, "28", days_ago=15)  # just too old
    sell(client, db, milk, "10", days_ago=0)  # today isn't over yet

    [item] = client.get(f"{URL}/running-out").json()
    assert Decimal(item["average_daily_sales"]) == 1
    assert Decimal(item["stock"]) == 6


def test_products_that_never_sold_or_are_archived_are_not_running_out(
    client: TestClient, db: Session
) -> None:
    make_product(client, "Never sold")
    archived = make_product(client, "Archived")
    receive(client, archived, "1")
    sell(client, db, archived, "1")
    client.patch(f"{PRODUCTS_URL}/{archived['id']}", json={"active": False})
    assert client.get(f"{URL}/running-out").json() == []


# Top products


def test_top_products_are_ordered_by_profit_not_revenue(client: TestClient, db: Session) -> None:
    pricey = make_product(client, "Pricey", purchase_price="9.00", sale_price="10.00")
    cheap = make_product(client, "Cheap", purchase_price="1.00", sale_price="3.00")
    receive(client, pricey, "5")
    receive(client, cheap, "5")
    sell(client, db, pricey, "2")  # revenue 20, profit 2
    sell(client, db, cheap, "2")  # revenue 6, profit 4

    report = client.get(f"{URL}/top-products", params=period()).json()

    assert [item["product"]["name"] for item in report] == ["Cheap", "Pricey"]
    assert report[0]["revenue"] == "6.00"
    assert report[0]["profit"] == "4.00"
    assert Decimal(report[0]["quantity"]) == 2


def test_top_products_respect_limit_and_period(client: TestClient, db: Session) -> None:
    for name, days_ago in (("A", 1), ("B", 2), ("C", 40)):
        product = make_product(client, name)
        receive(client, product, "5")
        sell(client, db, product, "1", days_ago=days_ago)

    params = {**period(), "limit": 1}
    assert len(client.get(f"{URL}/top-products", params=params).json()) == 1
    names = {
        i["product"]["name"] for i in client.get(f"{URL}/top-products", params=period()).json()
    }
    assert names == {"A", "B"}
    assert client.get(f"{URL}/top-products", params={**period(), "limit": 51}).status_code == 422


# Categories


def test_categories_add_up_to_the_sales_of_the_period(client: TestClient, db: Session) -> None:
    dairy = make_product(client, "Milk", category="Dairy")
    bread = make_product(client, "Bread", category="Bakery", sale_price="5.00")
    loose = make_product(client, "Loose goods", sale_price="1.50")
    for product in (dairy, bread, loose):
        receive(client, product, "10")
    sell(client, db, dairy, "2")
    sell(client, db, bread, "1")
    sell(client, db, loose, "2")

    report = client.get(f"{URL}/categories", params=period()).json()

    assert report == [
        {"category": "Bakery", "revenue": "5.00", "profit": "4.00"},
        {"category": "Dairy", "revenue": "4.00", "profit": "2.00"},
        {"category": None, "revenue": "3.00", "profit": "1.00"},
    ]
    summary = client.get(f"{SALES_URL}/summary", params=period()).json()
    assert sum(Decimal(row["revenue"]) for row in report) == Decimal(summary["revenue"])
    assert sum(Decimal(row["profit"]) for row in report) == Decimal(summary["profit"])


def test_categories_count_only_their_period(client: TestClient, db: Session) -> None:
    dairy = make_product(client, "Milk", category="Dairy")
    receive(client, dairy, "10")
    sell(client, db, dairy, "1", days_ago=40)
    assert client.get(f"{URL}/categories", params=period()).json() == []
