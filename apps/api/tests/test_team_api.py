"""API tests for /api/v1/team and accepting an invitation: who works in the store."""

import re
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.security import hash_token
from app.main import app
from app.models import AuthToken, Store, User, UserRole
from app.models.auth_token import AuthTokenPurpose
from app.models.user_session import UserSession
from tests.conftest import OWNER_EMAIL, FakeEmailSender

URL = "/api/v1/team"
ACCEPT = "/api/v1/auth/accept-invitation"
NEW_PASSWORD = "a-new-strong-password"


def invite(client: TestClient, email: str = "ivan@test-store.example", **extra: object) -> dict:
    body = {"email": email, "full_name": "Ivan Petrov", "role": "staff", **extra}
    response = client.post(f"{URL}/invitations", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def link_token(outbox: FakeEmailSender, to: str) -> str:
    email = next(e for e in reversed(outbox.sent) if e.to == to)
    match = re.search(r"/accept-invitation\?token=([\w-]+)", email.text)
    assert match, email.text
    return match.group(1)


def accept(client: TestClient, token: str, password: str = NEW_PASSWORD):
    return client.post(ACCEPT, json={"token": token, "password": password})


def log_in(client: TestClient, email: str, password: str = NEW_PASSWORD):
    return client.post("/api/v1/auth/login", json={"email": email, "password": password})


def member(client: TestClient, email: str) -> dict:
    return next(m for m in client.get(URL).json() if m["email"] == email)


# Inviting


def test_an_invited_person_is_listed_as_not_joined_yet(
    client: TestClient, outbox: FakeEmailSender
) -> None:
    invited = invite(client, role="manager")

    assert invited["status"] == "invited"
    assert invited["role"] == "manager"
    assert "is_active" not in invited or invited["is_active"] is True
    email = outbox.sent[-1]
    assert email.to == "ivan@test-store.example"
    assert "Test Owner invited you to Test store" in email.subject
    assert "as a manager" in email.text
    assert "valid for 7 days" in email.text


def test_the_list_shows_owners_first_then_by_name(client: TestClient) -> None:
    invite(client, "zara@test-store.example", full_name="Zara")
    invite(client, "anna@test-store.example", full_name="Anna", role="manager")

    names = [m["full_name"] for m in client.get(URL).json()]

    assert names == ["Test Owner", "Anna", "Zara"]


def test_an_invited_person_cannot_log_in_before_choosing_a_password(client: TestClient) -> None:
    invite(client)
    for password in (NEW_PASSWORD, ""):
        assert log_in(client, "ivan@test-store.example", password).status_code == 401


def test_nobody_can_be_invited_as_an_owner(client: TestClient) -> None:
    body = {"email": "boss@test-store.example", "full_name": "Boss", "role": "owner"}
    assert client.post(f"{URL}/invitations", json=body).status_code == 422


def test_an_address_with_an_account_cannot_be_invited(client: TestClient) -> None:
    invite(client)
    for email in ("ivan@test-store.example", "IVAN@test-store.example", OWNER_EMAIL):
        body = {"email": email, "full_name": "Again", "role": "staff"}
        response = client.post(f"{URL}/invitations", json=body)
        assert response.status_code == 409
        assert "already has an Inventra account" in response.json()["detail"]


# Accepting


def test_accepting_sets_the_password_and_lets_the_person_in(
    client: TestClient, anon_client: TestClient, outbox: FakeEmailSender
) -> None:
    invite(client)
    token = link_token(outbox, "ivan@test-store.example")

    response = accept(anon_client, token)

    assert response.status_code == 200, response.text
    assert member(client, "ivan@test-store.example")["status"] == "active"
    logged_in = log_in(anon_client, "ivan@test-store.example")
    assert logged_in.status_code == 200, logged_in.text
    assert logged_in.json()["role"] == "staff"
    assert logged_in.json()["store"]["name"] == "Test store"


def test_a_link_works_only_once(
    client: TestClient, anon_client: TestClient, outbox: FakeEmailSender
) -> None:
    invite(client)
    token = link_token(outbox, "ivan@test-store.example")
    accept(anon_client, token)

    again = accept(anon_client, token, "someone-elses-password")

    assert again.status_code == 400
    assert again.json()["code"] == "invalid_token"


def test_a_short_password_is_refused(
    client: TestClient, anon_client: TestClient, outbox: FakeEmailSender
) -> None:
    invite(client)
    assert (
        accept(anon_client, link_token(outbox, "ivan@test-store.example"), "short").status_code
        == 422
    )


def test_an_expired_link_is_refused(
    client: TestClient, anon_client: TestClient, outbox: FakeEmailSender, db: Session
) -> None:
    invite(client)
    token = link_token(outbox, "ivan@test-store.example")
    db.execute(update(AuthToken).values(expires_at=AuthToken.created_at))
    db.flush()

    assert accept(anon_client, token).status_code == 400


def test_other_kinds_of_link_cannot_be_used_to_join(
    client: TestClient, anon_client: TestClient, db: Session, outbox: FakeEmailSender
) -> None:
    invite(client)
    token = link_token(outbox, "ivan@test-store.example")
    db.execute(update(AuthToken).values(purpose=AuthTokenPurpose.PASSWORD_RESET))
    db.flush()

    assert accept(anon_client, token).status_code == 400


def test_resending_makes_a_new_link_and_the_old_one_stops_working(
    client: TestClient, anon_client: TestClient, outbox: FakeEmailSender
) -> None:
    invited = invite(client)
    old = link_token(outbox, "ivan@test-store.example")

    response = client.post(f"{URL}/{invited['id']}/resend-invitation")
    new = link_token(outbox, "ivan@test-store.example")

    assert response.status_code == 200, response.text
    assert new != old
    assert accept(anon_client, old).status_code == 400
    assert accept(anon_client, new).status_code == 200


def test_someone_who_joined_gets_no_new_invitation(
    client: TestClient, anon_client: TestClient, outbox: FakeEmailSender
) -> None:
    invited = invite(client)
    accept(anon_client, link_token(outbox, "ivan@test-store.example"))

    response = client.post(f"{URL}/{invited['id']}/resend-invitation")

    assert response.status_code == 409
    assert "already joined" in response.json()["detail"]


# Changing roles and stopping access


def test_the_owner_can_change_a_role(client: TestClient) -> None:
    invited = invite(client)
    changed = client.patch(f"{URL}/{invited['id']}", json={"role": "manager"})
    assert changed.status_code == 200
    assert changed.json()["role"] == "manager"


def test_deactivating_logs_the_person_out_everywhere_at_once(
    client: TestClient, outbox: FakeEmailSender, db: Session
) -> None:
    invited = invite(client)
    # Ivan's own browser: the test client is the owner's.
    with TestClient(app) as ivan:
        accept(ivan, link_token(outbox, "ivan@test-store.example"))
        log_in(ivan, "ivan@test-store.example")
        assert ivan.get("/api/v1/me").status_code == 200

        response = client.patch(f"{URL}/{invited['id']}", json={"active": False})

        assert response.json()["status"] == "deactivated"
        assert ivan.get("/api/v1/me").status_code == 401
        assert log_in(ivan, "ivan@test-store.example").status_code == 401
    sessions = db.scalars(select(UserSession).where(UserSession.user_id == invited["id"]))
    assert list(sessions) == []


def test_a_deactivated_person_cannot_join_with_an_old_link(
    client: TestClient, anon_client: TestClient, outbox: FakeEmailSender
) -> None:
    invited = invite(client)
    token = link_token(outbox, "ivan@test-store.example")
    client.patch(f"{URL}/{invited['id']}", json={"active": False})

    assert accept(anon_client, token).status_code == 400
    resend = client.post(f"{URL}/{invited['id']}/resend-invitation")
    assert resend.status_code == 409


def test_a_link_from_before_deactivation_stays_dead_after_access_is_restored(
    client: TestClient, anon_client: TestClient, outbox: FakeEmailSender
) -> None:
    invited = invite(client)
    token = link_token(outbox, "ivan@test-store.example")
    client.patch(f"{URL}/{invited['id']}", json={"active": False})
    client.patch(f"{URL}/{invited['id']}", json={"active": True})

    assert accept(anon_client, token).status_code == 400


def test_a_deactivated_person_cannot_join_even_with_a_link_that_is_still_valid(
    client: TestClient, anon_client: TestClient, db: Session
) -> None:
    """A link made at the very moment of deactivation would still be valid: joining checks too."""
    invited = invite(client)
    client.patch(f"{URL}/{invited['id']}", json={"active": False})
    db.add(
        AuthToken(
            user_id=invited["id"],
            purpose=AuthTokenPurpose.INVITATION,
            token_hash=hash_token("late-link"),
            expires_at=datetime.now(UTC) + timedelta(days=1),
        )
    )
    db.flush()

    assert accept(anon_client, "late-link").status_code == 400


def test_access_can_be_given_back(
    client: TestClient, anon_client: TestClient, outbox: FakeEmailSender
) -> None:
    invited = invite(client)
    accept(anon_client, link_token(outbox, "ivan@test-store.example"))
    client.patch(f"{URL}/{invited['id']}", json={"active": False})

    restored = client.patch(f"{URL}/{invited['id']}", json={"active": True})

    assert restored.json()["status"] == "active"
    assert log_in(anon_client, "ivan@test-store.example").status_code == 200


@pytest.mark.parametrize("change", [{"role": "manager"}, {"active": False}])
def test_the_last_owner_cannot_stop_being_one(
    client: TestClient, owner: User, change: dict
) -> None:
    response = client.patch(f"{URL}/{owner.id}", json=change)

    assert response.status_code == 409
    assert response.json()["code"] == "last_owner"
    assert member(client, OWNER_EMAIL)["role"] == "owner"
    assert member(client, OWNER_EMAIL)["status"] == "active"


def test_with_a_second_owner_the_first_may_step_down(
    client: TestClient, owner: User, anon_client: TestClient, outbox: FakeEmailSender
) -> None:
    invited = invite(client, role="manager")
    accept(anon_client, link_token(outbox, "ivan@test-store.example"))
    client.patch(f"{URL}/{invited['id']}", json={"role": "owner"})

    response = client.patch(f"{URL}/{owner.id}", json={"role": "manager"})

    assert response.status_code == 200
    assert response.json()["role"] == "manager"


def test_an_owner_of_another_store_does_not_count_as_the_other_owner(
    client: TestClient, owner: User, db: Session
) -> None:
    other = Store(name="Other store")
    db.add(other)
    db.flush()
    db.add(
        User(
            store_id=other.id,
            email="their-owner@other.example",
            password_hash="x",
            full_name="Their Owner",
            role=UserRole.OWNER,
        )
    )
    db.flush()

    assert client.patch(f"{URL}/{owner.id}", json={"role": "staff"}).status_code == 409


def test_a_deactivated_owner_does_not_count_as_the_other_owner(
    client: TestClient, owner: User, db: Session, store: Store
) -> None:
    db.add(
        User(
            store_id=store.id,
            email="old@test-store.example",
            password_hash="x",
            full_name="Old Owner",
            role=UserRole.OWNER,
            is_active=False,
        )
    )
    db.flush()

    assert client.patch(f"{URL}/{owner.id}", json={"active": False}).status_code == 409


@pytest.mark.parametrize("body", [{"role": None}, {"active": None}, {"role": "boss"}])
def test_nonsense_changes_are_refused(client: TestClient, body: dict) -> None:
    invited = invite(client)
    assert client.patch(f"{URL}/{invited['id']}", json=body).status_code == 422


# Other stores


def test_another_stores_people_are_out_of_reach(client: TestClient, db: Session) -> None:
    other = Store(name="Other store")
    db.add(other)
    db.flush()
    stranger = User(
        store_id=other.id,
        email="stranger@other.example",
        password_hash="x",
        full_name="Stranger",
        role=UserRole.STAFF,
    )
    db.add(stranger)
    db.flush()

    assert all(m["email"] != "stranger@other.example" for m in client.get(URL).json())
    assert client.patch(f"{URL}/{stranger.id}", json={"active": False}).status_code == 404
    assert client.post(f"{URL}/{stranger.id}/resend-invitation").status_code == 404


def test_the_team_requires_login(anon_client: TestClient) -> None:
    assert anon_client.get(URL).status_code == 401


# The store's name


def test_the_owner_can_rename_the_store(client: TestClient) -> None:
    response = client.patch("/api/v1/store", json={"name": "  Corner Shop  "})
    assert response.status_code == 200
    assert response.json() == {**response.json(), "name": "Corner Shop"}
    assert client.get("/api/v1/me").json()["store"]["name"] == "Corner Shop"


@pytest.mark.parametrize("body", [{"name": ""}, {"name": "x" * 121}, {"currency": "USD"}])
def test_a_bad_name_is_refused_and_the_currency_cannot_change(
    client: TestClient, body: dict
) -> None:
    assert client.patch("/api/v1/store", json=body).status_code == 422
    assert client.get("/api/v1/me").json()["store"]["currency"] == "EUR"
