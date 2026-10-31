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
from app.services.delivery_service import DeliveryService
from app.services.forecast_service import ForecastService
from app.services.inventory_service import InventoryService
from app.services.product_service import ProductService
from app.services.report_service import ReportService
from app.services.sale_import_service import SaleImportService
from app.services.sale_service import SaleService
from app.services.supplier_service import SupplierService

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


def get_sale_import_service(db: DbSession) -> SaleImportService:
    return SaleImportService(db)


SaleImportServiceDep = Annotated[SaleImportService, Depends(get_sale_import_service)]


def get_forecast_service(db: DbSession) -> ForecastService:
    return ForecastService(db)


ForecastServiceDep = Annotated[ForecastService, Depends(get_forecast_service)]
