"""Unit tests for GTIN check-digit validation (no database needed)."""

import pytest

from app.core.barcode import gtin_check_digit, is_valid_gtin


@pytest.mark.parametrize(
    "code",
    [
        "4006381333931",  # EAN-13
        "96385074",  # EAN-8
        "036000291452",  # UPC-A
        "10614141000415",  # GTIN-14
        "2000000000015",  # in-store EAN-13 used by the demo seed
    ],
)
def test_valid_codes_are_accepted(code: str) -> None:
    assert is_valid_gtin(code)


@pytest.mark.parametrize(
    "code",
    [
        "4006381333932",  # wrong check digit (a typical misread)
        "400638133393",  # 12 digits, but not a valid UPC-A
        "40063813339",  # unsupported length
        "40063813339X",  # not only digits
        "",
    ],
)
def test_invalid_codes_are_rejected(code: str) -> None:
    assert not is_valid_gtin(code)


def test_check_digit_is_computed_from_the_other_digits() -> None:
    assert gtin_check_digit("400638133393") == 1
