from app.extensions import db
from datetime import datetime, timezone


class ChatChannel(db.Model):
    __tablename__ = "chat_channels"

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name = db.Column(db.String(120), nullable=False)
    is_default = db.Column(db.Boolean, default=False)
    created_by_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.now(timezone.utc))

    project = db.relationship("Project", backref=db.backref("chat_channels", lazy="dynamic", cascade="all, delete-orphan"))
    created_by = db.relationship("User", backref="created_channels")

    __table_args__ = (
        db.UniqueConstraint("project_id", "name", name="uq_chat_channel_project_name"),
    )


class DirectConversation(db.Model):
    __tablename__ = "direct_conversations"

    id = db.Column(db.Integer, primary_key=True)
    user_one_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    user_two_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.now(timezone.utc))

    user_one = db.relationship("User", foreign_keys=[user_one_id], backref="direct_conversations_started")
    user_two = db.relationship("User", foreign_keys=[user_two_id], backref="direct_conversations_received")

    __table_args__ = (
        db.UniqueConstraint("user_one_id", "user_two_id", name="uq_direct_conversation_pair"),
        db.CheckConstraint("user_one_id <> user_two_id", name="ck_direct_conversation_distinct_users"),
    )


class Message(db.Model):
    __tablename__ = "messages"

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)
    channel_id = db.Column(db.Integer, db.ForeignKey("chat_channels.id", ondelete="SET NULL"), nullable=True)
    direct_conversation_id = db.Column(
        db.Integer, db.ForeignKey("direct_conversations.id", ondelete="CASCADE"), nullable=True
    )
    sender_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=datetime.now(timezone.utc), onupdate=datetime.now(timezone.utc))

    sender = db.relationship("User", backref="messages")
    channel = db.relationship("ChatChannel", backref=db.backref("messages", lazy="dynamic"))
    direct_conversation = db.relationship("DirectConversation", backref=db.backref("messages", lazy="dynamic"))

    __table_args__ = (
        db.CheckConstraint(
            "(channel_id IS NOT NULL AND direct_conversation_id IS NULL) OR "
            "(channel_id IS NULL AND direct_conversation_id IS NOT NULL) OR "
            "(channel_id IS NULL AND direct_conversation_id IS NULL AND project_id IS NOT NULL)",
            name="ck_message_scope_valid",
        ),
    )

    def __init__(self, **kw):
        super().__init__(**kw)

    def to_dict(self):
        return {
            "id": self.id,
            "project_id": self.project_id,
            "channel_id": self.channel_id,
            "direct_conversation_id": self.direct_conversation_id,
            "sender_id": self.sender_id,
            "content": self.content,
            "mentions": [
                {"id": mention.user.id, "name": mention.user.name, "avatar": mention.user.avatar}
                for mention in self.mentions
            ],
            "reactions": [
                {"emoji": reaction.emoji, "user_id": reaction.user_id}
                for reaction in self.reactions
            ],
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


class MessageMention(db.Model):
    __tablename__ = "message_mentions"

    id = db.Column(db.Integer, primary_key=True)
    message_id = db.Column(db.Integer, db.ForeignKey("messages.id", ondelete="CASCADE"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.now(timezone.utc))

    message = db.relationship("Message", backref=db.backref("mentions", lazy="dynamic", cascade="all, delete-orphan"))
    user = db.relationship("User", backref="message_mentions")

    __table_args__ = (
        db.UniqueConstraint("message_id", "user_id", name="uq_message_mention"),
    )


class MessageReaction(db.Model):
    __tablename__ = "message_reactions"

    id = db.Column(db.Integer, primary_key=True)
    message_id = db.Column(db.Integer, db.ForeignKey("messages.id", ondelete="CASCADE"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    emoji = db.Column(db.String(32), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.now(timezone.utc))

    message = db.relationship("Message", backref=db.backref("reactions", lazy="dynamic", cascade="all, delete-orphan"))
    user = db.relationship("User", backref="message_reactions")

    __table_args__ = (
        db.UniqueConstraint("message_id", "user_id", "emoji", name="uq_message_reaction"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "message_id": self.message_id,
            "user_id": self.user_id,
            "emoji": self.emoji,
            "created_at": self.created_at.isoformat(),
        }