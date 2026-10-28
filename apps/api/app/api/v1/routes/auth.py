"""HTTP endpoints for registration, email verification, login and logout."""

from fastapi import APIRouter, Request, Response, status

from app.api.deps import AuthServiceDep, CurrentUser, get_session_token
from app.core.config import get_settings
from app.schemas.auth import (
    CurrentUserRead,
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    ResendVerificationRequest,
    ResetPasswordRequest,
    VerifyEmailRequest,
)
from app.schemas.common import ErrorResponse

router = APIRouter(tags=["auth"])

CHECK_INBOX = "If this email can be used, we have sent a confirmation link to it"


@router.post("/auth/register", response_model=MessageResponse, status_code=202)
def register(data: RegisterRequest, auth: AuthServiceDep) -> MessageResponse:
    # Always the same answer, whether or not the email was already registered.
    auth.register(data)
    return MessageResponse(detail=CHECK_INBOX)


@router.post(
    "/auth/verify-email", response_model=MessageResponse, responses={400: {"model": ErrorResponse}}
)
def verify_email(data: VerifyEmailRequest, auth: AuthServiceDep) -> MessageResponse:
    auth.verify_email(data.token)
    return MessageResponse(detail="Your email is confirmed. You can now log in")


@router.post("/auth/resend-verification", response_model=MessageResponse, status_code=202)
def resend_verification(data: ResendVerificationRequest, auth: AuthServiceDep) -> MessageResponse:
    auth.resend_verification(data.email)
    return MessageResponse(detail=CHECK_INBOX)


@router.post("/auth/forgot-password", response_model=MessageResponse, status_code=202)
def forgot_password(data: ForgotPasswordRequest, auth: AuthServiceDep) -> MessageResponse:
    # Same answer whether or not the account exists.
    auth.request_password_reset(data.email)
    return MessageResponse(detail="If an account uses this email, we have sent a reset link to it")


@router.post(
    "/auth/reset-password",
    response_model=MessageResponse,
    responses={400: {"model": ErrorResponse}},
)
def reset_password(data: ResetPasswordRequest, auth: AuthServiceDep) -> MessageResponse:
    auth.reset_password(data)
    return MessageResponse(detail="Your password was changed. Log in with the new password")


@router.post(
    "/auth/login",
    response_model=CurrentUserRead,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse},
               429: {"model": ErrorResponse}},
)
def login(data: LoginRequest, request: Request, response: Response, auth: AuthServiceDep):
    settings = get_settings()
    token, user = auth.login(data, request.headers.get("user-agent"))
    response.set_cookie(
        settings.session_cookie_name,
        token,
        max_age=settings.session_lifetime_days * 24 * 60 * 60,
        httponly=True,  # JavaScript can't read it, so an XSS bug can't steal the session
        secure=settings.cookie_secure,  # only sent over HTTPS in production
        samesite="lax",  # not sent with requests started by other websites (CSRF protection)
    )
    return user


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response, auth: AuthServiceDep) -> None:
    token = get_session_token(request)
    if token:
        auth.logout(token)
    settings = get_settings()
    # Same attributes as when it was set, or some browsers keep the cookie.
    response.delete_cookie(
        settings.session_cookie_name, httponly=True, secure=settings.cookie_secure, samesite="lax"
    )


@router.get("/me", response_model=CurrentUserRead, responses={401: {"model": ErrorResponse}})
def me(user: CurrentUser):
    return user
