"""Business rules for the companies a store buys from."""

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, NotFoundError
from app.models.supplier import Supplier
from app.repositories.supplier_repository import SupplierRepository
from app.schemas.supplier import SupplierCreate, SupplierUpdate


class SupplierService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.suppliers = SupplierRepository(session)

    def list_suppliers(
        self,
        store_id: int,
        *,
        search: str | None,
        active: bool | None,
        limit: int,
        offset: int,
    ) -> tuple[list[Supplier], int]:
        return self.suppliers.search(
            store_id, search=search, active=active, limit=limit, offset=offset
        )

    def get_supplier(self, store_id: int, supplier_id: int) -> Supplier:
        supplier = self.suppliers.get(store_id, supplier_id)
        if supplier is None:
            raise NotFoundError(f"Supplier {supplier_id} was not found")
        return supplier

    def create_supplier(self, store_id: int, data: SupplierCreate) -> Supplier:
        self._ensure_name_free(store_id, data.name)
        supplier = Supplier(store_id=store_id, **data.model_dump())
        self.suppliers.add(supplier)
        self._commit()
        return supplier

    def update_supplier(self, store_id: int, supplier_id: int, data: SupplierUpdate) -> Supplier:
        supplier = self.get_supplier(store_id, supplier_id)
        changes = data.model_dump(exclude_unset=True)
        new_name = changes.get("name")
        if new_name and new_name.lower() != supplier.name.lower():
            self._ensure_name_free(store_id, new_name)
        for field, value in changes.items():
            setattr(supplier, field, value)
        self._commit()
        return supplier

    def _ensure_name_free(self, store_id: int, name: str) -> None:
        existing = self.suppliers.find_by_name(store_id, name)
        if existing is None:
            return
        where = "" if existing.active else " among the archived ones"
        raise ConflictError(f"'{existing.name}' already exists{where}")

    def _commit(self) -> None:
        # The check above gives a friendly message; the unique index is the real guarantee if
        # two requests add the same name at the same moment.
        try:
            self.session.commit()
        except IntegrityError as error:
            self.session.rollback()
            raise ConflictError("A supplier with this name already exists") from error
