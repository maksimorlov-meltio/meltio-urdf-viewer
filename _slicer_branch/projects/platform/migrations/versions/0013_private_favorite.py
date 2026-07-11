"""private + favorite flags on parts and projects

Revision ID: 0013_private_favorite
Revises: 0012_audit_events
Create Date: 2026-06-23
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0013_private_favorite"
down_revision = "0012_audit_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table in ("parts", "projects"):
        op.add_column(
            table,
            sa.Column("is_private", sa.Boolean(), nullable=False, server_default=sa.false()),
        )
        op.add_column(
            table,
            sa.Column("is_favorite", sa.Boolean(), nullable=False, server_default=sa.false()),
        )


def downgrade() -> None:
    for table in ("parts", "projects"):
        op.drop_column(table, "is_favorite")
        op.drop_column(table, "is_private")
