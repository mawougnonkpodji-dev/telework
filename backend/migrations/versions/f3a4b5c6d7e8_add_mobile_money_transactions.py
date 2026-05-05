"""add mobile money transactions

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
Create Date: 2026-04-22
"""

from alembic import op
import sqlalchemy as sa


revision = "f3a4b5c6d7e8"
down_revision = "e2f3a4b5c6d7"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "mobile_money_transactions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("initiated_by_id", sa.Integer(), nullable=True),
        sa.Column("beneficiary_user_id", sa.Integer(), nullable=True),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("currency", sa.String(length=10), nullable=False),
        sa.Column("provider", sa.String(length=30), nullable=False),
        sa.Column("phone_number", sa.String(length=30), nullable=True),
        sa.Column("status", sa.Enum("pending", "success", "failed", name="mobilemoneytransactionstatus"), nullable=False),
        sa.Column("simulated_result", sa.String(length=20), nullable=False),
        sa.Column("failure_reason", sa.String(length=255), nullable=True),
        sa.Column("external_reference", sa.String(length=64), nullable=False),
        sa.Column("metadata_json", sa.Text(), nullable=True),
        sa.Column("processed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["beneficiary_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["initiated_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("external_reference"),
    )


def downgrade():
    op.drop_table("mobile_money_transactions")
    op.execute("DROP TYPE IF EXISTS mobilemoneytransactionstatus")
