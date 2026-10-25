"""Shared test setup (pytest loads this file automatically).

Tests run against a separate database (TEST_DATABASE_URL), never the development one.
The schema is built with our real Alembic migrations, and every test runs inside a
transaction that is rolled back afterwards, so each test starts with an empty database.
"""

from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import Connection, create_engine
from sqlalchemy.orm import Session

from app.api.deps import get_current_store
from app.core.config import get_settings
from app.db.session import get_db
from app.main import app
from app.models.store import Store

API_ROOT = Path(__file__).resolve().parents[1]


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
def client(db: Session, store: Store) -> Iterator[TestClient]:
    """An HTTP client for the app that uses the test session and acts as `store`."""
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_store] = lambda: store
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
