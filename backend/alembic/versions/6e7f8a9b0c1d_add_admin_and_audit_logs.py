"""Add role and status to users and create audit_logs table

Revision ID: 6e7f8a9b0c1d
Revises: 5d6e7f8a9b0c
Create Date: 2026-10-29 17:35:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6e7f8a9b0c1d'
down_revision: Union[str, Sequence[str], None] = '5d6e7f8a9b0c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    # 1. Add admin and status columns to users
    user_cols = [c['name'] for c in inspector.get_columns('users')]
    if 'role' not in user_cols:
        op.add_column('users', sa.Column('role', sa.String(length=50), server_default='user', nullable=True))
    if 'is_suspended' not in user_cols:
        op.add_column('users', sa.Column('is_suspended', sa.Boolean(), server_default='0', nullable=True))
    if 'is_deleted' not in user_cols:
        op.add_column('users', sa.Column('is_deleted', sa.Boolean(), server_default='0', nullable=True))
    if 'deleted_at' not in user_cols:
        op.add_column('users', sa.Column('deleted_at', sa.DateTime(), nullable=True))
    if 'token_version' not in user_cols:
        op.add_column('users', sa.Column('token_version', sa.Integer(), server_default='1', nullable=True))
    if 'last_active_at' not in user_cols:
        op.add_column('users', sa.Column('last_active_at', sa.DateTime(), nullable=True))

    # 2. Create audit_logs table
    tables = inspector.get_table_names()
    if 'audit_logs' not in tables:
        op.create_table(
            'audit_logs',
            sa.Column('id', sa.String(length=36), primary_key=True),
            sa.Column('admin_id', sa.String(length=36), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
            sa.Column('admin_email', sa.String(length=255), nullable=False),
            sa.Column('action', sa.String(length=100), nullable=False),
            sa.Column('target_type', sa.String(length=50), server_default='user', nullable=True),
            sa.Column('target_id', sa.String(length=36), nullable=True),
            sa.Column('target_email', sa.String(length=255), nullable=True),
            sa.Column('details', sa.JSON(), nullable=True),
            sa.Column('ip_address', sa.String(length=100), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=True),
        )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()
    if 'audit_logs' in tables:
        op.drop_table('audit_logs')

