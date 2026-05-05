"""add payroll runs and slips

Revision ID: e2f3a4b5c6d7
Revises: d1f2e3a4b5c6
Create Date: 2026-04-21
"""

from alembic import op
import sqlalchemy as sa


revision = "e2f3a4b5c6d7"
down_revision = "d1f2e3a4b5c6"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "payroll_runs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("month", sa.String(length=7), nullable=False),
        sa.Column("currency", sa.String(length=10), nullable=False),
        sa.Column("status", sa.Enum("generated", "closed", name="payrollrunstatus"), nullable=False),
        sa.Column("generated_by_id", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["generated_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "month", name="uq_payroll_run_project_month"),
    )
    op.create_table(
        "payroll_slips",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("payroll_run_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("base_amount", sa.Float(), nullable=False),
        sa.Column("bonus_amount", sa.Float(), nullable=False),
        sa.Column("penalty_amount", sa.Float(), nullable=False),
        sa.Column("net_amount", sa.Float(), nullable=False),
        sa.Column("details_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["payroll_run_id"], ["payroll_runs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("payroll_run_id", "user_id", name="uq_payroll_slip_run_user"),
    )


def downgrade():
    op.drop_table("payroll_slips")
    op.drop_table("payroll_runs")
    op.execute("DROP TYPE IF EXISTS payrollrunstatus")
