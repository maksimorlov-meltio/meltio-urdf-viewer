"""org slicer preference

Revision ID: 0006_org_slicer_pref
Revises: 0005_slice_provenance
Create Date: 2026-06-23
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0006_org_slicer_pref"
down_revision = "0005_slice_provenance"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "orgs",
        sa.Column("slicer_pref", sa.String(), nullable=False, server_default="latest"),
    )


def downgrade() -> None:
    op.drop_column("orgs", "slicer_pref")
