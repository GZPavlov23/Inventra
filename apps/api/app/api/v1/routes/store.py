"""HTTP endpoint for the store's own details."""

from fastapi import APIRouter

from app.api.deps import CurrentStore, CurrentUser, SetupServiceDep, TeamServiceDep, allowed_to
from app.core.permissions import Permission
from app.schemas.auth import StoreRead, StoreUpdate
from app.schemas.setup import StoreSetup

router = APIRouter(prefix="/store", tags=["store"])


@router.patch("", response_model=StoreRead, dependencies=[allowed_to(Permission.MANAGE_TEAM)])
def rename_store(data: StoreUpdate, store: CurrentStore, service: TeamServiceDep):
    """Only the name changes here. The currency stays, because every price is in it."""
    return service.rename_store(store, data)


@router.get("/setup", response_model=StoreSetup, dependencies=[allowed_to(Permission.SEE_FINANCES)])
def store_setup(user: CurrentUser, service: SetupServiceDep) -> StoreSetup:
    """The first steps of a new store, for the list on the dashboard: done or not."""
    return service.progress(user)
