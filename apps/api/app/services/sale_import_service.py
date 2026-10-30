"""Imports a CSV file of sales: whole or not at all.

A check and a real import run exactly the same code, and a check then rolls everything back. So
a file that passes the check can't fail for a reason the check didn't see.
"""

from dataclasses import dataclass
from datetime import UTC, date, datetime, time
from decimal import Decimal

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import DomainError
from app.core.money import to_cents
from app.models.product import Product
from app.repositories.inventory_repository import InventoryRepository
from app.repositories.product_repository import ProductRepository
from app.repositories.sale_repository import SaleRepository
from app.schemas.sale import MAX_SALE_LINES, SaleCreate, SaleItemCreate
from app.schemas.sale_import import ImportRowError, SalesImportReport, SalesImportRequest
from app.services.inventory_service import ensure_whole_pieces
from app.services.sale_service import SaleService
from app.services.sales_csv import SaleRow, read_sales_csv

# Every real sale is written with its stock history, so a file of real sales has a lower limit.
MAX_CURRENT_ROWS = 5_000
MAX_ERRORS_SHOWN = 50


@dataclass
class Outcome:
    sales: int = 0
    revenue: Decimal = Decimal(0)


class SaleImportService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.sales = SaleRepository(session)
        self.inventory = InventoryRepository(session)
        self.products = ProductRepository(session)
        self.sale_service = SaleService(session)

    def import_sales(
        self, store_id: int, actor_id: int, data: SalesImportRequest
    ) -> SalesImportReport:
        rows, errors = read_sales_csv(data.content, data.mode, date.today())
        if data.mode == "current" and len(rows) > MAX_CURRENT_ROWS:
            message = f"A file of current sales can have up to {MAX_CURRENT_ROWS} rows"
            errors.append(ImportRowError(row=1, message=message))

        matched = self._match_products(store_id, rows, errors)
        for row, product in matched:
            try:
                ensure_whole_pieces(product, row.quantity)
            except DomainError as error:
                errors.append(ImportRowError(row=row.number, message=error.message))

        outcome = Outcome()
        if not errors:
            if data.mode == "current":
                outcome = self._import_current(store_id, actor_id, matched, errors)
            else:
                outcome = self._import_history(store_id, matched)

        applied = not data.dry_run and not errors
        if applied:
            self.session.commit()
        else:
            self.session.rollback()

        days = [row.day for row, _ in matched]
        errors.sort(key=lambda error: error.row)
        return SalesImportReport(
            mode=data.mode,
            applied=applied,
            rows=len(rows),
            sales=outcome.sales,
            products=len({product.id for _, product in matched}),
            first_day=min(days, default=None),
            last_day=max(days, default=None),
            revenue=outcome.revenue,
            error_count=len(errors),
            errors=errors[:MAX_ERRORS_SHOWN],
        )

    def _match_products(
        self, store_id: int, rows: list[SaleRow], errors: list[ImportRowError]
    ) -> list[tuple[SaleRow, Product]]:
        products = self.products.all_in_store(store_id)
        by_barcode = {product.barcode: product for product in products if product.barcode}
        by_name: dict[str, list[Product]] = {}
        for product in products:
            by_name.setdefault(product.name.casefold(), []).append(product)

        matched = []
        for row in rows:
            if row.barcode:
                product = by_barcode.get(row.barcode)
                problem = f"No product with barcode {row.barcode}"
            else:
                named = by_name.get(row.product.casefold(), [])
                product = named[0] if len(named) == 1 else None
                problem = (
                    f"Several products are called '{row.product}'. Use the barcode"
                    if named
                    else f"No product called '{row.product}'"
                )
            if product is None:
                errors.append(ImportRowError(row=row.number, message=problem))
            else:
                matched.append((row, product))
        return matched

    def _import_current(
        self,
        store_id: int,
        actor_id: int,
        matched: list[tuple[SaleRow, Product]],
        errors: list[ImportRowError],
    ) -> Outcome:
        receipts: dict[str, list[SaleRow]] = {}
        for row, _ in matched:
            receipts.setdefault(row.receipt, []).append(row)
        products = {row.number: product for row, product in matched}

        # Locked in one fixed order first, so this can't block a live sale forever (a deadlock).
        first_day = min(row.day for row, _ in matched)
        for product_id in sorted({product.id for product in products.values()}):
            self.inventory.lock_sellable_batches(store_id, product_id, first_day)

        outcome = Outcome()
        for receipt, lines in sorted(receipts.items(), key=lambda item: item[1][0].day):
            problem = self._receipt_problem(receipt, lines)
            if problem:
                errors.append(ImportRowError(row=lines[0].number, message=problem))
                continue
            data = SaleCreate(
                items=[
                    SaleItemCreate(
                        product_id=products[line.number].id,
                        quantity=line.quantity,
                        unit_price=line.unit_price,
                    )
                    for line in lines
                ]
            )
            try:
                # A savepoint, so a refused receipt leaves nothing behind and the next ones can
                # still be checked: the owner sees every problem of the file at once.
                with self.session.begin_nested():
                    sale = self.sale_service.add_sale(
                        store_id,
                        actor_id,
                        data,
                        sold_on=lines[0].day,
                        sold_at=_moment(lines[0].day),
                        external_id=receipt,
                    )
            except DomainError as error:
                errors.append(ImportRowError(row=lines[0].number, message=error.message))
                continue
            except IntegrityError:
                # The database refuses a receipt number it has already seen in this store,
                # also when someone uploads the same file at this very moment.
                message = f"Receipt {receipt} was already imported"
                errors.append(ImportRowError(row=lines[0].number, message=message))
                continue
            outcome.sales += 1
            outcome.revenue += sale.total
        return outcome

    @staticmethod
    def _receipt_problem(receipt: str, lines: list[SaleRow]) -> str | None:
        if len({line.day for line in lines}) > 1:
            return f"Receipt {receipt} has more than one date"
        if len(lines) > MAX_SALE_LINES:
            return f"Receipt {receipt} has more than {MAX_SALE_LINES} lines"
        return None

    def _import_history(self, store_id: int, matched: list[tuple[SaleRow, Product]]) -> Outcome:
        days: dict[tuple[int, date], tuple[Decimal, Decimal]] = {}
        for row, product in matched:
            price = product.sale_price if row.unit_price is None else row.unit_price
            quantity, revenue = days.get((product.id, row.day), (Decimal(0), Decimal(0)))
            days[(product.id, row.day)] = (
                quantity + row.quantity,
                revenue + row.quantity * price,
            )

        self.sales.replace_demand_days(
            store_id,
            [
                {
                    "store_id": store_id,
                    "product_id": product_id,
                    "day": day,
                    "quantity": quantity,
                    "revenue": to_cents(revenue),
                }
                for (product_id, day), (quantity, revenue) in days.items()
            ],
        )
        total = sum((to_cents(revenue) for _, revenue in days.values()), Decimal(0))
        return Outcome(revenue=total)


def _moment(day: date) -> datetime:
    # The file has only dates. Noon keeps a sale inside its day in every time zone around us.
    if day == date.today():
        return datetime.now(UTC)
    return datetime.combine(day, time(12)).astimezone()
