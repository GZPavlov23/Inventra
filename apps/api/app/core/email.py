"""Sending emails.

Services depend on the EmailSender interface, not on a concrete provider. In development the
ConsoleEmailSender prints each email (with its link) to the backend terminal. At deployment a
real sender (e.g. SMTP) is plugged in through get_email_sender, without changing any service.
"""

import logging
from typing import Protocol

logger = logging.getLogger("inventra.email")

CONSOLE_TEMPLATE = """
--- EMAIL (development: printed here, not really sent) ---
To: %s
Subject: %s

%s
-----------------------------------------------------------"""


class EmailSender(Protocol):
    def send(self, to: str, subject: str, body: str) -> None: ...


class ConsoleEmailSender:
    def send(self, to: str, subject: str, body: str) -> None:
        logger.warning(CONSOLE_TEMPLATE, to, subject, body)


def get_email_sender() -> EmailSender:
    return ConsoleEmailSender()
