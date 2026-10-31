"""Fills the database with a DEMO store, products and batches, so the API has data to work with.

Run from apps/api after `alembic upgrade head`:
    macOS:   .venv/bin/python -m scripts.seed_demo
    Windows: .venv\\Scripts\\python -m scripts.seed_demo

Safe to run many times: existing records are skipped, never duplicated.

Dates are counted from the day of seeding, so demo data ages. Before a presentation, replace it
with fresh data (this deletes the demo store's batches, sales and their history):
    macOS:   .venv/bin/python -m scripts.seed_demo --fresh-demo
    Windows: .venv\\Scripts\\python -m scripts.seed_demo --fresh-demo

It also creates a verified DEMO owner account (credentials below) for testing and for the jury.

All data here is fictional DEMO data. Barcodes use the GS1 prefix 200, which is reserved for
in-store use and never assigned to real retail products, so they can't clash with a real scan.
"""

import random
import sys
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.batch import Batch
from app.models.delivery import Delivery, DeliveryItem, DeliveryStatus
from app.models.inventory_movement import InventoryMovement, MovementType
from app.models.product import Product, ProductUnit
from app.models.sale import Sale, SaleItem
from app.models.store import Store
from app.models.user import User, UserRole
from app.repositories.product_repository import ProductRepository
from app.repositories.supplier_repository import SupplierRepository
from app.schemas.delivery import DeliveryCreate, DeliveryItemCreate
from app.schemas.inventory import ReceiptCreate
from app.schemas.product import ProductCreate
from app.schemas.supplier import SupplierCreate
from app.services.delivery_service import DeliveryService
from app.services.inventory_service import InventoryService
from app.services.product_service import ProductService
from app.services.supplier_service import SupplierService

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

# (name, contact, phone, email, notes, brands it supplies; None means products without a brand)
# Phone numbers start with 000 after the area code, which is never assigned to a real line.
DEMO_SUPPLIERS = [
    (
        "Зелена долина (демо)",
        "Мария Демова",
        "02 000 0001",
        "orders@zelena-dolina.example",
        "Поръчки до вторник на обед",
        ("Зелена долина",),
    ),
    (
        "Пекарна Изгрев (демо)",
        "Иван Демов",
        "02 000 0002",
        "orders@izgrev.example",
        "Доставка всеки ден до 7:00",
        ("Пекарна Изгрев",),
    ),
    (
        "Ферма Слънце (демо)",
        "Елена Демова",
        "02 000 0003",
        "orders@ferma-slantse.example",
        None,
        ("Ферма Слънце", "Извор Демо"),
    ),
    (
        "Плод и зеленчук (демо)",
        "Георги Демов",
        "02 000 0004",
        None,
        "Плащане в брой при доставка",
        (None,),
    ),
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

# (days ago, product name, quantity, reason)
DEMO_WASTE = [
    (2, "Бял хляб 500 г", "5", "expired"),
    (4, "Прясно мляко 3% 1 л", "4", "expired"),
    (6, "Домати", "1.200", "damaged"),
    (8, "Бял хляб 500 г", "6", "expired"),
    (10, "Банани", "0.800", "damaged"),
    (13, "Яйца размер M 10 бр.", "2", "damaged"),
    (15, "Пилешко филе 500 г", "3", "expired"),
    (18, "Кисело мляко 3.6% 400 г", "4", "expired"),
    (21, "Минерална вода 1.5 л", "2", "other"),
    (24, "Домати", "0.900", "expired"),
    (27, "Бял хляб 500 г", "4", "expired"),
    (33, "Прясно мляко 3% 1 л", "3", "expired"),
]

# (supplier, days until it is expected, [(product name, quantity)]). A negative day is a late one.
DEMO_DELIVERIES = [
    (
        "Зелена долина (демо)",
        1,
        [
            ("Прясно мляко 3% 1 л", "24"),
            ("Кисело мляко 3.6% 400 г", "20"),
            ("Сирене краве 400 г", "6"),
        ],
    ),
    ("Ферма Слънце (демо)", -1, [("Яйца размер M 10 бр.", "15"), ("Пилешко филе 500 г", "10")]),
]
# This supplier's first goods of the sales history arrived as a delivery that is already received.
DEMO_RECEIVED_FROM = "Пекарна Изгрев (демо)"

# How many weeks of invented sales the demo store has.
DEMO_SALES_WEEKS = 8
# Sales per day, Monday to Sunday: small stores are busiest before and on the weekend.
DEMO_SALES_PER_DAY = (9, 8, 9, 10, 14, 17, 12)
# Always the same numbers, so the demo doesn't change between runs.
DEMO_RANDOM_SEED = 2026


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


def seed_suppliers(session: Session, store_id: int) -> None:
    service = SupplierService(session)
    repository = SupplierRepository(session)
    created = 0

    for name, contact, phone, email, notes, brands in DEMO_SUPPLIERS:
        supplier = repository.find_by_name(store_id, name)
        if supplier is None:
            supplier = service.create_supplier(
                store_id,
                SupplierCreate(
                    name=name, contact_name=contact, phone=phone, email=email, notes=notes
                ),
            )
            created += 1
        stmt = select(Product).where(Product.store_id == store_id, Product.supplier_id.is_(None))
        for product in session.scalars(stmt):
            if product.brand in brands:
                product.supplier_id = supplier.id
        session.commit()

    print(f"Suppliers: {created} created")


def delete_demo_stock(session: Session, store_id: int) -> None:
    # Only ever called with the demo store. History goes first, because it points at the rest.
    session.execute(delete(Delivery).where(Delivery.store_id == store_id))
    session.execute(delete(InventoryMovement).where(InventoryMovement.store_id == store_id))
    session.execute(delete(Sale).where(Sale.store_id == store_id))
    session.execute(delete(Batch).where(Batch.store_id == store_id))
    session.commit()
    print("Deleted the demo store's batches and sales")


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


def seed_sales(session: Session, store_id: int, owner_id: int) -> None:
    """Invented past sales, so reports and charts have something to show.

    The sold goods come from old batches that are used up, so today's stock stays as it is.
    Records are written directly, because the app only records sales as they happen.
    """
    today_start = datetime.combine(date.today(), time.min).astimezone()
    stmt = select(Sale.id).where(Sale.store_id == store_id, Sale.sold_at < today_start).limit(1)
    if session.scalar(stmt) is not None:
        print("Sales history already exists")
        return

    stmt = select(Product).where(Product.store_id == store_id, Product.active)
    products = list(session.scalars(stmt.order_by(Product.id)))
    if not products:
        return

    rng = random.Random(DEMO_RANDOM_SEED)
    first_day = date.today() - timedelta(weeks=DEMO_SALES_WEEKS)
    received_at = datetime.combine(first_day - timedelta(days=1), time(7)).astimezone()

    sales: list[tuple[datetime, list[tuple[Product, Decimal]]]] = []
    for offset in range(DEMO_SALES_WEEKS * 7):
        day = first_day + timedelta(days=offset)
        for _ in range(DEMO_SALES_PER_DAY[day.weekday()]):
            moment = time(rng.randint(8, 19), rng.randint(0, 59))
            lines = [
                (product, demo_quantity(rng, product))
                for product in rng.sample(products, rng.randint(1, 3))
            ]
            sales.append((datetime.combine(day, moment).astimezone(), lines))
    sales.sort(key=lambda sale: sale[0])

    # One used-up batch per product, large enough for everything sold from it.
    sold: dict[int, Decimal] = {}
    for _, lines in sales:
        for product, quantity in lines:
            sold[product.id] = sold.get(product.id, Decimal(0)) + quantity

    batches: dict[int, Batch] = {}
    for product in products:
        if product.id not in sold:
            continue
        batch = Batch(
            store_id=store_id,
            product_id=product.id,
            expiry_date=date.today() - timedelta(days=1),
            received_at=received_at,
            received_quantity=sold[product.id],
            remaining_quantity=0,
            purchase_price=product.purchase_price,
        )
        session.add(batch)
        session.flush()
        batches[product.id] = batch
        session.add(
            InventoryMovement(
                store_id=store_id,
                product_id=product.id,
                batch_id=batch.id,
                actor_id=owner_id,
                type=MovementType.RECEIPT,
                quantity_delta=sold[product.id],
                occurred_at=received_at,
            )
        )

    for moment, lines in sales:
        sale = Sale(store_id=store_id, actor_id=owner_id, sold_at=moment)
        session.add(sale)
        session.flush()
        for product, quantity in lines:
            item = SaleItem(
                store_id=store_id,
                sale_id=sale.id,
                product_id=product.id,
                quantity=quantity,
                unit_price=product.sale_price,
            )
            session.add(item)
            session.flush()
            session.add(
                InventoryMovement(
                    store_id=store_id,
                    product_id=product.id,
                    batch_id=batches[product.id].id,
                    actor_id=owner_id,
                    type=MovementType.SALE,
                    quantity_delta=-quantity,
                    sale_item_id=item.id,
                    occurred_at=moment,
                )
            )
    session.commit()
    print(f"Sales history: {len(sales)} demo sales created")


def seed_waste(session: Session, store_id: int, owner_id: int) -> None:
    """Invented past write-offs, each on its own used-up batch, so today's stock stays as it is."""
    today_start = datetime.combine(date.today(), time.min).astimezone()
    stmt = select(InventoryMovement.id).where(
        InventoryMovement.store_id == store_id,
        InventoryMovement.type == MovementType.WASTE,
        InventoryMovement.occurred_at < today_start,
    )
    if session.scalar(stmt.limit(1)) is not None:
        print("Waste history already exists")
        return

    created = 0
    for days_ago, name, quantity, reason in DEMO_WASTE:
        stmt = select(Product).where(Product.store_id == store_id, Product.name == name)
        product = session.scalars(stmt).first()
        if product is None:
            continue

        amount = Decimal(quantity)
        day = date.today() - timedelta(days=days_ago)
        received_at = datetime.combine(day - timedelta(days=5), time(7)).astimezone()
        thrown_away_at = datetime.combine(day, time(20)).astimezone()
        batch = Batch(
            store_id=store_id,
            product_id=product.id,
            expiry_date=day - timedelta(days=1),
            received_at=received_at,
            received_quantity=amount,
            remaining_quantity=0,
            purchase_price=product.purchase_price,
        )
        session.add(batch)
        session.flush()
        for movement_type, delta, reason_text, moment in (
            (MovementType.RECEIPT, amount, None, received_at),
            (MovementType.WASTE, -amount, reason, thrown_away_at),
        ):
            session.add(
                InventoryMovement(
                    store_id=store_id,
                    product_id=product.id,
                    batch_id=batch.id,
                    actor_id=owner_id,
                    type=movement_type,
                    quantity_delta=delta,
                    reason=reason_text,
                    occurred_at=moment,
                )
            )
        created += 1
    session.commit()
    print(f"Waste history: {created} demo write-offs created")


def seed_deliveries(session: Session, store_id: int, owner_id: int) -> None:
    """Two deliveries on their way, and one that arrived before the sales history begins.

    Those on their way go through the service. The received one points at batches that were
    used up long ago, so today's stock stays as it is.
    """
    stmt = select(Delivery.id).where(Delivery.store_id == store_id).limit(1)
    if session.scalar(stmt) is not None:
        print("Deliveries already exist")
        return

    repository = SupplierRepository(session)
    service = DeliveryService(session)
    products = {
        product.name: product
        for product in session.scalars(select(Product).where(Product.store_id == store_id))
    }
    for supplier_name, days_left, lines in DEMO_DELIVERIES:
        supplier = repository.find_by_name(store_id, supplier_name)
        if supplier is None:
            continue
        delivery = service.create(
            store_id,
            owner_id,
            DeliveryCreate(
                supplier_id=supplier.id,
                expected_on=date.today() + timedelta(days=max(days_left, 0)),
                items=[
                    DeliveryItemCreate(product_id=products[name].id, quantity=Decimal(quantity))
                    for name, quantity in lines
                ],
            ),
        )
        # The app refuses a date in the past, so the demo has to make this delivery late itself.
        delivery.expected_on = date.today() + timedelta(days=days_left)
    session.commit()

    seed_received_delivery(session, store_id, owner_id)
    print("Deliveries: demo deliveries created")


def seed_received_delivery(session: Session, store_id: int, owner_id: int) -> None:
    supplier = SupplierRepository(session).find_by_name(store_id, DEMO_RECEIVED_FROM)
    if supplier is None:
        return
    stmt = (
        select(Batch)
        .join(Product, Batch.product_id == Product.id)
        .where(Product.supplier_id == supplier.id, Batch.remaining_quantity == 0)
        .order_by(Batch.received_at)
    )
    # The oldest batch of each product: the one all of its demo sales came from.
    batches: dict[int, Batch] = {}
    for batch in session.scalars(stmt):
        batches.setdefault(batch.product_id, batch)
    if not batches:
        return

    received_at = min(batch.received_at for batch in batches.values())
    delivery = Delivery(
        store_id=store_id,
        supplier_id=supplier.id,
        actor_id=owner_id,
        status=DeliveryStatus.RECEIVED,
        expected_on=received_at.date(),
        received_at=received_at,
        invoice_number="DEMO-0001",
        created_at=received_at - timedelta(days=2),
    )
    session.add(delivery)
    session.flush()
    session.add_all(
        DeliveryItem(
            store_id=store_id,
            delivery_id=delivery.id,
            product_id=batch.product_id,
            batch_id=batch.id,
            ordered_quantity=batch.received_quantity,
            unit_cost=batch.purchase_price,
            received_quantity=batch.received_quantity,
        )
        for batch in batches.values()
    )
    session.commit()


def demo_quantity(rng: random.Random, product: Product) -> Decimal:
    if product.unit == ProductUnit.PIECE:
        return Decimal(rng.randint(1, 3))
    return Decimal(rng.randint(250, 1500)).scaleb(-3).quantize(Decimal("0.001"))


def main() -> None:
    with SessionLocal() as session:
        store = get_or_create_store(session)
        owner = get_or_create_owner(session, store)
        seed_products(session, store.id)
        seed_suppliers(session, store.id)
        if "--fresh-demo" in sys.argv:
            delete_demo_stock(session, store.id)
        seed_batches(session, store.id, owner.id)
        seed_sales(session, store.id, owner.id)
        seed_waste(session, store.id, owner.id)
        seed_deliveries(session, store.id, owner.id)

    print(f"\nLog in with: {DEMO_OWNER_EMAIL} / {DEMO_OWNER_PASSWORD}")


if __name__ == "__main__":
    main()
