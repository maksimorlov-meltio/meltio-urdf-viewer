"""user-given name on slice_versions

Revision ID: 0015_slice_name
Revises: 0014_slice_toolpath
Create Date: 2026-06-26
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0015_slice_name"
down_revision = "0014_slice_toolpath"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "slice_versions",
        sa.Column("name", sa.String(), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_column("slice_versions", "name")
