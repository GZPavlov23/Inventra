"""Password hashing and secure random tokens.

Passwords are hashed with Argon2id: slow and memory-hard on purpose, so a stolen database
can't be brute-forced quickly. Each hash has its own random salt, so two users with the same
password still get different hashes.

Tokens (sessions, email verification links) are long random strings. Only their SHA-256 hash
is stored, so someone who reads the database still can't log in as a user. A fast hash is
enough here because the tokens are random and 256 bits long, unlike human-chosen passwords.
"""

import hashlib
import secrets

from pwdlib import PasswordHash

_password_hasher = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return _password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return _password_hasher.verify(password, password_hash)


def generate_token() -> str:
    """A URL-safe random token with 256 bits of entropy."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
