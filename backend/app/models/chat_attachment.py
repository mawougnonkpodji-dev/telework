from datetime import datetime, timezone

from app.extensions import db


class ChatAttachment(db.Model):
    __tablename__ = "chat_attachments"

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    message_id = db.Column(db.Integer, db.ForeignKey("messages.id", ondelete="SET NULL"), nullable=True)
    uploaded_by_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    original_filename = db.Column(db.String(255), nullable=False)
    stored_path = db.Column(db.String(512), nullable=False)
    mime_type = db.Column(db.String(128), nullable=True)
    size_bytes = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, default=datetime.now(timezone.utc))

    project = db.relationship("Project", backref=db.backref("chat_attachments", lazy="dynamic", cascade="all, delete-orphan"))
    message = db.relationship("Message", backref=db.backref("chat_attachments", lazy="dynamic"))
    uploader = db.relationship("User", backref="uploaded_chat_attachments")

    def to_dict(self, download_path=None):
        data = {
            "id": self.id,
            "project_id": self.project_id,
            "message_id": self.message_id,
            "uploaded_by_id": self.uploaded_by_id,
            "original_filename": self.original_filename,
            "mime_type": self.mime_type,
            "size_bytes": self.size_bytes,
            "created_at": self.created_at.isoformat(),
        }
        if download_path:
            data["download_url"] = download_path
        return data
