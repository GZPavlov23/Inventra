"""API tests for /api/v1/batches. The rules themselves are covered by the service tests."""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Batch, Product, ProductUnit, Store
from app.models.batch import EXPIRING_SOON_DAYS

URL = "/api/v1/batches"
PRODUCTS_URL = "/api/v1/products"


def in_days(days: int) -> date:
    return date.today() + timedelta(days=days)


def make_product(client: TestClient, name: str = "Milk", **overrides: object) -> dict:
    payload = {"name": name, "purchase_price": "1.10", "sale_price": "1.59", **overrides}
    response = client.post(PRODUCTS_URL, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def receive(
    client: TestClient, product: dict, quantity: str = "10", expiry: date | None = None, **extra
) -> dict:
    payload = {
        "product_id": product["id"],
        "quantity": quantity,
        "expiry_date": expiry.isoformat() if expiry else None,
        **extra,
    }
    response = client.post(URL, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def waste(client: TestClient, batch: dict, quantity: str = "1", reason: str = "expired"):
    return client.post(f"{URL}/{batch['id']}/waste", json={"quantity": quantity, "reason": reason})


def foreign_batch(db: Session) -> Batch:
    """A batch in another store, created directly: the logged-in owner must never reach it."""
    other_store = Store(name="Someone else's store")
    db.add(other_store)
    db.flush()
    product = Product(
        store_id=other_store.id,
        name="Foreign milk",
        unit=ProductUnit.PIECE,
        purchase_price=Decimal("1"),
        sale_price=Decimal("2"),
    )
    db.add(product)
    db.flush()
    batch = Batch(
        store_id=other_store.id,
        product_id=product.id,
        received_quantity=Decimal("9"),
        remaining_quantity=Decimal("9"),
        purchase_price=Decimal("1"),
    )
    db.add(batch)
    db.flush()
    return batch


def ids(response) -> list[int]:
    assert response.status_code == 200, response.text
    return [item["id"] for item in response.json()["items"]]


# Access


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", URL),
        ("post", URL),
        ("post", f"{URL}/1/waste"),
        ("post", f"{URL}/1/adjustments"),
        ("get", f"{URL}/1/movements"),
    ],
)
def test_every_endpoint_requires_login(anon_client: TestClient, method: str, path: str) -> None:
    assert anon_client.request(method, path, json={}).status_code == 401


def test_another_store_cannot_be_reached(client: TestClient, db: Session) -> None:
    batch = foreign_batch(db)

    assert batch.id not in ids(client.get(URL, params={"status": "all"}))
    assert client.get(f"{URL}/{batch.id}/movements").status_code == 404
    assert waste(client, {"id": batch.id}).status_code == 404
    adjustment = {"quantity_delta": "-1", "reason": "Count"}
    assert client.post(f"{URL}/{batch.id}/adjustments", json=adjustment).status_code == 404

    stolen = {"product_id": batch.product_id, "quantity": "1"}
    assert client.post(URL, json=stolen).status_code == 404

    db.refresh(batch)
    assert batch.remaining_quantity == Decimal("9")


# Receiving goods


def test_receiving_returns_the_batch_with_its_product(client: TestClient) -> None:
    product = make_product(client, barcode="2000000000015")
    batch = receive(client, product, "24", in_days(30), lot_code="  L-42  ", purchase_price="0.99")

    assert batch["product"] == {
        "id": product["id"],
        "name": "Milk",
        "barcode": "2000000000015",
        "unit": "pcs",
    }
    assert Decimal(batch["received_quantity"]) == Decimal(batch["remaining_quantity"]) == 24
    assert batch["lot_code"] == "L-42"
    assert batch["purchase_price"] == "0.99"
    assert batch["expiry_status"] == "fresh"


@pytest.mark.parametrize(
    "quantity",
    ["0", "-1", "1.2345", "100000.001", "3800123456789", "abc", "NaN", "Infinity"],
)
def test_nonsense_quantities_are_refused(client: TestClient, quantity: str) -> None:
    product = make_product(client)
    response = client.post(URL, json={"product_id": product["id"], "quantity": quantity})
    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


def test_business_errors_keep_their_codes(client: TestClient) -> None:
    product = make_product(client)
    past = {
        "product_id": product["id"],
        "quantity": "1",
        "expiry_date": in_days(-1).isoformat(),
    }
    response = client.post(URL, json=past)
    assert (response.status_code, response.json()["code"]) == (422, "invalid_receipt")

    half = {"product_id": product["id"], "quantity": "1.5"}
    response = client.post(URL, json=half)
    assert (response.status_code, response.json()["code"]) == (422, "invalid_quantity")

    client.patch(f"{PRODUCTS_URL}/{product['id']}", json={"active": False})
    response = client.post(URL, json={"product_id": product["id"], "quantity": "1"})
    assert (response.status_code, response.json()["code"]) == (409, "conflict")


# Waste and corrections


def test_waste_reduces_stock_and_refuses_too_much(client: TestClient) -> None:
    batch = receive(client, make_product(client), "5")

    response = waste(client, batch, "2", "damaged")
    assert response.status_code == 200
    assert Decimal(response.json()["remaining_quantity"]) == 3

    response = waste(client, batch, "4")
    assert response.status_code == 409
    assert response.json() == {
        "code": "insufficient_stock",
        "detail": "Only 3 left in this batch",
    }


def test_waste_needs_a_known_reason(client: TestClient) -> None:
    batch = receive(client, make_product(client))
    assert waste(client, batch, "1", "the cat ate it").status_code == 422


def test_correction_needs_an_explanation(client: TestClient) -> None:
    batch = receive(client, make_product(client), "5")
    url = f"{URL}/{batch['id']}/adjustments"

    assert client.post(url, json={"quantity_delta": "2"}).status_code == 422
    blank = {"quantity_delta": "2", "reason": "   "}
    assert client.post(url, json=blank).status_code == 422
    huge = {"quantity_delta": "100001", "reason": "Count"}
    assert client.post(url, json=huge).status_code == 422

    response = client.post(url, json={"quantity_delta": "2", "reason": " Found on the shelf "})
    assert response.status_code == 200
    assert Decimal(response.json()["remaining_quantity"]) == 7


def test_correction_from_an_old_number_gets_its_own_code(client: TestClient) -> None:
    batch = receive(client, make_product(client), "5")
    assert waste(client, batch, "1").status_code == 200

    response = client.post(
        f"{URL}/{batch['id']}/adjustments",
        json={"quantity_delta": "-1", "reason": "Count", "expected_quantity": "5"},
    )
    assert response.status_code == 409
    assert response.json() == {
        "code": "stock_changed",
        "detail": "This batch changed meanwhile, it now has 4",
    }


# The list


def test_batches_come_in_the_order_they_should_leave_the_shelf(client: TestClient) -> None:
    product = make_product(client)
    no_expiry = receive(client, product)
    later = receive(client, product, expiry=in_days(20))
    sooner = receive(client, product, expiry=in_days(3))

    assert ids(client.get(URL)) == [sooner["id"], later["id"], no_expiry["id"]]


def test_empty_batches_are_hidden_unless_asked_for(client: TestClient) -> None:
    batch = receive(client, make_product(client), "2")
    assert waste(client, batch, "2").status_code == 200

    assert ids(client.get(URL)) == []
    assert ids(client.get(URL, params={"status": "all"})) == [batch["id"]]


def test_expiry_filters_and_their_edges(client: TestClient, db: Session) -> None:
    product = make_product(client)
    today = receive(client, product, expiry=in_days(0))
    last_soon_day = receive(client, product, expiry=in_days(EXPIRING_SOON_DAYS))
    fresh = receive(client, product, expiry=in_days(EXPIRING_SOON_DAYS + 1))
    no_expiry = receive(client, product)

    # The API refuses expired goods, so this batch ages directly in the database.
    expired = receive(client, product, expiry=in_days(1))
    db.get(Batch, expired["id"]).expiry_date = in_days(-1)
    db.flush()

    assert ids(client.get(URL, params={"status": "expired"})) == [expired["id"]]
    assert ids(client.get(URL, params={"status": "expiring"})) == [today["id"], last_soon_day["id"]]

    statuses = {item["id"]: item["expiry_status"] for item in client.get(URL).json()["items"]}
    assert statuses == {
        expired["id"]: "expired",
        today["id"]: "expiring",
        last_soon_day["id"]: "expiring",
        fresh["id"]: "fresh",
        no_expiry["id"]: "none",
    }


def test_written_off_goods_leave_the_expired_list(client: TestClient, db: Session) -> None:
    batch = receive(client, make_product(client), "3", in_days(1))
    db.get(Batch, batch["id"]).expiry_date = in_days(-1)
    db.flush()

    assert waste(client, batch, "3").status_code == 200
    assert ids(client.get(URL, params={"status": "expired"})) == []


def test_list_filters_by_product_and_search(client: TestClient) -> None:
    milk = make_product(client, "Прясно мляко", barcode="2000000000015")
    bread = make_product(client, "Хляб", brand="Изгрев")
    milk_batch = receive(client, milk, lot_code="LOT-777")
    bread_batch = receive(client, bread)

    assert ids(client.get(URL, params={"product_id": bread["id"]})) == [bread_batch["id"]]
    assert ids(client.get(URL, params={"search": "МЛЯКО"})) == [milk_batch["id"]]
    assert ids(client.get(URL, params={"search": "изгрев"})) == [bread_batch["id"]]
    assert ids(client.get(URL, params={"search": "2000000"})) == [milk_batch["id"]]
    assert ids(client.get(URL, params={"search": "lot-7"})) == [milk_batch["id"]]
    assert ids(client.get(URL, params={"search": "%"})) == []


def test_list_is_paginated(client: TestClient) -> None:
    product = make_product(client)
    created = [receive(client, product, expiry=in_days(days))["id"] for days in (1, 2, 3)]

    page = client.get(URL, params={"limit": 2, "offset": 1})
    assert ids(page) == created[1:]
    assert page.json()["total"] == 3
    assert client.get(URL, params={"limit": 201}).status_code == 422


# History


def test_history_shows_who_did_what_newest_first(client: TestClient) -> None:
    batch = receive(client, make_product(client), "10")
    waste(client, batch, "2", "damaged")
    client.post(
        f"{URL}/{batch['id']}/adjustments", json={"quantity_delta": "1", "reason": "Recount"}
    )

    history = client.get(f"{URL}/{batch['id']}/movements").json()
    assert history["total"] == 3
    assert [
        (line["type"], Decimal(line["quantity_delta"]), line["reason"]) for line in history["items"]
    ] == [
        ("adjustment", Decimal("1"), "Recount"),
        ("waste", Decimal("-2"), "damaged"),
        ("receipt", Decimal("10"), None),
    ]
    assert history["items"][0]["actor"] == {"full_name": "Test Owner"}


def test_a_refused_change_leaves_no_history(client: TestClient) -> None:
    batch = receive(client, make_product(client), "1")
    assert waste(client, batch, "2").status_code == 409
    assert client.get(f"{URL}/{batch['id']}/movements").json()["total"] == 1


# Stock on products


def test_product_stock_is_the_sum_of_its_batches(client: TestClient) -> None:
    product = make_product(client, "Bananas", unit="kg")
    url = f"{PRODUCTS_URL}/{product['id']}"
    assert Decimal(client.get(url).json()["stock"]) == 0

    receive(client, product, "1.250")
    second = receive(client, product, "2.500")
    assert Decimal(client.get(url).json()["stock"]) == Decimal("3.750")

    assert waste(client, second, "0.500").status_code == 200
    assert Decimal(client.get(url).json()["stock"]) == Decimal("3.250")


def test_products_can_be_sorted_by_stock(client: TestClient) -> None:
    empty = make_product(client, "Empty")
    full = make_product(client, "Full")
    some = make_product(client, "Some")
    receive(client, full, "50")
    receive(client, some, "5")

    params = {"sort": "stock", "order": "desc"}
    assert ids(client.get(PRODUCTS_URL, params=params)) == [full["id"], some["id"], empty["id"]]


def test_unit_is_locked_once_a_product_has_batches(client: TestClient) -> None:
    product = make_product(client)
    url = f"{PRODUCTS_URL}/{product['id']}"

    # Nothing depends on the unit yet, so a mistake can still be fixed.
    assert client.patch(url, json={"unit": "kg"}).json()["unit"] == "kg"
    assert client.patch(url, json={"unit": "pcs"}).json()["unit"] == "pcs"

    batch = receive(client, product, "1")
    response = client.patch(url, json={"unit": "kg"})
    assert response.status_code == 409
    assert response.json()["code"] == "unit_locked"

    # An empty batch still locks it: its history would change its meaning.
    assert waste(client, batch, "1").status_code == 200
    assert client.patch(url, json={"unit": "kg"}).status_code == 409

    # Saving the form with the same unit is not a change.
    assert client.patch(url, json={"unit": "pcs", "name": "Fresh milk"}).status_code == 200
