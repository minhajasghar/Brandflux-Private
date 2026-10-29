"""Add usage table for AI image generation and model cost tracking

Revision ID: 5d6e7f8a9b0c
Revises: 4c5d6e7f8a9b
Create Date: 2026-10-29 17:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5d6e7f8a9b0c'
down_revision: Union[str, Sequence[str], None] = '4c5d6e7f8a9b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    tables = inspector.get_table_names()
    if 'usage' not in tables:
        op.create_table(
            'usage',
            sa.Column('id', sa.String(length=36), primary_key=True),
            sa.Column('user_id', sa.String(length=36), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
            sa.Column('brand_id', sa.String(length=36), sa.ForeignKey('brands.id', ondelete='SET NULL'), nullable=True),
            sa.Column('feature', sa.String(length=100), server_default='image_generation', nullable=True),
            sa.Column('model', sa.String(length=100), server_default='gemini-nano-banana-2.1', nullable=True),
            sa.Column('prompt', sa.Text(), nullable=True),
            sa.Column('aspect_ratio', sa.String(length=20), server_default='1:1', nullable=True),
            sa.Column('media_url', sa.Text(), nullable=True),
            sa.Column('cost', sa.Float(), server_default='0.03', nullable=True),
            sa.Column('credits_used', sa.Integer(), server_default='1', nullable=True),
            sa.Column('status', sa.String(length=50), server_default='success', nullable=True),
            sa.Column('error_message', sa.Text(), nullable=True),
            sa.Column('duration_ms', sa.Integer(), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=True),
        )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()
    if 'usage' in tables:
        op.drop_table('usage')

