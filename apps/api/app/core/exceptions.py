"""Domain errors raised by the service layer.

Services know nothing about HTTP. They raise these errors, and app/main.py
translates them into HTTP responses in one place.
"""


class DomainError(Exception):
    status_code = 400
    code = "domain_error"

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class NotFoundError(DomainError):
    status_code = 404
    code = "not_found"


class ConflictError(DomainError):
    status_code = 409
    code = "conflict"


class NotAuthenticatedError(DomainError):
    status_code = 401
    code = "not_authenticated"


class InvalidCredentialsError(DomainError):
    status_code = 401
    code = "invalid_credentials"


class EmailNotVerifiedError(DomainError):
    status_code = 403
    code = "email_not_verified"


class AccountLockedError(DomainError):
    status_code = 429
    code = "account_locked"


class InvalidTokenError(DomainError):
    status_code = 400
    code = "invalid_token"


class UnitLockedError(DomainError):
    status_code = 409
    code = "unit_locked"


class InsufficientStockError(DomainError):
    status_code = 409
    code = "insufficient_stock"


class InvalidQuantityError(DomainError):
    status_code = 422
    code = "invalid_quantity"


class InvalidReceiptError(DomainError):
    status_code = 422
    code = "invalid_receipt"
