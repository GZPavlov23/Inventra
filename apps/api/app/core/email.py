"""Sending emails.

Services depend on the EmailSender interface, not on a concrete provider. Without SMTP settings
the ConsoleEmailSender prints each email (with its link) to the backend terminal, which is what
development and the tests use. With SMTP_HOST set, the SmtpEmailSender really sends it, through
any provider that speaks SMTP (we use Brevo), so changing provider is only a change of settings.
"""

import logging
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage
from typing import Protocol

from app.core.config import get_settings
from app.core.exceptions import EmailNotSentError

logger = logging.getLogger("inventra.email")

# Long enough for a slow provider, short enough that nobody waits on a frozen page.
SMTP_TIMEOUT_SECONDS = 15
# Port 465 starts encrypted; the usual 587 starts plain and switches to TLS (STARTTLS).
IMPLICIT_TLS_PORT = 465

CONSOLE_TEMPLATE = """
--- EMAIL (development: printed here, not really sent) ---
To: %s
Subject: %s

%s
-----------------------------------------------------------"""


@dataclass(frozen=True)
class Email:
    to: str
    subject: str
    # Every email has a plain text version, for mail apps that don't show HTML.
    text: str
    html: str | None = None


class EmailSender(Protocol):
    def send(self, email: Email) -> None: ...


class ConsoleEmailSender:
    def send(self, email: Email) -> None:
        logger.warning(CONSOLE_TEMPLATE, email.to, email.subject, email.text)


class SmtpEmailSender:
    def __init__(self, host: str, port: int, username: str, password: str, sender: str) -> None:
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.sender = sender

    def send(self, email: Email) -> None:
        message = EmailMessage()
        message["From"] = self.sender
        message["To"] = email.to
        message["Subject"] = email.subject
        message.set_content(email.text)
        if email.html is not None:
            message.add_alternative(email.html, subtype="html")

        context = ssl.create_default_context()
        try:
            if self.port == IMPLICIT_TLS_PORT:
                smtp = smtplib.SMTP_SSL(
                    self.host, self.port, timeout=SMTP_TIMEOUT_SECONDS, context=context
                )
            else:
                smtp = smtplib.SMTP(self.host, self.port, timeout=SMTP_TIMEOUT_SECONDS)
            with smtp:
                if self.port != IMPLICIT_TLS_PORT:
                    smtp.starttls(context=context)
                smtp.login(self.username, self.password)
                smtp.send_message(message)
        except (smtplib.SMTPException, OSError) as error:
            # OSError covers a provider that can't be reached at all (no internet, wrong host).
            logger.error("The email %r to %s was not sent: %s", email.subject, email.to, error)
            raise EmailNotSentError(
                "The email could not be sent. Try again in a few minutes"
            ) from error


def get_email_sender() -> EmailSender:
    settings = get_settings()
    if not settings.smtp_host:
        return ConsoleEmailSender()
    return SmtpEmailSender(
        host=settings.smtp_host,
        port=settings.smtp_port,
        username=settings.smtp_username,
        password=settings.smtp_password.get_secret_value(),
        sender=settings.email_from,
    )
