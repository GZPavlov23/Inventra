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
| Automated backend tests (pytest) | ✅ 414 tests |
| Automated browser tests (Playwright) | ✅ 85 scenarios: login, registration, password reset, dashboard, products, inventory, suppliers, sales, CSV import, forecast, orders |
| Web platform shell (sidebar navigation, layout, page transitions) | ✅ working. Modules that aren't built yet show a "Planned" placeholder |
| Accounts API: registration, email verification, login/logout, sessions, forgotten password | ✅ working. Locally, verification emails are printed in the backend terminal |
| Login, Register, Forgot/Reset password and email confirmation pages; every platform page requires login | ✅ working |
| Employee accounts and role permissions | ⏳ planned |
| Products page: table with search, Active/Archived/All filter, sorting, pagination | ✅ working (real data from the API) |
| Adding products in the web platform, with a category picker | ✅ working |
| Editing, archiving and restoring products in the web platform | ✅ working |
| Batches REST API: receiving goods, waste, corrections, expiry filters, stock history, stock per product | ✅ working |
| Inventory page: batches in shelf order, expiry filters, receiving goods, writing off waste, count corrections, batch history; stock column on Products | ✅ working |
| Suppliers: REST API and page with contacts, search, archiving; every product can have a supplier | ✅ working |
| Sales REST API: recording sales from the batch that expires first, revenue, cost and profit, period summary | ✅ working |
| Sales page: new sale with barcode search, list by period, revenue and profit totals, batches behind each sale | ✅ working. Returns are planned |
| Dashboard page: revenue and profit chart, week over week comparison, stock value, expired and expiring stock, what needs attention | ✅ working (real data from the API) |
| Reports on the dashboard: waste by reason, products running out, top products, sales by category | ✅ working |
| CSV import of sales: current sales that take stock, and old history for the forecast, with a check before anything is written | ✅ working |
| Forecast page and API: expected sales per product, shortages, models measured on the store's own past | ✅ working |
| Orders page: what to order and why, counting only stock that will sell before it expires, with a safety buffer and CSV download | ✅ working. Suppliers and pack sizes are planned |
| Machine learning demand model, used only where it beats the simple models on the store's own sales | ✅ working, see `ml/README.md`. Trained on public data, not on real Bulgarian stores |
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

The demand model is trained separately (`ml/`) and used only through backend services.

## Project structure

```
inventra/
├── apps/
│   ├── api/                    # Backend: Python + FastAPI
│   │   ├── app/
│   │   │   ├── api/v1/routes/  # HTTP endpoints
│   │   │   ├── services/       # Business logic
│   │   │   ├── repositories/   # Database access
│   │   │   ├── models/         # Database tables (SQLAlchemy)
│   │   │   ├── schemas/        # Request/response shapes and validation (Pydantic)
│   │   │   ├── core/           # Settings, errors, barcode validation
│   │   │   └── db/             # Database connection
│   │   ├── migrations/         # Alembic migrations
│   │   ├── scripts/            # Seed script and initial SQL setup
│   │   └── tests/              # pytest tests
│   └── web/                    # Web platform: React + TypeScript + Vite
│       └── src/
│           ├── config/         # App name and the navigation list (drives sidebar + routes)
│           ├── components/
│           │   ├── layout/     # Sidebar, top bar, page transition
│           │   └── ui/         # shadcn/ui components (generated by the shadcn CLI)
│           ├── pages/          # One component per page
│           └── router.tsx      # Which URL opens which page
├── ml/                         # Trains the demand model (see ml/README.md)
├── brand/                      # Original logo files (web and mobile icons are exported from here)
└── docker-compose.yml          # Optional: PostgreSQL in Docker
```

## Tech stack

**Backend:** Python 3.12+, FastAPI, SQLAlchemy 2, Alembic, Pydantic, PostgreSQL 17, pytest, Ruff

**Web:** React 19, TypeScript, Vite, Tailwind CSS 4, shadcn/ui (Radix), React Router, TanStack Query (server data and caching), Lucide icons, GSAP (subtle page transitions, disabled for reduced-motion users), Recharts (charts, added together with real data), oxlint

## Running locally

Run the commands in a terminal. Where they differ, both **macOS** and **Windows (PowerShell)** versions are given.

### 1. Prerequisites

- **Git**
- **Python 3.12 or newer** from [python.org](https://www.python.org/downloads/). On Windows, make sure to tick **"Add python.exe to PATH"** during installation.
- **PostgreSQL 17** (see step 2)
- **Node.js 22 LTS or newer** from [nodejs.org](https://nodejs.org/) (for the web platform)

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

Browser tests run a real browser against the real web app, API and PostgreSQL. Install the browser once:

```bash
cd apps/web
npx playwright install chromium
```

Then run them (Playwright starts its own servers on ports 8010 and 5183, so your development servers can keep running):

```bash
npm run test:e2e
```

They rebuild the `inventra_test` database, so don't run them at the same time as `pytest`. After a failure, `npx playwright show-report` shows a step-by-step recording.

### 5. Web platform

In a **second** terminal (the backend keeps running in the first one). The commands are the same on macOS and Windows:

```bash
cd apps/web
npm install        # once, and again whenever package.json changes
npm run dev
```

Open **http://localhost:5173**. You land on the login page; in development a "Fill demo account" button fills in the test account.

The dev server forwards every `/api/...` request to the backend at `http://localhost:8000`, so for the browser the web app and the API share one address and the session cookie works without cross-site setup. To use a backend on another address, start the dev server with `API_PROXY_TARGET`, e.g. `API_PROXY_TARGET=http://localhost:8001 npm run dev`.

| Command | What it does |
|---|---|
| `npm run dev` | Development server with instant reload |
| `npm run build` | Type-checks with TypeScript and builds the production version into `dist/` |
| `npm run lint` | Checks the code with oxlint |

New shadcn/ui components are added with `npx shadcn@latest add <name>` (for example `table`).

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

## Test account

After running the seed script you can log in with:

| Role | Email | Password |
|---|---|---|
| Owner | `owner@inventra.example` | `Inventra-demo-2026` |

`.example` is a domain reserved for examples, so this address can never belong to a real person.

## Security

- Passwords are stored only as **Argon2id** hashes.
- Sessions are stored on the server; the browser keeps only a random token in an **httpOnly, SameSite=Lax** cookie (not readable by JavaScript). Logging out deletes the session on the server.
- Only SHA-256 hashes of session and email tokens are stored in the database.
- New accounts must **confirm their email** before they can log in. Verification links are single-use and expire after 24 hours.
- After 5 wrong passwords in a row the account is locked for 15 minutes.
- Forgotten passwords are reset through a single-use emailed link valid for 1 hour. A reset ends every session of the account and notifies the owner by email.
- Register, login and "resend link" give the same answer whether or not an email is registered, so accounts can't be discovered.
- Every data query is scoped to the logged-in user's store.

## Data sources

The demand model is trained on [FreshRetailNet-50K](https://huggingface.co/datasets/Dingdong-Inc/FreshRetailNet-50K) by Dingdong-Inc, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The model file is derived from this data. See [ml/README.md](ml/README.md).

## Demo data

`scripts/seed_demo.py` creates a store named "Демо магазин (демо данни)" ("Demo store (demo data)") with 10 fictional products and batches whose expiry dates are counted from the day you run it, including one already expired, plus 8 weeks of invented past sales and write-offs. To replace aged demo data with fresh data, run the script with `--fresh-demo`; this deletes the demo store's batches, sales and their history. Their barcodes start with `200`, a GS1 prefix reserved for in-store use that is never assigned to real retail products, so demo data can never be confused with a real scan.
