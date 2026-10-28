"""Shared test setup (pytest loads this file automatically).

Tests run against a separate database (TEST_DATABASE_URL), never the development one.
The schema is built with our real Alembic migrations, and every test runs inside a
transaction that is rolled back afterwards, so each test starts with an empty database.
"""

from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import Connection, create_engine
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.email import get_email_sender
from app.core.security import hash_password
from app.db.session import get_db
from app.main import app
from app.models.store import Store
from app.models.user import User, UserRole

API_ROOT = Path(__file__).resolve().parents[1]
OWNER_EMAIL = "owner@test-store.example"
OWNER_PASSWORD = "owner-password-123"
# Argon2 is slow on purpose, so the test owner's hash is computed once, not in every test.
OWNER_PASSWORD_HASH = hash_password(OWNER_PASSWORD)


@dataclass
class SentEmail:
    to: str
    subject: str
    body: str


@dataclass
class FakeEmailSender:
    """Collects emails instead of sending them, so tests can read the links inside."""

    sent: list[SentEmail] = field(default_factory=list)

    def send(self, to: str, subject: str, body: str) -> None:
        self.sent.append(SentEmail(to, subject, body))


@pytest.fixture(scope="session")
def connection() -> Iterator[Connection]:
    """Rebuilds the test database schema from the migrations once per test run."""
    url = get_settings().test_database_url
    alembic_config = Config(str(API_ROOT / "alembic.ini"))
    alembic_config.set_main_option("sqlalchemy.url", url)
    command.downgrade(alembic_config, "base")
    command.upgrade(alembic_config, "head")

    engine = create_engine(url)
    with engine.connect() as connection:
        yield connection
    engine.dispose()


@pytest.fixture
def db(connection: Connection) -> Iterator[Session]:
    """A session whose changes are thrown away after the test.

    Our services call session.commit(). With "create_savepoint", those commits only close a
    SAVEPOINT inside the outer transaction, which we roll back when the test ends.
    """
    transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    yield session
    session.close()
    transaction.rollback()


@pytest.fixture
def store(db: Session) -> Store:
    store = Store(name="Test store")
    db.add(store)
    db.flush()
    return store


@pytest.fixture
def owner(db: Session, store: Store) -> User:
    user = User(
        store_id=store.id,
        email=OWNER_EMAIL,
        password_hash=OWNER_PASSWORD_HASH,
        full_name="Test Owner",
        role=UserRole.OWNER,
        email_verified_at=datetime.now(UTC),
    )
    db.add(user)
    db.flush()
    return user


@pytest.fixture
def outbox() -> FakeEmailSender:
    return FakeEmailSender()


@pytest.fixture
def anon_client(db: Session, outbox: FakeEmailSender) -> Iterator[TestClient]:
    """An HTTP client for the app that uses the test session and is NOT logged in."""
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_email_sender] = lambda: outbox
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def client(anon_client: TestClient, owner: User) -> TestClient:
    """A client logged in as `owner` through the real login endpoint."""
    response = anon_client.post(
        "/api/v1/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD}
    )
    assert response.status_code == 200, response.text
    return anon_client
