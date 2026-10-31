from pydantic import BaseModel


def empty_to_none(value: str | None) -> str | None:
    return value or None


class ErrorResponse(BaseModel):
    """Shape of every error the API returns, so clients can rely on `code`."""

    code: str
    detail: str
