"""API tests for /api/v1/products/{id}/story: a product's life in the store, day by day."""

from datetime import date, datetime, time, timedelta
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.main import app
from app.models import Batch, InventoryMovement, Store, User
from app.models.delivery import Delivery
from tests.clock import on_day

API = "/api/v1"


def in_days(days: int) -> str:
    return (date.today() + timedelta(days=days)).isoformat()


def story(client: TestClient, product: dict, **params: object) -> dict:
    response = client.get(f"{API}/products/{product['id']}/story", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def events(result: dict) -> list[dict]:
    return [event for day in result["days"] for event in day["events"]]


def make_product(client: TestClient, name: str = "Milk", **overrides: object) -> dict:
    body = {"name": name, "purchase_price": "1.00", "sale_price": "2.00", **overrides}
    response = client.post(f"{API}/products", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def receive(client: TestClient, product: dict, quantity: str, **extra: object) -> dict:
    body = {"product_id": product["id"], "quantity": quantity, **extra}
    response = client.post(f"{API}/batches", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def sell(client: TestClient, product: dict, quantity: str) -> dict:
    body = {"items": [{"product_id": product["id"], "quantity": quantity}]}
    response = client.post(f"{API}/sales", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def mark(db: Session) -> tuple[int, int]:
    """The newest movement and delivery so far, to move only what comes after them."""
    newest_movement = db.scalar(select(func.max(InventoryMovement.id))) or 0
    newest_delivery = db.scalar(select(func.max(Delivery.id))) or 0
    return newest_movement, newest_delivery


def move_to(db: Session, days_ago: int, after: tuple[int, int] = (0, 0)) -> None:
    """Puts what happened after `after` on that day, at noon."""
    db.flush()
    db.execute(
        update(InventoryMovement)
        .where(InventoryMovement.id > after[0])
        .values(occurred_at=on_day(days_ago))
    )
    db.execute(update(Delivery).where(Delivery.id > after[1]).values(created_at=on_day(days_ago)))
    db.flush()


def supplier(client: TestClient, **extra: object) -> dict:
    response = client.post(f"{API}/suppliers", json={"name": "Ферма Слънце", **extra})
    assert response.status_code == 201, response.text
    return response.json()


def order(client: TestClient, by: dict, product: dict, quantity: str, **extra: object) -> dict:
    body = {
        "supplier_id": by["id"],
        "items": [{"product_id": product["id"], "quantity": quantity}],
        **extra,
    }
    response = client.post(f"{API}/deliveries", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def test_a_product_must_exist_in_this_store(client: TestClient, db: Session, owner: User) -> None:
    assert client.get(f"{API}/products/999999/story").status_code == 404
    milk = make_product(client)
    # A client of its own: the logged-in one would carry the session cookie along.
    with TestClient(app) as stranger:
        assert stranger.get(f"{API}/products/{milk['id']}/story").status_code == 401

    other = Store(name="Someone else's store")
    db.add(other)
    db.flush()
    owner.store_id = other.id
    db.commit()
    assert client.get(f"{API}/products/{milk['id']}/story").status_code == 404


def test_a_new_product_has_an_empty_story(client: TestClient) -> None:
    milk = make_product(client)
    # What happens to another product is that product's story.
    bread = make_product(client, "Bread")
    receive(client, bread, "5")
    sell(client, bread, "1")
    assert story(client, milk) == {
        "days": [],
        "earlier": None,
        "attention": {"expired": [], "late": []},
    }


def test_goods_written_off_and_corrected_are_told_with_who_and_why(client: TestClient) -> None:
    milk = make_product(client)
    batch = receive(client, milk, "10", expiry_date=in_days(5), lot_code="L-7")
    client.post(f"{API}/batches/{batch['id']}/waste", json={"quantity": "2", "reason": "damaged"})
    client.post(
        f"{API}/batches/{batch['id']}/adjustments",
        json={"quantity_delta": "-1", "reason": "Found broken"},
    )

    by_kind = {event["kind"]: event for event in events(story(client, milk))}
    received = by_kind["received"]
    assert (Decimal(received["quantity"]), received["expiry_date"], received["lot_code"]) == (
        10,
        in_days(5),
        "L-7",
    )
    assert (received["actor"], received["supplier"]) == ("Test Owner", None)
    assert (Decimal(by_kind["written_off"]["quantity"]), by_kind["written_off"]["reason"]) == (
        2,
        "damaged",
    )
    # A correction keeps its direction: minus means fewer than the system thought.
    assert (Decimal(by_kind["corrected"]["quantity"]), by_kind["corrected"]["reason"]) == (
        -1,
        "Found broken",
    )


def test_sales_are_added_up_per_day_and_a_sale_counts_once(client: TestClient, db: Session) -> None:
    milk = make_product(client)
    receive(client, milk, "2", expiry_date=in_days(2))
    receive(client, milk, "20", expiry_date=in_days(9))
    sell(client, milk, "1")
    sell(client, milk, "3")  # takes the last 1 of the first batch and 2 of the second
    move_to(db, 1)
    sell(client, milk, "2")

    result = story(client, milk)
    today, yesterday = result["days"]
    [sold_today] = [e for e in today["events"] if e["kind"] == "sold"]
    [sold_yesterday] = [e for e in yesterday["events"] if e["kind"] == "sold"]
    assert (Decimal(sold_today["quantity"]), sold_today["sales"]) == (2, 1)
    assert (Decimal(sold_yesterday["quantity"]), sold_yesterday["sales"]) == (4, 2)


def test_a_delivery_is_told_when_ordered_and_when_it_arrives(
    client: TestClient, db: Session
) -> None:
    milk = make_product(client)
    farm = supplier(client)
    delivery = order(client, farm, milk, "12", expected_on=in_days(1))
    move_to(db, 3)
    item = delivery["items"][0]
    response = client.post(
        f"{API}/deliveries/{delivery['id']}/receive",
        json={"items": [{"item_id": item["id"], "quantity": "12"}]},
    )
    assert response.status_code == 200, response.text

    result = story(client, milk)
    arrived_day, ordered_day = result["days"]
    assert ordered_day["day"] == (date.today() - timedelta(days=3)).isoformat()
    [ordered] = ordered_day["events"]
    assert (ordered["kind"], Decimal(ordered["quantity"]), ordered["supplier"]) == (
        "ordered",
        12,
        "Ферма Слънце",
    )
    # It already arrived, and the order says so.
    assert (ordered["expected_on"], ordered["status"]) == (in_days(1), "received")
    [received] = arrived_day["events"]
    assert (received["kind"], received["supplier"], received["delivery_id"]) == (
        "received",
        "Ферма Слънце",
        delivery["id"],
    )


def test_the_newest_day_and_the_newest_event_come_first(client: TestClient, db: Session) -> None:
    milk = make_product(client)
    batch = receive(client, milk, "10")
    move_to(db, 2)
    before_waste = mark(db)
    client.post(f"{API}/batches/{batch['id']}/waste", json={"quantity": "1", "reason": "other"})
    before_sale = mark(db)
    sell(client, milk, "1")
    # Within one test everything shares a transaction, and so the same clock: set the times.
    morning = datetime.combine(date.today(), time(8)).astimezone()
    db.execute(
        update(InventoryMovement)
        .where(InventoryMovement.id > before_waste[0], InventoryMovement.id <= before_sale[0])
        .values(occurred_at=morning)
    )
    db.execute(
        update(InventoryMovement)
        .where(InventoryMovement.id > before_sale[0])
        .values(occurred_at=morning + timedelta(hours=1))
    )
    db.flush()

    result = story(client, milk)
    assert [day["day"] for day in result["days"]] == [
        date.today().isoformat(),
        (date.today() - timedelta(days=2)).isoformat(),
    ]
    assert [event["kind"] for event in result["days"][0]["events"]] == ["sold", "written_off"]


def test_earlier_jumps_over_empty_days_and_ends(client: TestClient, db: Session) -> None:
    milk = make_product(client)
    receive(client, milk, "10")
    move_to(db, 100)
    second = mark(db)
    receive(client, milk, "10")
    move_to(db, 40, after=second)
    third = mark(db)
    receive(client, milk, "10")
    move_to(db, 1, after=third)

    first = story(client, milk, days=30)
    assert [day["day"] for day in first["days"]] == [(date.today() - timedelta(days=1)).isoformat()]
    assert first["earlier"] == (date.today() - timedelta(days=40)).isoformat()

    page_two = story(client, milk, until=first["earlier"], days=30)
    assert [day["day"] for day in page_two["days"]] == [first["earlier"]]
    assert page_two["earlier"] == (date.today() - timedelta(days=100)).isoformat()

    page_three = story(client, milk, until=page_two["earlier"], days=30)
    assert len(page_three["days"]) == 1
    assert page_three["earlier"] is None


def test_what_needs_doing_now_is_listed_whatever_stretch_is_shown(
    client: TestClient, db: Session
) -> None:
    milk = make_product(client)
    old = receive(client, milk, "6", expiry_date=in_days(1))
    cleared = receive(client, milk, "2", expiry_date=in_days(1))
    db.get(Batch, old["id"]).expiry_date = date.today() - timedelta(days=1)
    db.get(Batch, cleared["id"]).expiry_date = date.today() - timedelta(days=2)
    db.flush()
    client.post(f"{API}/batches/{cleared['id']}/waste", json={"quantity": "2", "reason": "expired"})
    farm = supplier(client, phone="+359 2 000 0003")
    late = order(client, farm, milk, "10", expected_on=in_days(1))
    db.get(Delivery, late["id"]).expected_on = date.today() - timedelta(days=1)
    db.flush()
    order(client, farm, milk, "5", expected_on=in_days(3))  # on time
    receive(client, milk, "3", expiry_date=in_days(0))  # its last day is today: still good
    arrived = order(client, farm, milk, "4", expected_on=in_days(1))
    item = arrived["items"][0]
    client.post(
        f"{API}/deliveries/{arrived['id']}/receive",
        json={"items": [{"item_id": item["id"], "quantity": "4"}]},
    )
    db.get(Delivery, arrived["id"]).expected_on = date.today() - timedelta(days=2)
    db.flush()  # came, even though later than expected: not late any more

    attention = story(client, milk, until=in_days(-200))["attention"]
    assert attention["expired"] == [
        {"batch_id": old["id"], "quantity": "6.000", "expiry_date": in_days(-1)}
    ]
    assert attention["late"] == [
        {
            "delivery_id": late["id"],
            "supplier": "Ферма Слънце",
            "phone": "+359 2 000 0003",
            "expected_on": in_days(-1),
        }
    ]


def test_the_stretch_must_be_reasonable(client: TestClient) -> None:
    milk = make_product(client)
    url = f"{API}/products/{milk['id']}/story"
    assert client.get(url, params={"days": 6}).status_code == 422
    assert client.get(url, params={"days": 91}).status_code == 422
