"""remap roles to the capability model (member->org_user, admin->org_admin)

Revision ID: 0007_role_remap
Revises: 0006_org_slicer_pref
Create Date: 2026-06-23
"""

from __future__ import annotations

from alembic import op

revision = "0007_role_remap"
down_revision = "0006_org_slicer_pref"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE users SET role = 'org_user' WHERE role = 'member'")
    op.execute("UPDATE users SET role = 'org_admin' WHERE role = 'admin'")
    op.alter_column("users", "role", server_default="org_user")


def downgrade() -> None:
    op.execute("UPDATE users SET role = 'member' WHERE role = 'org_user'")
    op.execute("UPDATE users SET role = 'admin' WHERE role = 'org_admin'")
    op.alter_column("users", "role", server_default="member")
