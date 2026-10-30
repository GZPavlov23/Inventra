"""Reads a CSV file of sales. Only parsing: nothing here touches the database.

Till software and Excel disagree on almost everything, so this accepts what a Bulgarian computer
produces: `;` as separator, `1,5` as a decimal, `30.10.2026` as a date, and Bulgarian column names.
"""

import csv
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from app.schemas.inventory import MAX_QUANTITY
from app.schemas.sale_import import ImportMode, ImportRowError

COLUMN_NAMES = {
    "receipt": "receipt",
    "бележка": "receipt",
    "date": "date",
    "дата": "date",
    "barcode": "barcode",
    "баркод": "barcode",
    "product": "product",
    "продукт": "product",
    "quantity": "quantity",
    "количество": "quantity",
    "unit_price": "unit_price",
    "цена": "unit_price",
}
DATE_FORMATS = ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y")
MAX_PRICE = Decimal("99999999.99")
MAX_RECEIPT_LENGTH = 64


@dataclass(frozen=True)
class SaleRow:
    number: int
    receipt: str
    day: date
    barcode: str
    product: str
    quantity: Decimal
    unit_price: Decimal | None


def read_sales_csv(
    content: str, mode: ImportMode, today: date
) -> tuple[list[SaleRow], list[ImportRowError]]:
    """The valid rows and an error for each invalid one. Row 1 is the file's first line."""
    lines = content.removeprefix("\ufeff").splitlines()
    if not any(line.strip() for line in lines):
        return [], [ImportRowError(row=1, message="The file is empty")]

    reader = csv.reader(lines, delimiter=_separator(lines[0]))
    header = [_column(name) for name in next(reader)]
    missing = _missing_columns(header, mode)
    if missing:
        names = ", ".join(missing)
        return [], [ImportRowError(row=1, message=f"Missing columns: {names}")]

    rows: list[SaleRow] = []
    errors: list[ImportRowError] = []
    for number, values in enumerate(reader, start=2):
        if not any(value.strip() for value in values):
            continue
        fields = {name: value.strip() for name, value in zip(header, values, strict=False)}
        try:
            rows.append(_read_row(number, fields, mode, today))
        except ValueError as error:
            errors.append(ImportRowError(row=number, message=str(error)))

    if not rows and not errors:
        errors.append(ImportRowError(row=1, message="The file has no sales in it"))
    return rows, errors


def _separator(header: str) -> str:
    return max(";,\t", key=header.count)


def _column(name: str) -> str | None:
    return COLUMN_NAMES.get(name.strip().lower())


def _missing_columns(header: Iterable[str | None], mode: ImportMode) -> list[str]:
    needed = ["date", "quantity"] + (["receipt"] if mode == "current" else [])
    missing = [name for name in needed if name not in header]
    if "barcode" not in header and "product" not in header:
        missing.append("barcode or product")
    return missing


def _read_row(number: int, fields: dict, mode: ImportMode, today: date) -> SaleRow:
    receipt = fields.get("receipt", "")
    if mode == "current" and not receipt:
        raise ValueError("The receipt number is missing")
    if len(receipt) > MAX_RECEIPT_LENGTH:
        raise ValueError("The receipt number is too long")

    barcode, product = fields.get("barcode", ""), fields.get("product", "")
    if not barcode and not product:
        raise ValueError("The row needs a barcode or a product name")

    return SaleRow(
        number=number,
        receipt=receipt,
        day=_read_day(fields.get("date", ""), today),
        barcode=barcode,
        product=product,
        quantity=_read_quantity(fields.get("quantity", "")),
        unit_price=_read_price(fields.get("unit_price", "")),
    )


def _read_day(text: str, today: date) -> date:
    for date_format in DATE_FORMATS:
        try:
            day = datetime.strptime(text, date_format).date()
        except ValueError:
            continue
        if day > today:
            raise ValueError(f"The date {text} is in the future")
        return day
    raise ValueError(f"'{text}' is not a date. Use 30.10.2026 or 2026-10-30")


def _read_number(text: str) -> Decimal | None:
    try:
        number = Decimal(text.replace(" ", "").replace("\u00a0", "").replace(",", "."))
    except InvalidOperation:
        return None
    return number if number.is_finite() else None


def _read_quantity(text: str) -> Decimal:
    quantity = _read_number(text)
    if quantity is None:
        raise ValueError(f"'{text}' is not a quantity")
    if quantity <= 0 or quantity > MAX_QUANTITY:
        raise ValueError(f"The quantity {text} is out of range")
    if quantity != quantity.quantize(Decimal("0.001")):
        raise ValueError(f"The quantity {text} has more than 3 decimals")
    return quantity


def _read_price(text: str) -> Decimal | None:
    if not text:
        return None
    price = _read_number(text)
    if price is None:
        raise ValueError(f"'{text}' is not a price")
    if price < 0 or price > MAX_PRICE:
        raise ValueError(f"The price {text} is out of range")
    if price != price.quantize(Decimal("0.01")):
        raise ValueError(f"The price {text} has more than 2 decimals")
    return price
