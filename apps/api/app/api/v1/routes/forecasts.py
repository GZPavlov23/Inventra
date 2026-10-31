"""HTTP endpoints for demand forecasts."""

from fastapi import APIRouter, Query

from app.api.deps import CurrentStore, ForecastServiceDep
from app.schemas.forecast import AccuracyReport, ForecastReport, OrderReport

router = APIRouter(prefix="/forecasts", tags=["forecasts"])


@router.get("", response_model=ForecastReport)
def forecast_demand(
    store: CurrentStore,
    service: ForecastServiceDep,
    horizon: int = Query(7, ge=1, le=14, description="Days to forecast, starting today"),
) -> ForecastReport:
    """Expected sales per product, the biggest shortage first."""
    return service.forecast(store.id, horizon)


@router.get("/orders", response_model=OrderReport)
def recommend_orders(
    store: CurrentStore,
    service: ForecastServiceDep,
    days: int = Query(7, ge=1, le=14, description="Days the order should cover, starting today"),
) -> OrderReport:
    """What to order and how much, with the arithmetic behind every number."""
    return service.orders(store.id, days)


@router.get("/accuracy", response_model=AccuracyReport)
def forecast_accuracy(store: CurrentStore, service: ForecastServiceDep) -> AccuracyReport:
    """How wrong the model would have been on this store's last four weeks."""
    return service.accuracy(store.id)
