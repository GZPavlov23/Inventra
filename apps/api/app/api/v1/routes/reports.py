"""HTTP endpoints for the dashboard's reports."""

from datetime import date

from fastapi import APIRouter, Query

from app.api.deps import CurrentStore, ReportServiceDep
from app.schemas.report import (
    CategorySales,
    RunningOutProduct,
    SalesTrend,
    TopProduct,
    WasteReport,
)

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/sales-trend", response_model=list[SalesTrend])
def sales_trend_report(
    store: CurrentStore,
    service: ReportServiceDep,
    product_id: list[int] = Query(min_length=1, max_length=200, description="One or more"),
    days: int = Query(14, ge=7, le=60),
) -> list[SalesTrend]:
    """Sold per day over the last finished days, today left out because it isn't over."""
    return service.sales_trend(store.id, set(product_id), days)


@router.get("/waste", response_model=WasteReport)
def waste_report(
    store: CurrentStore,
    service: ReportServiceDep,
    date_from: date = Query(description="First day, included"),
    date_to: date = Query(description="Last day, included"),
) -> WasteReport:
    """What thrown-away goods cost, in total and per reason."""
    return service.waste(store.id, date_from=date_from, date_to=date_to)


@router.get("/running-out", response_model=list[RunningOutProduct])
def running_out_report(store: CurrentStore, service: ReportServiceDep) -> list[RunningOutProduct]:
    """Products whose stock lasts a week or less at their recent average sales."""
    return service.running_out(store.id)


@router.get("/top-products", response_model=list[TopProduct])
def top_products_report(
    store: CurrentStore,
    service: ReportServiceDep,
    date_from: date = Query(description="First day, included"),
    date_to: date = Query(description="Last day, included"),
    limit: int = Query(5, ge=1, le=50),
) -> list[TopProduct]:
    """The products that earned the most, the most profitable first."""
    return service.top_products(store.id, date_from=date_from, date_to=date_to, limit=limit)


@router.get("/categories", response_model=list[CategorySales])
def categories_report(
    store: CurrentStore,
    service: ReportServiceDep,
    date_from: date = Query(description="First day, included"),
    date_to: date = Query(description="Last day, included"),
) -> list[CategorySales]:
    """Revenue and profit per category, the biggest revenue first."""
    return service.categories(store.id, date_from=date_from, date_to=date_to)
