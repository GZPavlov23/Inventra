from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, Field, StringConstraints

from app.models.user import UserRole

# Emails are compared case-insensitively, so they are always lowercased before use.
Email = Annotated[EmailStr, AfterValidator(str.lower)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
# Length is what matters most for password strength (NIST SP 800-63B): at least 8 characters,
# and long passphrases are allowed. No rules like "must contain a symbol".
NewPassword = Annotated[str, Field(min_length=8, max_length=128)]


class RegisterRequest(BaseModel):
    full_name: Name
    email: Email
    password: NewPassword
    store_name: Name


class LoginRequest(BaseModel):
    email: Email
    # No minimum length here: a login attempt is only checked against the stored hash.
    password: Annotated[str, Field(max_length=128)]


class VerifyEmailRequest(BaseModel):
    token: Annotated[str, Field(min_length=1, max_length=128)]


class ResendVerificationRequest(BaseModel):
    email: Email


class ForgotPasswordRequest(BaseModel):
    email: Email


class ResetPasswordRequest(BaseModel):
    token: Annotated[str, Field(min_length=1, max_length=128)]
    new_password: NewPassword


class MessageResponse(BaseModel):
    detail: str


class StoreRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    currency: str


class CurrentUserRead(BaseModel):
    """What the client may know about the logged-in user (never the password hash)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    full_name: str
    role: UserRole
    store: StoreRead
