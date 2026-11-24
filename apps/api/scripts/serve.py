"""Starts Inventra's server for real use, with one command: the API and the tunnel to it.

    .venv/bin/python -m scripts.serve            # online: https://inventra.day works
    .venv/bin/python -m scripts.serve --offline  # no internet: only this computer

Online, the API runs in production mode (cookies only over HTTPS, email links to inventra.day)
and a Cloudflare Tunnel connects api.inventra.day to it, so the site on inventra.day works while
this runs. Every request shows up as one readable line. Ctrl+C stops everything.

Offline is the plan for a room without internet: the API runs as in development, and the site
is opened from this computer with `npm run dev` (http://localhost:5173).

PostgreSQL must already be running (Homebrew starts it on its own; otherwise
`docker compose up -d` from the project folder).
"""

import logging
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[1]
PORT = 8000
SITE = "https://inventra.day"
API = "https://api.inventra.day"
TUNNEL = "inventra"
TUNNEL_LOG = API_ROOT / "cloudflared.log"


def main() -> None:
    offline = "--offline" in sys.argv
    if not offline:
        # Before the app is imported: settings are read once, at import.
        os.environ["ENVIRONMENT"] = "production"
        os.environ["WEB_APP_URL"] = SITE
        os.environ["CORS_ORIGINS"] = SITE
    os.environ["REQUEST_LOG"] = "true"

    check_database()
    upgrade_database()
    tunnel = None if offline else start_tunnel()

    # force: the migrations' logging setup (alembic.ini) has already set every log to warnings
    # only, which would silently swallow the request lines.
    logging.basicConfig(level=logging.INFO, format="%(message)s", force=True)
    print(
        f"\nInventra is running: {SITE if not offline else 'http://localhost:5173 (npm run dev)'}"
    )
    print("Every request shows up below. Ctrl+C stops the server and the tunnel.\n")
    try:
        import uvicorn

        uvicorn.run(
            "app.main:app", host="127.0.0.1", port=PORT, access_log=False, log_level="warning"
        )
    finally:
        if tunnel is not None:
            tunnel.terminate()
            print("Tunnel stopped.")


def check_database() -> None:
    from sqlalchemy import create_engine, text

    from app.core.config import get_settings

    try:
        with create_engine(get_settings().database_url).connect() as connection:
            connection.execute(text("select 1"))
    except Exception:  # noqa: BLE001 - any failure here means the same thing to the person
        sys.exit(
            "PostgreSQL isn't answering. Start it first: `brew services start postgresql@17`, "
            "or `docker compose up -d` from the project folder."
        )


def upgrade_database() -> None:
    from alembic import command
    from alembic.config import Config

    command.upgrade(Config(str(API_ROOT / "alembic.ini")), "head")


def start_tunnel() -> subprocess.Popen:
    if shutil.which("cloudflared") is None:
        sys.exit("cloudflared isn't installed. See 'Публикуване' (or run with --offline).")
    log = TUNNEL_LOG.open("w", encoding="utf-8")
    tunnel = subprocess.Popen(
        ["cloudflared", "tunnel", "run", "--url", f"http://localhost:{PORT}", TUNNEL],
        stdout=log,
        stderr=subprocess.STDOUT,
    )
    # A connection to Cloudflare usually takes a couple of seconds.
    for _ in range(30):
        time.sleep(0.5)
        if tunnel.poll() is not None:
            sys.exit(f"The tunnel stopped at once. Its log: {TUNNEL_LOG}")
        if "Registered tunnel connection" in TUNNEL_LOG.read_text(encoding="utf-8"):
            print(f"Tunnel connected: {API}")
            return tunnel
    print(f"The tunnel is still connecting. If the site doesn't work, see {TUNNEL_LOG}")
    return tunnel


if __name__ == "__main__":
    main()
