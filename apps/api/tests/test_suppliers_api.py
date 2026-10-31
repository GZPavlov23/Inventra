"""API tests for /api/v1/suppliers and for the supplier of a product."""

from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.product import Product
from app.models.store import Store
from app.models.supplier import Supplier

URL = "/api/v1/suppliers"
PRODUCTS = "/api/v1/products"
DAIRY = {
    "name": "Зелена долина",
    "contact_name": "Мария",
    "phone": "+359 2 000 0001",
    "email": "orders@dairy.example",
    "notes": "Orders by Tuesday",
}
MILK = {"name": "Milk", "purchase_price": "1.10", "sale_price": "1.59"}


def create(client: TestClient, **overrides: object) -> dict:
    response = client.post(URL, json={**DAIRY, **overrides})
    assert response.status_code == 201, response.text
    return response.json()


def create_product(client: TestClient, **overrides: object) -> dict:
    response = client.post(PRODUCTS, json={**MILK, **overrides})
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture
def other_store_supplier(db: Session) -> Supplier:
    other = Store(name="Other store")
    db.add(other)
    db.flush()
    supplier = Supplier(store_id=other.id, name="Foreign")
    db.add(supplier)
    db.flush()
    return supplier


def test_create_returns_the_supplier_with_defaults(client: TestClient) -> None:
    supplier = create(client)
    assert supplier["name"] == "Зелена долина"
    assert supplier["active"] is True
    assert supplier["product_count"] == 0
    assert client.get(f"{URL}/{supplier['id']}").json() == supplier


def test_only_the_name_is_required(client: TestClient) -> None:
    response = client.post(URL, json={"name": "Bakery", "phone": "", "email": "", "notes": " "})
    assert response.status_code == 201, response.text
    body = response.json()
    assert (body["phone"], body["email"], body["notes"]) == (None, None, None)


@pytest.mark.parametrize(
    "change",
    [{"name": "   "}, {"email": "not-an-email"}, {"phone": "call me"}, {"notes": "x" * 501}],
)
def test_invalid_details_are_rejected(client: TestClient, change: dict) -> None:
    assert client.post(URL, json={**DAIRY, **change}).status_code == 422


@pytest.mark.parametrize("name", ["Зелена долина", "ЗЕЛЕНА ДОЛИНА", "зелена долина"])
def test_a_name_can_be_used_only_once_whatever_the_case(client: TestClient, name: str) -> None:
    create(client)
    response = client.post(URL, json={**DAIRY, "name": name})
    assert response.status_code == 409
    assert response.json()["code"] == "conflict"


def test_the_database_itself_refuses_a_twin(db: Session, store: Store) -> None:
    db.add(Supplier(store_id=store.id, name="Зелена долина"))
    db.flush()
    with pytest.raises(IntegrityError, match="uq_suppliers_store_id_lower_name"), db.begin_nested():
        db.add(Supplier(store_id=store.id, name="зелена долина"))
        db.flush()


def test_two_stores_can_use_the_same_name(
    client: TestClient, other_store_supplier: Supplier
) -> None:
    assert create(client, name=other_store_supplier.name)["name"] == "Foreign"


def test_an_archived_name_is_not_free_and_the_message_says_where_it_is(client: TestClient) -> None:
    supplier = create(client)
    client.patch(f"{URL}/{supplier['id']}", json={"active": False})

    response = client.post(URL, json=DAIRY)

    assert response.status_code == 409
    assert "archived" in response.json()["detail"]


def test_list_is_alphabetical_with_search_and_pagination(client: TestClient) -> None:
    create(client, name="Яна")
    create(client, name="Борис", contact_name="Петър")
    create(client, name="Ангел", contact_name=None)

    names = [item["name"] for item in client.get(URL).json()["items"]]
    assert names == ["Ангел", "Борис", "Яна"]

    by_contact = client.get(URL, params={"search": "петър"}).json()
    assert [item["name"] for item in by_contact["items"]] == ["Борис"]

    page = client.get(URL, params={"limit": 1, "offset": 1}).json()
    assert page["total"] == 3
    assert [item["name"] for item in page["items"]] == ["Борис"]


def test_status_filter_separates_archived_suppliers(client: TestClient) -> None:
    keep = create(client, name="Keep")
    gone = create(client, name="Gone")
    client.patch(f"{URL}/{gone['id']}", json={"active": False})

    def names(status: str) -> list[str]:
        return [i["name"] for i in client.get(URL, params={"status": status}).json()["items"]]

    assert names("active") == [keep["name"]]
    assert names("archived") == [gone["name"]]
    assert names("all") == ["Gone", "Keep"]


def test_update_changes_only_what_was_sent(client: TestClient) -> None:
    supplier = create(client)
    response = client.patch(f"{URL}/{supplier['id']}", json={"phone": "02 000 0009"})
    assert response.status_code == 200
    assert response.json()["phone"] == "02 000 0009"
    assert response.json()["contact_name"] == DAIRY["contact_name"]


def test_contact_details_can_be_cleared_but_the_name_cannot(client: TestClient) -> None:
    supplier = create(client)
    url = f"{URL}/{supplier['id']}"
    assert client.patch(url, json={"email": None}).json()["email"] is None
    assert client.patch(url, json={"email": ""}).json()["email"] is None
    assert client.patch(url, json={"name": None}).status_code == 422
    assert client.patch(url, json={"active": None}).status_code == 422


def test_renaming_checks_the_new_name_but_allows_changing_the_case(client: TestClient) -> None:
    create(client, name="Taken")
    supplier = create(client, name="Mine")
    url = f"{URL}/{supplier['id']}"

    assert client.patch(url, json={"name": "taken"}).status_code == 409
    assert client.patch(url, json={"name": "MINE"}).json()["name"] == "MINE"


def test_another_stores_supplier_looks_like_it_does_not_exist(
    client: TestClient, other_store_supplier: Supplier
) -> None:
    url = f"{URL}/{other_store_supplier.id}"
    assert client.get(url).status_code == 404
    assert client.patch(url, json={"name": "Stolen"}).status_code == 404
    assert client.get(URL).json()["total"] == 0


def test_suppliers_require_login(anon_client: TestClient) -> None:
    assert anon_client.get(URL).status_code == 401
    assert anon_client.post(URL, json=DAIRY).status_code == 401


# The supplier of a product


def test_a_product_shows_its_supplier(client: TestClient) -> None:
    supplier = create(client)
    product = create_product(client, supplier_id=supplier["id"])
    expected = {"id": supplier["id"], "name": supplier["name"], "active": True}
    assert product["supplier"] == expected
    assert client.get(PRODUCTS).json()["items"][0]["supplier"] == expected


def test_a_product_does_not_need_a_supplier(client: TestClient) -> None:
    assert create_product(client)["supplier"] is None


def test_the_supplier_can_be_changed_and_removed(client: TestClient) -> None:
    first = create(client, name="First")
    second = create(client, name="Second")
    product = create_product(client, supplier_id=first["id"])
    url = f"{PRODUCTS}/{product['id']}"

    moved = client.patch(url, json={"supplier_id": second["id"]}).json()
    assert moved["supplier"]["id"] == second["id"]
    assert client.patch(url, json={"supplier_id": None}).json()["supplier"] is None


def test_an_edit_of_something_else_keeps_the_supplier(client: TestClient) -> None:
    supplier = create(client)
    product = create_product(client, supplier_id=supplier["id"])
    edited = client.patch(f"{PRODUCTS}/{product['id']}", json={"name": "Renamed"}).json()
    assert edited["supplier"]["id"] == supplier["id"]


def test_a_rename_shows_on_the_products(client: TestClient) -> None:
    supplier = create(client)
    product = create_product(client, supplier_id=supplier["id"])
    client.patch(f"{URL}/{supplier['id']}", json={"name": "New name"})
    assert client.get(f"{PRODUCTS}/{product['id']}").json()["supplier"]["name"] == "New name"


def test_a_product_cannot_use_another_stores_supplier(
    client: TestClient, other_store_supplier: Supplier
) -> None:
    body = {**MILK, "supplier_id": other_store_supplier.id}
    assert client.post(PRODUCTS, json=body).status_code == 404

    product = create_product(client)
    change = {"supplier_id": other_store_supplier.id}
    assert client.patch(f"{PRODUCTS}/{product['id']}", json=change).status_code == 404


def test_an_archived_supplier_cannot_be_picked_but_stays_on_its_products(
    client: TestClient,
) -> None:
    supplier = create(client)
    product = create_product(client, supplier_id=supplier["id"])
    client.patch(f"{URL}/{supplier['id']}", json={"active": False})

    refused = client.post(PRODUCTS, json={**MILK, "supplier_id": supplier["id"]})
    assert refused.status_code == 409
    assert refused.json()["code"] == "supplier_archived"

    other = create_product(client, name="Other")
    change = {"supplier_id": supplier["id"]}
    assert client.patch(f"{PRODUCTS}/{other['id']}", json=change).status_code == 409

    # Saving a product that already has it must keep working.
    kept = client.patch(f"{PRODUCTS}/{product['id']}", json={"name": "Milk 2", **change})
    assert kept.status_code == 200
    assert kept.json()["supplier"]["active"] is False


def test_product_count_counts_active_products_only(client: TestClient) -> None:
    supplier = create(client)
    create_product(client, supplier_id=supplier["id"])
    archived = create_product(client, name="Old", supplier_id=supplier["id"])
    client.patch(f"{PRODUCTS}/{archived['id']}", json={"active": False})

    assert client.get(f"{URL}/{supplier['id']}").json()["product_count"] == 1


def test_removing_a_supplier_leaves_its_products_without_one(
    client: TestClient, db: Session
) -> None:
    supplier = create(client)
    product = create_product(client, supplier_id=supplier["id"])

    db.execute(delete(Supplier).where(Supplier.id == supplier["id"]))

    assert client.get(f"{PRODUCTS}/{product['id']}").json()["supplier"] is None


def test_a_store_with_suppliers_can_still_be_deleted(db: Session, store: Store) -> None:
    supplier = Supplier(store_id=store.id, name="Dairy")
    db.add(supplier)
    db.flush()
    db.add(
        Product(
            store_id=store.id,
            supplier_id=supplier.id,
            name="Milk",
            purchase_price=Decimal(1),
            sale_price=Decimal(2),
        )
    )
    db.flush()

    db.execute(delete(Store).where(Store.id == store.id))

    assert db.scalars(select(Supplier)).first() is None
    assert db.scalars(select(Product)).first() is None
