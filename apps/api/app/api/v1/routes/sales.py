"""HTTP endpoints for sales."""

from datetime import date

from fastapi import APIRouter, Query

from app.api.deps import CurrentStore, CurrentUser, SaleServiceDep
from app.schemas.common import ErrorResponse
from app.schemas.sale import DailySales, SaleCreate, SalePage, SaleRead, SaleSummary

router = APIRouter(prefix="/sales", tags=["sales"])

NOT_FOUND = {404: {"model": ErrorResponse}}
CONFLICT = {409: {"model": ErrorResponse}}


@router.get("", response_model=SalePage)
def list_sales(
    store: CurrentStore,
    service: SaleServiceDep,
    date_from: date | None = Query(None, description="First day, included"),
    date_to: date | None = Query(None, description="Last day, included"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> SalePage:
    """Sales of a period, newest first."""
    items, total = service.list_sales(
        store.id, date_from=date_from, date_to=date_to, limit=limit, offset=offset
    )
    return SalePage(
        items=[SaleRead.model_validate(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


# Declared before /{sale_id}, otherwise "summary" and "daily" would be read as sale ids.
@router.get("/summary", response_model=SaleSummary)
def summarize_sales(
    store: CurrentStore,
    service: SaleServiceDep,
    date_from: date | None = Query(None, description="First day, included"),
    date_to: date | None = Query(None, description="Last day, included"),
) -> SaleSummary:
    """Number of sales, revenue, cost and profit of a whole period."""
    return service.summarize(store.id, date_from=date_from, date_to=date_to)


@router.get("/daily", response_model=list[DailySales])
def daily_sales(
    store: CurrentStore,
    service: SaleServiceDep,
    date_from: date = Query(description="First day, included"),
    date_to: date = Query(description="Last day, included"),
) -> list[DailySales]:
    """One row for every day of the period, also for days without sales."""
    return service.daily(store.id, date_from=date_from, date_to=date_to)


@router.post("", response_model=SaleRead, status_code=201, responses={**NOT_FOUND, **CONFLICT})
def record_sale(data: SaleCreate, user: CurrentUser, service: SaleServiceDep):
    """Records a sale. Stock leaves from the batches that expire first."""
    return service.record(user.store_id, user.id, data)


@router.get("/{sale_id}", response_model=SaleRead, responses=NOT_FOUND)
def get_sale(sale_id: int, store: CurrentStore, service: SaleServiceDep):
    return service.get_sale(store.id, sale_id)
