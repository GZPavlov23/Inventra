"""API tests for registration, email verification, login, sessions and logout."""

import re
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import AuthToken, Store, User, UserSession
from tests.conftest import OWNER_EMAIL, OWNER_PASSWORD, FakeEmailSender

API = "/api/v1"
NEW_OWNER = {
    "full_name": "Maria Ivanova",
    "email": "maria@corner-shop.example",
    "password": "a-good-long-password",
    "store_name": "Corner Shop",
}
COOKIE = get_settings().session_cookie_name


def register(client: TestClient, **overrides: object):
    return client.post(f"{API}/auth/register", json={**NEW_OWNER, **overrides})


def login(client: TestClient, email: str, password: str):
    return client.post(f"{API}/auth/login", json={"email": email, "password": password})


def link_token(outbox: FakeEmailSender) -> str:
    match = re.search(r"verify-email\?token=([\w-]+)", outbox.sent[-1].body)
    assert match, outbox.sent[-1].body
    return match.group(1)


def register_and_verify(client: TestClient, outbox: FakeEmailSender) -> None:
    register(client)
    assert client.post(f"{API}/auth/verify-email", json={"token": link_token(outbox)}).is_success


# Registration and verification


def test_register_creates_store_and_unverified_owner(
    anon_client: TestClient, db: Session, outbox: FakeEmailSender
) -> None:
    response = register(anon_client)
    assert response.status_code == 202

    user = db.scalars(select(User).where(User.email == NEW_OWNER["email"])).one()
    assert user.role == "owner"
    assert user.email_verified_at is None
    assert user.store.name == "Corner Shop"
    assert user.password_hash != NEW_OWNER["password"]
    assert outbox.sent[-1].to == NEW_OWNER["email"]
    assert "verify-email?token=" in outbox.sent[-1].body


def test_cannot_log_in_before_verifying_email(anon_client: TestClient) -> None:
    register(anon_client)
    response = login(anon_client, NEW_OWNER["email"], NEW_OWNER["password"])
    assert response.status_code == 403
    assert response.json()["code"] == "email_not_verified"


def test_verified_owner_can_log_in_and_see_their_account(
    anon_client: TestClient, outbox: FakeEmailSender
) -> None:
    register_and_verify(anon_client, outbox)
    response = login(anon_client, NEW_OWNER["email"], NEW_OWNER["password"])
    assert response.status_code == 200

    me = anon_client.get(f"{API}/me").json()
    assert me["email"] == NEW_OWNER["email"]
    assert me["store"]["name"] == "Corner Shop"
    assert "password_hash" not in me


def test_verification_link_works_only_once(
    anon_client: TestClient, outbox: FakeEmailSender
) -> None:
    register(anon_client)
    token = link_token(outbox)
    assert anon_client.post(f"{API}/auth/verify-email", json={"token": token}).status_code == 200
    second = anon_client.post(f"{API}/auth/verify-email", json={"token": token})
    assert second.status_code == 400
    assert second.json()["code"] == "invalid_token"


def test_expired_verification_link_is_rejected(
    anon_client: TestClient, db: Session, outbox: FakeEmailSender
) -> None:
    register(anon_client)
    db.execute(update(AuthToken).values(expires_at=datetime.now(UTC) - timedelta(minutes=1)))
    response = anon_client.post(f"{API}/auth/verify-email", json={"token": link_token(outbox)})
    assert response.status_code == 400


def test_resending_the_link_invalidates_the_old_one(
    anon_client: TestClient, outbox: FakeEmailSender
) -> None:
    register(anon_client)
    old_token = link_token(outbox)
    anon_client.post(f"{API}/auth/resend-verification", json={"email": NEW_OWNER["email"]})
    new_token = link_token(outbox)

    assert old_token != new_token
    verify = f"{API}/auth/verify-email"
    assert anon_client.post(verify, json={"token": old_token}).status_code == 400
    assert anon_client.post(verify, json={"token": new_token}).status_code == 200


def test_registering_a_taken_email_reveals_nothing(
    anon_client: TestClient, db: Session, outbox: FakeEmailSender, owner: User
) -> None:
    stores_before = db.scalar(select(func.count()).select_from(Store))
    response = register(anon_client, email=OWNER_EMAIL)

    # Same answer as a successful registration, so nobody can probe which emails exist...
    assert response.status_code == 202
    assert response.json() == register(anon_client, email="fresh@shop.example").json()
    # ...no new account or store for the taken email, and its real owner is told instead.
    assert db.scalar(select(func.count()).select_from(User).where(User.email == OWNER_EMAIL)) == 1
    assert db.scalar(select(func.count()).select_from(Store)) == stores_before + 1
    assert any(mail.to == OWNER_EMAIL and "tried" in mail.subject for mail in outbox.sent)


def test_email_is_case_insensitive(anon_client: TestClient, outbox: FakeEmailSender) -> None:
    register(anon_client, email="Maria@Corner-Shop.EXAMPLE")
    anon_client.post(f"{API}/auth/verify-email", json={"token": link_token(outbox)})
    assert login(anon_client, "maria@corner-shop.example", NEW_OWNER["password"]).status_code == 200


def test_short_password_and_invalid_email_are_rejected(anon_client: TestClient) -> None:
    assert register(anon_client, password="short").status_code == 422
    assert register(anon_client, email="not-an-email").status_code == 422


# Login and brute-force protection


def test_wrong_password_and_unknown_email_get_the_same_answer(
    anon_client: TestClient, owner: User
) -> None:
    wrong_password = login(anon_client, OWNER_EMAIL, "wrong-password")
    unknown_email = login(anon_client, "nobody@nowhere.example", "wrong-password")
    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json() == unknown_email.json()


def test_account_locks_after_too_many_wrong_passwords(
    anon_client: TestClient, db: Session, owner: User
) -> None:
    for _ in range(get_settings().max_failed_logins):
        assert login(anon_client, OWNER_EMAIL, "wrong-password").status_code == 401

    # Even the correct password is refused while the account is locked.
    locked = login(anon_client, OWNER_EMAIL, OWNER_PASSWORD)
    assert locked.status_code == 429
    assert locked.json()["code"] == "account_locked"

    # When the lock time has passed, the correct password works again.
    db.execute(update(User).values(locked_until=datetime.now(UTC) - timedelta(seconds=1)))
    assert login(anon_client, OWNER_EMAIL, OWNER_PASSWORD).status_code == 200


def test_successful_login_resets_the_failure_counter(
    anon_client: TestClient, db: Session, owner: User
) -> None:
    login(anon_client, OWNER_EMAIL, "wrong-password")
    login(anon_client, OWNER_EMAIL, OWNER_PASSWORD)
    db.refresh(owner)
    assert owner.failed_login_attempts == 0


def test_session_cookie_is_http_only_and_same_site(anon_client: TestClient, owner: User) -> None:
    response = login(anon_client, OWNER_EMAIL, OWNER_PASSWORD)
    cookie_header = response.headers["set-cookie"].lower()
    assert cookie_header.startswith(f"{COOKIE}=")
    assert "httponly" in cookie_header
    assert "samesite=lax" in cookie_header


# Protected endpoints, sessions and logout


def test_protected_endpoints_require_login(anon_client: TestClient) -> None:
    for path in ("/me", "/products", "/products/1", "/products/by-barcode/2000000000015"):
        response = anon_client.get(f"{API}{path}")
        assert response.status_code == 401, path
        assert response.json()["code"] == "not_authenticated"
    assert anon_client.get(f"{API}/health").status_code == 200  # public on purpose


def test_logout_ends_the_session_on_the_server(client: TestClient) -> None:
    token = client.cookies[COOKIE]
    assert client.post(f"{API}/auth/logout").status_code == 204
    assert client.get(f"{API}/me").status_code == 401

    # Even a copy of the old cookie is now useless, because the session row is gone.
    client.cookies.set(COOKIE, token)
    assert client.get(f"{API}/me").status_code == 401


def test_expired_session_is_rejected(client: TestClient, db: Session) -> None:
    db.execute(update(UserSession).values(expires_at=datetime.now(UTC) - timedelta(seconds=1)))
    assert client.get(f"{API}/me").status_code == 401


def test_made_up_session_token_is_rejected(anon_client: TestClient) -> None:
    anon_client.cookies.set(COOKIE, "made-up-token")
    assert anon_client.get(f"{API}/me").status_code == 401


def test_new_owner_does_not_see_other_stores_products(
    client: TestClient, anon_client: TestClient, outbox: FakeEmailSender
) -> None:
    client.post(f"{API}/products", json={"name": "Milk", "purchase_price": 1, "sale_price": 2})
    client.post(f"{API}/auth/logout")

    register_and_verify(anon_client, outbox)
    login(anon_client, NEW_OWNER["email"], NEW_OWNER["password"])
    assert anon_client.get(f"{API}/products").json()["total"] == 0
