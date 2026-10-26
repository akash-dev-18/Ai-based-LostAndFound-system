"""add rag document content and retrieval indexes

Revision ID: 9b7e4c2a1f60
Revises: 8f2c1d7a6b90
Create Date: 2026-10-25 15:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

from alembic import op

revision: str = "9b7e4c2a1f60"
down_revision: str | Sequence[str] | None = "8f2c1d7a6b90"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "knowledge_documents",
        sa.Column("content", sa.Text(), nullable=True),
    )
    op.execute("DELETE FROM document_chunks")
    op.execute("UPDATE knowledge_documents SET status = 'PENDING'")
    op.alter_column(
        "document_chunks",
        "embedding",
        existing_type=Vector(1536),
        type_=Vector(384),
        existing_nullable=False,
    )
    op.create_index(
        "ix_document_chunks_embedding_hnsw",
        "document_chunks",
        ["embedding"],
        unique=False,
        postgresql_using="hnsw",
        postgresql_ops={"embedding": "vector_cosine_ops"},
    )
    op.execute(
        "CREATE INDEX ix_document_chunks_fts ON document_chunks "
        "USING gin (to_tsvector('english'::regconfig, content))"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DROP INDEX IF EXISTS ix_document_chunks_fts")
    op.drop_index(
        "ix_document_chunks_embedding_hnsw",
        table_name="document_chunks",
    )
    op.execute("DELETE FROM document_chunks")
    op.execute("UPDATE knowledge_documents SET status = 'PENDING'")
    op.alter_column(
        "document_chunks",
        "embedding",
        existing_type=Vector(384),
        type_=Vector(1536),
        existing_nullable=False,
    )
    op.drop_column("knowledge_documents", "content")
