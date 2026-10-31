"""How much to order: walks through the coming days as the shop would live them.

Stock isn't one number. Ten bottles of milk that expire tomorrow don't cover a week if only one
sells per day: two get sold and eight are thrown away. So each batch is followed day by day, the
one that expires first going first, exactly as sales take them.
"""

from dataclasses import dataclass
from datetime import date, timedelta
from math import ceil

from app.models.product import ProductUnit


@dataclass(frozen=True)
class StockBatch:
    quantity: float
    expiry_date: date | None


@dataclass(frozen=True)
class StockPlan:
    # Demand that today's stock will really serve.
    served: float
    # What will expire on the shelf before anyone buys it.
    expiring_unsold: float
    # What is still good after the last day.
    left_over: float


def plan_stock(batches: list[StockBatch], demand: list[float], first_day: date) -> StockPlan:
    shelf = sorted(
        ([batch.expiry_date, batch.quantity] for batch in batches),
        key=lambda batch: (batch[0] is None, batch[0] or first_day),
    )
    served = lost = 0.0

    for offset, wanted in enumerate(demand):
        day = first_day + timedelta(days=offset)
        for batch in shelf:
            expiry_date, quantity = batch
            if expiry_date is not None and expiry_date < day:
                lost += quantity
                batch[1] = 0.0
                continue
            taken = min(wanted, quantity)
            batch[1] -= taken
            wanted -= taken
            served += taken

    last_day = first_day + timedelta(days=len(demand) - 1)
    left_over = 0.0
    for expiry_date, quantity in shelf:
        if expiry_date is not None and expiry_date <= last_day:
            lost += quantity
        else:
            left_over += quantity
    return StockPlan(served, lost, left_over)


def round_order(quantity: float, unit: ProductUnit) -> float:
    """Up, because too little is what the order is there to prevent, and a piece can't be split."""
    if unit == ProductUnit.PIECE:
        return float(ceil(round(quantity, 6)))
    return ceil(round(quantity * 10, 6)) / 10
