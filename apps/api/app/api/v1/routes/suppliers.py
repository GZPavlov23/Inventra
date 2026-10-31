"""HTTP endpoints for suppliers."""

from typing import Literal

from fastapi import APIRouter, Query

from app.api.deps import CurrentStore, SupplierServiceDep
from app.schemas.common import ErrorResponse
from app.schemas.supplier import SupplierCreate, SupplierPage, SupplierRead, SupplierUpdate

router = APIRouter(prefix="/suppliers", tags=["suppliers"])

NOT_FOUND = {404: {"model": ErrorResponse}}
CONFLICT = {409: {"model": ErrorResponse}}

STATUS_FILTER = {"active": True, "archived": False, "all": None}


@router.get("", response_model=SupplierPage)
def list_suppliers(
    store: CurrentStore,
    service: SupplierServiceDep,
    search: str | None = Query(None, max_length=100, description="Company or contact name"),
    status: Literal["active", "archived", "all"] = Query("active"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> SupplierPage:
    items, total = service.list_suppliers(
        store.id, search=search, active=STATUS_FILTER[status], limit=limit, offset=offset
    )
    return SupplierPage(
        items=[SupplierRead.model_validate(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("", response_model=SupplierRead, status_code=201, responses=CONFLICT)
def create_supplier(data: SupplierCreate, store: CurrentStore, service: SupplierServiceDep):
    return service.create_supplier(store.id, data)


@router.get("/{supplier_id}", response_model=SupplierRead, responses=NOT_FOUND)
def get_supplier(supplier_id: int, store: CurrentStore, service: SupplierServiceDep):
    return service.get_supplier(store.id, supplier_id)


@router.patch("/{supplier_id}", response_model=SupplierRead, responses={**NOT_FOUND, **CONFLICT})
def update_supplier(
    supplier_id: int, data: SupplierUpdate, store: CurrentStore, service: SupplierServiceDep
):
    return service.update_supplier(store.id, supplier_id, data)
