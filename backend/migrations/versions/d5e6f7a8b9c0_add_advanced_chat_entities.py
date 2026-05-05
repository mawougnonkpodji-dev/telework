"""add advanced chat entities

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-04-13
"""

from alembic import op
import sqlalchemy as sa


revision = "d5e6f7a8b9c0"
down_revision = "c4d5e6f7a8b9"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "chat_channels",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=True),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "name", name="uq_chat_channel_project_name"),
    )

    op.create_table(
        "direct_conversations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_one_id", sa.Integer(), nullable=False),
        sa.Column("user_two_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint("user_one_id <> user_two_id", name="ck_direct_conversation_distinct_users"),
        sa.ForeignKeyConstraint(["user_one_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_two_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_one_id", "user_two_id", name="uq_direct_conversation_pair"),
    )

    op.add_column("messages", sa.Column("channel_id", sa.Integer(), nullable=True))
    op.add_column("messages", sa.Column("direct_conversation_id", sa.Integer(), nullable=True))
    op.alter_column("messages", "project_id", existing_type=sa.INTEGER(), nullable=True)
    op.create_foreign_key(
        "fk_messages_channel_id",
        "messages",
        "chat_channels",
        ["channel_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_messages_direct_conversation_id",
        "messages",
        "direct_conversations",
        ["direct_conversation_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_check_constraint(
        "ck_message_scope_valid",
        "messages",
        "(channel_id IS NOT NULL AND direct_conversation_id IS NULL) OR "
        "(channel_id IS NULL AND direct_conversation_id IS NOT NULL) OR "
        "(channel_id IS NULL AND direct_conversation_id IS NULL AND project_id IS NOT NULL)",
    )

    op.create_table(
        "message_mentions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("message_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["message_id"], ["messages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("message_id", "user_id", name="uq_message_mention"),
    )

    op.create_table(
        "message_reactions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("message_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("emoji", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["message_id"], ["messages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("message_id", "user_id", "emoji", name="uq_message_reaction"),
    )


def downgrade():
    op.drop_table("message_reactions")
    op.drop_table("message_mentions")
    op.drop_constraint("ck_message_scope_valid", "messages", type_="check")
    op.drop_constraint("fk_messages_direct_conversation_id", "messages", type_="foreignkey")
    op.drop_constraint("fk_messages_channel_id", "messages", type_="foreignkey")
    op.alter_column("messages", "project_id", existing_type=sa.INTEGER(), nullable=False)
    op.drop_column("messages", "direct_conversation_id")
    op.drop_column("messages", "channel_id")
    op.drop_table("direct_conversations")
    op.drop_table("chat_channels")
