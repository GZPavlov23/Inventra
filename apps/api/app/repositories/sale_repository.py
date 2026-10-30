"""Data access for sales."""

from sqlalchemy.orm import Session

from app.models.sale import Sale, SaleItem


class SaleRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, entity: Sale | SaleItem) -> None:
        self.session.add(entity)
        self.session.flush()
