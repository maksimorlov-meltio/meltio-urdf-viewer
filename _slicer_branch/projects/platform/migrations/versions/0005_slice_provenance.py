"""slice provenance: slicer_version + profile_snapshot

Revision ID: 0005_slice_provenance
Revises: 0004_projects_versioning_prints
Create Date: 2026-06-23
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0005_slice_provenance"
down_revision = "0004_projects_versioning_prints"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "slice_versions",
        sa.Column("slicer_version", sa.String(), nullable=False, server_default=""),
    )
    op.add_column(
        "slice_versions", sa.Column("profile_snapshot", sa.String(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("slice_versions", "profile_snapshot")
    op.drop_column("slice_versions", "slicer_version")
