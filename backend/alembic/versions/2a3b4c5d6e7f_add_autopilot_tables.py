"""Add autopilot_configs and autopilot_logs tables

Revision ID: 2a3b4c5d6e7f
Revises: 1fe4073540b6
Create Date: 2026-10-29 14:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2a3b4c5d6e7f'
down_revision: Union[str, Sequence[str], None] = '1fe4073540b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 1. Create autopilot_configs table
    op.create_table(
        'autopilot_configs',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('brand_id', sa.String(length=36), nullable=False),
        sa.Column('enabled', sa.Boolean(), server_default='1', nullable=True),
        sa.Column('kill_switch', sa.Boolean(), server_default='0', nullable=True),
        sa.Column('mode', sa.String(length=20), server_default='approval', nullable=True),
        sa.Column('max_posts_per_day', sa.Integer(), server_default='2', nullable=True),
        sa.Column('banned_topics', sa.JSON(), nullable=True),
        sa.Column('allowed_prices_discounts', sa.JSON(), nullable=True),
        sa.Column('target_platforms', sa.JSON(), nullable=True),
        sa.Column('posting_times', sa.JSON(), nullable=True),
        sa.Column('notification_email', sa.String(length=255), nullable=True),
        sa.Column('last_run_at', sa.DateTime(), nullable=True),
        sa.Column('last_run_id', sa.String(length=36), nullable=True),
        sa.Column('last_run_summary', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['brand_id'], ['brands.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('brand_id')
    )

    # 2. Create autopilot_logs table
    op.create_table(
        'autopilot_logs',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('brand_id', sa.String(length=36), nullable=False),
        sa.Column('run_id', sa.String(length=36), nullable=False),
        sa.Column('stage', sa.String(length=50), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('decision_summary', sa.Text(), nullable=False),
        sa.Column('details_json', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['brand_id'], ['brands.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    # 3. Add columns to scheduled_posts if not exists
    try:
        op.add_column('scheduled_posts', sa.Column('autopilot_run_id', sa.String(length=36), nullable=True))
        op.add_column('scheduled_posts', sa.Column('critique_score', sa.Float(), nullable=True))
        op.add_column('scheduled_posts', sa.Column('critique_feedback', sa.JSON(), nullable=True))
    except Exception:
        pass


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('autopilot_logs')
    op.drop_table('autopilot_configs')
    try:
        op.drop_column('scheduled_posts', 'critique_feedback')
        op.drop_column('scheduled_posts', 'critique_score')
        op.drop_column('scheduled_posts', 'autopilot_run_id')
    except Exception:
        pass

