"""slice traceability: machine model + exact STL blob

Revision ID: 0020_slice_machine_stl
Revises: 0019_profile_machine
Create Date: 2026-06-30
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0020_slice_machine_stl"
down_revision = "0019_profile_machine"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "slice_versions",
        sa.Column("machine_key", sa.String(), nullable=False, server_default=""),
    )
    op.add_column(
        "slice_versions",
        sa.Column(
            "stl_file_id",
            sa.Uuid(),
            sa.ForeignKey("stl_files.id"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("slice_versions", "stl_file_id")
    op.drop_column("slice_versions", "machine_key")
