"""add chat attachments and ai usage logs

Revision ID: b9c0d1e2f3a4
Revises: a8b9c0d1e2f3
Create Date: 2026-04-13
"""

from alembic import op
import sqlalchemy as sa


revision = "b9c0d1e2f3a4"
down_revision = "a8b9c0d1e2f3"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    has_projects_table = inspector.has_table("projects")
    has_users_table = inspector.has_table("users")
    has_messages_table = inspector.has_table("messages")

    op.create_table(
        "chat_attachments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("message_id", sa.Integer(), nullable=True),
        sa.Column("uploaded_by_id", sa.Integer(), nullable=True),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("stored_path", sa.String(length=512), nullable=False),
        sa.Column("mime_type", sa.String(length=128), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    if has_projects_table:
        op.create_foreign_key(
            "fk_chat_attachments_project_id",
            "chat_attachments",
            "projects",
            ["project_id"],
            ["id"],
            ondelete="CASCADE",
        )
    if has_users_table:
        op.create_foreign_key(
            "fk_chat_attachments_uploaded_by_id",
            "chat_attachments",
            "users",
            ["uploaded_by_id"],
            ["id"],
            ondelete="SET NULL",
        )
    if has_messages_table:
        op.create_foreign_key(
            "fk_chat_attachments_message_id",
            "chat_attachments",
            "messages",
            ["message_id"],
            ["id"],
            ondelete="SET NULL",
        )
    op.create_index("ix_chat_attachments_project_id", "chat_attachments", ["project_id"], unique=False)

    op.create_table(
        "ai_usage_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("endpoint", sa.String(length=80), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("response_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    if has_projects_table:
        op.create_foreign_key(
            "fk_ai_usage_logs_project_id",
            "ai_usage_logs",
            "projects",
            ["project_id"],
            ["id"],
            ondelete="CASCADE",
        )
    if has_users_table:
        op.create_foreign_key(
            "fk_ai_usage_logs_user_id",
            "ai_usage_logs",
            "users",
            ["user_id"],
            ["id"],
            ondelete="SET NULL",
        )
    op.create_index("ix_ai_usage_logs_project_id", "ai_usage_logs", ["project_id"], unique=False)
    op.create_index("ix_ai_usage_logs_user_id", "ai_usage_logs", ["user_id"], unique=False)
    op.create_index("ix_ai_usage_logs_created_at", "ai_usage_logs", ["created_at"], unique=False)


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    op.drop_index("ix_ai_usage_logs_created_at", table_name="ai_usage_logs")
    op.drop_index("ix_ai_usage_logs_user_id", table_name="ai_usage_logs")
    op.drop_index("ix_ai_usage_logs_project_id", table_name="ai_usage_logs")
    if inspector.has_table("ai_usage_logs"):
        ai_fk_names = {fk.get("name") for fk in inspector.get_foreign_keys("ai_usage_logs")}
        if "fk_ai_usage_logs_user_id" in ai_fk_names:
            op.drop_constraint("fk_ai_usage_logs_user_id", "ai_usage_logs", type_="foreignkey")
        if "fk_ai_usage_logs_project_id" in ai_fk_names:
            op.drop_constraint("fk_ai_usage_logs_project_id", "ai_usage_logs", type_="foreignkey")
    op.drop_table("ai_usage_logs")
    if inspector.has_table("chat_attachments"):
        fk_names = {fk.get("name") for fk in inspector.get_foreign_keys("chat_attachments")}
        if "fk_chat_attachments_message_id" in fk_names:
            op.drop_constraint("fk_chat_attachments_message_id", "chat_attachments", type_="foreignkey")
        if "fk_chat_attachments_uploaded_by_id" in fk_names:
            op.drop_constraint("fk_chat_attachments_uploaded_by_id", "chat_attachments", type_="foreignkey")
        if "fk_chat_attachments_project_id" in fk_names:
            op.drop_constraint("fk_chat_attachments_project_id", "chat_attachments", type_="foreignkey")
    op.drop_index("ix_chat_attachments_project_id", table_name="chat_attachments")
    op.drop_table("chat_attachments")
