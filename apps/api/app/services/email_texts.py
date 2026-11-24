"""What each email says, in Bulgarian and in English, as plain text and as HTML.

Each email is a few paragraphs and at most one button. One template draws all of them, so they
look alike and a new email is only its words. Names typed by people are escaped in the HTML, so
a name like "<b>Ivan</b>" is shown as written instead of changing the email.
"""

from dataclasses import dataclass
from html import escape

from app.core.config import get_settings
from app.core.email import Email
from app.core.language import Language
from app.models.user import UserRole

ROLE_NAMES: dict[Language, dict[UserRole, str]] = {
    "en": {UserRole.OWNER: "an owner", UserRole.MANAGER: "a manager", UserRole.STAFF: "staff"},
    "bg": {UserRole.OWNER: "собственик", UserRole.MANAGER: "управител", UserRole.STAFF: "служител"},
}

GREETING = {"en": "Hello {name},", "bg": "Здравей, {name}!"}
FALLBACK = {
    "en": "If the button doesn't work, copy this link into your browser:",
    "bg": "Ако бутонът не работи, копирай този линк в браузъра:",
}
FOOTER = {
    "en": "You get this email because of an account at Inventra.",
    "bg": "Получаваш това писмо заради профил в Inventra.",
}

# The colours of the site: cream paper, dark ink, mustard for the brand.
PAPER = "#fbf5ea"
INK = "#2b2622"
MUTED = "#6f665d"
SIGNAL = "#e9a93a"


@dataclass(frozen=True)
class Button:
    label: str
    link: str


def compose(
    to: str,
    language: Language,
    name: str,
    subject: str,
    paragraphs: list[str],
    button: Button | None = None,
    after: list[str] | None = None,
) -> Email:
    """One email from its words: a greeting, paragraphs, a button and lines after it."""
    after = after or []
    greeting = GREETING[language].format(name=name)

    text_parts = [greeting, *paragraphs]
    if button:
        text_parts.append(f"{button.label}:\n{button.link}")
    text_parts += [*after, f"-- \n{FOOTER[language]}"]
    text = "\n\n".join(text_parts)

    def paragraph(words: str) -> str:
        return f'<p style="margin:0 0 16px;line-height:1.55">{escape(words)}</p>'

    button_html = ""
    if button:
        link = escape(button.link, quote=True)
        button_html = (
            f'<p style="margin:24px 0"><a href="{link}" style="display:inline-block;'
            f"background:{INK};color:#ffffff;text-decoration:none;font-weight:bold;"
            f'padding:12px 22px;border-radius:999px">{escape(button.label)}</a></p>'
        )
        fallback = (
            f'<p style="margin:0 0 16px;font-size:13px;color:{MUTED}">{escape(FALLBACK[language])}'
            f'<br><a href="{link}" style="color:{MUTED};word-break:break-all">{link}</a></p>'
        )
    else:
        fallback = ""

    html = f"""<!doctype html>
<html lang="{language}">
<body style="margin:0;padding:24px 12px;background:{PAPER};color:{INK};
  font-family:Arial,sans-serif;font-size:16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
        style="max-width:520px">
        <tr><td style="padding:0 4px 16px;font-size:20px;font-weight:bold">
          <span style="color:{SIGNAL}">&#9632;</span> Inventra
        </td></tr>
        <tr><td style="background:#ffffff;border-radius:20px;padding:28px">
          {paragraph(greeting)}
          {"".join(paragraph(words) for words in paragraphs)}
          {button_html}
          {"".join(paragraph(words) for words in after)}
          {fallback}
        </td></tr>
        <tr><td style="padding:16px 4px;font-size:12px;color:{MUTED}">
          {escape(FOOTER[language])}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""
    return Email(to=to, subject=subject, text=text, html=html)


def _site(path: str) -> str:
    return f"{get_settings().web_app_url}{path}"


def verification(to: str, language: Language, name: str, link: str, hours: int) -> Email:
    if language == "en":
        return compose(
            to,
            language,
            name,
            "Confirm your Inventra account",
            ["Open this link to confirm your email address."],
            Button("Confirm my email", link),
            [f"The link is valid for {hours} hours."],
        )
    return compose(
        to,
        language,
        name,
        "Потвърди профила си в Inventra",
        ["Отвори линка, за да потвърдиш имейл адреса си."],
        Button("Потвърди имейла", link),
        [f"Линкът важи {hours} часа."],
    )


def someone_tried(to: str, language: Language, name: str) -> Email:
    if language == "en":
        return compose(
            to,
            language,
            name,
            "Someone tried to register with your email",
            [
                "Someone tried to create an Inventra account with this email address, which "
                "already has an account. If it was you, just log in. If not, you can ignore this."
            ],
            Button("Log in", _site("/login")),
        )
    return compose(
        to,
        language,
        name,
        "Някой се опита да се регистрира с твоя имейл",
        [
            "Някой се опита да създаде профил в Inventra с този имейл адрес, а той вече има "
            "профил. Ако това си ти, просто влез. Ако не, можеш да пренебрегнеш това писмо."
        ],
        Button("Вход", _site("/login")),
    )


def password_reset(to: str, language: Language, name: str, link: str, minutes: int) -> Email:
    if language == "en":
        return compose(
            to,
            language,
            name,
            "Reset your Inventra password",
            ["Open this link to choose a new password."],
            Button("Choose a new password", link),
            [
                f"The link is valid for {minutes} minutes and works once. If you didn't ask for "
                "this, ignore this email: your password stays the same."
            ],
        )
    return compose(
        to,
        language,
        name,
        "Нова парола за Inventra",
        ["Отвори линка, за да избереш нова парола."],
        Button("Избери нова парола", link),
        [
            f"Линкът важи {minutes} минути и работи веднъж. Ако заявката не е от теб, "
            "пренебрегни това писмо: паролата ти остава същата."
        ],
    )


def password_changed(to: str, language: Language, name: str, everywhere: bool) -> Email:
    """After a reset everyone is logged out; after a change, everyone but the person changing."""
    if language == "en":
        devices = "on all devices" if everywhere else "on your other devices"
        return compose(
            to,
            language,
            name,
            "Your Inventra password was changed",
            [
                f"The password of your account was just changed and you were logged out {devices}. "
                "If this wasn't you, reset your password right away."
            ],
            Button("Reset my password", _site("/forgot-password")),
        )
    devices = (
        "всички устройства бяха изписани" if everywhere else "другите ти устройства бяха изписани"
    )
    return compose(
        to,
        language,
        name,
        "Паролата ти в Inventra е сменена",
        [
            f"Паролата на профила ти току-що беше сменена и {devices}. Ако това не си ти, "
            "поискай нова парола веднага."
        ],
        Button("Поискай нова парола", _site("/forgot-password")),
    )


def invitation(
    to: str,
    language: Language,
    name: str,
    inviter: str,
    store: str,
    role: UserRole,
    link: str,
    days: int,
) -> Email:
    role_name = ROLE_NAMES[language][role]
    if language == "en":
        return compose(
            to,
            language,
            name,
            f"{inviter} invited you to {store} on Inventra",
            [
                f"{inviter} invited you to join {store} on Inventra as {role_name}.",
                "Open this link to choose your password.",
            ],
            Button("Accept the invitation", link),
            [f"The link is valid for {days} days and works once."],
        )
    return compose(
        to,
        language,
        name,
        f"{inviter} те кани в {store} в Inventra",
        [
            f"{inviter} те кани да се присъединиш към {store} в Inventra като {role_name}.",
            "Отвори линка, за да си избереш парола.",
        ],
        Button("Приеми поканата", link),
        [f"Линкът важи {days} дни и работи веднъж."],
    )
