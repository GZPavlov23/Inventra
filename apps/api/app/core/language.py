"""The language a person reads the site in, for the few texts the server writes itself (emails).

The web app sends its chosen language in the standard Accept-Language header. Bulgarian is the
default, the same as on the site, so an app that sends nothing still gets Bulgarian emails.
"""

from typing import Literal

Language = Literal["bg", "en"]


def language_from_header(accept_language: str | None) -> Language:
    # "en", "en-US" and "en-GB,en;q=0.9" all start with the language the person prefers most.
    if accept_language and accept_language.strip().lower().startswith("en"):
        return "en"
    return "bg"
