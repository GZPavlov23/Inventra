"""API tests for "forgot password": requesting a reset link and choosing a new password."""

import re
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models import AuthToken, User
from tests.conftest import OWNER_EMAIL, OWNER_PASSWORD, FakeEmailSender

API = "/api/v1"
NEW_PASSWORD = "a-brand-new-password"


def request_reset(client: TestClient, email: str = OWNER_EMAIL):
    return client.post(f"{API}/auth/forgot-password", json={"email": email})


def reset(client: TestClient, token: str, new_password: str = NEW_PASSWORD):
    return client.post(
        f"{API}/auth/reset-password", json={"token": token, "new_password": new_password}
    )


def reset_token(outbox: FakeEmailSender) -> str:
    mail = next(m for m in reversed(outbox.sent) if "reset-password?token=" in m.body)
    return re.search(r"reset-password\?token=([\w-]+)", mail.body).group(1)


def login(client: TestClient, password: str):
    return client.post(f"{API}/auth/login", json={"email": OWNER_EMAIL, "password": password})


def test_reset_link_lets_the_user_choose_a_new_password(
    anon_client: TestClient, outbox: FakeEmailSender, owner: User
) -> None:
    assert request_reset(anon_client).status_code == 202
    assert outbox.sent[-1].to == OWNER_EMAIL

    response = reset(anon_client, reset_token(outbox))
    assert response.status_code == 200
    assert login(anon_client, OWNER_PASSWORD).status_code == 401  # the old password is gone
    assert login(anon_client, NEW_PASSWORD).status_code == 200


def test_unknown_email_gets_the_same_answer_and_no_email(
    anon_client: TestClient, outbox: FakeEmailSender, owner: User
) -> None:
    known = request_reset(anon_client)
    sent_before = len(outbox.sent)
    unknown = request_reset(anon_client, "nobody@nowhere.example")
    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json()
    assert len(outbox.sent) == sent_before


def test_reset_link_works_only_once(
    anon_client: TestClient, outbox: FakeEmailSender, owner: User
) -> None:
    request_reset(anon_client)
    token = reset_token(outbox)
    assert reset(anon_client, token).status_code == 200
    second = reset(anon_client, token, "yet-another-password")
    assert second.status_code == 400
    assert second.json()["code"] == "invalid_token"


def test_only_the_newest_reset_link_works(
    anon_client: TestClient, outbox: FakeEmailSender, owner: User
) -> None:
    request_reset(anon_client)
    old_token = reset_token(outbox)
    request_reset(anon_client)
    assert reset(anon_client, old_token).status_code == 400
    assert reset(anon_client, reset_token(outbox)).status_code == 200


def test_expired_reset_link_is_rejected(
    anon_client: TestClient, db: Session, outbox: FakeEmailSender, owner: User
) -> None:
    request_reset(anon_client)
    db.execute(update(AuthToken).values(expires_at=datetime.now(UTC) - timedelta(seconds=1)))
    assert reset(anon_client, reset_token(outbox)).status_code == 400


def test_a_verification_token_cannot_reset_a_password(
    anon_client: TestClient, outbox: FakeEmailSender
) -> None:
    anon_client.post(
        f"{API}/auth/register",
        json={"full_name": "A", "email": "a@shop.example", "password": "long-password",
              "store_name": "A Shop"},
    )
    verification_token = re.search(r"token=([\w-]+)", outbox.sent[-1].body).group(1)
    assert reset(anon_client, verification_token).status_code == 400


def test_reset_logs_out_every_device_and_sends_a_notice(
    client: TestClient, outbox: FakeEmailSender
) -> None:
    assert client.get(f"{API}/me").status_code == 200
    request_reset(client)
    reset(client, reset_token(outbox))

    assert client.get(f"{API}/me").status_code == 401
    assert outbox.sent[-1].subject == "Your Inventra password was changed"


def test_reset_unlocks_a_locked_account(
    anon_client: TestClient, db: Session, outbox: FakeEmailSender, owner: User
) -> None:
    db.execute(update(User).values(locked_until=datetime.now(UTC) + timedelta(minutes=15)))
    request_reset(anon_client)
    reset(anon_client, reset_token(outbox))
    assert login(anon_client, NEW_PASSWORD).status_code == 200


def test_new_password_must_be_long_enough(
    anon_client: TestClient, outbox: FakeEmailSender, owner: User
) -> None:
    request_reset(anon_client)
    assert reset(anon_client, reset_token(outbox), "short").status_code == 422
