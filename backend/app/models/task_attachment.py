from datetime import datetime, timezone

from app.extensions import db


class TaskAttachment(db.Model):
    __tablename__ = "task_attachments"

    __table_args__ = {'extend_existing': True}

    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    uploaded_by_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    original_filename = db.Column(db.String(255), nullable=False)
    stored_path = db.Column(db.String(512), nullable=False)
    mime_type = db.Column(db.String(128), nullable=True)
    size_bytes = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, default=datetime.now(timezone.utc))

    task = db.relationship("Task", back_populates="attachments")
    uploader = db.relationship("User", backref="uploaded_attachments")

    def to_dict(self, download_path=None):
        d = {
            "id": self.id,
            "task_id": self.task_id,
            "original_filename": self.original_filename,
            "mime_type": self.mime_type,
            "size_bytes": self.size_bytes,
            "created_at": self.created_at.isoformat(),
        }
        if download_path:
            d["download_url"] = download_path
        return d
