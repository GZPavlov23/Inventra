from datetime import date
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, Field

# "current": real sales, they take stock out of the batches.
# "history": old sales for the forecast, they don't touch stock.
ImportMode = Literal["current", "history"]

# About 200 000 rows, which is years of sales for a small store.
MAX_FILE_CHARACTERS = 10_000_000


class SalesImportRequest(BaseModel):
    mode: ImportMode
    content: Annotated[str, Field(max_length=MAX_FILE_CHARACTERS)]
    # By default only checks the file, so nothing can be written by accident.
    dry_run: bool = True


class ImportRowError(BaseModel):
    row: int
    message: str


class SalesImportReport(BaseModel):
    mode: ImportMode
    # False for a check, and for any file with errors: a file is imported whole or not at all.
    applied: bool
    rows: int
    sales: int
    products: int
    first_day: date | None
    last_day: date | None
    revenue: Decimal
    error_count: int
    # The first errors only: a wrong file can have thousands, and the first ones show why.
    errors: list[ImportRowError]
