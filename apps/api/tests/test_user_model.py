"""Database-level rules for users: they must hold even if application code has a bug."""

import pytest
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models import Store, User, UserRole, UserSession


def make_user(store: Store, **overrides: object) -> User:
    fields = {
        "store_id": store.id,
        "email": "owner@shop.bg",
        "password_hash": hash_password("a-long-password"),
        "full_name": "Ivan Petrov",
        "role": UserRole.OWNER,
        **overrides,
    }
    return User(**fields)


def test_new_user_is_unverified_active_and_unlocked(db: Session, store: Store) -> None:
    user = make_user(store)
    db.add(user)
    db.flush()
    db.refresh(user)
    assert user.email_verified_at is None
    assert user.is_active is True
    assert user.failed_login_attempts == 0
    assert user.locked_until is None


def test_email_must_be_unique(db: Session, store: Store) -> None:
    db.add(make_user(store))
    db.flush()
    db.add(make_user(store, full_name="Someone else"))
    with pytest.raises(IntegrityError):
        db.flush()


def test_email_must_be_lowercase(db: Session, store: Store) -> None:
    db.add(make_user(store, email="Owner@Shop.bg"))
    with pytest.raises(IntegrityError):
        db.flush()


def test_unknown_role_is_rejected_by_the_database(db: Session, store: Store) -> None:
    user = make_user(store)
    db.add(user)
    db.flush()
    with pytest.raises(IntegrityError):
        db.execute(User.__table__.update().values(role="admin"))


def test_deleting_a_user_deletes_their_sessions(db: Session, store: Store) -> None:
    user = make_user(store)
    db.add(user)
    db.flush()
    db.add(UserSession(user_id=user.id, token_hash="a" * 64, expires_at=user.created_at))
    db.flush()

    db.execute(delete(User).where(User.id == user.id))
    assert db.scalars(select(UserSession).where(UserSession.user_id == user.id)).all() == []
