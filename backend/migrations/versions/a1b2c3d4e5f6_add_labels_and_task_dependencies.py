"""add labels and task dependencies

Revision ID: a1b2c3d4e5f6
Revises: f757a2f9ad2e
Create Date: 2026-04-09

"""
from alembic import op
import sqlalchemy as sa


revision = "a1b2c3d4e5f6"
down_revision = "f757a2f9ad2e"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "labels",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("color", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "task_labels",
        sa.Column("task_id", sa.Integer(), nullable=False),
        sa.Column("label_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["label_id"], ["labels.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("task_id", "label_id"),
    )
    op.create_table(
        "task_dependencies",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("dependent_task_id", sa.Integer(), nullable=False),
        sa.Column("prerequisite_task_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["dependent_task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["prerequisite_task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "dependent_task_id",
            "prerequisite_task_id",
            name="uq_task_dep_pair",
        ),
    )


def downgrade():
    op.drop_table("task_dependencies")
    op.drop_table("task_labels")
    op.drop_table("labels")
