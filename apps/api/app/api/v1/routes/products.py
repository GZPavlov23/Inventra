"""HTTP endpoints for products. Routes only parse input, call the service and shape output."""

from typing import Literal

from fastapi import APIRouter, Query

from app.api.deps import CurrentStore, ProductServiceDep
from app.schemas.common import ErrorResponse
from app.schemas.product import ProductCreate, ProductPage, ProductRead, ProductUpdate

router = APIRouter(prefix="/products", tags=["products"])

NOT_FOUND = {404: {"model": ErrorResponse}}
CONFLICT = {409: {"model": ErrorResponse}}

# Which products a list request returns, mapped to the repository's `active` filter.
STATUS_FILTER = {"active": True, "archived": False, "all": None}


@router.get("", response_model=ProductPage)
def list_products(
    store: CurrentStore,
    service: ProductServiceDep,
    search: str | None = Query(None, max_length=100, description="Name, brand or barcode prefix"),
    status: Literal["active", "archived", "all"] = Query("active"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> ProductPage:
    items, total = service.list_products(
        store.id, search=search, active=STATUS_FILTER[status], limit=limit, offset=offset
    )
    return ProductPage(
        items=[ProductRead.model_validate(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


# Declared before /{product_id}, otherwise "categories" would be read as a product id.
@router.get("/categories", response_model=list[str])
def list_categories(store: CurrentStore, service: ProductServiceDep) -> list[str]:
    """The categories already used in this store, in alphabetical order."""
    return service.list_categories(store.id)


@router.post("", response_model=ProductRead, status_code=201, responses=CONFLICT)
def create_product(data: ProductCreate, store: CurrentStore, service: ProductServiceDep):
    return service.create_product(store.id, data)


@router.get("/by-barcode/{barcode}", response_model=ProductRead, responses=NOT_FOUND)
def get_product_by_barcode(barcode: str, store: CurrentStore, service: ProductServiceDep):
    return service.get_product_by_barcode(store.id, barcode)


@router.get("/{product_id}", response_model=ProductRead, responses=NOT_FOUND)
def get_product(product_id: int, store: CurrentStore, service: ProductServiceDep):
    return service.get_product(store.id, product_id)


@router.patch("/{product_id}", response_model=ProductRead, responses={**NOT_FOUND, **CONFLICT})
def update_product(
    product_id: int, data: ProductUpdate, store: CurrentStore, service: ProductServiceDep
):
    return service.update_product(store.id, product_id, data)
