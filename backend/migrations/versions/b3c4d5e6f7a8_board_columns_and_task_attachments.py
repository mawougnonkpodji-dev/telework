"""board columns and task attachments

Revision ID: b3c4d5e6f7a8
Revises: a1b2c3d4e5f6
Create Date: 2026-04-09

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text
from sqlalchemy.dialects import postgresql


revision = "b3c4d5e6f7a8"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None

taskstatus = postgresql.ENUM(
    "todo", "in_progress", "review", "done", name="taskstatus", create_type=False
)


def upgrade():
    op.create_table(
        "project_board_columns",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("color", sa.String(length=20), nullable=False),
        sa.Column("maps_to_status", taskstatus, nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "task_attachments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("task_id", sa.Integer(), nullable=False),
        sa.Column("uploaded_by_id", sa.Integer(), nullable=True),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("stored_path", sa.String(length=512), nullable=False),
        sa.Column("mime_type", sa.String(length=128), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["uploaded_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.add_column("tasks", sa.Column("column_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_tasks_board_column",
        "tasks",
        "project_board_columns",
        ["column_id"],
        ["id"],
        ondelete="SET NULL",
    )

    conn = op.get_bind()
    projects = conn.execute(text("SELECT id FROM projects")).fetchall()
    defaults = [
        ("À faire", 0, "#64748B", "todo"),
        ("En cours", 1, "#2563EB", "in_progress"),
        ("En révision", 2, "#D97706", "review"),
        ("Terminé", 3, "#16A34A", "done"),
    ]
    for (pid,) in projects:
        for title, pos, color, st in defaults:
            conn.execute(
                text(
                    """
                    INSERT INTO project_board_columns
                    (project_id, title, position, color, maps_to_status, created_at)
                    VALUES (:pid, :title, :pos, :color, CAST(:st AS taskstatus), NOW())
                    """
                ),
                {"pid": pid, "title": title, "pos": pos, "color": color, "st": st},
            )

    conn.execute(
        text(
            """
            UPDATE tasks AS t SET column_id = sub.cid
            FROM (
                SELECT t2.id AS tid,
                    (
                        SELECT c.id FROM project_board_columns c
                        WHERE c.project_id = t2.project_id
                          AND c.maps_to_status = t2.status
                        ORDER BY c.position ASC, c.id ASC
                        LIMIT 1
                    ) AS cid
                FROM tasks t2
            ) AS sub
            WHERE t.id = sub.tid AND sub.cid IS NOT NULL
            """
        )
    )


def downgrade():
    op.drop_constraint("fk_tasks_board_column", "tasks", type_="foreignkey")
    op.drop_column("tasks", "column_id")
    op.drop_table("task_attachments")
    op.drop_table("project_board_columns")
