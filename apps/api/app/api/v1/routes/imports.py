"""HTTP endpoints for importing data from files."""

from fastapi import APIRouter

from app.api.deps import CurrentUser, SaleImportServiceDep
from app.schemas.sale_import import SalesImportReport, SalesImportRequest

router = APIRouter(prefix="/imports", tags=["imports"])


@router.post("/sales", response_model=SalesImportReport)
def import_sales(data: SalesImportRequest, user: CurrentUser, service: SaleImportServiceDep):
    """Checks a CSV file of sales, or imports it with `dry_run: false`. All rows or none."""
    return service.import_sales(user.store_id, user.id, data)
