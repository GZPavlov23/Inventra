from datetime import datetime
from typing import Annotated, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.schemas.common import empty_to_none

SupplierName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)
]
ContactName = Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] | None
Phone = (
    Annotated[
        str, StringConstraints(strip_whitespace=True, max_length=32, pattern=r"^[\d +()/-]*$")
    ]
    | None
)
Notes = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] | None


class SupplierCreate(BaseModel):
    name: SupplierName
    contact_name: ContactName = None
    phone: Phone = None
    email: EmailStr | None = None
    notes: Notes = None

    _clean_text = field_validator("contact_name", "phone", "notes")(empty_to_none)
    _clean_email = field_validator("email", mode="before")(empty_to_none)


class SupplierUpdate(BaseModel):
    """PATCH body: only the fields the client actually sends are changed."""

    name: SupplierName | None = None
    contact_name: ContactName = None
    phone: Phone = None
    email: EmailStr | None = None
    notes: Notes = None
    active: bool | None = None

    _clean_text = field_validator("contact_name", "phone", "notes")(empty_to_none)
    _clean_email = field_validator("email", mode="before")(empty_to_none)

    @model_validator(mode="after")
    def required_fields_not_null(self) -> Self:
        for field in {"name", "active"} & self.model_fields_set:
            if getattr(self, field) is None:
                raise ValueError(f"'{field}' cannot be null")
        return self


class SupplierRef(BaseModel):
    """The little that a product needs to show who it comes from."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    active: bool


class SupplierRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    contact_name: str | None
    phone: str | None
    email: str | None
    notes: str | None
    active: bool
    product_count: int
    created_at: datetime
    updated_at: datetime


class SupplierPage(BaseModel):
    items: list[SupplierRead]
    total: int
    limit: int
    offset: int
