"""projects, part.project_id, slice lifecycle + simulation, prints, user.role

Revision ID: 0004_projects_versioning_prints
Revises: 0003_slices
Create Date: 2026-06-22
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0004_projects_versioning_prints"
down_revision = "0003_slices"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Roles (existing users default to member).
    op.add_column(
        "users",
        sa.Column("role", sa.String(), nullable=False, server_default="member"),
    )

    # Projects (folders).
    op.create_table(
        "projects",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("org_id", sa.Uuid(), sa.ForeignKey("orgs.id"), nullable=False),
        sa.Column(
            "created_by_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False
        ),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_projects_org_id", "projects", ["org_id"])

    op.add_column(
        "parts",
        sa.Column("project_id", sa.Uuid(), sa.ForeignKey("projects.id"), nullable=True),
    )
    op.create_index("ix_parts_project_id", "parts", ["project_id"])

    # Slice lifecycle + simulation.
    op.add_column(
        "slice_versions",
        sa.Column(
            "is_current", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
    )
    op.add_column(
        "slice_versions",
        sa.Column("superseded_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "slice_versions",
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "slice_versions", sa.Column("sim_object_key", sa.String(), nullable=True)
    )
    op.add_column(
        "slice_versions",
        sa.Column("sim_created_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Prints.
    op.create_table(
        "print_runs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("part_id", sa.Uuid(), sa.ForeignKey("parts.id"), nullable=False),
        sa.Column(
            "slice_version_id",
            sa.Uuid(),
            sa.ForeignKey("slice_versions.id"),
            nullable=False,
        ),
        sa.Column(
            "created_by_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False
        ),
        sa.Column("label", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="recorded"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_print_runs_part_id", "print_runs", ["part_id"])
    op.create_index(
        "ix_print_runs_slice_version_id", "print_runs", ["slice_version_id"]
    )


def downgrade() -> None:
    op.drop_table("print_runs")
    op.drop_column("slice_versions", "sim_created_at")
    op.drop_column("slice_versions", "sim_object_key")
    op.drop_column("slice_versions", "expires_at")
    op.drop_column("slice_versions", "superseded_at")
    op.drop_column("slice_versions", "is_current")
    op.drop_index("ix_parts_project_id", table_name="parts")
    op.drop_column("parts", "project_id")
    op.drop_table("projects")
    op.drop_column("users", "role")
