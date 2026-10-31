"""Following stock through the coming days. No database: only numbers and dates."""

from datetime import date, timedelta

import pytest

from app.forecasting.ordering import StockBatch, plan_stock, round_order
from app.models.product import ProductUnit

TODAY = date(2026, 10, 5)


def in_days(days: int) -> date:
    return TODAY + timedelta(days=days)


def test_no_stock_serves_nothing() -> None:
    plan = plan_stock([], [2.0, 2.0], TODAY)
    assert (plan.served, plan.expiring_unsold, plan.left_over) == (0, 0, 0)


def test_goods_without_an_expiry_date_last_as_long_as_needed() -> None:
    plan = plan_stock([StockBatch(10, None)], [2.0, 2.0, 2.0], TODAY)
    assert (plan.served, plan.expiring_unsold, plan.left_over) == (6, 0, 4)


def test_stock_that_expires_before_it_sells_does_not_count() -> None:
    # Sells 1 a day, and 10 expire tomorrow: 2 get sold, the other 8 are thrown away.
    plan = plan_stock([StockBatch(10, in_days(1))], [1.0] * 7, TODAY)
    assert (plan.served, plan.expiring_unsold, plan.left_over) == (2, 8, 0)


def test_goods_can_be_sold_on_their_last_day() -> None:
    plan = plan_stock([StockBatch(5, in_days(2))], [1.0] * 3, TODAY)
    assert plan.served == 3


def test_the_batch_that_expires_first_goes_first() -> None:
    plan = plan_stock(
        [StockBatch(10, None), StockBatch(4, in_days(30)), StockBatch(2, in_days(1))],
        [3.0, 3.0],
        TODAY,
    )
    # The batch of 2 sells out before it expires, so nothing is lost.
    assert (plan.served, plan.expiring_unsold) == (6, 0)
    assert plan.left_over == 10


def test_order_of_the_input_does_not_matter() -> None:
    batches = [StockBatch(3, in_days(1)), StockBatch(3, in_days(20)), StockBatch(3, None)]
    expected = plan_stock(batches, [1.0] * 5, TODAY)
    assert plan_stock(list(reversed(batches)), [1.0] * 5, TODAY) == expected


def test_stock_expiring_on_the_last_day_with_nothing_left_to_sell_it_to_is_lost() -> None:
    plan = plan_stock([StockBatch(5, in_days(1))], [1.0, 1.0], TODAY)
    assert (plan.served, plan.expiring_unsold, plan.left_over) == (2, 3, 0)


def test_everything_is_accounted_for() -> None:
    batches = [StockBatch(4, in_days(1)), StockBatch(6, in_days(9)), StockBatch(2, None)]
    plan = plan_stock(batches, [1.5] * 7, TODAY)
    assert plan.served + plan.expiring_unsold + plan.left_over == pytest.approx(12)


def test_batches_given_in_are_not_changed() -> None:
    batch = StockBatch(5, None)
    plan_stock([batch], [1.0], TODAY)
    assert batch.quantity == 5


@pytest.mark.parametrize(
    ("quantity", "unit", "expected"),
    [
        (3.2, ProductUnit.PIECE, 4),
        (3.0, ProductUnit.PIECE, 3),
        (3.0000000001, ProductUnit.PIECE, 3),
        (1.21, ProductUnit.KILOGRAM, 1.3),
        (1.2, ProductUnit.KILOGRAM, 1.2),
        (0.04, ProductUnit.LITER, 0.1),
    ],
)
def test_orders_are_rounded_up(quantity: float, unit: ProductUnit, expected: float) -> None:
    assert round_order(quantity, unit) == expected
