"""toolpath payload pointer on slice_versions

So a saved slice reloads its 3D (toolpath + sim) without re-slicing.

Revision ID: 0014_slice_toolpath
Revises: 0013_private_favorite
Create Date: 2026-06-26
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0014_slice_toolpath"
down_revision = "0013_private_favorite"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "slice_versions",
        sa.Column("toolpath_object_key", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("slice_versions", "toolpath_object_key")
