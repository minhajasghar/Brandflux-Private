"""Add multibrand support and migrate existing brands

Revision ID: 4c5d6e7f8a9b
Revises: 3b4c5d6e7f8a
Create Date: 2026-10-29 16:30:00.000000

"""
from typing import Sequence, Union
import json

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4c5d6e7f8a9b'
down_revision: Union[str, Sequence[str], None] = '3b4c5d6e7f8a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    # 1. Add active_brand_id to users
    user_cols = [c['name'] for c in inspector.get_columns('users')]
    if 'active_brand_id' not in user_cols:
        op.add_column('users', sa.Column('active_brand_id', sa.String(length=36), nullable=True))

    # 2. Add columns to brands table
    brand_cols = [c['name'] for c in inspector.get_columns('brands')]
    if 'name' not in brand_cols:
        op.add_column('brands', sa.Column('name', sa.String(length=255), nullable=True))
    if 'brand_kit' not in brand_cols:
        op.add_column('brands', sa.Column('brand_kit', sa.JSON(), nullable=True))
    if 'is_active' not in brand_cols:
        op.add_column('brands', sa.Column('is_active', sa.Boolean(), server_default='1', nullable=True))

    # 3. Add brand_id to generated_posts
    post_cols = [c['name'] for c in inspector.get_columns('generated_posts')]
    if 'brand_id' not in post_cols:
        op.add_column('generated_posts', sa.Column('brand_id', sa.String(length=36), nullable=True))

    # 4. Migrate existing data
    try:
        # Migrate brands: populate name and brand_kit JSON
        brands_data = conn.execute(sa.text("""
            SELECT id, user_id, business_name, tagline, business_type, industry,
                   target_audience, products_services, brand_tone, brand_personality,
                   brand_voice, content_themes, logo_url, clean_logo_url, colors,
                   primary_color, secondary_color, logo_style, primary_font, secondary_font,
                   website_url, brand_keywords
            FROM brands
        """)).fetchall()

        for b in brands_data:
            b_id = b[0]
            b_name = b[2] or "My Brand"
            
            # Construct brand kit JSON
            brand_kit = {
                "business_name": b[2],
                "tagline": b[3],
                "business_type": b[4],
                "industry": b[5],
                "target_audience": b[6],
                "products_services": json.loads(b[7]) if b[7] and isinstance(b[7], str) else (b[7] or []),
                "brand_tone": b[8],
                "brand_personality": b[9],
                "brand_voice": b[10],
                "content_themes": json.loads(b[11]) if b[11] and isinstance(b[11], str) else (b[11] or []),
                "logo_url": b[12],
                "clean_logo_url": b[13],
                "colors": json.loads(b[14]) if b[14] and isinstance(b[14], str) else (b[14] or []),
                "primary_color": b[15] or "#1558C9",
                "secondary_color": b[16] or "#D4FF24",
                "logo_style": b[17],
                "primary_font": b[18] or "Plus Jakarta Sans",
                "secondary_font": b[19] or "Plus Jakarta Sans",
                "website_url": b[20],
                "brand_keywords": json.loads(b[21]) if b[21] and isinstance(b[21], str) else (b[21] or [])
            }

            conn.execute(
                sa.text("UPDATE brands SET name = :name, brand_kit = :kit, is_active = 1 WHERE id = :id"),
                {"name": b_name, "kit": json.dumps(brand_kit), "id": b_id}
            )

        # Set user active_brand_id to their first brand
        users = conn.execute(sa.text("SELECT id FROM users")).fetchall()
        for u in users:
            uid = u[0]
            first_brand = conn.execute(
                sa.text("SELECT id FROM brands WHERE user_id = :uid ORDER BY created_at ASC LIMIT 1"),
                {"uid": uid}
            ).fetchone()
            if first_brand:
                conn.execute(
                    sa.text("UPDATE users SET active_brand_id = :bid WHERE id = :uid"),
                    {"bid": first_brand[0], "uid": uid}
                )

        # Scope existing generated_posts to brand_id via content_ideas
        conn.execute(sa.text("""
            UPDATE generated_posts
            SET brand_id = (
                SELECT content_ideas.brand_id
                FROM content_ideas
                WHERE content_ideas.id = generated_posts.idea_id
            )
            WHERE brand_id IS NULL AND idea_id IS NOT NULL
        """))

    except Exception as e:
        print(f"[Migration Warning] Data backfill notice: {e}")


def downgrade() -> None:
    op.drop_column('generated_posts', 'brand_id')
    op.drop_column('brands', 'is_active')
    op.drop_column('brands', 'brand_kit')
    op.drop_column('brands', 'name')
    op.drop_column('users', 'active_brand_id')

