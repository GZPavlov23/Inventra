"""Data access for products. The only layer that builds SQL queries for this table.

Every method takes store_id, so a query can never accidentally read another store's data.
"""

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.product import Product


class ProductRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self, store_id: int, product_id: int) -> Product | None:
        stmt = select(Product).where(Product.store_id == store_id, Product.id == product_id)
        return self.session.scalars(stmt).first()

    def get_by_barcode(self, store_id: int, barcode: str) -> Product | None:
        stmt = select(Product).where(Product.store_id == store_id, Product.barcode == barcode)
        return self.session.scalars(stmt).first()

    def list(
        self,
        store_id: int,
        *,
        search: str | None,
        active: bool | None,
        limit: int,
        offset: int,
    ) -> tuple[list[Product], int]:
        conditions = [Product.store_id == store_id]
        if active is not None:
            conditions.append(Product.active == active)
        if search:
            conditions.append(
                or_(
                    Product.name.icontains(search, autoescape=True),
                    Product.brand.icontains(search, autoescape=True),
                    Product.barcode.startswith(search, autoescape=True),
                )
            )

        total = self.session.scalar(select(func.count()).select_from(Product).where(*conditions))
        stmt = (
            select(Product)
            .where(*conditions)
            .order_by(Product.name, Product.id)
            .limit(limit)
            .offset(offset)
        )
        return list(self.session.scalars(stmt)), total or 0

    def add(self, product: Product) -> Product:
        self.session.add(product)
        self.session.flush()
        return product
