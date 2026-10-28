from datetime import datetime
from enum import StrEnum

from sqlalchemy import Boolean, CheckConstraint, DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.models.store import Store


class UserRole(StrEnum):
    OWNER = "owner"
    MANAGER = "manager"
    STAFF = "staff"


class User(TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        # The app lowercases emails; the database guarantees it, so "Ivan@Shop.bg" and
        # "ivan@shop.bg" can never become two accounts.
        CheckConstraint("email = lower(email)", name="email_lowercase"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id", ondelete="CASCADE"), index=True)
    store: Mapped[Store] = relationship()

    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(120))
    role: Mapped[UserRole] = mapped_column(
        Enum(
            UserRole,
            name="user_role",
            native_enum=False,
            create_constraint=True,
            length=16,
            values_callable=lambda enum: [member.value for member in enum],
        )
    )

    # NULL until the user clicks the link in the verification email.
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")

    # Brute-force protection: after too many wrong passwords the account is locked for a while.
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
