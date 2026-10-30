"""Starts the API for the Playwright browser tests (apps/web/e2e). Playwright runs this itself.

It uses the disposable test database: the schema is rebuilt from the migrations and filled with
the demo data, so every test run starts from the same state and development data is never
touched. Emails go to a file, where the tests read the links. That lives here on purpose: the
application itself has no test-only backdoor.

Environment: E2E_PORT (the port to listen on) and E2E_OUTBOX (the path of the email file).
"""

import json
import os
import sys
from pathlib import Path

import uvicorn
from alembic import command
from alembic.config import Config

from app.core.config import get_settings

API_ROOT = Path(__file__).resolve().parents[1]


class FileEmailSender:
    def __init__(self, path: Path) -> None:
        self.path = path

    def send(self, to: str, subject: str, body: str) -> None:
        with self.path.open("a", encoding="utf-8") as outbox:
            outbox.write(json.dumps({"to": to, "subject": subject, "body": body}) + "\n")


def main() -> None:
    settings = get_settings()
    test_url = settings.test_database_url
    if test_url == settings.database_url:
        sys.exit("TEST_DATABASE_URL equals DATABASE_URL: refusing to wipe the development database")

    # Must be set before anything imports app.db.session, which connects using this setting.
    os.environ["DATABASE_URL"] = test_url
    get_settings.cache_clear()

    alembic_config = Config(str(API_ROOT / "alembic.ini"))
    alembic_config.set_main_option("sqlalchemy.url", test_url)
    command.downgrade(alembic_config, "base")
    command.upgrade(alembic_config, "head")

    from app.core.email import get_email_sender
    from app.main import app
    from scripts.seed_demo import main as seed_demo

    seed_demo()

    outbox = Path(os.environ["E2E_OUTBOX"])
    outbox.write_text("", encoding="utf-8")
    app.dependency_overrides[get_email_sender] = lambda: FileEmailSender(outbox)

    uvicorn.run(app, host="127.0.0.1", port=int(os.environ["E2E_PORT"]), log_level="warning")


if __name__ == "__main__":
    main()
