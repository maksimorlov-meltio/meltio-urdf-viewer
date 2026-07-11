"""memberships table (multi-org membership beyond the home org)

Revision ID: 0009_memberships
Revises: 0008_platform_settings
Create Date: 2026-06-23
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0009_memberships"
down_revision = "0008_platform_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "memberships",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False, index=True
        ),
        sa.Column(
            "org_id", sa.Uuid(), sa.ForeignKey("orgs.id"), nullable=False, index=True
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("user_id", "org_id", name="uq_membership"),
    )


def downgrade() -> None:
    op.drop_table("memberships")
