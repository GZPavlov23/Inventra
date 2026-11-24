import logging
import sys
import time

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.exceptions import DomainError


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=f"{settings.app_name} API", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    if settings.request_log:
        add_request_log(app)

    @app.exception_handler(DomainError)
    async def handle_domain_error(_: Request, error: DomainError) -> JSONResponse:
        return JSONResponse(
            {"code": error.code, "detail": error.message}, status_code=error.status_code
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(_: Request, error: RequestValidationError) -> JSONResponse:
        errors = jsonable_encoder(error.errors(), exclude={"input", "ctx", "url"})
        for item in errors:
            # Pydantic prefixes our own validator messages; users should only see the message.
            item["msg"] = item["msg"].removeprefix("Value error, ")
        first = errors[0]["msg"] if errors else "Invalid request"
        return JSONResponse(
            {"code": "validation_error", "detail": first, "errors": errors}, status_code=422
        )

    app.include_router(api_router, prefix=settings.api_v1_prefix)
    return app


request_logger = logging.getLogger("inventra.requests")

# Green for done, yellow for refused (the client's mistake), red for a server error.
COLOURS = {2: "\033[32m", 3: "\033[36m", 4: "\033[33m", 5: "\033[31m"}


def add_request_log(app: FastAPI) -> None:
    """Writes every request as one line: time, method, address, answer and how long it took.

    12:31:05  POST   /api/v1/sales                     201    34 ms
    """
    colour = sys.stderr.isatty()
    # Alembic's logging setup switches off every logger that existed before it ran, and the
    # migrations run before the server starts.
    request_logger.disabled = False

    @app.middleware("http")
    async def log_request(request: Request, call_next):
        started = time.perf_counter()
        response = await call_next(request)
        took = (time.perf_counter() - started) * 1000
        status = str(response.status_code)
        if colour:
            status = f"{COLOURS.get(response.status_code // 100, '')}{status}\033[0m"
        request_logger.info(
            "%s  %-6s %-40s %s %5.0f ms",
            time.strftime("%H:%M:%S"),
            request.method,
            request.url.path,
            status,
            took,
        )
        return response


app = create_app()
