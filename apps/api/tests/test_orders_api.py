"""API tests for /api/v1/forecasts/orders, with history from the real CSV import."""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models import Batch, Delivery, Store, User
from app.schemas.forecast import AccuracyReport, ModelAccuracy
from app.services.forecast_service import ForecastService

URL = "/api/v1/forecasts/orders"
PRODUCTS_URL = "/api/v1/products"
BATCHES_URL = "/api/v1/batches"
IMPORT_URL = "/api/v1/imports/sales"
DELIVERIES_URL = "/api/v1/deliveries"


def _other_store(db: Session) -> int:
    other = Store(name="Someone else's store")
    db.add(other)
    db.flush()
    return other.id


def ago(days: int) -> date:
    return date.today() - timedelta(days=days)


def make_product(client: TestClient, name: str = "Milk", **overrides: object) -> dict:
    payload = {"name": name, "purchase_price": "1.50", "sale_price": "2.00", **overrides}
    response = client.post(PRODUCTS_URL, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def history(client: TestClient, product: dict, per_day: float = 2) -> None:
    rows = ["date;product;quantity"]
    rows += [f"{ago(days).isoformat()};{product['name']};{per_day}" for days in range(60, 0, -1)]
    response = client.post(
        IMPORT_URL, json={"mode": "history", "content": "\n".join(rows), "dry_run": False}
    )
    assert response.json()["applied"] is True, response.text


def receive(client: TestClient, product: dict, quantity: str, **extra: object) -> dict:
    payload = {"product_id": product["id"], "quantity": quantity, **extra}
    response = client.post(BATCHES_URL, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def orders(client: TestClient, **params: object) -> dict:
    response = client.get(URL, params=params)
    assert response.status_code == 200, response.text
    return response.json()


def supplier_named(client: TestClient, name: str = "Dairy") -> dict:
    return client.post("/api/v1/suppliers", json={"name": name}).json()


def ordered(client: TestClient, product: dict, quantity: str) -> dict:
    body = {
        "supplier_id": supplier_named(client, f"Supplier of {quantity}")["id"],
        "items": [{"product_id": product["id"], "quantity": quantity}],
    }
    response = client.post(DELIVERIES_URL, json=body)
    assert response.status_code == 201, response.text
    return response.json()


def test_requires_login(anon_client: TestClient) -> None:
    assert anon_client.get(URL).status_code == 401


@pytest.mark.parametrize("days", [0, 15])
def test_days_must_make_sense(client: TestClient, days: int) -> None:
    assert client.get(URL, params={"days": days}).status_code == 422


def test_a_store_without_history_has_nothing_to_order(client: TestClient) -> None:
    make_product(client)
    report = orders(client)
    assert report["items"] == []
    assert report["products_checked"] == 0
    assert Decimal(report["total_cost"]) == 0


def test_the_order_shows_its_arithmetic(client: TestClient) -> None:
    milk = make_product(client)
    history(client, milk, 2)
    receive(client, milk, "5")

    report = orders(client)
    [line] = report["items"]

    # A steady product is forecast perfectly, so the buffer is the smallest one: 10%.
    assert Decimal(report["buffer_share"]) == Decimal("0.10")
    assert Decimal(line["expected"]) == 14
    assert Decimal(line["from_stock"]) == 5
    assert Decimal(line["buffer"]) == Decimal("1.4")
    assert Decimal(line["order"]) == 11  # 14 + 1.4 − 5 = 10.4, rounded up
    assert line["unit_cost"] == "1.50"
    assert line["cost"] == "16.50"
    assert report["total_cost"] == "16.50"


def test_stock_that_will_expire_unsold_is_not_counted_on(client: TestClient) -> None:
    milk = make_product(client)
    history(client, milk, 1)
    receive(client, milk, "10", expiry_date=ago(-1).isoformat())

    [line] = orders(client)["items"]

    assert Decimal(line["from_stock"]) == 2
    assert Decimal(line["expiring_unsold"]) == 8
    assert Decimal(line["order"]) == 6  # 7 + 0.7 − 2 = 5.7


def test_expired_goods_are_not_stock_at_all(client: TestClient, db: Session) -> None:
    milk = make_product(client)
    history(client, milk, 1)
    old = receive(client, milk, "50", expiry_date=ago(-1).isoformat())
    db.get(Batch, old["id"]).expiry_date = ago(1)
    db.flush()

    [line] = orders(client)["items"]
    assert Decimal(line["from_stock"]) == 0
    assert Decimal(line["expiring_unsold"]) == 0  # it has already expired, that's old news
    assert Decimal(line["order"]) == 8


def test_enough_stock_means_no_order(client: TestClient) -> None:
    milk = make_product(client)
    history(client, milk, 1)
    receive(client, milk, "100")

    report = orders(client)
    assert report["items"] == []
    assert report["products_checked"] == 1


def test_stock_left_over_after_the_period_covers_the_buffer(client: TestClient) -> None:
    milk = make_product(client)
    history(client, milk, 10)
    receive(client, milk, "75")  # 70 expected, 7 of buffer, 5 left over
    [line] = orders(client)["items"]
    assert Decimal(line["left_over"]) == 5
    assert Decimal(line["order"]) == 2


def test_weighed_goods_keep_a_decimal(client: TestClient) -> None:
    bananas = make_product(client, "Bananas", unit="kg")
    history(client, bananas, 0.5)
    assert Decimal(orders(client)["items"][0]["order"]) == Decimal("3.9")  # 3.5 + 0.35


def test_a_longer_period_needs_more(client: TestClient) -> None:
    milk = make_product(client)
    history(client, milk, 2)
    short = Decimal(orders(client, days=7)["items"][0]["order"])
    long = Decimal(orders(client, days=14)["items"][0]["order"])
    assert long > short


def test_the_most_expensive_line_comes_first(client: TestClient) -> None:
    cheap = make_product(client, "Alpha cheap", purchase_price="0.10")
    dear = make_product(client, "Zulu dear", purchase_price="9.00")
    history(client, cheap, 5)
    history(client, dear, 1)

    report = orders(client)
    assert [line["product"]["name"] for line in report["items"]] == ["Zulu dear", "Alpha cheap"]
    assert Decimal(report["total_cost"]) == sum(Decimal(line["cost"]) for line in report["items"])


def test_a_forecast_with_a_big_error_gets_a_bigger_buffer(client: TestClient) -> None:
    make_product(client)
    # Jumps between 1 and 10 every nine days, so no model can follow it exactly.
    rows = ["date;product;quantity"]
    rows += [f"{ago(days).isoformat()};Milk;{1 + (days // 9) % 2 * 9}" for days in range(60, 0, -1)]
    client.post(IMPORT_URL, json={"mode": "history", "content": "\n".join(rows), "dry_run": False})

    assert Decimal(orders(client)["buffer_share"]) > Decimal("0.10")


@pytest.mark.parametrize(
    ("error", "share"),
    [
        ("0.01", "0.10"),  # still some reserve for a very accurate forecast
        ("0.24", "0.24"),
        ("0.90", "0.50"),  # a poor forecast shouldn't fill the shelf
        (None, "0.25"),  # nothing measured yet
    ],
)
def test_the_buffer_follows_the_error_within_limits(error: str | None, share: str) -> None:
    model = ModelAccuracy(
        method="Model",
        daily_wape=None,
        weekly_wape=None if error is None else Decimal(error),
        bias=Decimal(0),
        days=0,
        products=0,
    )
    accuracy = AccuracyReport(chosen="Model", models=[model])
    assert ForecastService._buffer_share(accuracy) == Decimal(share)


def test_a_line_shows_who_supplies_the_product(client: TestClient) -> None:
    dairy = supplier_named(client)
    milk = make_product(client, supplier_id=dairy["id"])
    bread = make_product(client, "Bread")
    history(client, milk)
    history(client, bread)

    lines = {line["product"]["name"]: line for line in orders(client)["items"]}

    assert lines["Milk"]["supplier"] == {"id": dairy["id"], "name": "Dairy", "active": True}
    assert lines["Bread"]["supplier"] is None


def test_goods_on_the_way_are_not_ordered_again(client: TestClient) -> None:
    milk = make_product(client)
    history(client, milk, 2)
    before = Decimal(orders(client)["items"][0]["order"])

    ordered(client, milk, "5")
    ordered(client, milk, "3")
    [line] = orders(client)["items"]

    assert Decimal(line["on_the_way"]) == 8
    assert Decimal(line["order"]) == before - 8
    assert Decimal(line["cost"]) == (before - 8) * Decimal("1.50")


def test_enough_on_the_way_means_no_order(client: TestClient) -> None:
    milk = make_product(client)
    history(client, milk, 2)
    ordered(client, milk, "100")
    assert orders(client)["items"] == []


def test_received_goods_are_counted_once(client: TestClient) -> None:
    milk = make_product(client)
    history(client, milk, 2)
    delivery = ordered(client, milk, "5")
    with_delivery = orders(client)["items"][0]

    item = delivery["items"][0]
    response = client.post(
        f"{DELIVERIES_URL}/{delivery['id']}/receive",
        json={"items": [{"item_id": item["id"], "quantity": "5"}]},
    )
    assert response.status_code == 200, response.text
    [line] = orders(client)["items"]

    assert Decimal(line["on_the_way"]) == 0
    assert Decimal(line["order"]) == Decimal(with_delivery["order"])


def test_a_cancelled_delivery_is_needed_again(client: TestClient) -> None:
    milk = make_product(client)
    history(client, milk, 2)
    before = orders(client)["items"][0]["order"]

    delivery = ordered(client, milk, "5")
    client.post(f"{DELIVERIES_URL}/{delivery['id']}/cancel")

    assert orders(client)["items"][0]["order"] == before


def test_another_stores_delivery_changes_nothing_here(
    client: TestClient, db: Session, owner: User, store: Store
) -> None:
    milk = make_product(client)
    history(client, milk, 2)
    ordered(client, milk, "5")
    with_delivery = orders(client)["items"][0]

    db.execute(update(Delivery).values(store_id=_other_store(db)))
    db.commit()

    assert Decimal(orders(client)["items"][0]["order"]) == Decimal(with_delivery["order"]) + 5


def test_orders_show_only_this_store(client: TestClient, db: Session, owner: User) -> None:
    milk = make_product(client)
    history(client, milk, 2)
    assert orders(client)["items"] != []

    other = Store(name="Someone else's store")
    db.add(other)
    db.flush()
    owner.store_id = other.id
    db.commit()
    assert orders(client)["items"] == []
