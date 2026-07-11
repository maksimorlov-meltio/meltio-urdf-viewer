"""profile version counter

Revision ID: 0018_profile_version
Revises: 0017_profiles
Create Date: 2026-06-30
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0018_profile_version"
down_revision = "0017_profiles"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "profiles",
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    )


def downgrade() -> None:
    op.drop_column("profiles", "version")
