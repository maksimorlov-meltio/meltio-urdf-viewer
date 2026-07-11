"""scoped machine-profile library

Revision ID: 0017_profiles
Revises: 0016_user_stream_prefs
Create Date: 2026-06-29
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0017_profiles"
down_revision = "0016_user_stream_prefs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "profiles",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("scope", sa.String(), nullable=False, index=True),
        sa.Column(
            "org_id", sa.Uuid(), sa.ForeignKey("orgs.id"), nullable=True, index=True
        ),
        sa.Column(
            "created_by_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True
        ),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("data", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
        sa.Column("source_profile_id", sa.Uuid(), nullable=True),
        sa.Column(
            "approved_by_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True
        ),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("profiles")
