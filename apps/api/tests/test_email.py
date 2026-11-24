"""Sending emails: the SMTP sender, the language of each email, and what a failed send does."""

import smtplib
from email.message import EmailMessage

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.email import (
    ConsoleEmailSender,
    Email,
    SmtpEmailSender,
    get_email_sender,
)
from app.core.exceptions import EmailNotSentError
from app.core.language import language_from_header
from app.main import app
from app.models.user import User
from tests.conftest import OWNER_EMAIL, OWNER_PASSWORD, FakeEmailSender

API = "/api/v1"
BULGARIAN = {"Accept-Language": "bg"}
NEW_OWNER = {
    "full_name": "Мария <b>Иванова</b>",
    "email": "maria@corner-shop.example",
    "password": "a-good-long-password",
    "store_name": "Магазинче",
}
EMAIL = Email(to="maria@shop.example", subject="Hi", text="Plain words", html="<p>Rich words</p>")


class FakeSmtp:
    """Stands in for smtplib's connection and remembers what was done with it."""

    opened: list["FakeSmtp"] = []
    fail_with: Exception | None = None

    def __init__(self, host: str, port: int, timeout: float, **kwargs: object) -> None:
        self.host, self.port, self.timeout = host, port, timeout
        self.steps: list[str] = []
        self.message: EmailMessage | None = None
        FakeSmtp.opened.append(self)

    def __enter__(self) -> "FakeSmtp":
        return self

    def __exit__(self, *args: object) -> None:
        self.steps.append("quit")

    def starttls(self, context: object) -> None:
        self.steps.append("starttls")

    def login(self, username: str, password: str) -> None:
        self.steps.append(f"login {username} {password}")
        if FakeSmtp.fail_with:
            raise FakeSmtp.fail_with

    def send_message(self, message: EmailMessage) -> None:
        self.steps.append("send")
        self.message = message


@pytest.fixture
def fake_smtp(monkeypatch: pytest.MonkeyPatch) -> type[FakeSmtp]:
    FakeSmtp.opened = []
    FakeSmtp.fail_with = None
    monkeypatch.setattr(smtplib, "SMTP", FakeSmtp)
    monkeypatch.setattr(smtplib, "SMTP_SSL", FakeSmtp)
    return FakeSmtp


def sender(port: int = 587) -> SmtpEmailSender:
    return SmtpEmailSender("smtp.example", port, "user@example", "secret", "Inventra <noreply@x>")


class FailingSender:
    def send(self, email: Email) -> None:
        raise EmailNotSentError("The email could not be sent. Try again in a few minutes")


def test_smtp_sends_text_and_html_over_tls_after_logging_in(fake_smtp: type[FakeSmtp]) -> None:
    sender().send(EMAIL)

    [connection] = fake_smtp.opened
    assert (connection.host, connection.port) == ("smtp.example", 587)
    assert connection.steps == ["starttls", "login user@example secret", "send", "quit"]
    message = connection.message
    assert (message["From"], message["To"], message["Subject"]) == (
        "Inventra <noreply@x>",
        "maria@shop.example",
        "Hi",
    )
    assert message.get_body(("plain",)).get_content().strip() == "Plain words"
    assert message.get_body(("html",)).get_content().strip() == "<p>Rich words</p>"


def test_port_465_starts_encrypted_without_starttls(fake_smtp: type[FakeSmtp]) -> None:
    sender(465).send(EMAIL)
    assert fake_smtp.opened[0].steps == ["login user@example secret", "send", "quit"]


@pytest.mark.parametrize(
    "problem", [smtplib.SMTPAuthenticationError(535, b"bad key"), OSError("no internet")]
)
def test_a_refused_or_unreachable_provider_is_a_clear_error(
    fake_smtp: type[FakeSmtp], problem: Exception
) -> None:
    fake_smtp.fail_with = problem
    with pytest.raises(EmailNotSentError):
        sender().send(EMAIL)


def test_without_smtp_settings_emails_are_printed(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "smtp_host", "")
    assert isinstance(get_email_sender(), ConsoleEmailSender)
    monkeypatch.setattr(settings, "smtp_host", "smtp-relay.brevo.com")
    chosen = get_email_sender()
    assert isinstance(chosen, SmtpEmailSender)
    assert chosen.host == "smtp-relay.brevo.com"


@pytest.mark.parametrize(
    ("header", "language"),
    [(None, "bg"), ("bg", "bg"), ("en", "en"), ("en-GB,en;q=0.9", "en"), ("de", "bg")],
)
def test_the_language_comes_from_the_header_and_is_bulgarian_by_default(
    header: str | None, language: str
) -> None:
    assert language_from_header(header) == language


def test_the_verification_email_is_in_bulgarian_and_names_are_escaped(
    anon_client: TestClient, outbox: FakeEmailSender
) -> None:
    response = anon_client.post(f"{API}/auth/register", json=NEW_OWNER, headers=BULGARIAN)
    assert response.status_code == 202, response.text

    email = outbox.sent[-1]
    assert email.subject == "Потвърди профила си в Inventra"
    assert "Здравей, Мария <b>Иванова</b>!" in email.text
    assert "verify-email?token=" in email.text
    # Shown as typed, not turned into bold text.
    assert "Мария &lt;b&gt;Иванова&lt;/b&gt;" in email.html
    assert "<b>Иванова</b>" not in email.html
    assert 'lang="bg"' in email.html
    assert "Потвърди имейла" in email.html


def test_the_invitation_is_in_the_language_of_the_person_inviting(
    client: TestClient, outbox: FakeEmailSender
) -> None:
    body = {"email": "ivan@test-store.example", "full_name": "Иван", "role": "manager"}
    response = client.post(f"{API}/team/invitations", json=body, headers=BULGARIAN)
    assert response.status_code == 201, response.text
    email = outbox.sent[-1]
    assert email.subject == "Test Owner те кани в Test store в Inventra"
    assert "като управител" in email.text
    assert "Линкът важи 7 дни" in email.text


def test_registration_is_undone_when_its_email_cannot_be_sent(
    anon_client: TestClient, db: Session
) -> None:
    app.dependency_overrides[get_email_sender] = FailingSender
    response = anon_client.post(f"{API}/auth/register", json=NEW_OWNER)
    assert response.status_code == 503
    assert response.json()["code"] == "email_not_sent"
    # Nothing blocks the address, so trying again later works.
    assert db.scalar(select(User).where(User.email == NEW_OWNER["email"])) is None


def test_an_invitation_that_cannot_be_sent_leaves_no_invited_person(
    client: TestClient, db: Session
) -> None:
    app.dependency_overrides[get_email_sender] = FailingSender
    body = {"email": "ivan@test-store.example", "full_name": "Ivan", "role": "staff"}
    response = client.post(f"{API}/team/invitations", json=body)
    assert response.status_code == 503
    assert db.scalar(select(User).where(User.email == "ivan@test-store.example")) is None


def test_a_password_change_stands_even_if_its_notice_is_not_sent(client: TestClient) -> None:
    app.dependency_overrides[get_email_sender] = FailingSender
    response = client.post(
        f"{API}/auth/change-password",
        json={"current_password": OWNER_PASSWORD, "new_password": "a-brand-new-password"},
    )
    assert response.status_code == 200, response.text
    client.post(f"{API}/auth/logout")
    login = {"email": OWNER_EMAIL, "password": "a-brand-new-password"}
    assert client.post(f"{API}/auth/login", json=login).status_code == 200
