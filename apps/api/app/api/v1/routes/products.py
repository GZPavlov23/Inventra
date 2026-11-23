"""HTTP endpoints for products. Routes only parse input, call the service and shape output."""

from datetime import date
from typing import Literal

from fastapi import APIRouter, Query

from app.api.deps import CurrentStore, ProductServiceDep, StoryServiceDep, allowed_to
from app.core.permissions import Permission
from app.schemas.common import ErrorResponse
from app.schemas.product import (
    ProductCreate,
    ProductPage,
    ProductRead,
    ProductSort,
    ProductUpdate,
    SortOrder,
)
from app.schemas.story import ProductStory

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
    sort: ProductSort = Query("name"),
    order: SortOrder = Query("asc"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> ProductPage:
    items, total = service.list_products(
        store.id,
        search=search,
        active=STATUS_FILTER[status],
        sort=sort,
        order=order,
        limit=limit,
        offset=offset,
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


@router.post(
    "",
    response_model=ProductRead,
    status_code=201,
    responses=CONFLICT,
    dependencies=[allowed_to(Permission.MANAGE_CATALOG)],
)
def create_product(data: ProductCreate, store: CurrentStore, service: ProductServiceDep):
    return service.create_product(store.id, data)


@router.get("/by-barcode/{barcode}", response_model=ProductRead, responses=NOT_FOUND)
def get_product_by_barcode(barcode: str, store: CurrentStore, service: ProductServiceDep):
    return service.get_product_by_barcode(store.id, barcode)


@router.get("/{product_id}", response_model=ProductRead, responses=NOT_FOUND)
def get_product(product_id: int, store: CurrentStore, service: ProductServiceDep):
    return service.get_product(store.id, product_id)


@router.get("/{product_id}/story", response_model=ProductStory, responses=NOT_FOUND)
def product_story(
    product_id: int,
    store: CurrentStore,
    service: StoryServiceDep,
    until: date | None = Query(None, description="The newest day shown, today if left out"),
    days: int = Query(30, ge=7, le=90, description="How many days, counting back from until"),
) -> ProductStory:
    """Everything that happened to the product, day by day, the newest first. Quantities only.

    `earlier` in the answer is the `until` for the next older stretch, so days with nothing
    in them are skipped.
    """
    return service.product_story(store.id, product_id, until=until or date.today(), days=days)


@router.patch(
    "/{product_id}",
    response_model=ProductRead,
    responses={**NOT_FOUND, **CONFLICT},
    dependencies=[allowed_to(Permission.MANAGE_CATALOG)],
)
def update_product(
    product_id: int, data: ProductUpdate, store: CurrentStore, service: ProductServiceDep
):
    return service.update_product(store.id, product_id, data)
