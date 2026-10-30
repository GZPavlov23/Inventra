"""Reading sales files. No database here: this is only about understanding the file."""

from datetime import date
from decimal import Decimal

import pytest

from app.services.sales_csv import read_sales_csv

TODAY = date(2026, 10, 30)
HEADER = "receipt;date;barcode;product;quantity;unit_price"


def read(content: str, mode: str = "current"):
    return read_sales_csv(content, mode, TODAY)


def one_error(content: str, mode: str = "current") -> str:
    rows, errors = read(content, mode)
    assert rows == []
    assert len(errors) == 1
    return errors[0].message


def test_reads_a_normal_file() -> None:
    rows, errors = read(f"{HEADER}\nR-1;2026-10-29;2000000000015;;2;1.59")
    assert errors == []
    [row] = rows
    assert row.number == 2
    assert row.receipt == "R-1"
    assert row.day == date(2026, 10, 29)
    assert row.barcode == "2000000000015"
    assert row.quantity == Decimal("2")
    assert row.unit_price == Decimal("1.59")


@pytest.mark.parametrize(
    "content",
    [
        "receipt,date,barcode,quantity\nR-1,2026-10-29,200,2",
        "receipt;date;barcode;quantity\nR-1;2026-10-29;200;2",
        "receipt\tdate\tbarcode\tquantity\nR-1\t2026-10-29\t200\t2",
    ],
)
def test_understands_every_common_separator(content: str) -> None:
    rows, errors = read(content)
    assert errors == []
    assert rows[0].barcode == "200"


def test_understands_what_excel_on_a_bulgarian_computer_writes() -> None:
    content = "\ufeffБележка;Дата;Продукт;Количество;Цена\r\nБ-7;29.10.2026;Банани;1,250;1,89\r\n"
    rows, errors = read(content)
    assert errors == []
    assert rows[0].receipt == "Б-7"
    assert rows[0].day == date(2026, 10, 29)
    assert rows[0].product == "Банани"
    assert rows[0].quantity == Decimal("1.250")
    assert rows[0].unit_price == Decimal("1.89")


def test_quoted_values_may_contain_the_separator() -> None:
    rows, errors = read('receipt,date,product,quantity\nR-1,2026-10-29,"Сирене, краве",1')
    assert errors == []
    assert rows[0].product == "Сирене, краве"


def test_blank_lines_and_columns_we_do_not_know_are_ignored() -> None:
    content = "receipt;date;barcode;quantity;cashier\nR-1;2026-10-29;200;2;Ivan\n;;;;\n\n"
    rows, errors = read(content)
    assert errors == []
    assert len(rows) == 1


def test_row_numbers_match_the_file_even_after_blank_lines() -> None:
    content = "receipt;date;barcode;quantity\n\nR-1;2026-10-29;200;abc"
    assert read(content)[1][0].row == 3


def test_history_needs_no_receipt_but_current_sales_do() -> None:
    content = "date;barcode;quantity\n2026-10-29;200;2"
    assert read(content, "history")[1] == []
    assert one_error(content, "current") == "Missing columns: receipt"


@pytest.mark.parametrize(
    ("content", "message"),
    [
        ("", "The file is empty"),
        ("   \n  ", "The file is empty"),
        ("receipt;date;barcode;quantity", "The file has no sales in it"),
        ("receipt;barcode;quantity\nR;200;1", "Missing columns: date"),
        ("receipt;date;quantity\nR;2026-10-29;1", "Missing columns: barcode or product"),
    ],
)
def test_files_that_can_not_be_used(content: str, message: str) -> None:
    assert one_error(content) == message


@pytest.mark.parametrize(
    ("row", "part"),
    [
        (";2026-10-29;200;;1;", "receipt number is missing"),
        (f"{'R' * 65};2026-10-29;200;;1;", "too long"),
        ("R;2026-10-29;;;1;", "barcode or a product"),
        ("R;вчера;200;;1;", "not a date"),
        ("R;31.02.2026;200;;1;", "not a date"),
        ("R;2026-10-31;200;;1;", "in the future"),
        ("R;2026-10-29;200;;abc;", "not a quantity"),
        ("R;2026-10-29;200;;;", "not a quantity"),
        ("R;2026-10-29;200;;NaN;", "not a quantity"),
        ("R;2026-10-29;200;;Infinity;", "not a quantity"),
        ("R;2026-10-29;200;;0;", "out of range"),
        ("R;2026-10-29;200;;-1;", "out of range"),
        ("R;2026-10-29;200;;100001;", "out of range"),
        ("R;2026-10-29;200;;1.2345;", "more than 3 decimals"),
        ("R;2026-10-29;200;;1;abc", "not a price"),
        ("R;2026-10-29;200;;1;-1", "out of range"),
        ("R;2026-10-29;200;;1;1.999", "more than 2 decimals"),
    ],
)
def test_wrong_rows_are_explained(row: str, part: str) -> None:
    assert part in one_error(f"{HEADER}\n{row}")


def test_today_is_allowed_and_the_price_is_optional() -> None:
    rows, errors = read(f"{HEADER}\nR;30.10.2026;200;;1;")
    assert errors == []
    assert rows[0].unit_price is None


def test_a_bad_row_does_not_hide_the_good_ones() -> None:
    rows, errors = read(
        f"{HEADER}\nA;2026-10-29;200;;1;\nB;2026-10-29;200;;x;\nC;2026-10-29;200;;2;"
    )
    assert [row.receipt for row in rows] == ["A", "C"]
    assert [error.row for error in errors] == [3]
