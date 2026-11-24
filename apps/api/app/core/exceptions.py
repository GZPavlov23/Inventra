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


class ForbiddenError(DomainError):
    status_code = 403
    code = "forbidden"


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


class SupplierArchivedError(DomainError):
    status_code = 409
    code = "supplier_archived"


class DeliveryClosedError(DomainError):
    status_code = 409
    code = "delivery_closed"


class WrongPasswordError(DomainError):
    # 400, not 401: a 401 means "your session ended" and would log the user out.
    status_code = 400
    code = "wrong_password"


class LastOwnerError(DomainError):
    status_code = 409
    code = "last_owner"


class InsufficientStockError(DomainError):
    status_code = 409
    code = "insufficient_stock"


class StockChangedError(DomainError):
    status_code = 409
    code = "stock_changed"


class InvalidQuantityError(DomainError):
    status_code = 422
    code = "invalid_quantity"


class InvalidReceiptError(DomainError):
    status_code = 422
    code = "invalid_receipt"


class InvalidPeriodError(DomainError):
    status_code = 422
    code = "invalid_period"


class EmailNotSentError(DomainError):
    # 503: the server itself is fine, but a service it relies on didn't answer.
    status_code = 503
    code = "email_not_sent"
