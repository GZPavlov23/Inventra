"""API tests for /api/v1/deliveries: ordering goods, and receiving them into batches."""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    Batch,
    Delivery,
    DeliveryItem,
    InventoryMovement,
    MovementType,
    Product,
    Store,
    Supplier,
    User,
)

URL = "/api/v1/deliveries"
PRODUCTS = "/api/v1/products"
SUPPLIERS = "/api/v1/suppliers"
BATCHES = "/api/v1/batches"


def in_days(days: int) -> str:
    return (date.today() + timedelta(days=days)).isoformat()


@pytest.fixture
def supplier(client: TestClient) -> dict:
    return client.post(SUPPLIERS, json={"name": "Dairy"}).json()


def make_product(client: TestClient, name: str = "Milk", **overrides: object) -> dict:
    payload = {"name": name, "purchase_price": "1.10", "sale_price": "1.59", **overrides}
    response = client.post(PRODUCTS, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def stock_of(client: TestClient, product: dict) -> Decimal:
    return Decimal(client.get(f"{PRODUCTS}/{product['id']}").json()["stock"])


def line(product: dict, quantity: str = "10", **extra: object) -> dict:
    return {"product_id": product["id"], "quantity": quantity, **extra}


def order(client: TestClient, supplier: dict, *lines: dict, **extra: object) -> dict:
    body = {"supplier_id": supplier["id"], "items": list(lines), **extra}
    response = client.post(URL, json=body)
    assert response.status_code == 201, response.text
    return response.json()


def arrived(item: dict, quantity: str | None = None, **extra: object) -> dict:
    amount = item["ordered_quantity"] if quantity is None else quantity
    return {"item_id": item["id"], "quantity": amount, **extra}


def send_receipt(client: TestClient, delivery: dict, *lines: dict, **extra: object):
    body = {"items": list(lines or map(arrived, delivery["items"])), **extra}
    return client.post(f"{URL}/{delivery['id']}/receive", json=body)


def receive(client: TestClient, delivery: dict, *lines: dict, **extra: object) -> dict:
    response = send_receipt(client, delivery, *lines, **extra)
    assert response.status_code == 200, response.text
    return response.json()


@pytest.fixture
def other_store(db: Session) -> Store:
    other = Store(name="Other store")
    db.add(other)
    db.flush()
    return other


def batches_in(db: Session) -> int:
    return db.scalar(select(func.count()).select_from(Batch))


# Ordering


def test_an_order_changes_no_stock(client: TestClient, supplier: dict) -> None:
    milk = make_product(client)
    delivery = order(client, supplier, line(milk, "24"), expected_on=in_days(2))

    assert delivery["status"] == "ordered"
    assert delivery["supplier"]["name"] == "Dairy"
    assert delivery["expected_on"] == in_days(2)
    assert delivery["received_at"] is None
    assert delivery["received_total"] is None
    assert delivery["actor"]["full_name"] == "Test Owner"
    assert delivery["items"][0]["received_quantity"] is None
    assert stock_of(client, milk) == 0
    assert client.get(BATCHES, params={"status": "all"}).json()["total"] == 0


def test_the_cost_defaults_to_the_purchase_price(client: TestClient, supplier: dict) -> None:
    delivery = order(
        client,
        supplier,
        line(make_product(client), "3"),
        line(make_product(client, "Bread"), "2", unit_cost="0.55"),
    )
    assert delivery["items"][0]["unit_cost"] == "1.10"
    assert delivery["items"][1]["unit_cost"] == "0.55"
    assert delivery["ordered_total"] == "4.40"


def test_each_line_is_rounded_to_cents(client: TestClient, supplier: dict) -> None:
    kilos = make_product(client, "Bananas", unit="kg", purchase_price="1.25")
    pieces = make_product(client, "Apples", unit="kg", purchase_price="1.25")
    delivery = order(client, supplier, line(kilos, "0.300"), line(pieces, "0.300"))
    # 0.375 twice: rounded per line it is 0.76, not the 0.75 of the sum.
    assert delivery["ordered_total"] == "0.76"


def test_half_a_piece_cannot_be_ordered(client: TestClient, supplier: dict) -> None:
    body = {"supplier_id": supplier["id"], "items": [line(make_product(client), "1.5")]}
    response = client.post(URL, json=body)
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_quantity"


def test_one_bad_line_saves_nothing(client: TestClient, db: Session, supplier: dict) -> None:
    body = {
        "supplier_id": supplier["id"],
        "items": [line(make_product(client)), {"product_id": 999999, "quantity": "1"}],
    }
    assert client.post(URL, json=body).status_code == 404
    assert client.get(URL).json()["total"] == 0
    assert db.scalar(select(func.count()).select_from(DeliveryItem)) == 0


def test_an_archived_product_cannot_be_ordered(client: TestClient, supplier: dict) -> None:
    milk = make_product(client)
    client.patch(f"{PRODUCTS}/{milk['id']}", json={"active": False})
    response = client.post(URL, json={"supplier_id": supplier["id"], "items": [line(milk)]})
    assert response.status_code == 409
    assert "archived" in response.json()["detail"]


def test_an_archived_supplier_cannot_be_ordered_from(client: TestClient, supplier: dict) -> None:
    client.patch(f"{SUPPLIERS}/{supplier['id']}", json={"active": False})
    body = {"supplier_id": supplier["id"], "items": [line(make_product(client))]}
    response = client.post(URL, json=body)
    assert response.status_code == 409
    assert response.json()["code"] == "supplier_archived"


def test_another_stores_supplier_and_product_cannot_be_used(
    client: TestClient, db: Session, supplier: dict, other_store: Store
) -> None:
    foreign_supplier = Supplier(store_id=other_store.id, name="Foreign")
    foreign_product = Product(
        store_id=other_store.id,
        name="Foreign",
        purchase_price=Decimal(1),
        sale_price=Decimal(2),
    )
    db.add_all([foreign_supplier, foreign_product])
    db.flush()

    milk = make_product(client)
    body = {"supplier_id": foreign_supplier.id, "items": [line(milk)]}
    assert client.post(URL, json=body).status_code == 404
    body = {
        "supplier_id": supplier["id"],
        "items": [{"product_id": foreign_product.id, "quantity": "1"}],
    }
    assert client.post(URL, json=body).status_code == 404


def test_the_expected_date_can_be_today_but_not_earlier(client: TestClient, supplier: dict) -> None:
    milk = make_product(client)
    assert order(client, supplier, line(milk), expected_on=in_days(0))["expected_on"] == in_days(0)

    body = {"supplier_id": supplier["id"], "items": [line(milk)], "expected_on": in_days(-1)}
    response = client.post(URL, json=body)
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_receipt"


@pytest.mark.parametrize("items", [[], "twice"])
def test_a_delivery_needs_lines_and_each_product_once(
    client: TestClient, supplier: dict, items: object
) -> None:
    lines = [line(make_product(client))] * 2 if items == "twice" else items
    response = client.post(URL, json={"supplier_id": supplier["id"], "items": lines})
    assert response.status_code == 422


# Reading


def test_list_is_newest_first_with_a_status_filter(client: TestClient, supplier: dict) -> None:
    milk = make_product(client)
    first = order(client, supplier, line(milk))
    second = order(client, supplier, line(milk))
    third = order(client, supplier, line(milk))
    receive(client, first)
    client.post(f"{URL}/{second['id']}/cancel")

    def ids(status: str) -> list[int]:
        return [d["id"] for d in client.get(URL, params={"status": status}).json()["items"]]

    assert ids("all") == [third["id"], second["id"], first["id"]]
    assert ids("ordered") == [third["id"]]
    assert ids("received") == [first["id"]]
    assert ids("cancelled") == [second["id"]]

    page = client.get(URL, params={"limit": 1, "offset": 1}).json()
    assert page["total"] == 3
    assert [d["id"] for d in page["items"]] == [second["id"]]


def test_another_stores_delivery_looks_like_it_does_not_exist(
    client: TestClient, db: Session, owner: User, supplier: dict, other_store: Store
) -> None:
    delivery = order(client, supplier, line(make_product(client)))
    url = f"{URL}/{delivery['id']}"
    owner.store_id = other_store.id
    db.commit()

    assert client.get(url).status_code == 404
    assert (
        client.post(f"{url}/receive", json={"items": [arrived(delivery["items"][0])]}).status_code
        == 404
    )
    assert client.post(f"{url}/cancel").status_code == 404
    assert client.get(URL).json()["total"] == 0


def test_deliveries_require_login(anon_client: TestClient) -> None:
    assert anon_client.get(URL).status_code == 401
    assert anon_client.post(URL, json={}).status_code == 401
    assert anon_client.post(f"{URL}/1/receive", json={"items": []}).status_code == 401
    assert anon_client.post(f"{URL}/1/cancel").status_code == 401


# Receiving


def test_receiving_turns_a_line_into_a_batch(client: TestClient, supplier: dict) -> None:
    milk = make_product(client)
    delivery = order(client, supplier, line(milk, "24"))
    item = delivery["items"][0]

    done = receive(
        client,
        delivery,
        arrived(item, expiry_date=in_days(9), lot_code="L-7"),
        invoice_number="INV-1",
    )

    assert done["status"] == "received"
    assert done["received_at"] is not None
    assert done["invoice_number"] == "INV-1"
    assert done["items"][0]["received_quantity"] == "24.000"
    assert done["items"][0]["batch"]["expiry_date"] == in_days(9)
    assert done["items"][0]["batch"]["lot_code"] == "L-7"
    assert stock_of(client, milk) == 24


def test_the_history_says_which_delivery_brought_the_goods(
    client: TestClient, db: Session, supplier: dict
) -> None:
    delivery = order(client, supplier, line(make_product(client), "5"))
    done = receive(client, delivery)

    batch_id = done["items"][0]["batch"]["id"]
    movement = client.get(f"{BATCHES}/{batch_id}/movements").json()["items"][0]
    assert movement["type"] == "receipt"
    assert movement["quantity_delta"] == "5.000"
    assert movement["reason"] == f"Delivery #{delivery['id']}"
    assert db.scalar(
        select(func.sum(InventoryMovement.quantity_delta)).where(
            InventoryMovement.batch_id == batch_id
        )
    ) == Decimal(5)


def test_the_price_on_the_invoice_is_what_the_batch_cost(
    client: TestClient, supplier: dict
) -> None:
    delivery = order(client, supplier, line(make_product(client), "10"))
    done = receive(client, delivery, arrived(delivery["items"][0], unit_cost="1.30"))

    assert done["items"][0]["unit_cost"] == "1.10"  # what was agreed stays on record
    assert done["items"][0]["batch"]["purchase_price"] == "1.30"
    assert done["ordered_total"] == "11.00"
    assert done["received_total"] == "13.00"


def test_without_an_invoice_price_the_agreed_one_is_used(
    client: TestClient, supplier: dict
) -> None:
    delivery = order(client, supplier, line(make_product(client), "10", unit_cost="0.95"))
    assert receive(client, delivery)["items"][0]["batch"]["purchase_price"] == "0.95"


def test_less_or_more_can_arrive_than_was_ordered(client: TestClient, supplier: dict) -> None:
    short = make_product(client, "Short")
    extra = make_product(client, "Extra")
    delivery = order(client, supplier, line(short, "10"), line(extra, "10"))

    done = receive(
        client,
        delivery,
        arrived(delivery["items"][0], "7"),
        arrived(delivery["items"][1], "12"),
    )

    assert stock_of(client, short) == 7
    assert stock_of(client, extra) == 12
    assert done["received_total"] == "20.90"


def test_a_product_that_never_came_makes_no_batch(
    client: TestClient, db: Session, supplier: dict
) -> None:
    came = make_product(client, "Came")
    missing = make_product(client, "Missing")
    delivery = order(client, supplier, line(came), line(missing))

    done = receive(
        client, delivery, arrived(delivery["items"][0]), arrived(delivery["items"][1], "0")
    )

    assert Decimal(done["items"][1]["received_quantity"]) == 0
    assert done["items"][1]["batch"] is None
    assert stock_of(client, missing) == 0
    assert batches_in(db) == 1


def test_nothing_arriving_is_a_cancellation_not_a_receipt(
    client: TestClient, supplier: dict
) -> None:
    delivery = order(client, supplier, line(make_product(client)))
    response = send_receipt(client, delivery, arrived(delivery["items"][0], "0"))
    assert response.status_code == 422
    assert "Cancel" in response.json()["detail"]
    assert client.get(f"{URL}/{delivery['id']}").json()["status"] == "ordered"


def test_a_delivery_can_be_received_only_once(client: TestClient, supplier: dict) -> None:
    milk = make_product(client)
    delivery = order(client, supplier, line(milk, "5"))
    receive(client, delivery)

    response = send_receipt(client, delivery)

    assert response.status_code == 409
    assert response.json()["code"] == "delivery_closed"
    assert stock_of(client, milk) == 5


def test_every_line_must_be_listed_once(client: TestClient, db: Session, supplier: dict) -> None:
    first = make_product(client, "First")
    second = make_product(client, "Second")
    delivery = order(client, supplier, line(first), line(second))
    one, other = delivery["items"]

    for lines in (
        [arrived(one)],
        [arrived(one), arrived(one)],
        [arrived(one), arrived(one), arrived(other)],
        [arrived(one), arrived(other), {"item_id": 999999, "quantity": "1"}],
    ):
        response = send_receipt(client, delivery, *lines)
        assert response.status_code == 422
        assert response.json()["code"] == "invalid_receipt"

    assert batches_in(db) == 0


@pytest.mark.parametrize(
    ("second_line", "code"),
    [
        ({"expiry_date": in_days(-1)}, "invalid_receipt"),
        ({"quantity": "1.5"}, "invalid_quantity"),
    ],
)
def test_one_refused_line_leaves_the_whole_delivery_open(
    client: TestClient, db: Session, supplier: dict, second_line: dict, code: str
) -> None:
    good = make_product(client, "Good")
    bad = make_product(client, "Bad")
    delivery = order(client, supplier, line(good), line(bad))
    first, second = delivery["items"]

    response = send_receipt(client, delivery, arrived(first), {**arrived(second), **second_line})

    assert response.status_code == 422
    assert response.json()["code"] == code
    assert stock_of(client, good) == 0
    assert batches_in(db) == 0
    after = client.get(f"{URL}/{delivery['id']}").json()
    assert after["status"] == "ordered"
    assert after["items"][0]["received_quantity"] is None


def test_the_message_of_a_refused_line_names_the_product(
    client: TestClient, supplier: dict
) -> None:
    delivery = order(client, supplier, line(make_product(client, "Yogurt")))
    response = send_receipt(
        client, delivery, arrived(delivery["items"][0], expiry_date=in_days(-1))
    )
    assert "Yogurt" in response.json()["detail"]


def test_a_product_archived_meanwhile_stops_the_receipt(
    client: TestClient, db: Session, supplier: dict
) -> None:
    milk = make_product(client)
    delivery = order(client, supplier, line(milk))
    client.patch(f"{PRODUCTS}/{milk['id']}", json={"active": False})

    response = send_receipt(client, delivery)

    assert response.status_code == 409
    assert batches_in(db) == 0


def test_an_archived_product_that_did_not_arrive_does_not_matter(
    client: TestClient, supplier: dict
) -> None:
    milk = make_product(client)
    gone = make_product(client, "Gone")
    delivery = order(client, supplier, line(milk), line(gone))
    client.patch(f"{PRODUCTS}/{gone['id']}", json={"active": False})

    receive(client, delivery, arrived(delivery["items"][0]), arrived(delivery["items"][1], "0"))

    assert stock_of(client, milk) == 10


def test_goods_on_their_way_arrive_even_if_the_supplier_was_archived(
    client: TestClient, supplier: dict
) -> None:
    milk = make_product(client)
    delivery = order(client, supplier, line(milk))
    client.patch(f"{SUPPLIERS}/{supplier['id']}", json={"active": False})

    assert receive(client, delivery)["supplier"]["active"] is False
    assert stock_of(client, milk) == 10


def test_received_goods_can_be_sold_at_their_real_cost(client: TestClient, supplier: dict) -> None:
    milk = make_product(client)
    delivery = order(client, supplier, line(milk, "5"))
    receive(client, delivery, arrived(delivery["items"][0], unit_cost="0.90"))

    sale = client.post(
        "/api/v1/sales", json={"items": [{"product_id": milk["id"], "quantity": "2"}]}
    )

    assert sale.status_code == 201, sale.text
    assert sale.json()["cost"] == "1.80"
    assert stock_of(client, milk) == 3


# Cancelling


def test_a_cancelled_delivery_stays_on_record_without_touching_stock(
    client: TestClient, supplier: dict
) -> None:
    milk = make_product(client)
    delivery = order(client, supplier, line(milk))

    response = client.post(f"{URL}/{delivery['id']}/cancel")

    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"
    assert stock_of(client, milk) == 0


def test_cancelled_goods_cannot_be_received(client: TestClient, supplier: dict) -> None:
    delivery = order(client, supplier, line(make_product(client)))
    client.post(f"{URL}/{delivery['id']}/cancel")

    response = send_receipt(client, delivery)

    assert response.status_code == 409
    assert "cancelled" in response.json()["detail"]


def test_a_closed_delivery_cannot_be_cancelled(client: TestClient, supplier: dict) -> None:
    received = order(client, supplier, line(make_product(client)))
    receive(client, received)
    cancelled = order(client, supplier, line(make_product(client, "Bread")))
    client.post(f"{URL}/{cancelled['id']}/cancel")

    for delivery in (received, cancelled):
        response = client.post(f"{URL}/{delivery['id']}/cancel")
        assert response.status_code == 409
        assert response.json()["code"] == "delivery_closed"


# Rules the database enforces by itself, even if application code has a bug


def test_a_store_with_deliveries_can_still_be_deleted(
    client: TestClient, db: Session, store: Store, supplier: dict
) -> None:
    received = order(client, supplier, line(make_product(client)))
    receive(client, received)
    order(client, supplier, line(make_product(client, "Bread")))

    db.execute(delete(Store).where(Store.id == store.id))

    assert db.scalars(select(Delivery)).first() is None
    assert db.scalars(select(DeliveryItem)).first() is None


@pytest.mark.parametrize(
    "values",
    [
        {"received_quantity": Decimal(5)},  # goods arrived, but no batch
        {"received_quantity": Decimal(0), "batch_id": "real"},  # a batch of nothing
        {"ordered_quantity": Decimal(0)},
        {"unit_cost": Decimal(-1)},
    ],
)
def test_the_database_refuses_impossible_lines(
    client: TestClient, db: Session, supplier: dict, values: dict
) -> None:
    done = receive(client, order(client, supplier, line(make_product(client))))
    item = done["items"][0]
    open_delivery = order(client, supplier, line(make_product(client, "Bread")))
    changes = dict(values)
    if changes.get("batch_id") == "real":
        changes["batch_id"] = item["batch"]["id"]

    with pytest.raises(IntegrityError), db.begin_nested():
        target = open_delivery["items"][0]["id"]
        db.execute(update(DeliveryItem).where(DeliveryItem.id == target).values(**changes))


def test_the_database_refuses_a_received_delivery_without_a_date(
    client: TestClient, db: Session, supplier: dict
) -> None:
    delivery = order(client, supplier, line(make_product(client)))
    with pytest.raises(IntegrityError), db.begin_nested():
        db.execute(update(Delivery).where(Delivery.id == delivery["id"]).values(status="received"))


def test_only_receiving_writes_to_the_stock_history(
    client: TestClient, db: Session, supplier: dict
) -> None:
    delivery = order(client, supplier, line(make_product(client)))
    assert db.scalar(select(func.count()).select_from(InventoryMovement)) == 0
    receive(client, delivery)
    types = db.scalars(select(InventoryMovement.type))
    assert list(types) == [MovementType.RECEIPT]
