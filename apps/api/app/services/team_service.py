"""The people of a store: inviting employees, changing their role, stopping their access."""

from datetime import UTC, datetime, timedelta

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.email import EmailSender
from app.core.exceptions import ConflictError, LastOwnerError, NotFoundError
from app.core.security import generate_token, hash_password
from app.models.auth_token import AuthTokenPurpose
from app.models.store import Store
from app.models.user import User, UserRole
from app.repositories.user_repository import UserRepository
from app.schemas.auth import StoreUpdate
from app.schemas.team import InvitationCreate, MemberUpdate
from app.services.auth_service import AuthService

ROLE_NAMES = {UserRole.OWNER: "an owner", UserRole.MANAGER: "a manager", UserRole.STAFF: "staff"}


class TeamService:
    def __init__(self, session: Session, email_sender: EmailSender) -> None:
        self.session = session
        self.users = UserRepository(session)
        self.auth = AuthService(session, email_sender)
        self.email_sender = email_sender
        self.settings = get_settings()

    def rename_store(self, store: Store, data: StoreUpdate) -> Store:
        store.name = data.name
        self.session.commit()
        return store

    def list_members(self, store_id: int) -> list[User]:
        return self.users.members(store_id)

    def invite(self, store_id: int, inviter: User, data: InvitationCreate) -> User:
        if self.users.get_by_email(data.email) is not None:
            raise ConflictError(f"{data.email} already has an Inventra account")
        member = User(
            store_id=store_id,
            email=data.email,
            # Nobody knows this password, so the account can't be used until the person
            # chooses their own through the link.
            password_hash=hash_password(generate_token()),
            full_name=data.full_name,
            role=data.role,
        )
        try:
            self.users.add(member)
        except IntegrityError as error:
            # Someone took the address a moment ago: the unique index is the real guarantee.
            self.session.rollback()
            raise ConflictError(f"{data.email} already has an Inventra account") from error
        self._send_invitation(member, inviter)
        self.session.commit()
        return member

    def resend(self, store_id: int, inviter: User, member_id: int) -> User:
        member = self._get(store_id, member_id)
        if member.email_verified_at is not None:
            raise ConflictError(f"{member.full_name} has already joined")
        if not member.is_active:
            raise ConflictError(f"{member.full_name} was deactivated. Activate them first")
        self._send_invitation(member, inviter)
        self.session.commit()
        return member

    def update(self, store_id: int, member_id: int, data: MemberUpdate) -> User:
        member = self._get(store_id, member_id)
        changes = data.model_dump(exclude_unset=True)
        stops_being_owner = (
            member.role == UserRole.OWNER
            and member.is_active
            and (
                changes.get("role", UserRole.OWNER) != UserRole.OWNER
                or changes.get("active", True) is False
            )
        )
        if stops_being_owner:
            # Locked, so two owners can't demote each other at the same moment and leave none.
            owners = self.users.lock_active_owners(store_id)
            if not any(owner.id != member.id for owner in owners):
                self.session.rollback()
                raise LastOwnerError(
                    "The store needs at least one active owner. Make someone else an owner first"
                )

        if "role" in changes:
            member.role = changes["role"]
        if changes.get("active") is False and member.is_active:
            member.is_active = False
            # Out at once on every device, and an unused invitation stops working too.
            self.users.delete_all_sessions(member.id)
            self.users.invalidate_tokens(member.id, AuthTokenPurpose.INVITATION, datetime.now(UTC))
        elif changes.get("active") is True:
            member.is_active = True
        self.session.commit()
        return member

    def _get(self, store_id: int, member_id: int) -> User:
        member = self.users.get_member(store_id, member_id)
        if member is None:
            raise NotFoundError(f"Person {member_id} was not found")
        return member

    def _send_invitation(self, member: User, inviter: User) -> None:
        days = self.settings.invitation_lifetime_days
        token = self.auth.issue_token(member, AuthTokenPurpose.INVITATION, timedelta(days=days))
        link = f"{self.settings.web_app_url}/accept-invitation?token={token}"
        self.email_sender.send(
            member.email,
            f"{inviter.full_name} invited you to {inviter.store.name} on Inventra",
            f"Hello {member.full_name},\n\n{inviter.full_name} invited you to join "
            f"{inviter.store.name} on Inventra as {ROLE_NAMES[member.role]}.\n\n"
            f"Open this link to choose your password:\n{link}\n\n"
            f"The link is valid for {days} days and works once.",
        )
