"""add user position field

Revision ID: a1b2c3d4e5f7
Revises: 31c7f45b636f
Create Date: 2026-03-17 15:30:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "a1b2c3d4e5f7"
down_revision = "31c7f45b636f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user", sa.Column("position", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("user", "position")
