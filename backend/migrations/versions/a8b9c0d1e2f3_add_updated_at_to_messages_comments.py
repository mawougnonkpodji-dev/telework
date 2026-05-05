"""add updated_at to messages and comments

Revision ID: a8b9c0d1e2f3
Revises: f7a8b9c0d1e2
Create Date: 2026-04-13
"""

from alembic import op
import sqlalchemy as sa


revision = "a8b9c0d1e2f3"
down_revision = "f7a8b9c0d1e2"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("messages", sa.Column("updated_at", sa.DateTime(), nullable=True))
    op.add_column("comments", sa.Column("updated_at", sa.DateTime(), nullable=True))
    op.execute("UPDATE messages SET updated_at = created_at WHERE updated_at IS NULL")
    op.execute("UPDATE comments SET updated_at = created_at WHERE updated_at IS NULL")


def downgrade():
    op.drop_column("comments", "updated_at")
    op.drop_column("messages", "updated_at")
