"""HTTP endpoints for demand forecasts."""

from fastapi import APIRouter, Query

from app.api.deps import CurrentStore, ForecastServiceDep
from app.schemas.forecast import AccuracyReport, ForecastReport

router = APIRouter(prefix="/forecasts", tags=["forecasts"])


@router.get("", response_model=ForecastReport)
def forecast_demand(
    store: CurrentStore,
    service: ForecastServiceDep,
    horizon: int = Query(7, ge=1, le=14, description="Days to forecast, starting today"),
) -> ForecastReport:
    """Expected sales per product, the biggest shortage first."""
    return service.forecast(store.id, horizon)


@router.get("/accuracy", response_model=AccuracyReport)
def forecast_accuracy(store: CurrentStore, service: ForecastServiceDep) -> AccuracyReport:
    """How wrong the model would have been on this store's last four weeks."""
    return service.accuracy(store.id)
