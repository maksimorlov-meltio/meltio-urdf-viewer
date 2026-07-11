"""profile machine model binding

Revision ID: 0019_profile_machine
Revises: 0018_profile_version
Create Date: 2026-06-30
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0019_profile_machine"
down_revision = "0018_profile_version"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "profiles",
        sa.Column("machine_key", sa.String(), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_column("profiles", "machine_key")
