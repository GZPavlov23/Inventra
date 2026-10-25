from pydantic import BaseModel


class ErrorResponse(BaseModel):
    """Shape of every error the API returns, so clients can rely on `code`."""

    code: str
    detail: str
