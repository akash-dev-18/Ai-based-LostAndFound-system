"""add notification dedupe and chat indexes

Revision ID: 8f2c1d7a6b90
Revises: 3d0acb296dc6
Create Date: 2026-10-25 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "8f2c1d7a6b90"
down_revision: str | Sequence[str] | None = "3d0acb296dc6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "notifications",
        sa.Column("dedupe_key", sa.String(length=255), nullable=True),
    )
    op.create_unique_constraint(
        op.f("uq_notifications_dedupe_key"),
        "notifications",
        ["dedupe_key"],
    )
    op.create_index(
        "ix_conversation_participants_user_id",
        "conversation_participants",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(
        "ix_conversation_participants_user_id",
        table_name="conversation_participants",
    )
    op.drop_constraint(
        op.f("uq_notifications_dedupe_key"),
        "notifications",
        type_="unique",
    )
    op.drop_column("notifications", "dedupe_key")
