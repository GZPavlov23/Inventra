"""The one-line request log that scripts/serve.py turns on for showing the server at work."""

import logging

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import create_app


@pytest.fixture
def app_with(monkeypatch: pytest.MonkeyPatch):
    def build(request_log: bool):
        monkeypatch.setenv("REQUEST_LOG", "true" if request_log else "false")
        get_settings.cache_clear()
        try:
            return create_app()
        finally:
            get_settings.cache_clear()

    return build


def test_each_request_is_one_line_with_method_address_answer_and_time(
    app_with, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.INFO, logger="inventra.requests"):
        TestClient(app_with(True)).get("/api/v1/health")
    [line] = [
        record.getMessage() for record in caplog.records if record.name == "inventra.requests"
    ]
    assert "GET" in line and "/api/v1/health" in line and "200" in line and line.endswith("ms")


def test_it_is_off_unless_asked_for(app_with, caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.INFO, logger="inventra.requests"):
        TestClient(app_with(False)).get("/api/v1/health")
    assert not [record for record in caplog.records if record.name == "inventra.requests"]
