"""Shared FastAPI dependencies (injected into route functions with Depends)."""

from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import NotFoundError
from app.db.session import get_db
from app.models.store import Store
from app.services.product_service import ProductService

DbSession = Annotated[Session, Depends(get_db)]


def get_current_store(db: DbSession) -> Store:
    # TEMPORARY (Milestone 1): every request uses the configured demo store.
    # Milestone 2 replaces this with the store of the authenticated user (JWT),
    # without changing any route, service or repository code.
    store_id = get_settings().dev_store_id
    store = db.get(Store, store_id)
    if store is None:
        raise NotFoundError(f"Store {store_id} does not exist. Run: python -m scripts.seed_demo")
    return store


CurrentStore = Annotated[Store, Depends(get_current_store)]


def get_product_service(db: DbSession) -> ProductService:
    return ProductService(db)


ProductServiceDep = Annotated[ProductService, Depends(get_product_service)]
