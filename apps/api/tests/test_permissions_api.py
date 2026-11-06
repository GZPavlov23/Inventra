"""Every route against every role: what each one may do, checked through the real API."""

from collections.abc import Callable, Iterator
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.permissions import ROLE_PERMISSIONS, Permission
from app.main import app
from app.models import Store, User, UserRole
from tests.conftest import OWNER_PASSWORD, OWNER_PASSWORD_HASH

API = "/api/v1"

# Written out here on purpose, not read from the code: if someone changes a role in
# app/core/permissions.py by mistake, these tests must notice, not quietly agree.
EXPECTED = {
    UserRole.OWNER: set(Permission),
    UserRole.MANAGER: set(Permission) - {Permission.MANAGE_TEAM},
    UserRole.STAFF: {Permission.SELL, Permission.HANDLE_STOCK},
}

# (method, path, the permission it needs; None means everyone in the store may use it)
ROUTES = [
    ("GET", "/products", None),
    ("GET", "/products/categories", None),
    ("GET", "/products/999999", None),
    ("POST", "/products", Permission.MANAGE_CATALOG),
    ("PATCH", "/products/999999", Permission.MANAGE_CATALOG),
    ("GET", "/suppliers", None),
    ("POST", "/suppliers", Permission.MANAGE_CATALOG),
    ("PATCH", "/suppliers/999999", Permission.MANAGE_CATALOG),
    ("GET", "/batches", None),
    ("GET", "/batches/999999/movements", None),
    ("GET", "/batches/summary", Permission.SEE_FINANCES),
    ("POST", "/batches", Permission.HANDLE_STOCK),
    ("POST", "/batches/999999/waste", Permission.HANDLE_STOCK),
    ("POST", "/batches/999999/adjustments", Permission.HANDLE_STOCK),
    ("GET", "/deliveries", None),
    ("GET", "/deliveries/999999", None),
    ("POST", "/deliveries", Permission.PLAN),
    ("POST", "/deliveries/from-order", Permission.PLAN),
    ("POST", "/deliveries/999999/receive", Permission.HANDLE_STOCK),
    ("POST", "/deliveries/999999/cancel", Permission.PLAN),
    ("POST", "/sales", Permission.SELL),
    ("GET", "/sales", Permission.SEE_FINANCES),
    ("GET", "/sales/summary", Permission.SEE_FINANCES),
    ("GET", "/sales/daily?date_from=2026-11-01&date_to=2026-11-02", Permission.SEE_FINANCES),
    ("GET", "/sales/999999", Permission.SEE_FINANCES),
    ("POST", "/imports/sales", Permission.PLAN),
    ("GET", "/forecasts", Permission.PLAN),
    ("GET", "/forecasts/orders", Permission.PLAN),
    ("GET", "/forecasts/accuracy", Permission.PLAN),
    ("GET", "/reports/briefing", Permission.SEE_FINANCES),
    ("GET", "/reports/waste?date_from=2026-11-01&date_to=2026-11-02", Permission.SEE_FINANCES),
    ("GET", "/reports/running-out", Permission.SEE_FINANCES),
    (
        "GET",
        "/reports/top-products?date_from=2026-11-01&date_to=2026-11-02",
        Permission.SEE_FINANCES,
    ),
    ("GET", "/reports/categories?date_from=2026-11-01&date_to=2026-11-02", Permission.SEE_FINANCES),
    # Quantities only, for the small charts on Products.
    ("GET", "/reports/sales-trend?product_id=1", None),
]


@pytest.fixture
def client_as(
    db: Session, store: Store, anon_client: TestClient
) -> Iterator[Callable[[UserRole], TestClient]]:
    """Logs in a user of the test store with the given role, each in a client of its own."""
    clients: list[TestClient] = []

    def log_in(role: UserRole) -> TestClient:
        email = f"{role.value}@test-store.example"
        db.add(
            User(
                store_id=store.id,
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
        response = client.post(
            f"{API}/auth/login", json={"email": email, "password": OWNER_PASSWORD}
        )
        assert response.status_code == 200, response.text
        return client

    yield log_in
    for client in clients:
        client.close()


@pytest.mark.parametrize("role", list(UserRole))
def test_every_route_lets_in_exactly_the_roles_that_may_use_it(
    client_as: Callable[[UserRole], TestClient], role: UserRole
) -> None:
    client = client_as(role)
    wrong = []
    for method, path, permission in ROUTES:
        # An empty body on purpose: a refused request is refused before its body is read.
        body = {} if method in ("POST", "PATCH") else None
        response = client.request(method, f"{API}{path}", json=body)
        allowed = permission is None or permission in EXPECTED[role]
        if allowed == (response.status_code == 403):
            wrong.append(f"{method} {path}: {response.status_code}")
    assert wrong == []


def test_a_refusal_says_why_in_the_usual_shape(
    client_as: Callable[[UserRole], TestClient],
) -> None:
    response = client_as(UserRole.STAFF).get(f"{API}/reports/briefing")
    assert response.status_code == 403
    assert response.json()["code"] == "forbidden"
    assert "role" in response.json()["detail"]


def test_staff_can_do_the_work_of_the_till_and_the_shelves(
    client_as: Callable[[UserRole], TestClient], client: TestClient
) -> None:
    milk = client.post(
        f"{API}/products", json={"name": "Milk", "purchase_price": "1.00", "sale_price": "2.00"}
    ).json()
    staff = client_as(UserRole.STAFF)

    received = staff.post(f"{API}/batches", json={"product_id": milk["id"], "quantity": "5"})
    assert received.status_code == 201, received.text
    sold = staff.post(f"{API}/sales", json={"items": [{"product_id": milk["id"], "quantity": "2"}]})
    assert sold.status_code == 201, sold.text
    wasted = staff.post(
        f"{API}/batches/{received.json()['id']}/waste", json={"quantity": "1", "reason": "damaged"}
    )
    assert wasted.status_code == 200, wasted.text
    assert staff.get(f"{API}/products/{milk['id']}").json()["stock"] == "2.000"


@pytest.mark.parametrize("role", list(UserRole))
def test_the_client_is_told_what_the_role_may_do(
    client_as: Callable[[UserRole], TestClient], role: UserRole
) -> None:
    me = client_as(role).get(f"{API}/me").json()
    assert me["role"] == role.value
    assert set(me["permissions"]) == {p.value for p in EXPECTED[role]}


def test_the_code_gives_each_role_exactly_what_is_expected() -> None:
    assert {role: set(held) for role, held in ROLE_PERMISSIONS.items()} == EXPECTED
