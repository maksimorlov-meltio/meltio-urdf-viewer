"""per-org role on memberships

Revision ID: 0011_membership_role
Revises: 0010_stl_uploader
Create Date: 2026-06-23
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0011_membership_role"
down_revision = "0010_stl_uploader"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "memberships",
        sa.Column(
            "role", sa.String(), nullable=False, server_default="org_user"
        ),
    )


def downgrade() -> None:
    op.drop_column("memberships", "role")
