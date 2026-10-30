"""HTTP endpoints for batches and their stock history."""

from fastapi import APIRouter, Query

from app.api.deps import CurrentStore, CurrentUser, InventoryServiceDep
from app.schemas.common import ErrorResponse
from app.schemas.inventory import (
    AdjustmentCreate,
    BatchPage,
    BatchRead,
    BatchStatus,
    InventorySummary,
    MovementPage,
    MovementRead,
    ReceiptCreate,
    WasteCreate,
)

router = APIRouter(prefix="/batches", tags=["inventory"])

NOT_FOUND = {404: {"model": ErrorResponse}}
CONFLICT = {409: {"model": ErrorResponse}}


@router.get("", response_model=BatchPage)
def list_batches(
    store: CurrentStore,
    service: InventoryServiceDep,
    product_id: int | None = Query(None),
    status: BatchStatus = Query("in_stock"),
    search: str | None = Query(
        None, max_length=100, description="Product name, brand, barcode prefix or lot code"
    ),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> BatchPage:
    """Batches in the order they should leave the shelf: the earliest expiry date first."""
    items, total = service.list_batches(
        store.id,
        product_id=product_id,
        status=status,
        search=search,
        limit=limit,
        offset=offset,
    )
    return BatchPage(
        items=[BatchRead.model_validate(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/summary", response_model=InventorySummary)
def summarize_stock(store: CurrentStore, service: InventoryServiceDep) -> InventorySummary:
    """What the stock is worth at purchase prices, and how much of it needs attention."""
    return service.summarize(store.id)


@router.post("", response_model=BatchRead, status_code=201, responses={**NOT_FOUND, **CONFLICT})
def receive_goods(data: ReceiptCreate, user: CurrentUser, service: InventoryServiceDep):
    """Goods arrived in the store: creates a new batch and its history line."""
    return service.receive(user.store_id, user.id, data)


@router.post("/{batch_id}/waste", response_model=BatchRead, responses={**NOT_FOUND, **CONFLICT})
def write_off(batch_id: int, data: WasteCreate, user: CurrentUser, service: InventoryServiceDep):
    """Goods were thrown away: expired, damaged or another reason."""
    return service.write_off(user.store_id, user.id, batch_id, data)


@router.post(
    "/{batch_id}/adjustments", response_model=BatchRead, responses={**NOT_FOUND, **CONFLICT}
)
def adjust(batch_id: int, data: AdjustmentCreate, user: CurrentUser, service: InventoryServiceDep):
    """A correction after counting the shelf. A positive number adds stock, a negative removes."""
    return service.adjust(user.store_id, user.id, batch_id, data)


@router.get("/{batch_id}/movements", response_model=MovementPage, responses=NOT_FOUND)
def list_movements(
    batch_id: int,
    store: CurrentStore,
    service: InventoryServiceDep,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> MovementPage:
    """The full history of one batch, newest first."""
    items, total = service.list_movements(store.id, batch_id, limit=limit, offset=offset)
    return MovementPage(
        items=[MovementRead.model_validate(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )
