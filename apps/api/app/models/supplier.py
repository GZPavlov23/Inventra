from sqlalchemy import Boolean, ForeignKey, Index, String, func, select, text
from sqlalchemy.orm import Mapped, column_property, mapped_column

from app.db.base import Base, TimestampMixin
from app.models.product import Product


class Supplier(TimestampMixin, Base):
    """A company the store buys goods from."""

    __tablename__ = "suppliers"
    __table_args__ = (
        # "Dairy Ltd" and "dairy ltd" are one company inside a store. An archived supplier keeps
        # its name, so bringing a company back means restoring it, not adding a twin.
        Index("uq_suppliers_store_id_lower_name", "store_id", text("lower(name)"), unique=True),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id", ondelete="CASCADE"), index=True)

    name: Mapped[str] = mapped_column(String(200))
    contact_name: Mapped[str | None] = mapped_column(String(120))
    phone: Mapped[str | None] = mapped_column(String(32))
    email: Mapped[str | None] = mapped_column(String(254))
    # Things worth remembering when ordering, like "orders by Tuesday noon".
    notes: Mapped[str | None] = mapped_column(String(500))
    # Suppliers are archived, never hard-deleted, because deliveries will reference them.
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")

    # Calculated on every read, like Product.stock, so there is no second number to keep in sync.
    product_count: Mapped[int] = column_property(
        select(func.count(Product.id))
        .where(Product.supplier_id == id, Product.active)
        .correlate_except(Product)
        .scalar_subquery()
    )
