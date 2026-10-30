"""Data access for products. The only layer that builds SQL queries for this table.

Every method takes store_id, so a query can never accidentally read another store's data.
"""

from sqlalchemy import ColumnElement, exists, func, or_, select
from sqlalchemy.orm import Session

from app.models.batch import Batch
from app.models.product import Product
from app.schemas.product import ProductSort, SortOrder

# Unicode (ICU) sort order: alphabetical for Latin and Cyrillic alike. The operating system's
# default collation sorts Bulgarian names wrongly on macOS, so we never rely on it.
ALPHABETICAL = "und-x-icu"

# The only columns a list can be sorted by; the API can't ask for anything else.
SORT_COLUMNS = {
    "name": Product.name.collate(ALPHABETICAL),
    "category": Product.category.collate(ALPHABETICAL),
    "purchase_price": Product.purchase_price,
    "sale_price": Product.sale_price,
    # NULLIF avoids dividing by zero: a free product simply has no margin.
    "margin": (Product.sale_price - Product.purchase_price) / func.nullif(Product.sale_price, 0),
    "stock": Product.stock,
}


def matches_search(search: str) -> ColumnElement[bool]:
    return or_(
        Product.name.icontains(search, autoescape=True),
        Product.brand.icontains(search, autoescape=True),
        Product.barcode.startswith(search, autoescape=True),
    )


class ProductRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self, store_id: int, product_id: int) -> Product | None:
        stmt = select(Product).where(Product.store_id == store_id, Product.id == product_id)
        return self.session.scalars(stmt).first()

    def get_by_barcode(self, store_id: int, barcode: str) -> Product | None:
        stmt = select(Product).where(Product.store_id == store_id, Product.barcode == barcode)
        return self.session.scalars(stmt).first()

    def all_in_store(self, store_id: int) -> list[Product]:
        return list(self.session.scalars(select(Product).where(Product.store_id == store_id)))

    def search(
        self,
        store_id: int,
        *,
        search: str | None,
        active: bool | None,
        sort: ProductSort = "name",
        order: SortOrder = "asc",
        limit: int,
        offset: int,
    ) -> tuple[list[Product], int]:
        conditions = [Product.store_id == store_id]
        if active is not None:
            conditions.append(Product.active == active)
        if search:
            conditions.append(matches_search(search))

        total = self.session.scalar(select(func.count()).select_from(Product).where(*conditions))
        column = SORT_COLUMNS[sort]
        ordering = column.desc() if order == "desc" else column.asc()
        stmt = (
            select(Product)
            .where(*conditions)
            .order_by(ordering.nulls_last(), Product.name.collate(ALPHABETICAL), Product.id)
            .limit(limit)
            .offset(offset)
        )
        return list(self.session.scalars(stmt)), total or 0

    def list_categories(self, store_id: int) -> list[str]:
        stmt = (
            select(Product.category)
            .where(Product.store_id == store_id, Product.category.is_not(None))
            .group_by(Product.category)
            .order_by(Product.category.collate(ALPHABETICAL))
        )
        return list(self.session.scalars(stmt))

    def find_category(self, store_id: int, category: str) -> str | None:
        """The spelling already used in this store, ignoring upper and lower case."""
        stmt = (
            select(Product.category)
            .where(
                Product.store_id == store_id,
                func.lower(Product.category) == func.lower(category),
            )
            .order_by(Product.id)
            .limit(1)
        )
        return self.session.scalar(stmt)

    def has_batches(self, product_id: int) -> bool:
        return self.session.scalar(select(exists().where(Batch.product_id == product_id)))

    def add(self, product: Product) -> Product:
        self.session.add(product)
        self.session.flush()
        return product
