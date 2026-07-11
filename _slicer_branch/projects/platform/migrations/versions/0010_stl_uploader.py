"""audit: stl_files.created_by_id (who uploaded the blob)

Revision ID: 0010_stl_uploader
Revises: 0009_memberships
Create Date: 2026-06-23
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0010_stl_uploader"
down_revision = "0009_memberships"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "stl_files",
        sa.Column("created_by_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("stl_files", "created_by_id")
