"""API tests for /api/v1/products: they send real HTTP requests to the app and a test database."""

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.product import Product
from app.models.store import Store

URL = "/api/v1/products"
MILK = {
    "name": "Fresh milk 1 l",
    "brand": "Test Dairy",
    "barcode": "2000000000015",
    "category": "Dairy",
    "purchase_price": "1.10",
    "sale_price": "1.59",
}


def create(client: TestClient, **overrides: object) -> dict:
    response = client.post(URL, json={**MILK, **overrides})
    assert response.status_code == 201, response.text
    return response.json()


def test_health_reports_database_ok(client: TestClient) -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


def test_create_product_returns_it_with_defaults(client: TestClient) -> None:
    product = create(client)
    assert product["id"] > 0
    assert product["name"] == "Fresh milk 1 l"
    assert product["unit"] == "pcs"
    assert product["active"] is True
    assert product["sale_price"] == "1.59"


def test_created_product_can_be_read_by_id_and_barcode(client: TestClient) -> None:
    product = create(client)
    assert client.get(f"{URL}/{product['id']}").json()["name"] == product["name"]
    assert client.get(f"{URL}/by-barcode/2000000000015").json()["id"] == product["id"]


def test_product_without_barcode_is_allowed(client: TestClient) -> None:
    first = create(client, name="Bananas", barcode=None, unit="kg")
    second = create(client, name="Tomatoes", barcode="", unit="kg")
    assert first["barcode"] is None
    assert second["barcode"] is None  # an empty string is stored as "no barcode"


def test_unknown_product_returns_404(client: TestClient) -> None:
    assert client.get(f"{URL}/999999").status_code == 404
    response = client.get(f"{URL}/by-barcode/4006381333931")
    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


def test_invalid_barcode_is_rejected(client: TestClient) -> None:
    response = client.post(URL, json={**MILK, "barcode": "2000000000016"})
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "validation_error"
    assert body["detail"].startswith("Barcode must be")  # readable, without Pydantic's prefix
    assert body["errors"][0]["loc"] == ["body", "barcode"]  # lets forms mark the right field


def test_duplicate_barcode_returns_409(client: TestClient) -> None:
    create(client)
    response = client.post(URL, json={**MILK, "name": "Another product"})
    assert response.status_code == 409
    assert response.json()["code"] == "conflict"


def test_negative_price_and_empty_name_are_rejected(client: TestClient) -> None:
    assert client.post(URL, json={**MILK, "sale_price": "-1"}).status_code == 422
    assert client.post(URL, json={**MILK, "name": "   "}).status_code == 422


def test_list_supports_search_and_pagination(client: TestClient) -> None:
    create(client, name="Fresh milk", barcode="2000000000015")
    create(client, name="Yogurt", barcode="2000000000022")
    create(client, name="Chocolate milk", barcode="2000000000039")

    found = client.get(URL, params={"search": "milk"}).json()
    assert found["total"] == 2
    assert [item["name"] for item in found["items"]] == ["Chocolate milk", "Fresh milk"]

    by_barcode_prefix = client.get(URL, params={"search": "200000000002"}).json()
    assert [item["name"] for item in by_barcode_prefix["items"]] == ["Yogurt"]

    page = client.get(URL, params={"limit": 2, "offset": 2}).json()
    assert page["total"] == 3
    assert len(page["items"]) == 1


def test_patch_changes_only_sent_fields(client: TestClient) -> None:
    product = create(client)
    response = client.patch(f"{URL}/{product['id']}", json={"sale_price": "1.79"})
    assert response.status_code == 200
    updated = response.json()
    assert updated["sale_price"] == "1.79"
    assert updated["name"] == product["name"]
    assert updated["barcode"] == product["barcode"]


def test_patch_rejects_null_for_required_field(client: TestClient) -> None:
    product = create(client)
    response = client.patch(f"{URL}/{product['id']}", json={"name": None})
    assert response.status_code == 422


def test_patch_to_a_used_barcode_returns_409(client: TestClient) -> None:
    create(client)
    other = create(client, name="Yogurt", barcode="2000000000022")
    response = client.patch(f"{URL}/{other['id']}", json={"barcode": "2000000000015"})
    assert response.status_code == 409


def test_archived_products_are_hidden_by_default(client: TestClient) -> None:
    product = create(client)
    client.patch(f"{URL}/{product['id']}", json={"active": False})

    assert client.get(URL).json()["total"] == 0
    archived = client.get(URL, params={"status": "archived"}).json()
    assert [item["id"] for item in archived["items"]] == [product["id"]]


def test_status_all_lists_active_and_archived(client: TestClient) -> None:
    active = create(client, name="Active one", barcode="2000000000022")
    archived = create(client, name="Archived one", barcode="2000000000039")
    client.patch(f"{URL}/{archived['id']}", json={"active": False})

    listed = client.get(URL, params={"status": "all"}).json()
    assert {item["id"] for item in listed["items"]} == {active["id"], archived["id"]}
    assert client.get(URL, params={"status": "deleted"}).status_code == 422


def test_other_store_data_is_never_visible(client: TestClient, db: Session) -> None:
    other_store = Store(name="Someone else's store")
    db.add(other_store)
    db.flush()
    foreign = Product(
        store_id=other_store.id,
        name="Foreign product",
        barcode="2000000000046",
        purchase_price=1,
        sale_price=2,
    )
    db.add(foreign)
    db.flush()

    assert client.get(URL).json()["total"] == 0
    assert client.get(f"{URL}/{foreign.id}").status_code == 404
    assert client.get(f"{URL}/by-barcode/2000000000046").status_code == 404
    assert client.patch(f"{URL}/{foreign.id}", json={"name": "Hacked"}).status_code == 404
    # The same barcode is free to use in our own store.
    create(client, barcode="2000000000046")


def test_list_is_alphabetical_for_cyrillic_names(client: TestClient) -> None:
    names = ["Сирене", "Бял хляб", "Яйца", "Айрян", "Кисело мляко", "Банани", "Apple juice"]
    for name in names:
        create(client, name=name, barcode=None)
    listed = [item["name"] for item in client.get(URL).json()["items"]]
    expected = ["Apple juice", "Айрян", "Банани", "Бял хляб", "Кисело мляко", "Сирене", "Яйца"]
    assert listed == expected


def test_categories_lists_each_one_once_in_alphabetical_order(client: TestClient) -> None:
    for name, category in [("A", "Хляб"), ("B", "Млечни"), ("C", "Млечни"), ("D", None)]:
        create(client, name=name, barcode=None, category=category)
    assert client.get(f"{URL}/categories").json() == ["Млечни", "Хляб"]


def test_category_keeps_the_first_spelling_in_the_store(client: TestClient) -> None:
    create(client, name="First", barcode=None, category="Млечни")
    second = create(client, name="Second", barcode=None, category="  млечни ")
    assert second["category"] == "Млечни"
    assert client.get(f"{URL}/categories").json() == ["Млечни"]


def test_patch_also_keeps_the_first_spelling(client: TestClient) -> None:
    create(client, name="First", barcode=None, category="Млечни")
    other = create(client, name="Second", barcode=None, category="Хляб")
    response = client.patch(f"{URL}/{other['id']}", json={"category": "МЛЕЧНИ"})
    assert response.json()["category"] == "Млечни"


def test_category_extra_spaces_are_removed(client: TestClient) -> None:
    product = create(client, name="First", barcode=None, category="Плодове   и  зеленчуци")
    assert product["category"] == "Плодове и зеленчуци"


def test_blank_category_is_stored_as_none(client: TestClient) -> None:
    assert create(client, name="First", barcode=None, category="   ")["category"] is None


def test_too_long_category_is_a_clear_error_not_a_crash(client: TestClient) -> None:
    response = client.post(URL, json={**MILK, "category": "к" * 81})
    assert response.status_code == 422
    assert response.json()["errors"][0]["loc"] == ["body", "category"]


def test_categories_of_other_stores_stay_separate(client: TestClient, db: Session) -> None:
    other_store = Store(name="Someone else's store")
    db.add(other_store)
    db.flush()
    db.add(Product(store_id=other_store.id, name="Foreign", category="Secret", purchase_price=1,
                   sale_price=2))
    db.flush()

    assert client.get(f"{URL}/categories").json() == []
    # Another store's spelling is not reused either.
    assert create(client, barcode=None, category="secret")["category"] == "secret"
