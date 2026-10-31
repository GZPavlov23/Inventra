"""The trained demand model. It is trained separately, in the ml folder, and only used here."""

from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path

import joblib
import numpy as np

from app.forecasting.features import HISTORY_DAYS, build_features
from app.forecasting.models import Case, seasonal_average

MODEL_FILE = Path(__file__).with_name("demand_model.joblib")


@lru_cache(maxsize=1)
def load_model():
    # Loading runs code from the file, which is safe only because it is our own, from the repo.
    return joblib.load(MODEL_FILE)


def learned_forecast(cases: list[Case], horizon: int) -> list[list[float]]:
    """Forecasts all the cases in one go, the ones with the same first day together."""
    results: list[list[float] | None] = [None] * len(cases)
    by_origin: dict[date, list[int]] = {}

    for index, case in enumerate(cases):
        if case.origin - timedelta(days=HISTORY_DAYS) in case.series:
            by_origin.setdefault(case.origin, []).append(index)
        else:
            # Too short a past for the model's features.
            results[index] = seasonal_average(case.series, case.origin, horizon)

    for origin, indexes in by_origin.items():
        days = [origin - timedelta(days=n) for n in range(HISTORY_DAYS, 0, -1)]
        history = np.array([[cases[i].series[day] for day in days] for i in indexes])
        sold_out = np.array([[day in cases[i].sold_out for day in days] for i in indexes])
        features, level = build_features(history, sold_out, origin.weekday(), horizon)
        predicted = load_model().predict(features.reshape(-1, features.shape[-1]))
        rows = (predicted.reshape(level.shape) * level).tolist()
        for index, row in zip(indexes, rows, strict=True):
            results[index] = row
    return results
