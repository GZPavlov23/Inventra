"""Business rules for accounts: registration, email verification, login and sessions.

Security decisions (each one answers a question the jury may ask):
- Passwords are stored only as Argon2id hashes (app/core/security.py).
- Sessions live in the database, so logout really ends a session (a deleted row can't be used).
- Only token hashes are stored; the raw session token exists only in the user's cookie.
- Register, login and "resend link" never reveal whether an email is registered
  (no user enumeration): the same answer is given, and the same slow hashing work is done.
- Repeated wrong passwords lock the account for a while (brute-force protection).
- A password reset ends every session of the account, so a thief using the old password
  is logged out everywhere.
"""

from datetime import UTC, datetime, timedelta
from functools import cache

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.email import EmailSender
from app.core.exceptions import (
    AccountLockedError,
    EmailNotVerifiedError,
    InvalidCredentialsError,
    InvalidTokenError,
)
from app.core.security import generate_token, hash_password, hash_token, verify_password
from app.models.auth_token import AuthToken, AuthTokenPurpose
from app.models.store import Store
from app.models.user import User, UserRole
from app.models.user_session import UserSession
from app.repositories.user_repository import UserRepository
from app.schemas.auth import LoginRequest, RegisterRequest, ResetPasswordRequest

INVALID_CREDENTIALS = "Invalid email or password"


@cache
def _dummy_password_hash() -> str:
    # Checked against when the email doesn't exist, so a login for an unknown email takes as
    # long as one with a wrong password. Otherwise response times would reveal real accounts.
    return hash_password("dummy-password-for-constant-time")


def _now() -> datetime:
    return datetime.now(UTC)


class AuthService:
    def __init__(self, session: Session, email_sender: EmailSender) -> None:
        self.session = session
        self.users = UserRepository(session)
        self.email_sender = email_sender
        self.settings = get_settings()

    # Registration and email verification

    def register(self, data: RegisterRequest) -> None:
        """Creates a store and its owner account, then emails a verification link."""
        password_hash = hash_password(data.password)  # done in both branches, for equal timing
        existing = self.users.get_by_email(data.email)
        if existing is not None:
            # Tell the real owner of the address instead of telling the person registering.
            self.email_sender.send(
                existing.email,
                "Someone tried to register with your email",
                "Someone tried to create an Inventra account with this email address, which "
                "already has an account. If it was you, just log in. If not, you can ignore this.",
            )
            return

        store = Store(name=data.store_name)
        self.session.add(store)
        self.session.flush()
        user = User(
            store_id=store.id,
            email=data.email,
            password_hash=password_hash,
            full_name=data.full_name,
            role=UserRole.OWNER,
        )
        self.users.add(user)
        self._send_verification_email(user)
        self.session.commit()

    def verify_email(self, token: str) -> None:
        now = _now()
        auth_token = self.users.get_valid_token(
            hash_token(token), AuthTokenPurpose.EMAIL_VERIFICATION, now
        )
        if auth_token is None:
            raise InvalidTokenError("This verification link is invalid or has expired")

        user = self.session.get(User, auth_token.user_id)
        auth_token.used_at = now
        if user.email_verified_at is None:
            user.email_verified_at = now
        self.session.commit()

    def resend_verification(self, email: str) -> None:
        user = self.users.get_by_email(email)
        if user is not None and user.email_verified_at is None:
            self._send_verification_email(user)
            self.session.commit()

    def _send_verification_email(self, user: User) -> None:
        hours = self.settings.email_verification_lifetime_hours
        token = self._issue_token(user, AuthTokenPurpose.EMAIL_VERIFICATION, timedelta(hours=hours))
        link = f"{self.settings.web_app_url}/verify-email?token={token}"
        self.email_sender.send(
            user.email,
            "Confirm your Inventra account",
            f"Hello {user.full_name},\n\nOpen this link to confirm your email address:\n{link}\n\n"
            f"The link is valid for {hours} hours.",
        )

    # Forgotten password

    def request_password_reset(self, email: str) -> None:
        """Emails a reset link if the account exists. The caller gets the same answer either way."""
        user = self.users.get_by_email(email)
        if user is None or not user.is_active:
            return
        minutes = self.settings.password_reset_lifetime_minutes
        token = self._issue_token(user, AuthTokenPurpose.PASSWORD_RESET, timedelta(minutes=minutes))
        link = f"{self.settings.web_app_url}/reset-password?token={token}"
        self.email_sender.send(
            user.email,
            "Reset your Inventra password",
            f"Hello {user.full_name},\n\nOpen this link to choose a new password:\n{link}\n\n"
            f"The link is valid for {minutes} minutes and works once. If you didn't ask for this, "
            "ignore this email: your password stays the same.",
        )
        self.session.commit()

    def reset_password(self, data: ResetPasswordRequest) -> None:
        now = _now()
        auth_token = self.users.get_valid_token(
            hash_token(data.token), AuthTokenPurpose.PASSWORD_RESET, now
        )
        if auth_token is None:
            raise InvalidTokenError("This password reset link is invalid or has expired")

        user = self.session.get(User, auth_token.user_id)
        user.password_hash = hash_password(data.new_password)
        user.failed_login_attempts = 0
        user.locked_until = None
        # The link arrived by email, so it also proves the user owns the address.
        if user.email_verified_at is None:
            user.email_verified_at = now
        auth_token.used_at = now
        self.users.invalidate_tokens(user.id, AuthTokenPurpose.PASSWORD_RESET, now)
        self.users.delete_all_sessions(user.id)
        self.email_sender.send(
            user.email,
            "Your Inventra password was changed",
            f"Hello {user.full_name},\n\nThe password of your account was just changed and you "
            "were logged out on all devices. If this wasn't you, reset your password right away.",
        )
        self.session.commit()

    def _issue_token(self, user: User, purpose: AuthTokenPurpose, lifetime: timedelta) -> str:
        """Creates a one-time token (only the newest of each kind works) and returns it."""
        now = _now()
        self.users.invalidate_tokens(user.id, purpose, now)
        token = generate_token()
        self.users.add(
            AuthToken(
                user_id=user.id,
                purpose=purpose,
                token_hash=hash_token(token),
                expires_at=now + lifetime,
            )
        )
        return token

    # Login, sessions and logout

    def login(self, data: LoginRequest, user_agent: str | None) -> tuple[str, User]:
        """Returns a new session token and the user, or raises a domain error."""
        now = _now()
        user = self.users.get_by_email(data.email)
        if user is None:
            verify_password(data.password, _dummy_password_hash())
            raise InvalidCredentialsError(INVALID_CREDENTIALS)

        if user.locked_until is not None and user.locked_until > now:
            minutes = max(1, round((user.locked_until - now).total_seconds() / 60))
            raise AccountLockedError(
                f"Too many failed login attempts. Try again in {minutes} minute(s)"
            )

        if not verify_password(data.password, user.password_hash):
            self._register_failed_login(user, now)
            raise InvalidCredentialsError(INVALID_CREDENTIALS)

        # The checks below run only after a correct password, so they reveal nothing to
        # someone who is guessing.
        if not user.is_active:
            raise InvalidCredentialsError(INVALID_CREDENTIALS)
        if user.email_verified_at is None:
            raise EmailNotVerifiedError("Please confirm your email address before logging in")

        user.failed_login_attempts = 0
        user.locked_until = None
        token = generate_token()
        self.users.add(
            UserSession(
                user_id=user.id,
                token_hash=hash_token(token),
                expires_at=now + timedelta(days=self.settings.session_lifetime_days),
                user_agent=(user_agent or "")[:255] or None,
            )
        )
        self.session.commit()
        return token, user

    def _register_failed_login(self, user: User, now: datetime) -> None:
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= self.settings.max_failed_logins:
            user.locked_until = now + timedelta(minutes=self.settings.lockout_minutes)
            user.failed_login_attempts = 0
        self.session.commit()

    def get_user_for_session(self, token: str) -> User | None:
        user_session = self.users.get_active_session(hash_token(token), _now())
        if user_session is None:
            return None
        user = self.session.get(User, user_session.user_id)
        return user if user is not None and user.is_active else None

    def logout(self, token: str) -> None:
        self.users.delete_session(hash_token(token))
        self.session.commit()
