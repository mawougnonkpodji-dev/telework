import enum
from datetime import datetime, timezone

from sqlalchemy import Enum

from app.extensions import db


class ContractStatus(enum.Enum):
    draft = "draft"
    sent = "sent"
    signed = "signed"
    rejected = "rejected"
    cancelled = "cancelled"


class Contract(db.Model):
    __tablename__ = "contracts"

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    content = db.Column(db.Text, nullable=False)
    status = db.Column(Enum(ContractStatus), nullable=False, default=ContractStatus.draft)
    created_by_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    signee_user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    signed_at = db.Column(db.DateTime, nullable=True)
    rejected_at = db.Column(db.DateTime, nullable=True)
    rejection_reason = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=datetime.now(timezone.utc), onupdate=datetime.now(timezone.utc))

    project = db.relationship("Project", backref=db.backref("contracts", lazy="dynamic", cascade="all, delete-orphan"))
    created_by = db.relationship("User", foreign_keys=[created_by_id], backref="created_contracts")
    signee = db.relationship("User", foreign_keys=[signee_user_id], backref="contracts_to_sign")

    def to_dict(self):
        return {
            "id": self.id,
            "project_id": self.project_id,
            "title": self.title,
            "content": self.content,
            "status": self.status.value,
            "created_by_id": self.created_by_id,
            "signee_user_id": self.signee_user_id,
            "signed_at": self.signed_at.isoformat() if self.signed_at else None,
            "rejected_at": self.rejected_at.isoformat() if self.rejected_at else None,
            "rejection_reason": self.rejection_reason,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
