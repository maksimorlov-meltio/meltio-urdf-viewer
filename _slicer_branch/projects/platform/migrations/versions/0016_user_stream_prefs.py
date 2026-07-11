"""per-user pixel-streaming preferences

Revision ID: 0016_user_stream_prefs
Revises: 0015_slice_name
Create Date: 2026-06-26
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0016_user_stream_prefs"
down_revision = "0015_slice_name"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("stream_always", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "users",
        sa.Column("stream_limit_desktop_mb", sa.Integer(), nullable=False, server_default="200"),
    )
    op.add_column(
        "users",
        sa.Column("stream_limit_mobile_mb", sa.Integer(), nullable=False, server_default="18"),
    )


def downgrade() -> None:
    op.drop_column("users", "stream_limit_mobile_mb")
    op.drop_column("users", "stream_limit_desktop_mb")
    op.drop_column("users", "stream_always")
