from datetime import datetime
from enum import StrEnum

from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class AuthTokenPurpose(StrEnum):
    EMAIL_VERIFICATION = "email_verification"
    PASSWORD_RESET = "password_reset"


class AuthToken(TimestampMixin, Base):
    """A one-time token sent by email (verification link, later also password reset)."""

    __tablename__ = "auth_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    purpose: Mapped[AuthTokenPurpose] = mapped_column(
        Enum(
            AuthTokenPurpose,
            name="auth_token_purpose",
            native_enum=False,
            create_constraint=True,
            length=32,
            values_callable=lambda enum: [member.value for member in enum],
        )
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # Set when the link is used, so the same link can't be used twice.
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
