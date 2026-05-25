import enum
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import Enum

from app.extensions import db
from app.models.project import MemberRole


class InvitationStatus(enum.Enum):
    pending   = "pending"
    accepted  = "accepted"
    expired   = "expired"
    cancelled = "cancelled"


class Invitation(db.Model):
    __tablename__ = "invitations"

    id               = db.Column(db.Integer, primary_key=True)
    token            = db.Column(db.String(64), unique=True, nullable=False, index=True)
    project_id       = db.Column(db.Integer, db.ForeignKey("projects.id",  ondelete="CASCADE"),  nullable=False)
    invited_email    = db.Column(db.String(150), nullable=False)
    role             = db.Column(Enum(MemberRole), default=MemberRole.member, nullable=False)
    invited_by_id    = db.Column(db.Integer, db.ForeignKey("users.id",     ondelete="SET NULL"), nullable=True)
    # Contract content to be auto-signed upon acceptance (stored here so no user_id needed yet)
    contract_title   = db.Column(db.String(200), nullable=True)
    contract_content = db.Column(db.Text, nullable=True)
    status           = db.Column(Enum(InvitationStatus), default=InvitationStatus.pending, nullable=False)
    expires_at       = db.Column(db.DateTime, nullable=False)
    created_at       = db.Column(db.DateTime, default=datetime.utcnow)

    project    = db.relationship("Project",  backref="invitations",       foreign_keys=[project_id])
    invited_by = db.relationship("User",     backref="sent_invitations",  foreign_keys=[invited_by_id])

    # ── helpers ────────────────────────────────────────────────────────────────
    @staticmethod
    def generate_token():
        return secrets.token_urlsafe(32)

    def is_valid(self) -> bool:
        if self.status != InvitationStatus.pending:
            return False
        return datetime.utcnow() < self.expires_at

    def to_dict(self):
        return {
            "id":            self.id,
            "token":         self.token,
            "project_id":    self.project_id,
            "invited_email": self.invited_email,
            "role":          self.role.value,
            "status":        self.status.value,
            "has_contract":  bool(self.contract_content),
            "expires_at":    self.expires_at.isoformat(),
            "created_at":    self.created_at.isoformat(),
        }
