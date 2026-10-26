"""split embedding modalities and add claim constraint

Revision ID: 3d0acb296dc6
Revises: 63268b810c94
Create Date: 2026-10-24 23:45:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "3d0acb296dc6"
down_revision: str | Sequence[str] | None = "63268b810c94"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_column("item_embeddings", "embedding")
    op.add_column(
        "item_embeddings",
        sa.Column("text_embedding", Vector(384), nullable=True),
    )
    op.add_column(
        "item_embeddings",
        sa.Column("image_embedding", Vector(512), nullable=True),
    )
    op.create_check_constraint(
        "valid_embedding_modality",
        "item_embeddings",
        "(modality = 'TEXT' AND text_embedding IS NOT NULL "
        "AND image_embedding IS NULL AND image_id IS NULL) OR "
        "(modality = 'IMAGE' AND image_embedding IS NOT NULL "
        "AND text_embedding IS NULL AND image_id IS NOT NULL)",
    )
    op.create_index(
        "uq_item_embeddings_text_item",
        "item_embeddings",
        ["item_id"],
        unique=True,
        postgresql_where=sa.text("modality = 'TEXT'"),
    )
    op.create_index(
        "uq_item_embeddings_image_image",
        "item_embeddings",
        ["image_id"],
        unique=True,
        postgresql_where=sa.text("modality = 'IMAGE'"),
    )
    op.create_index(
        "uq_claims_pending_claimant_item",
        "claims",
        ["item_id", "claimant_id"],
        unique=True,
        postgresql_where=sa.text("status = 'PENDING'"),
    )

    op.execute(
        "CREATE INDEX ix_item_embeddings_text_hnsw "
        "ON item_embeddings USING hnsw (text_embedding vector_cosine_ops) "
        "WHERE modality = 'TEXT'"
    )
    op.execute(
        "CREATE INDEX ix_item_embeddings_image_hnsw "
        "ON item_embeddings USING hnsw (image_embedding vector_cosine_ops) "
        "WHERE modality = 'IMAGE'"
    )
    op.execute(
        "CREATE INDEX ix_items_fts ON items USING gin ("
        "to_tsvector("
        "'english', "
        "coalesce(title, '') || ' ' || "
        "coalesce(description, '') || ' ' || "
        "coalesce(category, '') || ' ' || "
        "coalesce(brand, '') || ' ' || "
        "coalesce(color, '') || ' ' || "
        "coalesce(location, '')"
        ")"
        ")"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DROP INDEX IF EXISTS ix_items_fts")
    op.execute("DROP INDEX IF EXISTS ix_item_embeddings_image_hnsw")
    op.execute("DROP INDEX IF EXISTS ix_item_embeddings_text_hnsw")
    op.drop_index("uq_claims_pending_claimant_item", table_name="claims")
    op.drop_index("uq_item_embeddings_image_image", table_name="item_embeddings")
    op.drop_index("uq_item_embeddings_text_item", table_name="item_embeddings")
    op.drop_constraint(
        "valid_embedding_modality",
        "item_embeddings",
        type_="check",
    )
    op.drop_column("item_embeddings", "image_embedding")
    op.drop_column("item_embeddings", "text_embedding")
    op.add_column(
        "item_embeddings",
        sa.Column("embedding", Vector(1536), nullable=True),
    )
    op.execute("DELETE FROM item_embeddings")
    op.alter_column("item_embeddings", "embedding", nullable=False)
