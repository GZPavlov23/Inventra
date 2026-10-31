"""API tests for /api/v1/forecasts, with history brought in through the real CSV import."""

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Batch, Sale, Store, User

URL = "/api/v1/forecasts"
PRODUCTS_URL = "/api/v1/products"
BATCHES_URL = "/api/v1/batches"
SALES_URL = "/api/v1/sales"
IMPORT_URL = "/api/v1/imports/sales"
SEASONAL = "Same weekday, last 4 weeks"
RECENT = "Average of the last 7 days"


def ago(days: int) -> date:
    return date.today() - timedelta(days=days)


def make_product(client: TestClient, name: str = "Milk", **overrides: object) -> dict:
    payload = {"name": name, "purchase_price": "1.00", "sale_price": "2.00", **overrides}
    response = client.post(PRODUCTS_URL, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def history(client: TestClient, product: dict, quantity_of_day) -> None:
    """Imports old sales: `quantity_of_day` gets the day and says how much sold, or 0."""
    rows = ["date;product;quantity"]
    for days in range(60, 0, -1):
        quantity = quantity_of_day(ago(days))
        if quantity:
            rows.append(f"{ago(days).isoformat()};{product['name']};{quantity}")
    response = client.post(
        IMPORT_URL, json={"mode": "history", "content": "\n".join(rows), "dry_run": False}
    )
    assert response.json()["applied"] is True, response.text


def receive(client: TestClient, product: dict, quantity: str, **extra: object) -> dict:
    payload = {"product_id": product["id"], "quantity": quantity, **extra}
    response = client.post(BATCHES_URL, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def forecast(client: TestClient, **params: object) -> dict:
    response = client.get(URL, params=params)
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.parametrize("path", ["", "/accuracy"])
def test_requires_login(anon_client: TestClient, path: str) -> None:
    assert anon_client.get(f"{URL}{path}").status_code == 401


def test_a_store_without_history_gets_an_empty_answer(client: TestClient) -> None:
    make_product(client)
    report = forecast(client)
    assert report["items"] == []
    assert report["not_enough_history"] == 0

    accuracy = client.get(f"{URL}/accuracy").json()
    assert accuracy["chosen"] == SEASONAL
    assert [model["weekly_wape"] for model in accuracy["models"]] == [None, None]


@pytest.mark.parametrize("horizon", [0, 15])
def test_horizon_must_make_sense(client: TestClient, horizon: int) -> None:
    assert client.get(URL, params={"horizon": horizon}).status_code == 422


def test_forecast_has_a_number_for_every_day(client: TestClient) -> None:
    milk = make_product(client)
    history(client, milk, lambda _day: 3)

    [item] = forecast(client, horizon=5)["items"]

    assert item["product"]["name"] == "Milk"
    assert [day["day"] for day in item["days"]] == [ago(-n).isoformat() for n in range(5)]
    assert [Decimal(day["quantity"]) for day in item["days"]] == [3] * 5
    assert Decimal(item["total"]) == 15
    assert item["history_days"] == 60


def test_shortage_compares_the_forecast_with_stock_that_can_be_sold(
    client: TestClient, db: Session
) -> None:
    milk = make_product(client)
    history(client, milk, lambda _day: 2)
    receive(client, milk, "5")
    old = receive(client, milk, "100", expiry_date=ago(-1).isoformat())
    db.get(Batch, old["id"]).expiry_date = ago(1)
    db.flush()

    [item] = forecast(client)["items"]

    assert Decimal(item["stock"]) == 5  # the expired 100 don't count
    assert Decimal(item["total"]) == 14
    assert Decimal(item["shortage"]) == 9


def test_no_shortage_when_the_stock_is_enough(client: TestClient) -> None:
    milk = make_product(client)
    history(client, milk, lambda _day: 1)
    receive(client, milk, "50")
    assert Decimal(forecast(client)["items"][0]["shortage"]) == 0


def test_the_biggest_shortage_comes_first(client: TestClient) -> None:
    stocked = make_product(client, "Alpha with stock")
    small = make_product(client, "Middle shortage")
    big = make_product(client, "Zulu biggest shortage")
    history(client, stocked, lambda _day: 9)
    history(client, small, lambda _day: 1)
    history(client, big, lambda _day: 5)
    receive(client, stocked, "1000")

    names = [item["product"]["name"] for item in forecast(client)["items"]]
    assert names == ["Zulu biggest shortage", "Middle shortage", "Alpha with stock"]


def test_too_little_history_is_counted_but_not_guessed(client: TestClient) -> None:
    make_product(client, "Young")
    response = client.post(
        IMPORT_URL,
        json={
            "mode": "history",
            "content": f"date;product;quantity\n{ago(13).isoformat()};Young;5",
            "dry_run": False,
        },
    )
    assert response.json()["applied"] is True

    report = forecast(client)
    assert report["items"] == []
    assert report["not_enough_history"] == 1


def test_days_without_sales_count_as_zero(client: TestClient) -> None:
    milk = make_product(client)
    # Sold only on the first of the 60 days: the store knows the rest were days without sales.
    history(client, milk, lambda day: 7 if day == ago(60) else 0)
    assert Decimal(forecast(client)["items"][0]["total"]) == 0


def test_archived_products_are_left_out(client: TestClient) -> None:
    milk = make_product(client)
    history(client, milk, lambda _day: 2)
    client.patch(f"{PRODUCTS_URL}/{milk['id']}", json={"active": False})
    assert forecast(client)["items"] == []


def test_real_sales_beat_the_history_of_the_same_day(client: TestClient, db: Session) -> None:
    milk = make_product(client)
    history(client, milk, lambda _day: 1)
    receive(client, milk, "100")
    sale = client.post(
        SALES_URL, json={"items": [{"product_id": milk["id"], "quantity": "8"}]}
    ).json()
    db.get(Sale, sale["id"]).sold_at = datetime.now(UTC) - timedelta(days=7)
    db.flush()

    report = forecast(client, horizon=1)

    # A week ago was really 8 and not 1, and adding the two up would give other numbers.
    expected = {SEASONAL: Decimal("2.75"), RECENT: Decimal("2")}[report["method"]]
    assert Decimal(report["items"][0]["days"][0]["quantity"]) == expected


def test_todays_unfinished_sales_are_not_learned_from(client: TestClient) -> None:
    milk = make_product(client)
    history(client, milk, lambda _day: 2)
    receive(client, milk, "100")
    before = forecast(client)["items"][0]["total"]

    client.post(SALES_URL, json={"items": [{"product_id": milk["id"], "quantity": "50"}]})

    assert forecast(client)["items"][0]["total"] == before


def test_on_a_tie_the_weekday_model_is_kept(client: TestClient) -> None:
    weekly = make_product(client, "Weekly")
    history(client, weekly, lambda day: 20 if day.weekday() == 5 else 1)

    accuracy = client.get(f"{URL}/accuracy").json()
    by_method = {model["method"]: model for model in accuracy["models"]}

    # Every week sums up the same, so only the days tell the two models apart.
    assert Decimal(by_method[SEASONAL]["weekly_wape"]) == Decimal(by_method[RECENT]["weekly_wape"])
    assert Decimal(by_method[SEASONAL]["daily_wape"]) < Decimal(by_method[RECENT]["daily_wape"])
    assert accuracy["chosen"] == SEASONAL
    assert forecast(client)["method"] == SEASONAL


def test_a_trend_is_caught_better_by_the_recent_average(client: TestClient) -> None:
    growing = make_product(client, "Growing")
    history(client, growing, lambda day: 1 + (60 - (date.today() - day).days))

    accuracy = client.get(f"{URL}/accuracy").json()
    by_method = {model["method"]: model for model in accuracy["models"]}

    assert accuracy["chosen"] == RECENT
    assert forecast(client)["method"] == RECENT
    assert Decimal(by_method[RECENT]["weekly_wape"]) < Decimal(by_method[SEASONAL]["weekly_wape"])
    assert Decimal(by_method[SEASONAL]["bias"]) < 0


def test_forecast_shows_only_this_store(client: TestClient, db: Session, owner: User) -> None:
    milk = make_product(client)
    history(client, milk, lambda _day: 2)
    assert forecast(client)["items"] != []

    other = Store(name="Someone else's store")
    db.add(other)
    db.flush()
    owner.store_id = other.id
    db.commit()

    assert forecast(client)["items"] == []
    assert client.get(f"{URL}/accuracy").json()["models"][0]["days"] == 0
