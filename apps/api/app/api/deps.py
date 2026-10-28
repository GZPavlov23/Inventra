"""Shared FastAPI dependencies (injected into route functions with Depends)."""

from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.email import EmailSender, get_email_sender
from app.core.exceptions import NotAuthenticatedError
from app.db.session import get_db
from app.models.store import Store
from app.models.user import User
from app.services.auth_service import AuthService
from app.services.product_service import ProductService

DbSession = Annotated[Session, Depends(get_db)]


def get_auth_service(
    db: DbSession, email_sender: Annotated[EmailSender, Depends(get_email_sender)]
) -> AuthService:
    return AuthService(db, email_sender)


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]


def get_session_token(request: Request) -> str | None:
    return request.cookies.get(get_settings().session_cookie_name)


def get_current_user(request: Request, auth: AuthServiceDep) -> User:
    """Every protected route depends on this: no valid session, no access (HTTP 401)."""
    token = get_session_token(request)
    if not token:
        raise NotAuthenticatedError("You are not logged in")
    user = auth.get_user_for_session(token)
    if user is None:
        raise NotAuthenticatedError("Your session has expired. Please log in again")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_current_store(user: CurrentUser) -> Store:
    # The store always comes from the logged-in user, never from the request,
    # so nobody can ask for another store's data.
    return user.store


CurrentStore = Annotated[Store, Depends(get_current_store)]


def get_product_service(db: DbSession) -> ProductService:
    return ProductService(db)


ProductServiceDep = Annotated[ProductService, Depends(get_product_service)]
