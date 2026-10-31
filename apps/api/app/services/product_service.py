"""Business rules for the product catalog.

Routes call this service; it uses the repository for data access and owns the transaction
(commit/rollback). It raises domain errors and never imports anything from FastAPI.
"""

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import (
    ConflictError,
    NotFoundError,
    SupplierArchivedError,
    UnitLockedError,
)
from app.models.product import Product
from app.repositories.product_repository import ProductRepository
from app.repositories.supplier_repository import SupplierRepository
from app.schemas.product import ProductCreate, ProductSort, ProductUpdate, SortOrder


class ProductService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.products = ProductRepository(session)
        self.suppliers = SupplierRepository(session)

    def list_products(
        self,
        store_id: int,
        *,
        search: str | None,
        active: bool | None,
        sort: ProductSort,
        order: SortOrder,
        limit: int,
        offset: int,
    ) -> tuple[list[Product], int]:
        return self.products.search(
            store_id,
            search=search,
            active=active,
            sort=sort,
            order=order,
            limit=limit,
            offset=offset,
        )

    def list_categories(self, store_id: int) -> list[str]:
        return self.products.list_categories(store_id)

    def get_product(self, store_id: int, product_id: int) -> Product:
        product = self.products.get(store_id, product_id)
        if product is None:
            raise NotFoundError(f"Product {product_id} was not found")
        return product

    def get_product_by_barcode(self, store_id: int, barcode: str) -> Product:
        product = self.products.get_by_barcode(store_id, barcode)
        if product is None:
            raise NotFoundError(f"No product with barcode {barcode}")
        return product

    def create_product(self, store_id: int, data: ProductCreate) -> Product:
        if data.barcode:
            self._ensure_barcode_free(store_id, data.barcode)
        self._ensure_supplier_usable(store_id, data.supplier_id)
        values = data.model_dump()
        values["category"] = self._existing_spelling(store_id, values["category"])
        product = Product(store_id=store_id, **values)
        self.products.add(product)
        self._commit()
        return product

    def update_product(self, store_id: int, product_id: int, data: ProductUpdate) -> Product:
        product = self.get_product(store_id, product_id)
        changes = data.model_dump(exclude_unset=True)
        new_barcode = changes.get("barcode")
        if new_barcode and new_barcode != product.barcode:
            self._ensure_barcode_free(store_id, new_barcode)
        new_unit = changes.get("unit")
        if new_unit and new_unit != product.unit and self.products.has_batches(product.id):
            # The stock history would change its meaning: 1.5 kg must not become 1.5 pieces.
            raise UnitLockedError(f"'{product.name}' already has batches, its unit can't change")
        new_supplier = changes.get("supplier_id")
        if new_supplier != product.supplier_id:
            self._ensure_supplier_usable(store_id, new_supplier)
        if "category" in changes:
            changes["category"] = self._existing_spelling(store_id, changes["category"])
        for field, value in changes.items():
            setattr(product, field, value)
        self._commit()
        # Otherwise the response would still show the supplier loaded before the change.
        self.session.refresh(product)
        return product

    def _existing_spelling(self, store_id: int, category: str | None) -> str | None:
        # The first spelling in a store wins, so "dairy" and "Dairy" stay one category
        # no matter which client (web, mobile, CSV import) sends the data.
        if category is None:
            return None
        return self.products.find_category(store_id, category) or category

    def _ensure_barcode_free(self, store_id: int, barcode: str) -> None:
        existing = self.products.get_by_barcode(store_id, barcode)
        if existing is not None:
            raise ConflictError(f"Barcode {barcode} is already used by '{existing.name}'")

    def _ensure_supplier_usable(self, store_id: int, supplier_id: int | None) -> None:
        # Checked against the logged-in store, so a product can't point at another store's supplier.
        if supplier_id is None:
            return
        supplier = self.suppliers.get(store_id, supplier_id)
        if supplier is None:
            raise NotFoundError(f"Supplier {supplier_id} was not found")
        if not supplier.active:
            raise SupplierArchivedError(f"'{supplier.name}' is archived")

    def _commit(self) -> None:
        # The pre-check above gives a friendly message; the database unique constraint is
        # the real guarantee if two requests create the same barcode at the same moment.
        try:
            self.session.commit()
        except IntegrityError as error:
            self.session.rollback()
            raise ConflictError("Barcode is already used by another product") from error
