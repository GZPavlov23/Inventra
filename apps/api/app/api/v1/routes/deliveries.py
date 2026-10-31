"""HTTP endpoints for deliveries."""

from fastapi import APIRouter, Query

from app.api.deps import CurrentStore, CurrentUser, DeliveryServiceDep
from app.models.delivery import DeliveryStatus
from app.schemas.common import ErrorResponse
from app.schemas.delivery import (
    DeliveryCreate,
    DeliveryFilter,
    DeliveryPage,
    DeliveryRead,
    DeliveryReceipt,
)

router = APIRouter(prefix="/deliveries", tags=["deliveries"])

NOT_FOUND = {404: {"model": ErrorResponse}}
CONFLICT = {409: {"model": ErrorResponse}}


@router.get("", response_model=DeliveryPage)
def list_deliveries(
    store: CurrentStore,
    service: DeliveryServiceDep,
    status: DeliveryFilter = Query("all"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> DeliveryPage:
    """Deliveries, newest first."""
    items, total = service.list_deliveries(
        store.id,
        status=None if status == "all" else DeliveryStatus(status),
        limit=limit,
        offset=offset,
    )
    return DeliveryPage(
        items=[DeliveryRead.model_validate(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("", response_model=DeliveryRead, status_code=201, responses={**NOT_FOUND, **CONFLICT})
def create_delivery(data: DeliveryCreate, user: CurrentUser, service: DeliveryServiceDep):
    """Records an order. Stock changes only when the goods are received."""
    return service.create(user.store_id, user.id, data)


@router.get("/{delivery_id}", response_model=DeliveryRead, responses=NOT_FOUND)
def get_delivery(delivery_id: int, store: CurrentStore, service: DeliveryServiceDep):
    return service.get_delivery(store.id, delivery_id)


@router.post(
    "/{delivery_id}/receive", response_model=DeliveryRead, responses={**NOT_FOUND, **CONFLICT}
)
def receive_delivery(
    delivery_id: int, data: DeliveryReceipt, user: CurrentUser, service: DeliveryServiceDep
):
    """Turns what really arrived into batches. All lines are accepted, or none."""
    return service.receive(user.store_id, user.id, delivery_id, data)


@router.post(
    "/{delivery_id}/cancel", response_model=DeliveryRead, responses={**NOT_FOUND, **CONFLICT}
)
def cancel_delivery(delivery_id: int, store: CurrentStore, service: DeliveryServiceDep):
    return service.cancel(store.id, delivery_id)
