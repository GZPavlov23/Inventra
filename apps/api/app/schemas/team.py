from datetime import datetime
from enum import StrEnum
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, computed_field, model_validator

from app.models.user import UserRole
from app.schemas.auth import Email, Name


class MemberStatus(StrEnum):
    ACTIVE = "active"
    INVITED = "invited"  # hasn't chosen a password yet
    DEACTIVATED = "deactivated"  # stopped by the owner: can't log in


class TeamMember(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    email: str
    role: UserRole
    created_at: datetime
    # Read from the user, never sent by a client.
    is_active: bool
    email_verified_at: datetime | None

    @computed_field
    @property
    def status(self) -> MemberStatus:
        if not self.is_active:
            return MemberStatus.DEACTIVATED
        if self.email_verified_at is None:
            return MemberStatus.INVITED
        return MemberStatus.ACTIVE


class InvitationCreate(BaseModel):
    email: Email
    full_name: Name
    # Owners are made by promoting someone who already works there, not by an email.
    role: Literal[UserRole.MANAGER, UserRole.STAFF]


class MemberUpdate(BaseModel):
    """PATCH body: only what is sent changes."""

    role: UserRole | None = None
    active: bool | None = None

    @model_validator(mode="after")
    def nothing_is_null(self) -> Self:
        for field in self.model_fields_set:
            if getattr(self, field) is None:
                raise ValueError(f"'{field}' cannot be null")
        return self
