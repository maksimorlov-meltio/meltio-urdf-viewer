"""append-only audit_events table

Revision ID: 0012_audit_events
Revises: 0011_membership_role
Create Date: 2026-06-23
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0012_audit_events"
down_revision = "0011_membership_role"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "audit_events",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
            index=True,
        ),
        sa.Column("actor_id", sa.Uuid(), nullable=True),
        sa.Column("actor_email", sa.String(), nullable=False, server_default=""),
        sa.Column("org_id", sa.Uuid(), nullable=True, index=True),
        sa.Column("action", sa.String(), nullable=False, index=True),
        sa.Column("target_type", sa.String(), nullable=False, server_default=""),
        sa.Column("target_id", sa.String(), nullable=True),
        sa.Column("detail", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("audit_events")
