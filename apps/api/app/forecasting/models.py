"""Demand forecasting models. Plain functions over numbers: no database and no web here.

A model gets the days before `origin` and predicts the following days. It never sees `origin` or
anything after it, because a real forecast can't look into the future, and a test that lets it
would report an accuracy nobody can reach.
"""

from collections.abc import Callable
from datetime import date, timedelta
from statistics import fmean

# Quantity sold per day, from a product's first sale on. Days without sales are 0, and days before
# the first sale are missing: the product simply wasn't on the shelf.
Series = dict[date, float]
Model = Callable[[Series, date, int], list[float]]

SEASONAL_WEEKS = 4
RECENT_DAYS = 7


def known_before(series: Series, origin: date) -> Series:
    return {day: quantity for day, quantity in series.items() if day < origin}


def next_days(origin: date, horizon: int) -> list[date]:
    return [origin + timedelta(days=offset) for offset in range(horizon)]


def recent_average(series: Series, origin: date, horizon: int) -> list[float]:
    """The comparison point: the same number for every day, the mean of the last week."""
    history = known_before(series, origin)
    recent = [
        history[origin - timedelta(days=n)]
        for n in range(1, RECENT_DAYS + 1)
        if origin - timedelta(days=n) in history
    ]
    return [fmean(recent) if recent else 0.0] * horizon


def seasonal_average(series: Series, origin: date, horizon: int) -> list[float]:
    """The mean of the same weekday in the last weeks: shops sell differently on a Saturday."""
    history = known_before(series, origin)
    fallback = recent_average(history, origin, 1)[0]

    forecast = []
    for day in next_days(origin, horizon):
        # Going back whole weeks keeps the weekday. With a long horizon the nearest weeks are
        # still in the future, so they are skipped until enough known weeks are found.
        same_weekday = [
            history[earlier]
            for weeks in range(1, SEASONAL_WEEKS + horizon // 7 + 1)
            if (earlier := day - timedelta(weeks=weeks)) in history
        ][:SEASONAL_WEEKS]
        forecast.append(fmean(same_weekday) if same_weekday else fallback)
    return forecast
