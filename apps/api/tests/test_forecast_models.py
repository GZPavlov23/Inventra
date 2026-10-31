"""The forecasting models and their measurement. No database: only numbers and dates."""

from datetime import date, timedelta

import pytest

from app.forecasting.backtest import MIN_HISTORY_DAYS, backtest, origins
from app.forecasting.models import (
    Case,
    Series,
    known_before,
    one_by_one,
    recent_average,
    seasonal_average,
)

# A Monday, so weekdays in these tests are easy to follow.
ORIGIN = date(2026, 10, 5)


def days_before(origin: date, count: int) -> list[date]:
    return [origin - timedelta(days=n) for n in range(count, 0, -1)]


def by_weekday(origin: date, weeks: int, saturday: float, other: float) -> Series:
    return {
        day: saturday if day.weekday() == 5 else other for day in days_before(origin, weeks * 7)
    }


def test_recent_average_is_one_number_for_every_day() -> None:
    series = {day: float(n) for n, day in enumerate(days_before(ORIGIN, 7), start=1)}
    assert recent_average(series, ORIGIN, 3) == [4.0, 4.0, 4.0]


def test_recent_average_looks_only_at_the_last_week() -> None:
    series = {day: 1.0 for day in days_before(ORIGIN, 7)}
    series[ORIGIN - timedelta(days=8)] = 1000.0
    assert recent_average(series, ORIGIN, 1) == [1.0]


def test_recent_average_without_history_is_zero() -> None:
    assert recent_average({}, ORIGIN, 2) == [0.0, 0.0]


def test_seasonal_average_knows_saturdays_are_different() -> None:
    forecast = seasonal_average(by_weekday(ORIGIN, 4, saturday=10.0, other=1.0), ORIGIN, 7)
    # Monday to Sunday.
    assert forecast == [1.0, 1.0, 1.0, 1.0, 1.0, 10.0, 1.0]


def test_seasonal_average_uses_four_weeks_at_most() -> None:
    series = by_weekday(ORIGIN, 5, saturday=4.0, other=1.0)
    series[ORIGIN + timedelta(days=5) - timedelta(weeks=5)] = 1000.0
    assert seasonal_average(series, ORIGIN, 7)[5] == 4.0


def test_seasonal_average_works_past_the_first_week() -> None:
    forecast = seasonal_average(by_weekday(ORIGIN, 4, saturday=10.0, other=1.0), ORIGIN, 14)
    assert forecast[12] == 10.0
    assert forecast[13] == 1.0


def test_seasonal_average_falls_back_when_the_weekday_is_unknown() -> None:
    # Three days of history: Friday to Sunday, so a Monday has never been seen.
    series = {day: 3.0 for day in days_before(ORIGIN, 1)}
    series.pop(ORIGIN - timedelta(days=1))
    series[ORIGIN - timedelta(days=2)] = 3.0
    assert seasonal_average(series, ORIGIN, 1) == [3.0]


@pytest.mark.parametrize("model", [recent_average, seasonal_average])
def test_models_can_not_see_the_future(model) -> None:
    series = by_weekday(ORIGIN, 4, saturday=5.0, other=2.0)
    expected = model(series, ORIGIN, 7)

    future = {ORIGIN + timedelta(days=n): 9999.0 for n in range(14)}
    assert model({**series, **future}, ORIGIN, 7) == expected


def test_one_by_one_answers_every_case_in_order() -> None:
    model = one_by_one(lambda series, _origin, horizon: [series[ORIGIN]] * horizon)
    cases = [Case({ORIGIN: 1.0}, ORIGIN), Case({ORIGIN: 2.0}, ORIGIN)]
    assert model(cases, 2) == [[1.0, 1.0], [2.0, 2.0]]


def test_known_before_leaves_out_the_day_itself() -> None:
    assert known_before({ORIGIN: 1.0, ORIGIN - timedelta(days=1): 2.0}, ORIGIN) == {
        ORIGIN - timedelta(days=1): 2.0
    }


# Measuring


LAST_DAY = date(2026, 10, 25)


def full_series(weeks: int = 8, value: float = 2.0) -> Series:
    return {LAST_DAY - timedelta(days=n): value for n in range(weeks * 7)}


def always(value: float):
    return one_by_one(lambda _series, _origin, horizon: [value] * horizon)


def test_the_test_weeks_end_on_the_last_day_and_do_not_overlap() -> None:
    first, second, third, fourth = origins(LAST_DAY)
    assert fourth + timedelta(days=6) == LAST_DAY
    assert (second - first).days == (third - second).days == (fourth - third).days == 7


def test_a_perfect_model_has_no_error() -> None:
    result = backtest({1: full_series()}, always(2.0), LAST_DAY)
    assert result.daily_wape == 0
    assert result.weekly_wape == 0
    assert result.days == 28
    assert result.products == 1


def test_error_is_a_share_of_what_was_sold() -> None:
    result = backtest({1: full_series()}, always(3.0), LAST_DAY)
    assert result.sold == 56
    assert result.daily_wape == pytest.approx(0.5)
    assert result.bias == 28


def test_too_little_forecast_has_a_negative_bias() -> None:
    assert backtest({1: full_series()}, always(1.0), LAST_DAY).bias == -28


def test_chance_cancels_out_over_a_week_but_not_over_days() -> None:
    # Sells 4 and 0 in turns, so a flat 2 is wrong every day but right about the week.
    series = {day: (4.0 if n % 2 else 0.0) for n, day in enumerate(sorted(full_series()))}
    result = backtest({1: series}, always(2.0), LAST_DAY)

    assert result.daily_wape == pytest.approx(1.0)
    assert result.weekly_wape < 0.2


def test_products_with_too_little_history_are_not_judged() -> None:
    young = {LAST_DAY - timedelta(days=n): 1.0 for n in range(MIN_HISTORY_DAYS + 7)}
    assert backtest({1: young}, always(1.0), LAST_DAY).days == 7
    assert backtest({1: young}, always(1.0), LAST_DAY).products == 1

    newborn = {LAST_DAY - timedelta(days=n): 1.0 for n in range(5)}
    assert backtest({1: newborn}, always(1.0), LAST_DAY).days == 0


def test_nothing_measured_gives_no_number_instead_of_zero() -> None:
    result = backtest({}, always(1.0), LAST_DAY)
    assert result.daily_wape is None
    assert result.weekly_wape is None


def test_nothing_sold_gives_no_number() -> None:
    assert backtest({1: full_series(value=0.0)}, always(1.0), LAST_DAY).weekly_wape is None


def test_a_sold_out_day_does_not_count_against_a_model() -> None:
    series = full_series()
    # Sales show 0 on the last day, but only because there was nothing left to sell.
    series[LAST_DAY] = 0.0

    counted = backtest({1: series}, always(2.0), LAST_DAY)
    skipped = backtest({1: series}, always(2.0), LAST_DAY, {1: frozenset({LAST_DAY})})

    assert counted.daily_wape > 0
    assert skipped.daily_wape == 0
    assert skipped.days == counted.days - 1


def test_each_test_sees_only_what_was_known_then() -> None:
    seen: list[date] = []

    def spy(series: Series, origin: date, horizon: int) -> list[float]:
        seen.append(max(known_before(series, origin)))
        return [0.0] * horizon

    backtest({1: full_series()}, one_by_one(spy), LAST_DAY)
    assert seen == [origin - timedelta(days=1) for origin in origins(LAST_DAY)]
