import enum
from sqlalchemy import Enum
from app.extensions import db
from datetime import datetime, timezone


class Role(enum.Enum):
    member = "member"
    admin  = "admin"
    observateur = "observateur"

class User(db.Model):
    __tablename__ = "users"

    __table_args__ = {'extend_existing': True}

    id         = db.Column(db.Integer, primary_key=True)
    name       = db.Column(db.String(100), nullable=False)
    email      = db.Column(db.String(150), unique=True, nullable=False)
    password   = db.Column(db.String(255), nullable=False)
    avatar     = db.Column(db.String(255))
    role       = db.Column(Enum(Role), default=Role.member)
    points     = db.Column(db.Integer, default=0)
    otp_secret = db.Column(db.String(32))
    is_2fa     = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.now(timezone.utc))

    # Relations
    tasks      = db.relationship("Task", secondary="task_assignees", back_populates="assignees")

    def to_dict(self):
        return {
        "id":         self.id,
        "name":       self.name,
        "email":      self.email,
        "avatar":     self.avatar,
        "role":       self.role.value,
        "points":     self.points,
        "is_2fa":     self.is_2fa,
        "created_at": self.created_at.isoformat()
        }