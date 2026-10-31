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

Over 4 separate weeks, on 179 stores hidden from training, with the model training only on what came before each week. Days when the goods ran out aren't scored, because their sales show the stock rather than the demand. WAPE is the error as a share of everything sold.

| Model | Daily WAPE | Weekly WAPE |
|---|---|---|
| Same weekday, last 4 weeks | 37.9% | 24.7% |
| Average of the last 7 days | 34.3% | 21.5% |
| **Machine learning** | **32.3%** | **20.1%** |

It won all 4 weeks, and also on the slowest quarter of products (25.2% against 27.1%). The exact numbers are in `results.json`.

## How it works

`HistGradientBoostingRegressor` from scikit-learn. It gets only what Inventra knows too: past sales and sold-out days, without weather or holidays. Every number is divided by the product's own level, so the model learns shapes rather than sizes and works for any size of shop.

The features live in `apps/api/app/forecasting/features.py`, and both training and the API use that one file. If you change it, train again.

## Keep in mind

- The API pins the same scikit-learn version, because a saved model isn't guaranteed to work in another one. If you upgrade it, train again.
- Only load model files from this repository: loading one runs code from the file.
