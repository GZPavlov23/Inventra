"""API tests for /api/v1/store/setup: the set-up list on a new store's dashboard."""

from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.models import Store, User
from app.models.demand_day import DemandDay
from app.models.user import UserRole
from tests.conftest import OWNER_PASSWORD, OWNER_PASSWORD_HASH

API = "/api/v1"
URL = f"{API}/store/setup"
NOTHING_YET = {
    "products": False,
    "goods": False,
    "sales": False,
    "suppliers": False,
    "team": False,
    "done": False,
}


def setup(client: TestClient) -> dict:
    response = client.get(URL)
    assert response.status_code == 200, response.text
    return response.json()


def add_product(client: TestClient) -> dict:
    body = {"name": "Milk", "purchase_price": "1.00", "sale_price": "2.00"}
    response = client.post(f"{API}/products", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def receive(client: TestClient, product: dict) -> None:
    response = client.post(f"{API}/batches", json={"product_id": product["id"], "quantity": "10"})
    assert response.status_code == 201, response.text


def sell(client: TestClient, product: dict) -> None:
    body = {"items": [{"product_id": product["id"], "quantity": "1"}]}
    response = client.post(f"{API}/sales", json=body)
    assert response.status_code == 201, response.text


@pytest.fixture
def client_as(db: Session, store: Store) -> Iterator:
    """A logged-in person of the test store with the given role, in a client of their own."""
    clients: list[TestClient] = []

    def log_in(role: UserRole, store_id: int | None = None) -> TestClient:
        email = f"{role.value}-{len(clients)}@setup.example"
        db.add(
            User(
                store_id=store_id or store.id,
                email=email,
                password_hash=OWNER_PASSWORD_HASH,
                full_name=f"Test {role.value}",
                role=role,
                email_verified_at=datetime.now(UTC),
            )
        )
        db.flush()
        client = TestClient(app)
        clients.append(client)
        credentials = {"email": email, "password": OWNER_PASSWORD}
        response = client.post(f"{API}/auth/login", json=credentials)
        assert response.status_code == 200, response.text
        return client

    yield log_in
    for client in clients:
        client.close()


def test_a_new_store_has_done_nothing_yet(client: TestClient) -> None:
    assert setup(client) == NOTHING_YET


def test_each_step_is_ticked_off_by_doing_it(client: TestClient) -> None:
    milk = add_product(client)
    assert setup(client) == {**NOTHING_YET, "products": True}

    receive(client, milk)
    assert setup(client) == {**NOTHING_YET, "products": True, "goods": True}

    sell(client, milk)
    response = client.post(
        f"{API}/suppliers", json={"name": "Зелена долина", "phone": "+359 2 000 0001"}
    )
    assert response.status_code == 201, response.text
    body = {"email": "ivan@test-store.example", "full_name": "Ivan Petrov", "role": "staff"}
    assert client.post(f"{API}/team/invitations", json=body).status_code == 201

    assert setup(client) == {
        "products": True,
        "goods": True,
        "sales": True,
        "suppliers": True,
        "team": True,
        "done": True,
    }


def test_imported_history_counts_as_sales(client: TestClient, db: Session, owner: User) -> None:
    milk = add_product(client)
    db.add(
        DemandDay(
            store_id=owner.store_id,
            product_id=milk["id"],
            day=date.today() - timedelta(days=3),
            quantity=Decimal(4),
            revenue=Decimal("8.00"),
        )
    )
    db.flush()
    assert setup(client)["sales"] is True


def test_a_manager_has_no_team_step_and_is_done_without_it(client: TestClient, client_as) -> None:
    milk = add_product(client)
    receive(client, milk)
    sell(client, milk)
    client.post(f"{API}/suppliers", json={"name": "Зелена долина", "phone": "+359 2 000 0001"})

    # The manager is a colleague, so for the owner the team step is done as well.
    manager = client_as(UserRole.MANAGER)
    assert setup(manager) == {
        "products": True,
        "goods": True,
        "sales": True,
        "suppliers": True,
        "team": None,
        "done": True,
    }
    assert setup(client)["done"] is True


def test_the_owner_is_not_done_until_someone_else_joins(client: TestClient) -> None:
    milk = add_product(client)
    receive(client, milk)
    sell(client, milk)
    client.post(f"{API}/suppliers", json={"name": "Зелена долина", "phone": "+359 2 000 0001"})

    assert setup(client) == {
        "products": True,
        "goods": True,
        "sales": True,
        "suppliers": True,
        "team": False,
        "done": False,
    }


def test_another_store_does_not_count(client: TestClient, db: Session, client_as) -> None:
    milk = add_product(client)
    receive(client, milk)

    other = Store(name="Someone else's store")
    db.add(other)
    db.flush()
    stranger = client_as(UserRole.OWNER, store_id=other.id)
    assert setup(stranger) == NOTHING_YET


def test_staff_and_strangers_are_refused(anon_client: TestClient, client_as) -> None:
    assert anon_client.get(URL).status_code == 401
    response = client_as(UserRole.STAFF).get(URL)
    assert (response.status_code, response.json()["code"]) == (403, "forbidden")
