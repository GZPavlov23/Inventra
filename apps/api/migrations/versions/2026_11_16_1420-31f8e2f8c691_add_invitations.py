"""add invitations

Revision ID: 31f8e2f8c691
Revises: 58435a183c8b
Create Date: 2026-11-16 14:20:08.499339

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '31f8e2f8c691'
down_revision: Union[str, Sequence[str], None] = '58435a183c8b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Alembic can't see a new value inside the CHECK constraint of a non-native enum,
# so the constraint is replaced by hand.
CONSTRAINT = "ck_auth_tokens_auth_token_purpose"
OLD = "purpose IN ('email_verification', 'password_reset')"
NEW = "purpose IN ('email_verification', 'password_reset', 'invitation')"


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_constraint(op.f(CONSTRAINT), "auth_tokens", type_="check")
    op.create_check_constraint(op.f(CONSTRAINT), "auth_tokens", NEW)


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DELETE FROM auth_tokens WHERE purpose = 'invitation'")
    op.drop_constraint(op.f(CONSTRAINT), "auth_tokens", type_="check")
    op.create_check_constraint(op.f(CONSTRAINT), "auth_tokens", OLD)
