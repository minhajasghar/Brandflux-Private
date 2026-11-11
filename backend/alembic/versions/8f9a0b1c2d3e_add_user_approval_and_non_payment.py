"""Add user approval and non-payment account flags

Revision ID: 8f9a0b1c2d3e
Revises: 6e7f8a9b0c1d
Create Date: 2026-11-12 02:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8f9a0b1c2d3e'
down_revision: Union[str, Sequence[str], None] = '6e7f8a9b0c1d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_cols = [c["name"] for c in inspector.get_columns("users")]

    if "is_approved" not in existing_cols:
        op.add_column("users", sa.Column("is_approved", sa.Boolean(), nullable=False, server_default=sa.text("0")))
    if "approved_at" not in existing_cols:
        op.add_column("users", sa.Column("approved_at", sa.DateTime(), nullable=True))
    if "approved_by_id" not in existing_cols:
        op.add_column("users", sa.Column("approved_by_id", sa.String(length=36), nullable=True))
    if "is_non_payment" not in existing_cols:
        op.add_column("users", sa.Column("is_non_payment", sa.Boolean(), nullable=False, server_default=sa.text("0")))


def downgrade() -> None:
    op.drop_column("users", "is_non_payment")
    op.drop_column("users", "approved_by_id")
    op.drop_column("users", "approved_at")
    op.drop_column("users", "is_approved")

