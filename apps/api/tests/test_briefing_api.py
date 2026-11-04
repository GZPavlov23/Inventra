"""API tests for /api/v1/reports/briefing: what the owner is told first, and why."""

from datetime import date, timedelta
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models import Batch, Delivery, Store, User

URL = "/api/v1/reports/briefing"


def in_days(days: int) -> date:
    return date.today() + timedelta(days=days)


def make_product(client: TestClient, name: str = "Milk", **overrides: object) -> dict:
    payload = {"name": name, "purchase_price": "1.00", "sale_price": "2.00", **overrides}
    response = client.post("/api/v1/products", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def history(client: TestClient, product: dict, per_day, days: int = 60) -> None:
    """Old sales, one row per day: per_day is a number or a function of how many days ago."""
    count = per_day if callable(per_day) else (lambda _ago: per_day)
    rows = ["date;product;quantity"]
    # Days without sales are left out, as a till's export would; the forecast reads them as zero.
    rows += [
        f"{in_days(-ago).isoformat()};{product['name']};{count(ago)}"
        for ago in range(days, 0, -1)
        if count(ago) > 0
    ]
    response = client.post(
        "/api/v1/imports/sales",
        json={"mode": "history", "content": "\n".join(rows), "dry_run": False},
    )
    assert response.json()["applied"] is True, response.text


def receive(client: TestClient, product: dict, quantity: str, expiry: date | None = None) -> dict:
    body = {
        "product_id": product["id"],
        "quantity": quantity,
        "expiry_date": expiry.isoformat() if expiry else None,
    }
    response = client.post("/api/v1/batches", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def order(client: TestClient, product: dict, quantity: str, expected: date | None) -> dict:
    supplier = client.post(
        "/api/v1/suppliers", json={"name": f"Supplier {product['name']}", "phone": "02 000 0001"}
    ).json()
    body = {
        "supplier_id": supplier["id"],
        "expected_on": expected.isoformat() if expected and expected >= date.today() else None,
        "items": [{"product_id": product["id"], "quantity": quantity}],
    }
    response = client.post("/api/v1/deliveries", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def notes(client: TestClient, kind: str | None = None) -> list[dict]:
    response = client.get(URL)
    assert response.status_code == 200, response.text
    found = response.json()["notes"]
    return [note for note in found if kind is None or note["kind"] == kind]


def test_a_quiet_store_has_nothing_to_say(client: TestClient) -> None:
    make_product(client)
    body = client.get(URL).json()
    assert body["notes"] == []
    assert body["method"]


def test_expired_goods_are_counted_and_valued(client: TestClient, db: Session) -> None:
    milk = make_product(client, purchase_price="1.25")
    first = receive(client, milk, "4", in_days(3))
    second = receive(client, milk, "2", in_days(3))
    db.execute(
        update(Batch)
        .where(Batch.id.in_([first["id"], second["id"]]))
        .values(expiry_date=in_days(-1))
    )
    db.flush()

    [note] = notes(client, "expired")

    assert note["batches"] == 2
    assert Decimal(note["at_stake"]) == Decimal("7.50")


def test_goods_expiring_today_have_not_expired_yet(client: TestClient) -> None:
    receive(client, make_product(client), "4", in_days(0))
    assert notes(client, "expired") == []


def test_a_late_delivery_comes_with_whom_to_call(client: TestClient, db: Session) -> None:
    milk = make_product(client)
    delivery = order(client, milk, "10", in_days(1))
    db.execute(update(Delivery).values(expected_on=in_days(-2)))
    db.flush()

    [note] = notes(client, "late_delivery")

    assert note["delivery_id"] == delivery["id"]
    assert note["deliveries"] == 1
    assert note["supplier"] == {"name": "Supplier Milk", "phone": "02 000 0001"}
    assert note["day"] == in_days(-2).isoformat()
    assert Decimal(note["at_stake"]) == Decimal("10.00")


def test_a_received_or_cancelled_delivery_is_never_late(client: TestClient, db: Session) -> None:
    received = order(client, make_product(client), "10", in_days(1))
    cancelled = order(client, make_product(client, "Bread"), "10", in_days(1))
    item = received["items"][0]
    client.post(
        f"/api/v1/deliveries/{received['id']}/receive",
        json={"items": [{"item_id": item["id"], "quantity": "10"}]},
    )
    client.post(f"/api/v1/deliveries/{cancelled['id']}/cancel")
    db.execute(update(Delivery).values(expected_on=in_days(-2)))
    db.flush()

    assert notes(client, "late_delivery") == []


def test_one_supplier_late_with_several_deliveries_is_one_note(
    client: TestClient, db: Session
) -> None:
    milk = make_product(client)
    first = order(client, milk, "10", in_days(1))
    later = client.post(
        "/api/v1/deliveries",
        json={
            "supplier_id": first["supplier"]["id"],
            "expected_on": in_days(1).isoformat(),
            "items": [{"product_id": milk["id"], "quantity": "5"}],
        },
    ).json()
    order(client, make_product(client, "Bread"), "3", in_days(1))  # another supplier
    db.execute(update(Delivery).where(Delivery.id == first["id"]).values(expected_on=in_days(-4)))
    db.execute(update(Delivery).where(Delivery.id != first["id"]).values(expected_on=in_days(-1)))
    db.flush()

    late = {note["supplier"]["name"]: note for note in notes(client, "late_delivery")}

    assert late.keys() == {"Supplier Milk", "Supplier Bread"}
    milk_note = late["Supplier Milk"]
    assert milk_note["deliveries"] == 2
    assert milk_note["delivery_id"] == first["id"]  # the most overdue one
    assert milk_note["day"] == in_days(-4).isoformat()
    assert Decimal(milk_note["at_stake"]) == Decimal("15.00")
    assert later["id"] != first["id"]


def test_a_delivery_expected_today_is_not_late(client: TestClient) -> None:
    order(client, make_product(client), "10", in_days(0))
    assert notes(client, "late_delivery") == []


def test_a_product_that_sells_out_with_nothing_on_the_way(client: TestClient) -> None:
    milk = make_product(client)
    history(client, milk, 2)
    receive(client, milk, "3")

    [note] = notes(client, "runs_out")

    # 2 sell today and the last one tomorrow, when one more is wanted than is left.
    assert note["day"] == in_days(1).isoformat()
    assert note["delivery_day"] is None
    assert Decimal(note["quantity"]) == 11  # a week wants 14, the shelf has 3
    assert Decimal(note["at_stake"]) == Decimal("22.00")  # missed sales at the sale price


def test_a_delivery_in_time_means_no_shortage_note(client: TestClient) -> None:
    milk = make_product(client)
    history(client, milk, 2)
    receive(client, milk, "3")
    order(client, milk, "20", in_days(1))

    assert notes(client, "runs_out") == []


def test_an_order_without_a_date_is_trusted(client: TestClient) -> None:
    milk = make_product(client)
    history(client, milk, 2)
    receive(client, milk, "3")
    order(client, milk, "20", None)

    assert notes(client, "runs_out") == []


def test_a_delivery_after_the_shelf_is_empty_still_misses_sales(client: TestClient) -> None:
    milk = make_product(client)
    history(client, milk, 2)
    receive(client, milk, "3")
    order(client, milk, "20", in_days(4))

    [note] = notes(client, "runs_out")

    assert note["day"] == in_days(1).isoformat()
    assert note["delivery_day"] == in_days(4).isoformat()
    # Only the days before the delivery: 4 days want 8, the shelf has 3.
    assert Decimal(note["quantity"]) == 5


def test_stock_that_will_expire_before_it_sells(client: TestClient) -> None:
    yogurt = make_product(client, "Yogurt", purchase_price="0.60")
    history(client, yogurt, 1)
    receive(client, yogurt, "10", in_days(2))

    [note] = notes(client, "expires_unsold")

    # One a day: today, tomorrow and the last day sell 3, the other 7 are thrown away.
    assert Decimal(note["quantity"]) == 7
    assert note["day"] == in_days(2).isoformat()
    assert Decimal(note["at_stake"]) == Decimal("4.20")


def test_the_loss_is_valued_at_what_the_batches_cost(client: TestClient) -> None:
    yogurt = make_product(client, "Yogurt", purchase_price="0.60")
    history(client, yogurt, 1)
    client.post(
        "/api/v1/batches",
        json={
            "product_id": yogurt["id"],
            "quantity": "10",
            "expiry_date": in_days(2).isoformat(),
            "purchase_price": "0.80",
        },
    )

    [note] = notes(client, "expires_unsold")

    assert Decimal(note["at_stake"]) == Decimal("5.60")


def test_a_loss_too_small_to_matter_is_left_out(client: TestClient) -> None:
    bananas = make_product(client, "Bananas", unit="kg")
    history(client, bananas, 1)
    receive(client, bananas, "3.3", in_days(2))  # 3 kg sell, 0.3 kg are thrown away
    assert notes(client, "expires_unsold") == []


def test_goods_that_keep_long_enough_are_not_mentioned(client: TestClient) -> None:
    water = make_product(client, "Water")
    history(client, water, 1)
    receive(client, water, "20", in_days(30))
    assert notes(client) == []


def test_a_week_that_sold_far_above_the_forecast(client: TestClient) -> None:
    bread = make_product(client, "Bread")
    history(client, bread, lambda ago: 5 if ago <= 7 else 2)
    receive(client, bread, "100")

    [note] = notes(client, "above_forecast")

    assert Decimal(note["quantity"]) == 35
    assert Decimal(note["expected"]) == 14
    assert Decimal(note["at_stake"]) == Decimal("42.00")  # 21 more, at the sale price


def test_a_busy_product_a_little_above_its_forecast_is_no_surprise(
    client: TestClient,
) -> None:
    rice = make_product(client, "Rice")
    history(client, rice, lambda ago: 11 if ago <= 7 else 10)  # 7 more, but only 10% more
    receive(client, rice, "500")
    assert notes(client, "above_forecast") == []


def test_an_ordinary_week_is_no_surprise(client: TestClient) -> None:
    bread = make_product(client, "Bread")
    history(client, bread, lambda ago: 3 if ago <= 7 else 2)  # 21 against 14: 50% more, but...
    receive(client, bread, "100")
    assert len(notes(client, "above_forecast")) == 1

    tea = make_product(client, "Tea")
    history(
        client, tea, lambda ago: (1 if ago % 7 == 0 else 0) if ago > 7 else (2 if ago == 3 else 0)
    )
    receive(client, tea, "100")
    # ...two teas instead of one is no news, however large the share.
    assert [n["product"]["name"] for n in notes(client, "above_forecast")] == ["Bread"]


def test_the_biggest_money_comes_first(client: TestClient) -> None:
    for index in range(7):
        product = make_product(client, f"Product {index}", sale_price=str(index + 1))
        history(client, product, 2)
    body = client.get(URL).json()

    amounts = [Decimal(note["at_stake"]) for note in body["notes"]]
    assert len(amounts) == 7
    assert amounts == sorted(amounts, reverse=True)
    assert body["notes"][0]["product"]["name"] == "Product 6"


def test_the_briefing_shows_only_this_store(client: TestClient, db: Session, owner: User) -> None:
    milk = make_product(client)
    history(client, milk, 2)
    order(client, milk, "1", in_days(1))
    db.execute(update(Delivery).values(expected_on=in_days(-1)))
    db.flush()
    assert {note["kind"] for note in notes(client)} == {"late_delivery"}

    other = Store(name="Someone else's store")
    db.add(other)
    db.flush()
    owner.store_id = other.id
    db.commit()

    assert notes(client) == []


def test_the_briefing_requires_login(anon_client: TestClient) -> None:
    assert anon_client.get(URL).status_code == 401
