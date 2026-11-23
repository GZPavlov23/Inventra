"""Picks real sales for Inventra's demo store, from stores the model never learned from.

The rules below were set before anyone looked at which forecast wins on the result, and they
must not be tuned to make one win: the point of the demo is a fair test. Run once after train.py:

    .venv/bin/python export_demo.py

It writes apps/api/scripts/demo_demand.json, which scripts/seed_demo.py turns into sales.
"""

import json
from pathlib import Path

import numpy as np
import pandas as pd

from demo_stores import DEMO_SEED, demo_store_ids

HERE = Path(__file__).parent
RAW_DATA = HERE / "data" / "raw"
OUTPUT = HERE.parent / "apps" / "api" / "scripts" / "demo_demand.json"

TOTAL_DAYS = 97
# Twelve weeks: enough for the forecast's four-week check, with history before every week.
DEMO_DAYS = 84
SERIES_WANTED = 10

# A product that sells every day...
MIN_AVERAGE = 0.5
MAX_DAYS_WITHOUT_SALES = 0.10
# ...and sometimes runs out, as fresh goods in a small shop do, but not so often that too few
# clean weeks are left to measure the forecast on.
MIN_SOLD_OUT_DAYS = 0.05
MAX_SOLD_OUT_DAYS = 0.25


def main() -> None:
    columns = ["store_id", "product_id", "dt", "sale_amount", "stock_hour6_22_cnt"]
    data = pd.concat(
        pd.read_parquet(RAW_DATA / name, columns=columns) for name in ("train.parquet", "eval.parquet")
    ).sort_values(["store_id", "product_id", "dt"])
    series = len(data) // TOTAL_DAYS
    sales = data["sale_amount"].to_numpy().reshape(series, TOTAL_DAYS)[:, -DEMO_DAYS:]
    sold_out = (data["stock_hour6_22_cnt"].to_numpy() > 0).reshape(series, TOTAL_DAYS)[:, -DEMO_DAYS:]
    stores = data["store_id"].to_numpy()[::TOTAL_DAYS]
    products = data["product_id"].to_numpy()[::TOTAL_DAYS]

    fits = (
        np.isin(stores, demo_store_ids(stores))
        & (sales.mean(axis=1) >= MIN_AVERAGE)
        & ((sales == 0).mean(axis=1) <= MAX_DAYS_WITHOUT_SALES)
        & (sold_out.mean(axis=1) >= MIN_SOLD_OUT_DAYS)
        & (sold_out.mean(axis=1) <= MAX_SOLD_OUT_DAYS)
    )
    candidates = np.where(fits)[0]
    picked = np.sort(np.random.default_rng(DEMO_SEED + 1).choice(candidates, SERIES_WANTED, replace=False))

    result = {
        "source": "FreshRetailNet-50K by Dingdong-Inc, CC BY 4.0, "
        "https://huggingface.co/datasets/Dingdong-Inc/FreshRetailNet-50K",
        "about": "Daily sales (scaled, as in the dataset) and whether the goods ran out that day, "
        "for the last 84 days of 10 store and product pairs from stores the model never learned "
        "from. The last day becomes yesterday in the demo.",
        "candidates": int(len(candidates)),
        "days": DEMO_DAYS,
        "series": [
            {
                "store": int(stores[i]),
                "product": int(products[i]),
                "sales": [round(float(value), 3) for value in sales[i]],
                "sold_out": [int(flag) for flag in sold_out[i]],
            }
            for i in picked
        ],
    }
    OUTPUT.write_text(json.dumps(result, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(candidates)} series fit the rules, {SERIES_WANTED} picked: {OUTPUT}")


if __name__ == "__main__":
    main()
