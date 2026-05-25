from datetime import datetime, timezone

from app.extensions import db


class AuditEvent(db.Model):
    __tablename__ = "audit_events"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action = db.Column(db.String(100), nullable=False)
    method = db.Column(db.String(10), nullable=False)
    path = db.Column(db.String(255), nullable=False)
    endpoint = db.Column(db.String(120), nullable=True)
    status_code = db.Column(db.Integer, nullable=False)
    ip_address = db.Column(db.String(64), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.now(timezone.utc))

    user = db.relationship("User", backref="audit_events")

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "action": self.action,
            "method": self.method,
            "path": self.path,
            "endpoint": self.endpoint,
            "status_code": self.status_code,
            "ip_address": self.ip_address,
            "created_at": self.created_at.isoformat(),
        }
