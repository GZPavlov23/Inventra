"""API tests for /api/v1/reports."""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Batch, InventoryMovement, MovementType, Sale, Store, User
from tests.clock import on_day

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
    db.get(Sale, sale["id"]).sold_at = on_day(days_ago)
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


@pytest.mark.parametrize(
    "path", ["waste", "running-out", "top-products", "categories", "expiry-calendar"]
)
def test_every_report_requires_login(anon_client: TestClient, path: str) -> None:
    assert anon_client.get(f"{URL}/{path}", params=period()).status_code == 401


@pytest.mark.parametrize("path", ["waste", "top-products", "categories", "expiry-calendar"])
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
    db.scalars(stmt).one().occurred_at = on_day(3)
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


# Sales trend


def trend(client: TestClient, *products: dict, days: int = 14) -> dict[int, dict]:
    params = {"product_id": [product["id"] for product in products], "days": days}
    response = client.get(f"{URL}/sales-trend", params=params)
    assert response.status_code == 200, response.text
    return {line["product_id"]: line for line in response.json()}


def test_the_trend_has_one_number_per_finished_day(client: TestClient, db: Session) -> None:
    milk = make_product(client)
    receive(client, milk, "50")
    sell(client, db, milk, "3", days_ago=1)
    sell(client, db, milk, "2", days_ago=1)
    sell(client, db, milk, "4", days_ago=14)

    line = trend(client, milk)[milk["id"]]

    assert len(line["quantities"]) == 14
    assert Decimal(line["quantities"][-1]) == 5  # yesterday, the newest day, comes last
    assert Decimal(line["quantities"][0]) == 4
    assert Decimal(line["total"]) == 9


def test_today_and_older_days_are_left_out(client: TestClient, db: Session) -> None:
    milk = make_product(client)
    receive(client, milk, "50")
    sell(client, db, milk, "3", days_ago=0)
    sell(client, db, milk, "7", days_ago=15)

    assert Decimal(trend(client, milk)[milk["id"]]["total"]) == 0


def test_imported_history_fills_days_without_real_sales(client: TestClient, db: Session) -> None:
    milk = make_product(client)
    receive(client, milk, "50")
    days = [in_days(-2), in_days(-1)]
    rows = ["date;product;quantity"] + [f"{day.isoformat()};Milk;6" for day in days]
    client.post(
        "/api/v1/imports/sales",
        json={"mode": "history", "content": "\n".join(rows), "dry_run": False},
    )
    sell(client, db, milk, "2", days_ago=1)

    quantities = trend(client, milk)[milk["id"]]["quantities"]

    assert Decimal(quantities[-2]) == 6
    assert Decimal(quantities[-1]) == 2  # a real sale replaces the imported number


def test_a_product_that_never_sold_gets_zeros(client: TestClient) -> None:
    line = trend(client, make_product(client), days=7)
    [only] = line.values()
    assert [Decimal(quantity) for quantity in only["quantities"]] == [0] * 7


def test_the_trend_shows_only_this_store(
    client: TestClient, db: Session, owner: User, other_store: Store
) -> None:
    milk = make_product(client)
    receive(client, milk, "50")
    sell(client, db, milk, "3")
    owner.store_id = other_store.id
    db.commit()

    assert Decimal(trend(client, milk)[milk["id"]]["total"]) == 0


@pytest.mark.parametrize(
    "params", [{}, {"product_id": 1, "days": 6}, {"product_id": 1, "days": 61}]
)
def test_the_trend_needs_products_and_a_sensible_period(client: TestClient, params: dict) -> None:
    assert client.get(f"{URL}/sales-trend", params=params).status_code == 422


def test_the_trend_requires_login(anon_client: TestClient) -> None:
    assert anon_client.get(f"{URL}/sales-trend", params={"product_id": 1}).status_code == 401


# Expiry calendar


def calendar(client: TestClient, first: int = 0, last: int = 20) -> dict:
    response = client.get(f"{URL}/expiry-calendar", params=period(first, last))
    assert response.status_code == 200, response.text
    return response.json()


def expiring_on(
    client: TestClient, product: dict, quantity: str, days: int, **extra: object
) -> dict:
    return receive(client, product, quantity, expiry_date=in_days(days).isoformat(), **extra)


def expired(db: Session, batch: dict, days_ago: int) -> None:
    db.get(Batch, batch["id"]).expiry_date = in_days(-days_ago)
    db.flush()


def test_an_empty_shelf_has_an_empty_calendar(client: TestClient) -> None:
    assert calendar(client) == {"days": [], "total": "0", "overdue": [], "overdue_value": "0"}


def test_batches_are_grouped_by_day_and_valued_at_their_own_prices(client: TestClient) -> None:
    milk = make_product(client, "Milk")
    bread = make_product(client, "Bread")
    tomatoes = make_product(client, "Tomatoes", unit="kg")
    expiring_on(client, milk, "10", 3, purchase_price="1.10")
    expiring_on(client, bread, "4", 3, purchase_price="0.95")
    expiring_on(client, tomatoes, "2.5", 7, purchase_price="1.33")

    result = calendar(client)

    assert [day["day"] for day in result["days"]] == [
        in_days(3).isoformat(),
        in_days(7).isoformat(),
    ]
    first, second = result["days"]
    # Same day: by product name.
    assert [b["product"]["name"] for b in first["batches"]] == ["Bread", "Milk"]
    assert [b["value"] for b in first["batches"]] == ["3.80", "11.00"]
    assert first["value"] == "14.80"
    # 2.5 x 1.33 = 3.325: half a cent rounds up, like every other amount.
    assert second["batches"][0]["value"] == "3.33"
    assert Decimal(result["total"]) == Decimal("14.80") + Decimal("3.33")


def test_only_what_is_left_and_dated_inside_the_period_shows(
    client: TestClient, db: Session
) -> None:
    milk = make_product(client)
    receive(client, milk, "50")  # no expiry date: never on the calendar
    sold_out = expiring_on(client, milk, "3", 2)
    write_off(client, sold_out, "3")
    half = expiring_on(client, milk, "10", 4)
    write_off(client, half, "6", reason="damaged")
    expiring_on(client, milk, "5", 30)  # after the period

    [day] = calendar(client)["days"]
    assert day["day"] == in_days(4).isoformat()
    [batch] = day["batches"]
    assert (batch["batch_id"], Decimal(batch["remaining_quantity"])) == (half["id"], 4)
    # Only what is left has a value: the 6 thrown away are already counted as waste.
    assert batch["value"] == "4.00"


def test_the_first_and_last_day_of_the_period_are_included(client: TestClient) -> None:
    milk = make_product(client)
    expiring_on(client, milk, "1", 0)
    expiring_on(client, milk, "1", 20)
    expiring_on(client, milk, "1", 21)

    days = [day["day"] for day in calendar(client, first=0, last=20)["days"]]
    assert days == [in_days(0).isoformat(), in_days(20).isoformat()]


def test_goods_that_expired_before_the_period_are_listed_as_overdue(
    client: TestClient, db: Session
) -> None:
    milk = make_product(client, purchase_price="2.00")
    old = expiring_on(client, milk, "6", 1)
    expired(db, old, 5)
    cleared = expiring_on(client, milk, "2", 1)
    expired(db, cleared, 3)
    write_off(client, cleared, "2")

    result = calendar(client)
    assert result["days"] == []
    assert [b["batch_id"] for b in result["overdue"]] == [old["id"]]
    assert result["overdue_value"] == "12.00"


def test_a_calendar_that_starts_later_does_not_call_good_stock_overdue(
    client: TestClient, db: Session
) -> None:
    milk = make_product(client)
    expiring_on(client, milk, "5", 2)  # still good today
    gone_off = expiring_on(client, milk, "1", 1)
    expired(db, gone_off, 1)

    result = calendar(client, first=7, last=20)
    assert [b["batch_id"] for b in result["overdue"]] == [gone_off["id"]]
    assert result["days"] == []


def test_a_day_inside_the_period_is_on_the_calendar_even_if_it_has_passed(
    client: TestClient, db: Session
) -> None:
    milk = make_product(client)
    batch = expiring_on(client, milk, "5", 1)
    expired(db, batch, 2)

    result = calendar(client, first=-6, last=7)
    assert [day["day"] for day in result["days"]] == [in_days(-2).isoformat()]
    assert result["overdue"] == []


def test_the_calendar_shows_only_this_store(
    client: TestClient, db: Session, owner: User, other_store: Store
) -> None:
    milk = make_product(client)
    expiring_on(client, milk, "5", 2)
    assert calendar(client)["days"] != []

    owner.store_id = other_store.id
    db.commit()
    assert calendar(client)["days"] == []
