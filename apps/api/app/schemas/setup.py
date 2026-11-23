from pydantic import BaseModel


class StoreSetup(BaseModel):
    """Which first steps a new store has taken. Each one is read from the data itself, so a
    step can't be ticked off without really being done."""

    products: bool
    goods: bool
    # A sale recorded here, or sales history imported from the till.
    sales: bool
    suppliers: bool
    # None when this person can't invite anyone (only the owner can): the step isn't theirs.
    team: bool | None
    done: bool
