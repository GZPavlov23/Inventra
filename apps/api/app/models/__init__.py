# Import every model here so Alembic autogenerate and tests see the full schema.
from app.models.auth_token import AuthToken, AuthTokenPurpose
from app.models.batch import Batch, ExpiryStatus
from app.models.demand_day import DemandDay
from app.models.inventory_movement import InventoryMovement, MovementType
from app.models.product import Product, ProductUnit
from app.models.sale import Sale, SaleItem
from app.models.store import Store
from app.models.user import User, UserRole
from app.models.user_session import UserSession

__all__ = [
    "AuthToken",
    "AuthTokenPurpose",
    "Batch",
    "DemandDay",
    "ExpiryStatus",
    "InventoryMovement",
    "MovementType",
    "Product",
    "ProductUnit",
    "Sale",
    "SaleItem",
    "Store",
    "User",
    "UserRole",
    "UserSession",
]
