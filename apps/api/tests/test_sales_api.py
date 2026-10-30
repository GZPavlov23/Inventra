"""API tests for /api/v1/sales. The rules themselves are covered by the service tests."""

from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Connection, event
from sqlalchemy.orm import Session

from app.models import Product, ProductUnit, Sale, Store, User

URL = "/api/v1/sales"
PRODUCTS_URL = "/api/v1/products"
BATCHES_URL = "/api/v1/batches"


def in_days(days: int) -> date:
    return date.today() + timedelta(days=days)


def make_product(client: TestClient, name: str = "Milk", **overrides: object) -> dict:
    payload = {"name": name, "purchase_price": "1.10", "sale_price": "1.59", **overrides}
    response = client.post(PRODUCTS_URL, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def receive(client: TestClient, product: dict, quantity: str = "10", **extra: object) -> dict:
    payload = {"product_id": product["id"], "quantity": quantity, **extra}
    response = client.post(BATCHES_URL, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def sell(client: TestClient, *lines: tuple[dict, str]):
    items = [{"product_id": product["id"], "quantity": quantity} for product, quantity in lines]
    return client.post(URL, json={"items": items})


def sold(client: TestClient, *lines: tuple[dict, str]) -> dict:
    response = sell(client, *lines)
    assert response.status_code == 201, response.text
    return response.json()


def stocked(client: TestClient, quantity: str = "10", **overrides: object) -> dict:
    product = make_product(client, **overrides)
    receive(client, product, quantity)
    return product


def backdate(db: Session, sale: dict, days: int) -> None:
    db.get(Sale, sale["id"]).sold_at = datetime.now(UTC) - timedelta(days=days)
    db.flush()


def ids(response) -> list[int]:
    assert response.status_code == 200, response.text
    return [item["id"] for item in response.json()["items"]]


# Access


@pytest.mark.parametrize(
    ("method", "path"),
    [("get", URL), ("post", URL), ("get", f"{URL}/summary"), ("get", f"{URL}/1")],
)
def test_every_endpoint_requires_login(anon_client: TestClient, method: str, path: str) -> None:
    assert anon_client.request(method, path, json={}).status_code == 401


def test_another_store_cannot_be_reached(client: TestClient, db: Session, owner: User) -> None:
    sale = sold(client, (stocked(client), "1"))

    other_store = Store(name="Someone else's store")
    db.add(other_store)
    db.flush()
    foreign = Product(
        store_id=other_store.id,
        name="Foreign milk",
        unit=ProductUnit.PIECE,
        purchase_price=Decimal("1"),
        sale_price=Decimal("2"),
    )
    db.add(foreign)
    db.commit()  # a refused sale rolls back, and this must survive that

    assert sell(client, ({"id": foreign.id}, "1")).status_code == 404

    # The same person moved to the other store sees nothing of the first one.
    owner.store_id = other_store.id
    db.commit()
    assert client.get(f"{URL}/{sale['id']}").status_code == 404
    assert ids(client.get(URL)) == []
    assert client.get(f"{URL}/summary").json()["sales"] == 0


# Recording a sale


def test_recording_a_sale_returns_money_and_the_batches_used(client: TestClient) -> None:
    milk = make_product(client)
    sooner = receive(client, milk, "2", expiry_date=in_days(2).isoformat(), purchase_price="1.00")
    later = receive(client, milk, "9", expiry_date=in_days(9).isoformat(), purchase_price="1.20")

    sale = sold(client, (milk, "3"))

    assert sale["actor"] == {"full_name": "Test Owner"}
    assert sale["total"] == "4.77"  # 3 × 1.59
    assert sale["cost"] == "3.20"  # 2 × 1.00 + 1 × 1.20, not 3 × the product's 1.10
    assert sale["profit"] == "1.57"

    [line] = sale["items"]
    assert line["product"]["name"] == "Milk"
    assert line["unit_price"] == "1.59"
    assert [(Decimal(m["quantity_delta"]), m["batch"]["id"]) for m in line["movements"]] == [
        (Decimal("-2"), sooner["id"]),
        (Decimal("-1"), later["id"]),
    ]


def test_a_sale_lowers_the_stock_of_the_product(client: TestClient) -> None:
    milk = stocked(client, "10")
    sold(client, (milk, "4"))
    assert Decimal(client.get(f"{PRODUCTS_URL}/{milk['id']}").json()["stock"]) == 6


def test_a_sale_shows_in_the_history_of_its_batch(client: TestClient) -> None:
    milk = make_product(client)
    batch = receive(client, milk, "5")
    sold(client, (milk, "2"))

    history = client.get(f"{BATCHES_URL}/{batch['id']}/movements").json()
    assert history["items"][0]["type"] == "sale"
    assert Decimal(history["items"][0]["quantity_delta"]) == -2
    assert history["items"][0]["reason"] is None


def test_lines_are_rounded_so_they_add_up_to_the_total(client: TestClient) -> None:
    bananas = make_product(client, "Bananas", unit="kg", sale_price="1.89", purchase_price="1.23")
    tomatoes = make_product(client, "Tomatoes", unit="kg", sale_price="2.49", purchase_price="1.67")
    receive(client, bananas, "5")
    receive(client, tomatoes, "5")

    sale = sold(client, (bananas, "0.750"), (tomatoes, "1.333"))

    assert [line["total"] for line in sale["items"]] == ["1.42", "3.32"]  # 1.4175 and 3.31917
    assert sale["total"] == "4.74"
    assert [line["cost"] for line in sale["items"]] == ["0.92", "2.23"]  # 0.9225 and 2.22611
    assert sale["cost"] == "3.15"


@pytest.mark.parametrize(
    "items",
    [
        [],
        [{"product_id": 1}],
        [{"product_id": 1, "quantity": "0"}],
        [{"product_id": 1, "quantity": "-1"}],
        [{"product_id": 1, "quantity": "100001"}],
        [{"product_id": 1, "quantity": "1", "unit_price": "-1"}],
        [{"product_id": 1, "quantity": "1"}] * 201,
    ],
)
def test_nonsense_sales_are_refused(client: TestClient, items: list[dict]) -> None:
    response = client.post(URL, json={"items": items})
    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


def test_business_errors_keep_their_codes(client: TestClient) -> None:
    milk = stocked(client, "2")

    response = sell(client, (milk, "3"))
    assert response.status_code == 409
    assert response.json() == {
        "code": "insufficient_stock",
        "detail": "Only 2 of 'Milk' can be sold",
    }

    response = sell(client, (milk, "1.5"))
    assert (response.status_code, response.json()["code"]) == (422, "invalid_quantity")

    response = sell(client, ({"id": 999999}, "1"))
    assert (response.status_code, response.json()["code"]) == (404, "not_found")

    client.patch(f"{PRODUCTS_URL}/{milk['id']}", json={"active": False})
    response = sell(client, (milk, "1"))
    assert (response.status_code, response.json()["code"]) == (409, "conflict")


# Reading sales


def test_sale_can_be_read_by_id(client: TestClient) -> None:
    sale = sold(client, (stocked(client), "1"))
    assert client.get(f"{URL}/{sale['id']}").json() == sale
    assert client.get(f"{URL}/999999").status_code == 404


def test_list_is_newest_first_and_paginated(client: TestClient, db: Session) -> None:
    milk = stocked(client)
    oldest = sold(client, (milk, "1"))
    middle = sold(client, (milk, "1"))
    newest = sold(client, (milk, "1"))
    backdate(db, oldest, 2)
    backdate(db, middle, 1)

    assert ids(client.get(URL)) == [newest["id"], middle["id"], oldest["id"]]

    page = client.get(URL, params={"limit": 1, "offset": 1})
    assert ids(page) == [middle["id"]]
    assert page.json()["total"] == 3
    assert client.get(URL, params={"limit": 201}).status_code == 422


def test_list_does_not_ask_the_database_more_with_more_sales(
    client: TestClient, connection: Connection
) -> None:
    milk = stocked(client, "50")
    bread = stocked(client, "50", name="Bread")
    queries: list[str] = []

    def count_query(_conn, _cursor, statement, *_args) -> None:
        queries.append(statement)

    def queries_of_the_list() -> int:
        queries.clear()
        event.listen(connection, "before_cursor_execute", count_query)
        assert client.get(URL).status_code == 200
        event.remove(connection, "before_cursor_execute", count_query)
        return len(queries)

    sold(client, (milk, "1"), (bread, "1"))
    with_one_sale = queries_of_the_list()
    for _ in range(5):
        sold(client, (milk, "1"), (bread, "1"))

    assert queries_of_the_list() == with_one_sale


def test_period_includes_both_of_its_days(client: TestClient, db: Session) -> None:
    milk = stocked(client)
    today = sold(client, (milk, "1"))
    yesterday = sold(client, (milk, "1"))
    last_week = sold(client, (milk, "1"))
    backdate(db, yesterday, 1)
    backdate(db, last_week, 7)

    def in_period(date_from: date | None, date_to: date | None) -> list[int]:
        params = {}
        if date_from:
            params["date_from"] = date_from.isoformat()
        if date_to:
            params["date_to"] = date_to.isoformat()
        return ids(client.get(URL, params=params))

    assert in_period(in_days(0), in_days(0)) == [today["id"]]
    assert in_period(in_days(-1), in_days(0)) == [today["id"], yesterday["id"]]
    assert in_period(None, in_days(-1)) == [yesterday["id"], last_week["id"]]
    assert in_period(in_days(-7), in_days(-7)) == [last_week["id"]]
    assert in_period(in_days(1), None) == []
    assert client.get(URL, params={"date_from": "not-a-date"}).status_code == 422


def test_midnight_belongs_to_the_new_day(client: TestClient, db: Session) -> None:
    sale = sold(client, (stocked(client), "1"))
    db.get(Sale, sale["id"]).sold_at = datetime.combine(date.today(), time.min).astimezone()
    db.flush()

    today = {"date_from": in_days(0).isoformat(), "date_to": in_days(0).isoformat()}
    yesterday = {"date_from": in_days(-1).isoformat(), "date_to": in_days(-1).isoformat()}
    assert ids(client.get(URL, params=today)) == [sale["id"]]
    assert ids(client.get(URL, params=yesterday)) == []


# Summary


def test_empty_summary_is_all_zeros(client: TestClient) -> None:
    summary = client.get(f"{URL}/summary").json()
    assert summary["sales"] == 0
    assert Decimal(summary["revenue"]) == Decimal(summary["cost"]) == 0
    assert Decimal(summary["profit"]) == 0


def test_summary_equals_the_sales_it_covers(client: TestClient, db: Session) -> None:
    bananas = make_product(client, "Bananas", unit="kg", sale_price="1.89", purchase_price="1.23")
    tomatoes = make_product(client, "Tomatoes", unit="kg", sale_price="2.49", purchase_price="1.67")
    # Two batches at different prices, so one line has two sources to round together.
    receive(client, bananas, "1.111", purchase_price="1.23")
    receive(client, bananas, "5", purchase_price="1.27")
    receive(client, tomatoes, "5")

    sales = [
        sold(client, (bananas, "0.750"), (tomatoes, "1.333")),
        sold(client, (bananas, "0.777")),
        sold(client, (tomatoes, "0.333"), (bananas, "0.125")),
    ]
    old = sold(client, (tomatoes, "0.500"))
    backdate(db, old, 3)

    period = {"date_from": in_days(0).isoformat(), "date_to": in_days(0).isoformat()}
    summary = client.get(f"{URL}/summary", params=period).json()

    assert summary["sales"] == 3
    assert Decimal(summary["revenue"]) == sum(Decimal(sale["total"]) for sale in sales)
    assert Decimal(summary["cost"]) == sum(Decimal(sale["cost"]) for sale in sales)
    assert Decimal(summary["profit"]) == sum(Decimal(sale["profit"]) for sale in sales)
    assert client.get(f"{URL}/summary").json()["sales"] == 4


def test_summary_rounds_a_line_from_two_batches_like_the_sale_does(client: TestClient) -> None:
    bananas = make_product(client, "Bananas", unit="kg", sale_price="2", purchase_price="1")
    receive(client, bananas, "0.005", expiry_date=in_days(1).isoformat())
    receive(client, bananas, "1", expiry_date=in_days(2).isoformat())

    # 0.005 kg from each batch: half a cent twice is one cent, not two.
    sale = sold(client, (bananas, "0.010"))

    assert sale["cost"] == "0.01"
    assert client.get(f"{URL}/summary").json()["cost"] == "0.01"
