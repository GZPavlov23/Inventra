"""HTTP endpoint for the store's own details."""

from fastapi import APIRouter

from app.api.deps import CurrentStore, TeamServiceDep, allowed_to
from app.core.permissions import Permission
from app.schemas.auth import StoreRead, StoreUpdate

router = APIRouter(prefix="/store", tags=["store"])


@router.patch("", response_model=StoreRead, dependencies=[allowed_to(Permission.MANAGE_TEAM)])
def rename_store(data: StoreUpdate, store: CurrentStore, service: TeamServiceDep):
    """Only the name changes here. The currency stays, because every price is in it."""
    return service.rename_store(store, data)
