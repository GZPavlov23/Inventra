"""Shared FastAPI dependencies (injected into route functions with Depends)."""

from typing import Annotated, Any

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.email import EmailSender, get_email_sender
from app.core.exceptions import ForbiddenError, NotAuthenticatedError
from app.core.permissions import Permission, can
from app.db.session import get_db
from app.models.store import Store
from app.models.user import User
from app.services.auth_service import AuthService
from app.services.briefing_service import BriefingService
from app.services.delivery_service import DeliveryService
from app.services.forecast_service import ForecastService
from app.services.inventory_service import InventoryService
from app.services.product_service import ProductService
from app.services.report_service import ReportService
from app.services.sale_import_service import SaleImportService
from app.services.sale_service import SaleService
from app.services.setup_service import SetupService
from app.services.supplier_service import SupplierService
from app.services.team_service import TeamService

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


def allowed_to(permission: Permission) -> Any:
    """For a route's dependencies=[...]: refuses anyone whose role lacks this permission.

    Checked before the request body, so a refused request learns nothing about what it sent.
    """

    def check(user: CurrentUser) -> None:
        if not can(user.role, permission):
            raise ForbiddenError("Your role doesn't allow this. Ask the store's owner")

    return Depends(check)


def get_current_store(user: CurrentUser) -> Store:
    # The store always comes from the logged-in user, never from the request,
    # so nobody can ask for another store's data.
    return user.store


CurrentStore = Annotated[Store, Depends(get_current_store)]


def get_team_service(
    db: DbSession, email_sender: Annotated[EmailSender, Depends(get_email_sender)]
) -> TeamService:
    return TeamService(db, email_sender)


TeamServiceDep = Annotated[TeamService, Depends(get_team_service)]


def get_product_service(db: DbSession) -> ProductService:
    return ProductService(db)


ProductServiceDep = Annotated[ProductService, Depends(get_product_service)]


def get_supplier_service(db: DbSession) -> SupplierService:
    return SupplierService(db)


SupplierServiceDep = Annotated[SupplierService, Depends(get_supplier_service)]


def get_inventory_service(db: DbSession) -> InventoryService:
    return InventoryService(db)


InventoryServiceDep = Annotated[InventoryService, Depends(get_inventory_service)]


def get_delivery_service(db: DbSession) -> DeliveryService:
    return DeliveryService(db)


DeliveryServiceDep = Annotated[DeliveryService, Depends(get_delivery_service)]


def get_sale_service(db: DbSession) -> SaleService:
    return SaleService(db)


SaleServiceDep = Annotated[SaleService, Depends(get_sale_service)]


def get_report_service(db: DbSession) -> ReportService:
    return ReportService(db)


ReportServiceDep = Annotated[ReportService, Depends(get_report_service)]


def get_briefing_service(db: DbSession) -> BriefingService:
    return BriefingService(db)


BriefingServiceDep = Annotated[BriefingService, Depends(get_briefing_service)]


def get_setup_service(db: DbSession) -> SetupService:
    return SetupService(db)


SetupServiceDep = Annotated[SetupService, Depends(get_setup_service)]


def get_sale_import_service(db: DbSession) -> SaleImportService:
    return SaleImportService(db)


SaleImportServiceDep = Annotated[SaleImportService, Depends(get_sale_import_service)]


def get_forecast_service(db: DbSession) -> ForecastService:
    return ForecastService(db)


ForecastServiceDep = Annotated[ForecastService, Depends(get_forecast_service)]
