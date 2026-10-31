"""The trained model as the API uses it. It was trained in the ml folder."""

import warnings
from datetime import date, timedelta

import numpy as np
import pytest
from sklearn.exceptions import InconsistentVersionWarning

from app.forecasting.features import (
    FEATURE_NAMES,
    HISTORY_DAYS,
    MAX_HORIZON,
    SMALLEST_LEVEL,
    build_features,
    in_stock_mean,
)
from app.forecasting.learned import learned_forecast as learned_many
from app.forecasting.learned import load_model
from app.forecasting.models import Case, Series, seasonal_average

ORIGIN = date(2026, 10, 5)  # a Monday


def days_before(count: int) -> list[date]:
    return [ORIGIN - timedelta(days=n) for n in range(count, 0, -1)]


def steady(value: float = 3.0, count: int = 56) -> Series:
    return {day: value for day in days_before(count)}


def learned_forecast(
    series: Series, origin: date, horizon: int, sold_out: frozenset[date] = frozenset()
) -> list[float]:
    return learned_many([Case(series, origin, sold_out)], horizon)[0]


def test_the_saved_model_expects_exactly_these_features() -> None:
    assert load_model().n_features_in_ == len(FEATURE_NAMES)


def test_the_saved_model_was_made_with_the_installed_version() -> None:
    # A saved model can give wrong answers in another version, with only this warning to show.
    load_model.cache_clear()
    with warnings.catch_warnings():
        warnings.simplefilter("error", InconsistentVersionWarning)
        load_model()


def test_forecast_has_a_sensible_number_for_every_day() -> None:
    forecast = learned_forecast(steady(), ORIGIN, 7)
    assert len(forecast) == 7
    assert all(1.5 < quantity < 6 for quantity in forecast)


def test_it_works_as_far_ahead_as_the_api_allows() -> None:
    assert len(learned_forecast(steady(), ORIGIN, MAX_HORIZON)) == MAX_HORIZON


def test_the_size_of_a_shop_does_not_matter() -> None:
    small = learned_forecast(steady(2.0), ORIGIN, 7)
    big = learned_forecast(steady(200.0), ORIGIN, 7)
    assert big == pytest.approx([quantity * 100 for quantity in small])


def test_it_sees_the_weekly_rhythm() -> None:
    series = {day: 20.0 if day.weekday() == 5 else 2.0 for day in days_before(56)}
    forecast = learned_forecast(series, ORIGIN, 7)
    assert forecast[5] == max(forecast)  # the coming Saturday


def test_it_can_not_see_the_future() -> None:
    series = steady()
    expected = learned_forecast(series, ORIGIN, 7)
    future = {ORIGIN + timedelta(days=n): 9999.0 for n in range(14)}
    assert learned_forecast({**series, **future}, ORIGIN, 7) == expected


def test_sold_out_days_are_not_mistaken_for_low_demand() -> None:
    series = steady(10.0)
    last_week = days_before(5)
    for day in last_week:
        series[day] = 0.0

    believed = sum(learned_forecast(series, ORIGIN, 7))
    knowing = sum(learned_forecast(series, ORIGIN, 7, frozenset(last_week)))

    assert knowing > believed


def test_too_short_a_past_falls_back_to_the_simple_model() -> None:
    series = steady(count=HISTORY_DAYS - 1)
    assert learned_forecast(series, ORIGIN, 7) == seasonal_average(series, ORIGIN, 7)


def test_exactly_enough_history_uses_the_model() -> None:
    assert learned_forecast(steady(count=HISTORY_DAYS), ORIGIN, 7) != seasonal_average(
        steady(count=HISTORY_DAYS), ORIGIN, 7
    )


def test_many_at_once_gives_the_same_answers_as_one_by_one() -> None:
    weekly = {day: 9.0 if day.weekday() == 5 else 1.0 for day in days_before(56)}
    earlier = ORIGIN - timedelta(days=3)  # another weekday, so the two must not be mixed up
    short = steady(count=20)
    cases = [
        Case(steady(4.0), ORIGIN),
        Case(short, ORIGIN),
        Case(weekly, earlier),
        Case(weekly, ORIGIN, frozenset(days_before(3))),
    ]

    together = learned_many(cases, 7)

    for case, answer in zip(cases, together, strict=True):
        assert learned_many([case], 7)[0] == pytest.approx(answer)


# Features


def test_features_have_the_promised_shape() -> None:
    history = np.ones((3, HISTORY_DAYS))
    features, level = build_features(history, np.zeros_like(history, bool), 0, 14)
    assert features.shape == (3, 14, len(FEATURE_NAMES))
    assert level.shape == (3, 14)


def test_only_the_last_days_count() -> None:
    old = np.concatenate([np.full(10, 999.0), np.full(HISTORY_DAYS, 2.0)])[None, :]
    new = np.full((1, HISTORY_DAYS), 2.0)
    out_old, out_new = np.zeros_like(old, bool), np.zeros_like(new, bool)
    assert np.array_equal(
        build_features(old, out_old, 0, 7)[0], build_features(new, out_new, 0, 7)[0]
    )


def test_weekday_follows_the_forecast_days() -> None:
    history = np.ones((1, HISTORY_DAYS))
    features, _ = build_features(history, np.zeros_like(history, bool), 5, 4)
    weekday = FEATURE_NAMES.index("weekday")
    assert features[0, :, weekday].tolist() == [5, 6, 0, 1]


def test_same_weekday_is_really_the_same_weekday() -> None:
    # Saturdays are the sixth day of each week here, counted from the end of the history.
    history = np.array(
        [[10.0 if (HISTORY_DAYS - n) % 7 == 2 else 1.0 for n in range(HISTORY_DAYS)]]
    )
    features, level = build_features(history, np.zeros_like(history, bool), 0, 14)
    same = FEATURE_NAMES.index("same_weekday")
    weekly = features[0, :, same] * level[0]
    assert weekly[5] == pytest.approx(10)
    assert weekly[12] == pytest.approx(10)
    assert weekly[4] == pytest.approx(1)


def test_days_further_than_a_week_ahead_look_only_at_known_weeks() -> None:
    # Every day has its own number, so the feature shows exactly which day it came from.
    history = np.arange(1.0, HISTORY_DAYS + 1)[None, :]
    features, level = build_features(history, np.zeros_like(history, bool), 0, 14)
    last_week = FEATURE_NAMES.index("same_day_last_week")

    days_back = [
        round(features[0, ahead, last_week] * level[0, ahead]) for ahead in (0, 6, 7, 8, 13)
    ]

    # Seen from the end of the history (day 28): a week before the first forecast day is day 22,
    # and from the eighth forecast day on the nearest known week is two weeks back.
    assert days_back == [22, 28, 22, 23, 28]


def test_level_leaves_out_sold_out_days() -> None:
    history = np.full((1, HISTORY_DAYS), 6.0)
    history[0, -14:] = 0.0
    sold_out = history == 0

    _, knowing = build_features(history, sold_out, 0, 1)
    _, believing = build_features(history, np.zeros_like(sold_out), 0, 1)

    assert knowing[0, 0] == 6.0
    assert believing[0, 0] == 3.0


def test_a_product_that_never_sold_does_not_divide_by_zero() -> None:
    history = np.zeros((1, HISTORY_DAYS))
    features, level = build_features(history, np.zeros_like(history, bool), 0, 7)
    assert level[0, 0] == SMALLEST_LEVEL
    assert np.isfinite(features).all()


def test_in_stock_mean_leaves_out_sold_out_days() -> None:
    sales = np.array([[4.0, 0.0, 2.0]])
    out = np.array([[False, True, False]])
    assert in_stock_mean(sales, out).tolist() == [3.0]


def test_in_stock_mean_of_a_series_always_sold_out_is_its_plain_mean() -> None:
    sales = np.array([[4.0, 2.0]])
    assert in_stock_mean(sales, np.ones_like(sales, bool)).tolist() == [3.0]
