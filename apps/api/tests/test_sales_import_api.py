"""API tests for POST /api/v1/imports/sales."""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import Batch, DemandDay, InventoryMovement, MovementType, Sale, Store, User

URL = "/api/v1/imports/sales"
PRODUCTS_URL = "/api/v1/products"
BATCHES_URL = "/api/v1/batches"
SALES_URL = "/api/v1/sales"
HEADER = "receipt;date;barcode;product;quantity;unit_price"
MILK_BARCODE = "2000000000015"


def in_days(days: int) -> date:
    return date.today() + timedelta(days=days)


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


@pytest.fixture
def milk(client: TestClient) -> dict:
    product = make_product(client, barcode=MILK_BARCODE)
    receive(client, product, "20")
    return product


def upload(client: TestClient, *rows: str, mode: str = "current", dry_run: bool = False) -> dict:
    content = "\n".join([HEADER, *rows])
    response = client.post(URL, json={"mode": mode, "content": content, "dry_run": dry_run})
    assert response.status_code == 200, response.text
    return response.json()


def stock(client: TestClient, product: dict) -> Decimal:
    return Decimal(client.get(f"{PRODUCTS_URL}/{product['id']}").json()["stock"])


def sales_count(client: TestClient) -> int:
    return client.get(f"{SALES_URL}/summary").json()["sales"]


def row(receipt: str = "R-1", quantity: str = "2", day: date | None = None, price: str = "") -> str:
    return f"{receipt};{(day or in_days(0)).isoformat()};{MILK_BARCODE};;{quantity};{price}"


def test_requires_login(anon_client: TestClient) -> None:
    response = anon_client.post(URL, json={"mode": "current", "content": HEADER})
    assert response.status_code == 401


def test_nothing_is_written_unless_asked_for(client: TestClient, milk: dict) -> None:
    response = client.post(URL, json={"mode": "current", "content": f"{HEADER}\n{row()}"})

    report = response.json()
    assert report["applied"] is False
    assert report["sales"] == 1
    assert report["error_count"] == 0
    assert sales_count(client) == 0
    assert stock(client, milk) == 20


def test_too_big_a_file_is_refused(client: TestClient) -> None:
    content = "x" * 10_000_001
    assert client.post(URL, json={"mode": "current", "content": content}).status_code == 422


def test_unknown_mode_is_refused(client: TestClient) -> None:
    assert client.post(URL, json={"mode": "other", "content": HEADER}).status_code == 422


# Current sales


def test_current_sales_take_stock_like_a_sale_typed_in(client: TestClient, milk: dict) -> None:
    report = upload(client, row("R-1", "2"), row("R-2", "3", price="1.50"))

    assert report["applied"] is True
    assert report["rows"] == 2
    assert report["sales"] == 2
    assert report["products"] == 1
    assert report["revenue"] == "8.50"  # 2 × 2.00 + 3 × 1.50
    assert stock(client, milk) == 15
    assert sales_count(client) == 2


def test_the_check_reports_exactly_what_the_import_does(client: TestClient, milk: dict) -> None:
    rows = [row("R-1", "2"), row("R-2", "3")]
    check = upload(client, *rows, dry_run=True)
    done = upload(client, *rows)

    assert {**check, "applied": True} == done


def test_lines_of_one_receipt_become_one_sale(client: TestClient, milk: dict) -> None:
    bread = make_product(client, "Bread")
    receive(client, bread, "5")
    today = in_days(0).isoformat()

    report = upload(client, row("R-1", "1"), f"R-1;{today};;Bread;2;")

    assert report["sales"] == 1
    [sale] = client.get(SALES_URL).json()["items"]
    assert {line["product"]["name"] for line in sale["items"]} == {"Milk", "Bread"}


def test_products_are_found_by_name_ignoring_case(client: TestClient, milk: dict) -> None:
    today = in_days(0).isoformat()
    assert upload(client, f"R-1;{today};;MILK;1;")["applied"] is True


def test_imported_sale_keeps_its_day_and_batches(
    client: TestClient, db: Session, milk: dict
) -> None:
    upload(client, row("R-1", "2", in_days(-3)))

    [sale] = client.get(SALES_URL).json()["items"]
    assert sale["sold_at"].startswith(in_days(-3).isoformat())
    assert sale["items"][0]["movements"]
    moment = db.scalar(
        select(InventoryMovement.occurred_at).where(InventoryMovement.type == MovementType.SALE)
    )
    assert moment.date() == in_days(-3)
    assert db.scalar(select(Sale.external_id)) == "R-1"


def test_goods_that_were_fresh_on_the_day_of_the_sale_can_be_imported(
    client: TestClient, db: Session
) -> None:
    product = make_product(client, barcode=MILK_BARCODE)
    batch = receive(client, product, "5", expiry_date=in_days(1).isoformat())
    db.get(Batch, batch["id"]).expiry_date = in_days(-2)
    db.commit()

    # Sold while still good.
    assert upload(client, row("R-1", "1", in_days(-3)))["applied"] is True

    # Sold after it had expired.
    report = upload(client, row("R-2", "1", in_days(-1)))
    assert report["applied"] is False
    assert "can be sold" in report["errors"][0]["message"]


def test_the_same_file_can_not_be_imported_twice(client: TestClient, milk: dict) -> None:
    first = upload(client, row("R-1", "2"))
    second = upload(client, row("R-1", "2"))

    assert first["applied"] is True
    assert second["applied"] is False
    assert second["errors"] == [{"row": 2, "message": "Receipt R-1 was already imported"}]
    assert stock(client, milk) == 18


def test_a_repeated_file_is_called_a_repeat_even_when_stock_has_run_out(
    client: TestClient, milk: dict
) -> None:
    upload(client, row("R-1", "20"))
    report = upload(client, row("R-1", "20"))
    assert report["errors"][0]["message"] == "Receipt R-1 was already imported"


def test_a_refused_receipt_leaves_nothing_for_the_next_ones(client: TestClient, milk: dict) -> None:
    bread = make_product(client, "Bread")
    receive(client, bread, "1")
    today = in_days(0).isoformat()

    # The milk of R-1 is fine and the bread is not, so R-1 must take no milk at all.
    report = upload(client, row("R-1", "20"), f"R-1;{today};;Bread;5;", row("R-2", "20"))

    assert [error["row"] for error in report["errors"]] == [2]
    assert "Bread" in report["errors"][0]["message"]


def test_one_bad_receipt_stops_the_whole_file(client: TestClient, milk: dict) -> None:
    report = upload(client, row("R-1", "2"), row("R-2", "999"), row("R-3", "1"))

    assert report["applied"] is False
    assert report["error_count"] == 1
    assert report["errors"][0]["row"] == 3
    assert "Only 18 of 'Milk' can be sold" in report["errors"][0]["message"]
    assert sales_count(client) == 0
    assert stock(client, milk) == 20


def test_every_problem_of_a_file_is_shown_at_once(client: TestClient, milk: dict) -> None:
    report = upload(
        client,
        row("R-1", "abc"),
        f"R-2;{in_days(0).isoformat()};4006381333931;;1;",
        f"R-3;{in_days(0).isoformat()};;Nothing like this;1;",
    )
    assert [error["row"] for error in report["errors"]] == [2, 3, 4]
    assert "not a quantity" in report["errors"][0]["message"]
    assert "No product with barcode" in report["errors"][1]["message"]
    assert "No product called" in report["errors"][2]["message"]


def test_stock_problems_of_several_receipts_are_all_shown(client: TestClient, milk: dict) -> None:
    report = upload(client, row("R-1", "21"), row("R-2", "25"), row("R-3", "20"))
    # R-3 still fits, because the refused receipts leave nothing behind.
    assert [error["row"] for error in report["errors"]] == [2, 3]
    assert stock(client, milk) == 20


def test_a_receipt_can_not_have_two_dates(client: TestClient, milk: dict) -> None:
    report = upload(client, row("R-1", "1", in_days(0)), row("R-1", "1", in_days(-1)))
    assert "more than one date" in report["errors"][0]["message"]


def test_half_a_piece_and_archived_products_are_refused(client: TestClient, milk: dict) -> None:
    report = upload(client, row("R-1", "1.5"))
    assert "whole pieces" in report["errors"][0]["message"]

    client.patch(f"{PRODUCTS_URL}/{milk['id']}", json={"active": False})
    report = upload(client, row("R-2", "1"))
    assert "archived" in report["errors"][0]["message"]


def test_two_products_with_one_name_need_a_barcode(client: TestClient) -> None:
    make_product(client, "Milk")
    make_product(client, "Milk")
    report = upload(client, f"R-1;{in_days(0).isoformat()};;Milk;1;")
    assert "Several products" in report["errors"][0]["message"]


def test_products_of_another_store_are_unknown(
    client: TestClient, db: Session, owner: User, milk: dict
) -> None:
    other = Store(name="Someone else's store")
    db.add(other)
    db.flush()
    owner.store_id = other.id
    db.commit()

    report = upload(client, row("R-1", "1"))
    assert "No product with barcode" in report["errors"][0]["message"]


def test_too_many_rows_of_current_sales(client: TestClient, milk: dict) -> None:
    rows = [row(f"R-{number}", "1") for number in range(5001)]
    report = upload(client, *rows, dry_run=True)
    assert "up to 5000 rows" in report["errors"][0]["message"]


def test_a_receipt_can_have_only_so_many_lines(client: TestClient, milk: dict) -> None:
    report = upload(client, *[row("R-1", "1")] * 201)
    assert "more than 200 lines" in report["errors"][0]["message"]


# History


def history(day: date, quantity: str, price: str = "") -> str:
    return f";{day.isoformat()};{MILK_BARCODE};;{quantity};{price}"


def demand(db: Session) -> list[tuple[date, Decimal, Decimal]]:
    db.expire_all()
    stmt = select(DemandDay.day, DemandDay.quantity, DemandDay.revenue).order_by(DemandDay.day)
    return [tuple(row) for row in db.execute(stmt)]


def test_history_does_not_touch_stock_or_sales(client: TestClient, db: Session, milk: dict) -> None:
    report = upload(client, history(in_days(-400), "5"), mode="history")

    assert report["applied"] is True
    assert report["sales"] == 0
    assert report["revenue"] == "10.00"
    assert stock(client, milk) == 20
    assert sales_count(client) == 0
    assert demand(db) == [(in_days(-400), Decimal("5"), Decimal("10"))]


def test_history_adds_up_each_day_of_a_product(client: TestClient, db: Session, milk: dict) -> None:
    upload(
        client,
        history(in_days(-2), "1", "1.50"),
        history(in_days(-2), "2"),
        history(in_days(-1), "4"),
        mode="history",
    )
    assert demand(db) == [
        (in_days(-2), Decimal("3"), Decimal("5.50")),
        (in_days(-1), Decimal("4"), Decimal("8")),
    ]


def test_importing_history_again_replaces_it(client: TestClient, db: Session, milk: dict) -> None:
    upload(client, history(in_days(-2), "5"), mode="history")
    upload(client, history(in_days(-2), "7"), history(in_days(-1), "1"), mode="history")

    assert [day_row[1] for day_row in demand(db)] == [Decimal("7"), Decimal("1")]


def test_checking_history_writes_nothing(client: TestClient, db: Session, milk: dict) -> None:
    report = upload(client, history(in_days(-2), "5"), mode="history", dry_run=True)
    assert report["applied"] is False
    assert report["revenue"] == "10.00"
    assert demand(db) == []


def test_history_may_include_archived_products(client: TestClient, db: Session, milk: dict) -> None:
    client.patch(f"{PRODUCTS_URL}/{milk['id']}", json={"active": False})
    assert upload(client, history(in_days(-2), "5"), mode="history")["applied"] is True


def test_history_refuses_half_a_piece(client: TestClient, milk: dict) -> None:
    report = upload(client, history(in_days(-2), "1.5"), mode="history")
    assert "whole pieces" in report["errors"][0]["message"]


def test_a_bad_row_stops_all_history(client: TestClient, db: Session, milk: dict) -> None:
    report = upload(client, history(in_days(-2), "5"), history(in_days(-1), "abc"), mode="history")
    assert report["applied"] is False
    assert demand(db) == []


def test_history_of_a_store_can_be_deleted_with_it(
    client: TestClient, db: Session, store: Store, milk: dict
) -> None:
    upload(client, history(in_days(-2), "5"), mode="history")
    db.execute(delete(Store).where(Store.id == store.id))
    assert demand(db) == []
