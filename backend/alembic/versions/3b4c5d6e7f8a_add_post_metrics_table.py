"""Add post_metrics table and metrics columns on scheduled_posts

Revision ID: 3b4c5d6e7f8a
Revises: 2a3b4c5d6e7f
Create Date: 2026-10-29 15:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3b4c5d6e7f8a'
down_revision: Union[str, Sequence[str], None] = '2a3b4c5d6e7f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add metrics columns to scheduled_posts if they don't exist
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_cols = [c['name'] for c in inspector.get_columns('scheduled_posts')]
    
    new_cols = [
        ('likes', sa.Integer(), sa.text('0')),
        ('comments', sa.Integer(), sa.text('0')),
        ('shares', sa.Integer(), sa.text('0')),
        ('reach', sa.Integer(), sa.text('0')),
        ('impressions', sa.Integer(), sa.text('0')),
        ('engagement_rate', sa.Float(), sa.text('0.0')),
        ('metrics_updated_at', sa.DateTime(), None),
    ]
    for col_name, col_type, default_val in new_cols:
        if col_name not in existing_cols:
            if default_val is not None:
                op.add_column('scheduled_posts', sa.Column(col_name, col_type, server_default=default_val, nullable=True))
            else:
                op.add_column('scheduled_posts', sa.Column(col_name, col_type, nullable=True))

    # 2. Create post_metrics table if not exists
    tables = inspector.get_table_names()
    if 'post_metrics' not in tables:
        op.create_table(
            'post_metrics',
            sa.Column('id', sa.String(length=36), nullable=False),
            sa.Column('post_id', sa.String(length=36), nullable=False),
            sa.Column('brand_id', sa.String(length=36), nullable=False),
            sa.Column('platform', sa.String(length=50), nullable=False),
            sa.Column('likes', sa.Integer(), server_default='0', nullable=True),
            sa.Column('comments', sa.Integer(), server_default='0', nullable=True),
            sa.Column('shares', sa.Integer(), server_default='0', nullable=True),
            sa.Column('reach', sa.Integer(), server_default='0', nullable=True),
            sa.Column('impressions', sa.Integer(), server_default='0', nullable=True),
            sa.Column('engagement_rate', sa.Float(), server_default='0.0', nullable=True),
            sa.Column('recorded_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['brand_id'], ['brands.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['post_id'], ['scheduled_posts.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id')
        )


def downgrade() -> None:
    op.drop_table('post_metrics')
    op.drop_column('scheduled_posts', 'metrics_updated_at')
    op.drop_column('scheduled_posts', 'engagement_rate')
    op.drop_column('scheduled_posts', 'impressions')
    op.drop_column('scheduled_posts', 'reach')
    op.drop_column('scheduled_posts', 'shares')
    op.drop_column('scheduled_posts', 'comments')
    op.drop_column('scheduled_posts', 'likes')

