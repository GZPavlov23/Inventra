"""Moments in the past for tests that put records on a given day."""

from datetime import UTC, date, datetime, time, timedelta


def on_day(days_ago: int) -> datetime:
    """Noon of the calendar day `days_ago` days back; now, for today.

    Subtracting days * 24 hours instead lands on the wrong day: late in the evening, a day
    from before a clock change is an hour longer or shorter.
    """
    if days_ago == 0:
        return datetime.now(UTC)
    return datetime.combine(date.today() - timedelta(days=days_ago), time(12)).astimezone()
