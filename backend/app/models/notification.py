from datetime import datetime, timezone

from app.extensions import db
from app.models.message import _iso


class Notification(db.Model):
    __tablename__ = "notifications"

    __table_args__ = {'extend_existing': True}

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    content = db.Column(db.Text)
    type = db.Column(db.String(50))
    is_read = db.Column(db.Boolean, default=False)
    link = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, default=datetime.now(timezone.utc))

    user = db.relationship("User", backref="notifications")

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "content": self.content,
            "type": self.type,
            "is_read": self.is_read,
            "link": self.link,
            "created_at": _iso(self.created_at),
        }
