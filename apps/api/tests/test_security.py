"""Unit tests for password hashing and token helpers (no database needed)."""

from app.core.security import generate_token, hash_password, hash_token, verify_password


def test_password_hash_is_argon2id_and_never_the_password() -> None:
    hashed = hash_password("correct horse battery staple")
    assert hashed.startswith("$argon2id$")
    assert "correct horse" not in hashed


def test_verify_password_accepts_only_the_right_password() -> None:
    hashed = hash_password("correct horse battery staple")
    assert verify_password("correct horse battery staple", hashed)
    assert not verify_password("Correct horse battery staple", hashed)
    assert not verify_password("", hashed)


def test_same_password_gets_a_different_hash_each_time() -> None:
    # A random salt per hash means equal passwords can't be spotted in the database.
    assert hash_password("same-password") != hash_password("same-password")


def test_generated_tokens_are_long_and_unique() -> None:
    tokens = {generate_token() for _ in range(1000)}
    assert len(tokens) == 1000
    assert all(len(token) >= 43 for token in tokens)  # 32 random bytes in base64


def test_token_hash_is_stable_and_hides_the_token() -> None:
    token = generate_token()
    assert hash_token(token) == hash_token(token)
    assert len(hash_token(token)) == 64
    assert token not in hash_token(token)
