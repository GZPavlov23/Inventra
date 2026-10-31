"""Data access for suppliers. Every method takes store_id, like the other repositories."""

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.supplier import Supplier
from app.repositories.product_repository import ALPHABETICAL


class SupplierRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self, store_id: int, supplier_id: int) -> Supplier | None:
        stmt = select(Supplier).where(Supplier.store_id == store_id, Supplier.id == supplier_id)
        return self.session.scalars(stmt).first()

    def find_by_name(self, store_id: int, name: str) -> Supplier | None:
        stmt = select(Supplier).where(
            Supplier.store_id == store_id, func.lower(Supplier.name) == func.lower(name)
        )
        return self.session.scalars(stmt).first()

    def search(
        self,
        store_id: int,
        *,
        search: str | None,
        active: bool | None,
        limit: int,
        offset: int,
    ) -> tuple[list[Supplier], int]:
        conditions = [Supplier.store_id == store_id]
        if active is not None:
            conditions.append(Supplier.active == active)
        if search:
            conditions.append(
                or_(
                    Supplier.name.icontains(search, autoescape=True),
                    Supplier.contact_name.icontains(search, autoescape=True),
                )
            )

        total = self.session.scalar(select(func.count()).select_from(Supplier).where(*conditions))
        stmt = (
            select(Supplier)
            .where(*conditions)
            .order_by(Supplier.name.collate(ALPHABETICAL), Supplier.id)
            .limit(limit)
            .offset(offset)
        )
        return list(self.session.scalars(stmt)), total or 0

    def add(self, supplier: Supplier) -> Supplier:
        self.session.add(supplier)
        self.session.flush()
        return supplier
