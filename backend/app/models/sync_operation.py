from datetime import datetime, timezone

from app.extensions import db


class SyncOperation(db.Model):
    __tablename__ = "sync_operations"

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    client_operation_id = db.Column(db.String(64), nullable=False)
    resource_type = db.Column(db.String(40), nullable=False)
    resource_id = db.Column(db.Integer, nullable=True)
    action = db.Column(db.String(20), nullable=False)
    status = db.Column(db.String(20), nullable=False, default="applied")
    error = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.now(timezone.utc))
    processed_at = db.Column(db.DateTime, default=datetime.now(timezone.utc))

    project = db.relationship("Project", backref=db.backref("sync_operations", lazy="dynamic", cascade="all, delete-orphan"))
    user = db.relationship("User", backref="sync_operations")

    __table_args__ = (
        db.UniqueConstraint("project_id", "client_operation_id", name="uq_sync_project_client_op"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "project_id": self.project_id,
            "user_id": self.user_id,
            "client_operation_id": self.client_operation_id,
            "resource_type": self.resource_type,
            "resource_id": self.resource_id,
            "action": self.action,
            "status": self.status,
            "error": self.error,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "processed_at": self.processed_at.isoformat() if self.processed_at else None,
        }
