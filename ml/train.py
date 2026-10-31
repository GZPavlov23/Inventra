"""Trains the demand model, and measures it honestly before anything else.

Measuring happens on stores the model has never seen, over four separate weeks, always training
only on what came before. That is the situation Inventra is in: every store is a new store.
The numbers go to results.json. The final model is then trained on everything.
"""

import json
from datetime import date, timedelta
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

from app.forecasting.features import (
    HISTORY_DAYS,
    MAX_HORIZON,
    WEEKDAY_FEATURE,
    build_features,
)
from app.forecasting.models import recent_average, seasonal_average

HERE = Path(__file__).parent
RAW_DATA = HERE / "data" / "raw"
MODEL_FILE = HERE.parent / "apps" / "api" / "app" / "forecasting" / "demand_model.joblib"
RESULTS_FILE = HERE / "results.json"

COLUMNS = ["store_id", "product_id", "dt", "sale_amount", "stock_hour6_22_cnt"]
TOTAL_DAYS = 97
TEST_ORIGINS = (69, 76, 83, 90)
TEST_HORIZON = 7
TRAINING_SERIES = 20_000
HIDDEN_STORE_SHARE = 0.2
SEED = 7


def load() -> tuple[np.ndarray, np.ndarray, np.ndarray, date]:
    frames = [
        pd.read_parquet(RAW_DATA / name, columns=COLUMNS)
        for name in ("train.parquet", "eval.parquet")
    ]
    data = pd.concat(frames).sort_values(["store_id", "product_id", "dt"])
    series = len(data) // TOTAL_DAYS
    sales = data["sale_amount"].to_numpy().reshape(series, TOTAL_DAYS)
    sold_out = (data["stock_hour6_22_cnt"].to_numpy() > 0).reshape(series, TOTAL_DAYS)
    stores = data["store_id"].to_numpy()[::TOTAL_DAYS]
    return sales, sold_out, stores, date.fromisoformat(data["dt"].iloc[0])


def train(sales: np.ndarray, sold_out: np.ndarray, first_day: date, last_origin: int):
    """Learns from every week up to last_origin, skipping days when the goods had run out.

    On those days the sales show how much stock there was, not how much people wanted.
    """
    inputs, targets, weights = [], [], []
    for origin in range(last_origin, HISTORY_DAYS - 1, -7):
        weekday = (first_day + timedelta(days=origin)).weekday()
        features, level = build_features(
            sales[:, :origin], sold_out[:, :origin], weekday, MAX_HORIZON
        )
        window = origin + MAX_HORIZON
        keep = ~sold_out[:, origin:window]
        inputs.append(features[keep])
        targets.append((sales[:, origin:window] / level)[keep])
        weights.append(level[keep])

    model = HistGradientBoostingRegressor(
        loss="poisson",
        max_iter=200,
        learning_rate=0.06,
        max_leaf_nodes=31,
        min_samples_leaf=100,
        categorical_features=[WEEKDAY_FEATURE],
        random_state=1,
    )
    model.fit(
        np.concatenate(inputs), np.concatenate(targets), sample_weight=np.concatenate(weights)
    )
    return model


def predict(model, history: np.ndarray, out: np.ndarray, weekday: int) -> np.ndarray:
    features, level = build_features(history, out, weekday, TEST_HORIZON)
    shape = features.shape
    return model.predict(features.reshape(-1, shape[-1])).reshape(shape[:2]) * level


def simple_model(model, history: np.ndarray, first_day: date, origin: int) -> np.ndarray:
    """Runs the API's own simple models, so they are compared exactly as the app computes them."""
    start = first_day + timedelta(days=origin)
    days = [start - timedelta(days=history.shape[1] - n) for n in range(history.shape[1])]
    return np.array(
        [model(dict(zip(days, row.tolist(), strict=True)), start, TEST_HORIZON) for row in history]
    )


class Score:
    def __init__(self) -> None:
        self.daily_error = self.daily_sold = self.weekly_error = self.weekly_sold = self.bias = 0.0

    def add(self, forecast: np.ndarray, actual: np.ndarray, sold_out: np.ndarray) -> None:
        clean = ~sold_out
        self.daily_error += float(np.abs(forecast - actual)[clean].sum())
        self.daily_sold += float(actual[clean].sum())
        self.bias += float((forecast - actual)[clean].sum())
        # A week counts when at most one day is missing, or too few weeks would remain.
        week = sold_out.sum(axis=1) <= 1
        forecast_week = (forecast * clean)[week].sum(axis=1)
        actual_week = (actual * clean)[week].sum(axis=1)
        self.weekly_error += float(np.abs(forecast_week - actual_week).sum())
        self.weekly_sold += float(actual_week.sum())

    def summary(self) -> dict[str, float]:
        return {
            "daily_wape": round(self.daily_error / self.daily_sold, 4),
            "weekly_wape": round(self.weekly_error / self.weekly_sold, 4),
            "bias": round(self.bias / self.daily_sold, 4),
        }


def measure(sales: np.ndarray, sold_out: np.ndarray, stores: np.ndarray, first_day: date) -> dict:
    rng = np.random.default_rng(SEED)
    unique = np.unique(stores)
    hidden_stores = rng.choice(unique, int(len(unique) * HIDDEN_STORE_SHARE), replace=False)
    hidden = np.isin(stores, hidden_stores)
    visible = np.where(~hidden)[0]

    level = sales[hidden][:, :HISTORY_DAYS].mean(axis=1)
    slow = level <= np.quantile(level, 0.25)
    groups = {"all": np.ones(hidden.sum(), bool), "slowest_quarter": slow}
    names = ("machine_learning", "recent_7_days", "same_weekday")
    scores = {group: {name: Score() for name in names} for group in groups}
    wins = 0

    for origin in TEST_ORIGINS:
        chosen = rng.choice(visible, TRAINING_SERIES, replace=False)
        model = train(sales[chosen], sold_out[chosen], first_day, origin - MAX_HORIZON)

        history = sales[hidden][:, :origin]
        actual = sales[hidden][:, origin : origin + TEST_HORIZON]
        out = sold_out[hidden][:, origin : origin + TEST_HORIZON]
        weekday = (first_day + timedelta(days=origin)).weekday()
        forecasts = {
            "machine_learning": predict(model, history, sold_out[hidden][:, :origin], weekday),
            "recent_7_days": simple_model(recent_average, history, first_day, origin),
            "same_weekday": simple_model(seasonal_average, history, first_day, origin),
        }
        week_score = {}
        for name, forecast in forecasts.items():
            for group, members in groups.items():
                scores[group][name].add(forecast[members], actual[members], out[members])
            one_week = Score()
            one_week.add(forecast, actual, out)
            week_score[name] = one_week.summary()["weekly_wape"]
        wins += week_score["machine_learning"] < min(
            week_score["recent_7_days"], week_score["same_weekday"]
        )
        print(f"Week from day {origin}: {week_score}", flush=True)

    return {
        "data": "FreshRetailNet-50K, CC BY 4.0",
        "hidden_stores": len(hidden_stores),
        "hidden_series": int(hidden.sum()),
        "test_weeks": len(TEST_ORIGINS),
        "weeks_won_by_machine_learning": int(wins),
        "scores": {
            group: {name: score.summary() for name, score in by_model.items()}
            for group, by_model in scores.items()
        },
    }


def main() -> None:
    sales, sold_out, stores, first_day = load()
    print(f"{len(sales)} series of {TOTAL_DAYS} days, from {first_day}", flush=True)

    results = measure(sales, sold_out, stores, first_day)
    RESULTS_FILE.write_text(json.dumps(results, indent=2) + "\n")
    print(json.dumps(results["scores"], indent=2))

    chosen = np.random.default_rng(SEED).choice(len(sales), TRAINING_SERIES, replace=False)
    model = train(sales[chosen], sold_out[chosen], first_day, TOTAL_DAYS - MAX_HORIZON)
    joblib.dump(model, MODEL_FILE, compress=3)
    print(f"Model saved: {MODEL_FILE} ({MODEL_FILE.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
