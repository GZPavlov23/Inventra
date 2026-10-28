"""Fills the database with a DEMO store and products, so the API has data to work with.

Run from apps/api after `alembic upgrade head`:
    macOS:   .venv/bin/python -m scripts.seed_demo
    Windows: .venv\\Scripts\\python -m scripts.seed_demo

Safe to run many times: existing records are skipped, never duplicated.

It also creates a verified DEMO owner account (credentials below) for testing and for the jury.

All data here is fictional DEMO data. Barcodes use the GS1 prefix 200, which is reserved for
in-store use and never assigned to real retail products, so they can't clash with a real scan.
"""

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.product import Product, ProductUnit
from app.models.store import Store
from app.models.user import User, UserRole
from app.repositories.product_repository import ProductRepository
from app.schemas.product import ProductCreate
from app.services.product_service import ProductService

DEMO_STORE_NAME = "Демо магазин (демо данни)"

# Public test account. ".example" is a domain reserved for examples (RFC 2606), so it can never
# belong to a real person.
DEMO_OWNER_EMAIL = "owner@inventra.example"
DEMO_OWNER_PASSWORD = "Inventra-demo-2026"

PCS, KG = ProductUnit.PIECE, ProductUnit.KILOGRAM

# (name, brand, barcode, category, unit, purchase_price, sale_price)
DEMO_PRODUCTS = [
    ("Прясно мляко 3% 1 л", "Зелена долина", "2000000000015", "Млечни", PCS, "1.10", "1.59"),
    ("Кисело мляко 3.6% 400 г", "Зелена долина", "2000000000022", "Млечни", PCS, "0.65", "0.99"),
    ("Сирене краве 400 г", "Зелена долина", "2000000000039", "Млечни", PCS, "3.80", "5.49"),
    ("Бял хляб 500 г", "Пекарна Изгрев", "2000000000046", "Хляб", PCS, "0.70", "1.09"),
    ("Пълнозърнест хляб 400 г", "Пекарна Изгрев", "2000000000053", "Хляб", PCS, "0.95", "1.49"),
    ("Яйца размер M 10 бр.", "Ферма Слънце", "2000000000060", "Яйца", PCS, "2.10", "2.99"),
    ("Пилешко филе 500 г", "Ферма Слънце", "2000000000077", "Месо", PCS, "3.20", "4.59"),
    ("Минерална вода 1.5 л", "Извор Демо", "2000000000084", "Напитки", PCS, "0.35", "0.65"),
    # Sold by weight, without a barcode — shows that barcode is optional.
    ("Банани", None, None, "Плодове и зеленчуци", KG, "1.20", "1.89"),
    ("Домати", None, None, "Плодове и зеленчуци", KG, "1.60", "2.49"),
]


def get_or_create_store(session: Session) -> Store:
    store = session.scalars(select(Store).where(Store.name == DEMO_STORE_NAME)).first()
    if store is None:
        store = Store(name=DEMO_STORE_NAME)
        session.add(store)
        session.commit()
        print(f"Created store #{store.id}: {store.name}")
    else:
        print(f"Store #{store.id} already exists: {store.name}")
    return store


def get_or_create_owner(session: Session, store: Store) -> None:
    if session.scalars(select(User).where(User.email == DEMO_OWNER_EMAIL)).first() is not None:
        print(f"Demo owner already exists: {DEMO_OWNER_EMAIL}")
        return
    session.add(
        User(
            store_id=store.id,
            email=DEMO_OWNER_EMAIL,
            password_hash=hash_password(DEMO_OWNER_PASSWORD),
            full_name="Demo Owner",
            role=UserRole.OWNER,
            email_verified_at=datetime.now(UTC),  # verified, so the account works right away
        )
    )
    session.commit()
    print(f"Created demo owner: {DEMO_OWNER_EMAIL}")


def seed_products(session: Session, store_id: int) -> None:
    # Products go through the service, so they pass the same validation as API requests.
    service = ProductService(session)
    repository = ProductRepository(session)
    created = skipped = 0

    for name, brand, barcode, category, unit, purchase_price, sale_price in DEMO_PRODUCTS:
        if barcode:
            exists = repository.get_by_barcode(store_id, barcode) is not None
        else:
            stmt = select(Product.id).where(Product.store_id == store_id, Product.name == name)
            exists = session.scalar(stmt) is not None
        if exists:
            skipped += 1
            continue

        service.create_product(
            store_id,
            ProductCreate(
                name=name,
                brand=brand,
                barcode=barcode,
                category=category,
                unit=unit,
                purchase_price=Decimal(purchase_price),
                sale_price=Decimal(sale_price),
            ),
        )
        created += 1

    print(f"Products: {created} created, {skipped} already existed")


def main() -> None:
    with SessionLocal() as session:
        store = get_or_create_store(session)
        get_or_create_owner(session, store)
        seed_products(session, store.id)

    print(f"\nLog in with: {DEMO_OWNER_EMAIL} / {DEMO_OWNER_PASSWORD}")


if __name__ == "__main__":
    main()
