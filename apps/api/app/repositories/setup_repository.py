"""Whether a store has any rows of a kind: the checks behind the set-up list."""

from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.models.batch import Batch
from app.models.demand_day import DemandDay
from app.models.product import Product
from app.models.sale import Sale
from app.models.supplier import Supplier
from app.models.user import User


class SetupRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def _any(self, model: type, store_id: int, *conditions: object) -> bool:
        # EXISTS stops at the first row it finds, so this stays fast in a store with years of data.
        stmt = select(exists().where(model.store_id == store_id, *conditions))
        return bool(self.session.scalar(stmt))

    def has_products(self, store_id: int) -> bool:
        return self._any(Product, store_id)

    def has_batches(self, store_id: int) -> bool:
        return self._any(Batch, store_id)

    def has_sales(self, store_id: int) -> bool:
        return self._any(Sale, store_id) or self._any(DemandDay, store_id)

    def has_suppliers(self, store_id: int) -> bool:
        return self._any(Supplier, store_id)

    def has_colleagues(self, store_id: int, user_id: int) -> bool:
        # An invitation already adds the person to the store, before they choose a password.
        return self._any(User, store_id, User.id != user_id)
