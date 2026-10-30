"""Fills the database with a DEMO store, products and batches, so the API has data to work with.

Run from apps/api after `alembic upgrade head`:
    macOS:   .venv/bin/python -m scripts.seed_demo
    Windows: .venv\\Scripts\\python -m scripts.seed_demo

Safe to run many times: existing records are skipped, never duplicated.

Expiry dates are counted from the day of seeding, so demo batches age. Before a presentation,
replace them with fresh ones (this deletes the demo store's batches and their history):
    macOS:   .venv/bin/python -m scripts.seed_demo --fresh-batches
    Windows: .venv\\Scripts\\python -m scripts.seed_demo --fresh-batches

It also creates a verified DEMO owner account (credentials below) for testing and for the jury.

All data here is fictional DEMO data. Barcodes use the GS1 prefix 200, which is reserved for
in-store use and never assigned to real retail products, so they can't clash with a real scan.
"""

import sys
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.batch import Batch
from app.models.inventory_movement import InventoryMovement
from app.models.product import Product, ProductUnit
from app.models.store import Store
from app.models.user import User, UserRole
from app.repositories.product_repository import ProductRepository
from app.schemas.inventory import ReceiptCreate
from app.schemas.product import ProductCreate
from app.services.inventory_service import InventoryService
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

# (product name, quantity, days until expiry; None means the goods don't expire)
DEMO_BATCHES = [
    ("Прясно мляко 3% 1 л", "24", 2),
    ("Прясно мляко 3% 1 л", "30", 9),
    ("Кисело мляко 3.6% 400 г", "40", 14),
    ("Сирене краве 400 г", "12", 45),
    ("Бял хляб 500 г", "18", 1),
    ("Пълнозърнест хляб 400 г", "8", 3),
    ("Яйца размер M 10 бр.", "20", 21),
    ("Пилешко филе 500 г", "6", -1),
    ("Минерална вода 1.5 л", "60", None),
    ("Банани", "14.500", 5),
    ("Домати", "9.750", 4),
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


def get_or_create_owner(session: Session, store: Store) -> User:
    owner = session.scalars(select(User).where(User.email == DEMO_OWNER_EMAIL)).first()
    if owner is not None:
        print(f"Demo owner already exists: {DEMO_OWNER_EMAIL}")
        return owner
    owner = User(
        store_id=store.id,
        email=DEMO_OWNER_EMAIL,
        password_hash=hash_password(DEMO_OWNER_PASSWORD),
        full_name="Demo Owner",
        role=UserRole.OWNER,
        email_verified_at=datetime.now(UTC),  # verified, so the account works right away
    )
    session.add(owner)
    session.commit()
    print(f"Created demo owner: {DEMO_OWNER_EMAIL}")
    return owner


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


def delete_batches(session: Session, store_id: int) -> None:
    # Only ever called with the demo store. The history goes first, because it points at batches.
    session.execute(delete(InventoryMovement).where(InventoryMovement.store_id == store_id))
    session.execute(delete(Batch).where(Batch.store_id == store_id))
    session.commit()
    print("Deleted the demo store's batches")


def seed_batches(session: Session, store_id: int, owner_id: int) -> None:
    if session.scalar(select(Batch.id).where(Batch.store_id == store_id).limit(1)) is not None:
        print("Batches already exist")
        return

    # Batches go through the service too, so every one gets its history line.
    service = InventoryService(session)
    created = 0
    for name, quantity, days_left in DEMO_BATCHES:
        stmt = select(Product).where(
            Product.store_id == store_id, Product.name == name, Product.active
        )
        product = session.scalars(stmt).first()
        if product is None:
            continue

        expired = days_left is not None and days_left < 0
        expiry_date = None if days_left is None else date.today() + timedelta(days=days_left)
        batch = service.receive(
            store_id,
            owner_id,
            ReceiptCreate(
                product_id=product.id,
                quantity=Decimal(quantity),
                expiry_date=None if expired else expiry_date,
            ),
        )
        if expired:
            # The app refuses expired goods at the door, so the demo has to age this batch itself.
            batch.expiry_date = expiry_date
            session.commit()
        created += 1

    print(f"Batches: {created} created")


def main() -> None:
    with SessionLocal() as session:
        store = get_or_create_store(session)
        owner = get_or_create_owner(session, store)
        seed_products(session, store.id)
        if "--fresh-batches" in sys.argv:
            delete_batches(session, store.id)
        seed_batches(session, store.id, owner.id)

    print(f"\nLog in with: {DEMO_OWNER_EMAIL} / {DEMO_OWNER_PASSWORD}")


if __name__ == "__main__":
    main()
