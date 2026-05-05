"""workflow roles observateur migration

Revision ID: d1f2e3a4b5c6
Revises: cc671ed40ebe
Create Date: 2026-04-21
"""

from alembic import op
import sqlalchemy as sa


revision = "d1f2e3a4b5c6"
down_revision = "cc671ed40ebe"
branch_labels = None
depends_on = None


old_task_status = sa.Enum("todo", "in_progress", "review", "done", name="taskstatus")
new_task_status = sa.Enum(
    "assigned",
    "in_progress",
    "delivered",
    "validated",
    "rejected",
    name="taskstatus",
)

old_member_role = sa.Enum("admin", "member", name="memberrole")
new_member_role = sa.Enum("admin", "member", "observateur", name="memberrole")

old_role = sa.Enum("member", "admin", name="role")
new_role = sa.Enum("member", "admin", "observateur", name="role")


def upgrade():
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "postgresql":
        op.execute("ALTER TYPE taskstatus RENAME TO taskstatus_old")
        new_task_status.create(bind, checkfirst=False)
        op.execute(
            """
            ALTER TABLE tasks
            ALTER COLUMN status TYPE taskstatus
            USING (
                CASE status::text
                    WHEN 'todo' THEN 'assigned'
                    WHEN 'review' THEN 'delivered'
                    WHEN 'done' THEN 'validated'
                    ELSE status::text
                END
            )::taskstatus
            """
        )
        op.execute(
            """
            ALTER TABLE project_board_columns
            ALTER COLUMN maps_to_status TYPE taskstatus
            USING (
                CASE maps_to_status::text
                    WHEN 'todo' THEN 'assigned'
                    WHEN 'review' THEN 'delivered'
                    WHEN 'done' THEN 'validated'
                    ELSE maps_to_status::text
                END
            )::taskstatus
            """
        )
        op.execute("DROP TYPE taskstatus_old")

        op.execute("ALTER TYPE memberrole ADD VALUE IF NOT EXISTS 'observateur'")
        op.execute("ALTER TYPE role ADD VALUE IF NOT EXISTS 'observateur'")
    else:
        op.execute("UPDATE tasks SET status = 'assigned' WHERE status = 'todo'")
        op.execute("UPDATE tasks SET status = 'delivered' WHERE status = 'review'")
        op.execute("UPDATE tasks SET status = 'validated' WHERE status = 'done'")
        with op.batch_alter_table("tasks", schema=None) as batch_op:
            batch_op.alter_column(
                "status",
                existing_type=old_task_status,
                type_=new_task_status,
                existing_nullable=True,
            )
        with op.batch_alter_table("project_members", schema=None) as batch_op:
            batch_op.alter_column(
                "role",
                existing_type=old_member_role,
                type_=new_member_role,
                existing_nullable=True,
            )
        with op.batch_alter_table("users", schema=None) as batch_op:
            batch_op.alter_column(
                "role",
                existing_type=old_role,
                type_=new_role,
                existing_nullable=True,
            )


def downgrade():
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "postgresql":
        op.execute("UPDATE users SET role = 'member' WHERE role = 'observateur'")
        op.execute("UPDATE project_members SET role = 'member' WHERE role = 'observateur'")
        op.execute("ALTER TYPE taskstatus RENAME TO taskstatus_new")
        old_task_status.create(bind, checkfirst=False)
        op.execute(
            """
            ALTER TABLE tasks
            ALTER COLUMN status TYPE taskstatus
            USING (
                CASE status::text
                    WHEN 'assigned' THEN 'todo'
                    WHEN 'delivered' THEN 'review'
                    WHEN 'validated' THEN 'done'
                    WHEN 'rejected' THEN 'in_progress'
                    ELSE status::text
                END
            )::taskstatus
            """
        )
        op.execute(
            """
            ALTER TABLE project_board_columns
            ALTER COLUMN maps_to_status TYPE taskstatus
            USING (
                CASE maps_to_status::text
                    WHEN 'assigned' THEN 'todo'
                    WHEN 'delivered' THEN 'review'
                    WHEN 'validated' THEN 'done'
                    WHEN 'rejected' THEN 'in_progress'
                    ELSE maps_to_status::text
                END
            )::taskstatus
            """
        )
        op.execute("DROP TYPE taskstatus_new")
    else:
        op.execute("UPDATE tasks SET status = 'todo' WHERE status = 'assigned'")
        op.execute("UPDATE tasks SET status = 'review' WHERE status = 'delivered'")
        op.execute("UPDATE tasks SET status = 'done' WHERE status = 'validated'")
        op.execute("UPDATE tasks SET status = 'in_progress' WHERE status = 'rejected'")
        op.execute("UPDATE users SET role = 'member' WHERE role = 'observateur'")
        op.execute("UPDATE project_members SET role = 'member' WHERE role = 'observateur'")
        with op.batch_alter_table("tasks", schema=None) as batch_op:
            batch_op.alter_column(
                "status",
                existing_type=new_task_status,
                type_=old_task_status,
                existing_nullable=True,
            )
        with op.batch_alter_table("project_members", schema=None) as batch_op:
            batch_op.alter_column(
                "role",
                existing_type=new_member_role,
                type_=old_member_role,
                existing_nullable=True,
            )
        with op.batch_alter_table("users", schema=None) as batch_op:
            batch_op.alter_column(
                "role",
                existing_type=new_role,
                type_=old_role,
                existing_nullable=True,
            )
