"""What a learned model sees. Training and the API both use this file, and only this file.

If the two computed their numbers separately, a small difference between them would make the model
wrong without any error to show for it.

Everything is divided by the product's own level, so the model learns shapes, not sizes. That is
why it can learn from a big chain and still work for a shop selling three bottles a day.
"""

import numpy as np

# Days of history a forecast needs. Fewer can't fill the features below.
HISTORY_DAYS = 28
MAX_HORIZON = 14

FEATURE_NAMES = (
    "last_7_days",
    "last_7_days_in_stock",
    "last_14_days_in_stock",
    "same_weekday",
    "same_weekday_in_stock",
    "same_day_last_week",
    "share_of_days_without_sales",
    "share_of_days_sold_out",
    "share_of_last_week_sold_out",
    "variation",
    "weekday",
    "days_ahead",
)
WEEKDAY_FEATURE = FEATURE_NAMES.index("weekday")

# Keeps products that barely sell from dividing by almost nothing.
SMALLEST_LEVEL = 0.05


def in_stock_mean(sales: np.ndarray, sold_out: np.ndarray) -> np.ndarray:
    """The mean of the days the goods were there, or of all days if there were none.

    On a sold-out day the sales show how much stock there was, not how much people wanted.
    """
    in_stock = ~sold_out
    days = in_stock.sum(axis=1)
    mean = (sales * in_stock).sum(axis=1) / np.maximum(days, 1)
    return np.where(days > 0, mean, sales.mean(axis=1))


def build_features(
    history: np.ndarray, sold_out: np.ndarray, first_weekday: int, horizon: int
) -> tuple[np.ndarray, np.ndarray]:
    """Features for every series and forecast day, and the level to multiply results back by.

    history has one row per series and at least HISTORY_DAYS columns, the newest day last, and
    sold_out says for the same days whether the goods ran out. first_weekday is the weekday of
    the first forecast day, Monday being 0. Returns arrays shaped (series, days, features) and
    (series, days).
    """
    recent = history[:, -HISTORY_DAYS:]
    out = sold_out[:, -HISTORY_DAYS:]
    level = np.maximum(in_stock_mean(recent, out), SMALLEST_LEVEL)

    shared = [
        recent[:, -7:].mean(axis=1) / level,
        in_stock_mean(recent[:, -7:], out[:, -7:]) / level,
        in_stock_mean(recent[:, -14:], out[:, -14:]) / level,
    ]
    without_sales = (recent == 0).mean(axis=1)
    days_sold_out = out.mean(axis=1)
    last_week_sold_out = out[:, -7:].mean(axis=1)
    variation = recent.std(axis=1) / level

    days = []
    for ahead in range(horizon):
        # Whole weeks back keep the weekday. Forecast days further than a week ahead go back
        # further too, because their nearest weeks are still in the future.
        columns = HISTORY_DAYS + ahead - 7 * (np.arange(1, 5) + ahead // 7)
        same_weekday = recent[:, columns]
        days.append(
            np.column_stack(
                [
                    *shared,
                    same_weekday.mean(axis=1) / level,
                    in_stock_mean(same_weekday, out[:, columns]) / level,
                    same_weekday[:, 0] / level,
                    without_sales,
                    days_sold_out,
                    last_week_sold_out,
                    variation,
                    np.full(len(recent), (first_weekday + ahead) % 7),
                    np.full(len(recent), ahead),
                ]
            )
        )
    return np.stack(days, axis=1), np.repeat(level[:, None], horizon, axis=1)
