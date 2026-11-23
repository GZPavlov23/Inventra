"""The set-up list on a new store's dashboard: what is done, read from the data."""

from sqlalchemy.orm import Session

from app.core.permissions import Permission, can
from app.models.user import User
from app.repositories.setup_repository import SetupRepository
from app.schemas.setup import StoreSetup


class SetupService:
    def __init__(self, session: Session) -> None:
        self.setup = SetupRepository(session)

    def progress(self, user: User) -> StoreSetup:
        store_id = user.store_id
        team = (
            self.setup.has_colleagues(store_id, user.id)
            if can(user.role, Permission.MANAGE_TEAM)
            else None
        )
        steps = {
            "products": self.setup.has_products(store_id),
            "goods": self.setup.has_batches(store_id),
            "sales": self.setup.has_sales(store_id),
            "suppliers": self.setup.has_suppliers(store_id),
        }
        done = all(steps.values()) and team is not False
        return StoreSetup(**steps, team=team, done=done)
