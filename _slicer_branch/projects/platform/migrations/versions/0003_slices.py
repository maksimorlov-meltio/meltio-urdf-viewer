"""slice_versions

Revision ID: 0003_slices
Revises: 0002_parts
Create Date: 2026-06-22
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0003_slices"
down_revision = "0002_parts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "slice_versions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("part_id", sa.Uuid(), sa.ForeignKey("parts.id"), nullable=False),
        sa.Column(
            "created_by_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("profile_name", sa.String(), nullable=False),
        sa.Column("gcode_object_key", sa.String(), nullable=False),
        sa.Column("gcode_filename", sa.String(), nullable=False),
        sa.Column("layer_count", sa.Integer(), nullable=False),
        sa.Column("total_extrusion_mm", sa.Float(), nullable=False),
        sa.Column("estimated_weight_g", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_slice_versions_part_id", "slice_versions", ["part_id"])


def downgrade() -> None:
    op.drop_table("slice_versions")
