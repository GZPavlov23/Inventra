"""Data access for users, their sessions and their one-time email tokens."""

from datetime import datetime

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.models.auth_token import AuthToken, AuthTokenPurpose
from app.models.user import User
from app.models.user_session import UserSession


class UserRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get_by_email(self, email: str) -> User | None:
        return self.session.scalars(select(User).where(User.email == email)).first()

    def add(self, entity: User | UserSession | AuthToken) -> None:
        self.session.add(entity)
        self.session.flush()

    # Sessions

    def get_active_session(self, token_hash: str, now: datetime) -> UserSession | None:
        stmt = select(UserSession).where(
            UserSession.token_hash == token_hash, UserSession.expires_at > now
        )
        return self.session.scalars(stmt).first()

    def delete_session(self, token_hash: str) -> None:
        self.session.execute(delete(UserSession).where(UserSession.token_hash == token_hash))

    # One-time tokens

    def get_valid_token(
        self, token_hash: str, purpose: AuthTokenPurpose, now: datetime
    ) -> AuthToken | None:
        stmt = select(AuthToken).where(
            AuthToken.token_hash == token_hash,
            AuthToken.purpose == purpose,
            AuthToken.used_at.is_(None),
            AuthToken.expires_at > now,
        )
        return self.session.scalars(stmt).first()

    def invalidate_tokens(self, user_id: int, purpose: AuthTokenPurpose, now: datetime) -> None:
        """Marks all unused tokens of this kind as used, so only the newest link works."""
        self.session.execute(
            update(AuthToken)
            .where(
                AuthToken.user_id == user_id,
                AuthToken.purpose == purpose,
                AuthToken.used_at.is_(None),
            )
            .values(used_at=now)
        )
