# Inventra

An inventory, batch and expiry-date management platform for small grocery stores. It uses machine learning to forecast demand and suggest well-founded order quantities, so stores throw away less food and run out of stock less often.

Built for the "John Atanasoff" National Autumn IT Tournament, category "Distributed Applications".

## Status

The project is under active development. This section lists only what actually works today.

| Part | Status |
|---|---|
| Products REST API (create, read, search, update, barcode lookup) | ✅ working |
| Barcode validation (EAN-8, UPC-A, EAN-13, GTIN-14) | ✅ working |
| PostgreSQL database with migrations (Alembic) | ✅ working |
| Automated tests (pytest) | ✅ 25 tests |
| Login, roles and API authorization | ⏳ planned. For now every request uses a single demo store |
| Web platform (React) | ⏳ planned |
| Batches, deliveries, sales | ⏳ planned |
| Demand forecasting (ML) | ⏳ planned |
| Mobile app (Expo) | ⏳ planned |

## Architecture

A modular three-layer application. The web platform and the mobile app share **one REST API** and **one database**.

```
  Web (React)      Mobile (Expo)
        \              /
         \   HTTPS    /
          ▼          ▼
   ┌──────────────────────────┐
   │  FastAPI backend         │
   │                          │
   │  routes        ← Presentation: HTTP, input validation
   │    ▼                     │
   │  services      ← Business logic: rules, transactions
   │    ▼                     │
   │  repositories  ← Data: SQL queries, always scoped to a store
   └────────────┬─────────────┘
                ▼
           PostgreSQL
```

ML models will be trained separately (`ml/`) and used only through backend services.

## Project structure

```
inventra/
├── apps/
│   └── api/                    # Backend: Python + FastAPI
│       ├── app/
│       │   ├── api/v1/routes/  # HTTP endpoints
│       │   ├── services/       # Business logic
│       │   ├── repositories/   # Database access
│       │   ├── models/         # Database tables (SQLAlchemy)
│       │   ├── schemas/        # Request/response shapes and validation (Pydantic)
│       │   ├── core/           # Settings, errors, barcode validation
│       │   └── db/             # Database connection
│       ├── migrations/         # Alembic migrations
│       ├── scripts/            # Seed script and initial SQL setup
│       └── tests/              # pytest tests
└── docker-compose.yml          # Optional: PostgreSQL in Docker
```

## Tech stack

**Backend:** Python 3.12+, FastAPI, SQLAlchemy 2, Alembic, Pydantic, PostgreSQL 17, pytest, Ruff

## Running locally

Run the commands in a terminal. Where they differ, both **macOS** and **Windows (PowerShell)** versions are given.

### 1. Prerequisites

- **Git**
- **Python 3.12 or newer** from [python.org](https://www.python.org/downloads/). On Windows, make sure to tick **"Add python.exe to PATH"** during installation.
- **PostgreSQL 17** (see step 2)

### 2. PostgreSQL

Pick **one** option.

**macOS (Homebrew)**
```bash
brew install postgresql@17
brew services start postgresql@17
psql -d postgres -f apps/api/scripts/create-local-db.sql
```

**Windows**
1. Download the installer from [postgresql.org/download/windows](https://www.postgresql.org/download/windows/) and run it. Remember the password you set for the `postgres` user and keep the port at `5432`.
2. From the project root, run:
   ```powershell
   & "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -f apps/api/scripts/create-local-db.sql
   ```
   It asks for the `postgres` password from step 1.

**Docker (any OS)**
```bash
docker compose up -d
```
This option creates the user and databases automatically.

All three options give you a user `inventra` and two databases: `inventra` (development) and `inventra_test` (tests only).

### 3. Backend

```bash
cd apps/api
```

Create a virtual environment and install the packages (once):

| macOS | Windows |
|---|---|
| `python3 -m venv .venv` | `py -m venv .venv` |
| `.venv/bin/pip install -e ".[dev]"` | `.venv\Scripts\pip install -e ".[dev]"` |
| `cp .env.example .env` | `Copy-Item .env.example .env` |

Create the tables and the demo data:

| macOS | Windows |
|---|---|
| `.venv/bin/alembic upgrade head` | `.venv\Scripts\alembic upgrade head` |
| `.venv/bin/python -m scripts.seed_demo` | `.venv\Scripts\python -m scripts.seed_demo` |

Start the server:

| macOS | Windows |
|---|---|
| `.venv/bin/uvicorn app.main:app --reload` | `.venv\Scripts\uvicorn app.main:app --reload` |

Open **http://localhost:8000/docs** for the interactive API documentation, where every endpoint can be tried with "Try it out". Stop the server with `Ctrl+C`.

### 4. Tests

| macOS | Windows |
|---|---|
| `.venv/bin/pytest` | `.venv\Scripts\pytest` |

The tests use the separate `inventra_test` database and never touch development data.

## Day-to-day work

After `git pull`, if someone changed the database schema or the dependencies:

```bash
alembic upgrade head        # apply new migrations
pip install -e ".[dev]"     # install new packages (if pyproject.toml changed)
```

(prefix with `.venv/bin/` on macOS or `.venv\Scripts\` on Windows)

Check code style:
```bash
ruff check .
```

## Demo data

`scripts/seed_demo.py` creates a store named "Демо магазин (демо данни)" ("Demo store (demo data)") with 10 fictional products. Their barcodes start with `200`, a GS1 prefix reserved for in-store use that is never assigned to real retail products, so demo data can never be confused with a real scan.
