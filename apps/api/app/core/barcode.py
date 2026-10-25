"""GTIN barcode validation (EAN-8, UPC-A, EAN-13, GTIN-14).

The last digit of every GTIN is a check digit computed from the others.
Validating it catches most typos and scanner misreads before they reach the database.
"""

VALID_GTIN_LENGTHS = {8, 12, 13, 14}


def gtin_check_digit(digits_without_check: str) -> int:
    # Weights alternate 3, 1, 3, 1... starting from the rightmost digit.
    total = sum(
        int(digit) * (3 if position % 2 == 0 else 1)
        for position, digit in enumerate(reversed(digits_without_check))
    )
    return (10 - total % 10) % 10


def is_valid_gtin(code: str) -> bool:
    if not code.isdigit() or len(code) not in VALID_GTIN_LENGTHS:
        return False
    return gtin_check_digit(code[:-1]) == int(code[-1])
