# Demand model

Trains the machine learning model behind the forecast. Training happens here, and the API only uses the finished file. The API never trains anything, and it doesn't need the packages listed here.

## Data

**FreshRetailNet-50K** by Dingdong-Inc, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Source: [Hugging Face](https://huggingface.co/datasets/Dingdong-Inc/FreshRetailNet-50K), paper: [arXiv:2505.16319](https://arxiv.org/abs/2505.16319). It has 50,000 store and product pairs over 97 days, with the hours each product was out of stock.

The data isn't in this repository. `download_data.py` fetches it into `data/raw/`, which Git ignores.

Inventra has no real sales from Bulgarian stores, so the model learns from this public data. It comes from a large chain abroad, so its numbers below say nothing certain about a small store. That's why the app tests the model again on each store's own sales and uses it only if it beats the simple models there.

## Running it

From this folder:

| macOS | Windows |
|---|---|
| `python3 -m venv .venv` | `py -m venv .venv` |
| `.venv/bin/pip install -r requirements.txt` | `.venv\Scripts\pip install -r requirements.txt` |
| `.venv/bin/python download_data.py` | `.venv\Scripts\python download_data.py` |
| `.venv/bin/python train.py` | `.venv\Scripts\python train.py` |

Training takes a few minutes. It writes `results.json` and replaces `apps/api/app/forecasting/demand_model.joblib`.

The API only needs that file, so nobody has to run this to use the app.

## How it is measured

Over 4 separate weeks, on 170 stores hidden from training, with the model training only on what came before each week. Days when the goods ran out aren't scored, because their sales show the stock rather than the demand. WAPE is the error as a share of everything sold.

| Model | Daily WAPE | Weekly WAPE |
|---|---|---|
| Same weekday, last 4 weeks | 37.3% | 24.8% |
| Average of the last 7 days | 33.9% | 21.3% |
| **Machine learning** | **32.0%** | **20.1%** |

It won 4 of 4 weeks, and also on the slowest quarter of products (24.6% against 26.7%). The exact numbers are in `results.json`.

## The demo store's sales

The demo store in Inventra sells along real sales from this dataset, so the forecast can be shown on real demand rather than invented numbers. That is only a fair test if the model has never seen those sales:

- `demo_stores.py` sets aside 44 stores. `train.py` leaves them out of every training run, the final model included, and checks it with an `assert` before saving.
- `export_demo.py` picks 10 store and product pairs from those stores by rules written down before anyone looked at which model wins: a product that sells every day, at most 10% of days with no sales, and out of stock on 5–25% of days. It writes `apps/api/scripts/demo_demand.json` (12 weeks), which `scripts/seed_demo.py` scales to the size of a small shop.
- The days the goods ran out become batches that run out on exactly those days, so the app finds them in the stock history like in a real shop. A test checks that they match the data day by day.

Run it after training: `.venv/bin/python export_demo.py`.

## How it works

`HistGradientBoostingRegressor` from scikit-learn. It gets only what Inventra knows too: past sales and sold-out days, without weather or holidays. Every number is divided by the product's own level, so the model learns shapes rather than sizes and works for any size of shop.

The features live in `apps/api/app/forecasting/features.py`, and both training and the API use that one file. If you change it, train again.

## Keep in mind

- The API pins the same scikit-learn version, because a saved model isn't guaranteed to work in another one. If you upgrade it, train again.
- Only load model files from this repository: loading one runs code from the file.
