"""add sync operations table

Revision ID: f7a8b9c0d1e2
Revises: e6f7a8b9c0d1
Create Date: 2026-04-13
"""

from alembic import op
import sqlalchemy as sa


revision = "f7a8b9c0d1e2"
down_revision = "e6f7a8b9c0d1"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "sync_operations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("client_operation_id", sa.String(length=64), nullable=False),
        sa.Column("resource_type", sa.String(length=40), nullable=False),
        sa.Column("resource_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("processed_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "client_operation_id", name="uq_sync_project_client_op"),
    )
    op.create_index("ix_sync_operations_project_id", "sync_operations", ["project_id"], unique=False)
    op.create_index("ix_sync_operations_status", "sync_operations", ["status"], unique=False)
    op.create_index("ix_sync_operations_created_at", "sync_operations", ["created_at"], unique=False)


def downgrade():
    op.drop_index("ix_sync_operations_created_at", table_name="sync_operations")
    op.drop_index("ix_sync_operations_status", table_name="sync_operations")
    op.drop_index("ix_sync_operations_project_id", table_name="sync_operations")
    op.drop_table("sync_operations")
