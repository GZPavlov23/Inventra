"""Periods of whole days, as reports and lists ask for them."""

from datetime import date, datetime, time, timedelta

from app.core.exceptions import InvalidPeriodError

# A report of more than a year wouldn't be readable anyway.
MAX_PERIOD_DAYS = 366


def start_of_day(day: date | None) -> datetime | None:
    # astimezone: the day is the server's local day, the same one date.today() gives.
    return None if day is None else datetime.combine(day, time.min).astimezone()


def period_bounds(
    date_from: date | None, date_to: date | None
) -> tuple[datetime | None, datetime | None]:
    # date_to counts as a whole day, so the period ends where the next day starts.
    next_day = None if date_to is None else date_to + timedelta(days=1)
    return start_of_day(date_from), start_of_day(next_day)


def period_length(date_from: date, date_to: date) -> int:
    """Number of days in a period, both ends included. Refuses a period that makes no sense."""
    days = (date_to - date_from).days + 1
    if days < 1:
        raise InvalidPeriodError("The period ends before it starts")
    if days > MAX_PERIOD_DAYS:
        raise InvalidPeriodError(f"The period can't be longer than {MAX_PERIOD_DAYS} days")
    return days
