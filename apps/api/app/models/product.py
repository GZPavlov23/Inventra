from decimal import Decimal
from enum import StrEnum

from sqlalchemy import Boolean, CheckConstraint, Enum, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class ProductUnit(StrEnum):
    PIECE = "pcs"
    KILOGRAM = "kg"
    LITER = "l"


class Product(TimestampMixin, Base):
    __tablename__ = "products"
    __table_args__ = (
        # One barcode can belong to only one product inside a store.
        # PostgreSQL allows many NULLs, so products without a barcode are fine.
        UniqueConstraint("store_id", "barcode"),
        CheckConstraint("purchase_price >= 0", name="purchase_price_non_negative"),
        CheckConstraint("sale_price >= 0", name="sale_price_non_negative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id", ondelete="CASCADE"), index=True)

    name: Mapped[str] = mapped_column(String(200))
    brand: Mapped[str | None] = mapped_column(String(120))
    barcode: Mapped[str | None] = mapped_column(String(14))
    category: Mapped[str | None] = mapped_column(String(80))
    unit: Mapped[ProductUnit] = mapped_column(
        Enum(
            ProductUnit,
            name="product_unit",
            native_enum=False,
            # Adds a CHECK constraint so the database itself rejects unknown units.
            create_constraint=True,
            length=8,
            values_callable=lambda enum: [member.value for member in enum],
        ),
        default=ProductUnit.PIECE,
    )
    purchase_price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    sale_price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    # Products are archived, never hard-deleted, because stock history will reference them.
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
