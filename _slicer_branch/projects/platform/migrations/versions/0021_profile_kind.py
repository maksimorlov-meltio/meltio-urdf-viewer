"""profile/machine kind discriminator

Revision ID: 0021_profile_kind
Revises: 0020_slice_machine_stl
Create Date: 2026-06-30
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0021_profile_kind"
down_revision = "0020_slice_machine_stl"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "profiles",
        sa.Column("kind", sa.String(), nullable=False, server_default="profile"),
    )
    op.create_index("ix_profiles_kind", "profiles", ["kind"])


def downgrade() -> None:
    op.drop_index("ix_profiles_kind", table_name="profiles")
    op.drop_column("profiles", "kind")
