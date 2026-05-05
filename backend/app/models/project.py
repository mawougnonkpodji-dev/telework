import enum
from app.extensions import db
from datetime import datetime, timezone
from sqlalchemy import Enum

class ProjectStatus(enum.Enum):
    active   = "active"
    archived = "archived"

class MemberRole(enum.Enum):
    admin  = "admin"
    member = "member"
    observateur = "observateur"

# Table d'association Project <---> User (avec rôle dans le projet)
project_members = db.Table(
    "project_members",
    db.Column("id",         db.Integer, primary_key=True),
    db.Column("user_id",    db.Integer, db.ForeignKey("users.id",    ondelete="CASCADE"), nullable=False),
    db.Column("project_id", db.Integer, db.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
    db.Column("role",       Enum(MemberRole), default=MemberRole.member),
    db.Column("joined_at",  db.DateTime, default=datetime.now(timezone.utc))
)

class Project(db.Model):
    query = None
    __tablename__ = "projects"

    id          = db.Column(db.Integer, primary_key=True)
    name        = db.Column(db.String(150), nullable=False)
    description = db.Column(db.Text)
    owner_id    = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status      = db.Column(Enum(ProjectStatus), default=ProjectStatus.active)
    created_at  = db.Column(db.DateTime, default=datetime.now(timezone.utc))
    updated_at  = db.Column(db.DateTime, default=datetime.now(timezone.utc), onupdate=datetime.now(timezone.utc))

    # Relations
    owner    = db.relationship("User", foreign_keys=[owner_id], backref="owned_projects")
    members  = db.relationship("User", secondary=project_members, backref="projects")
    tasks    = db.relationship("Task",   backref="project", lazy="dynamic", cascade="all, delete-orphan")
    sprints  = db.relationship("Sprint", backref="project", lazy="dynamic", cascade="all, delete-orphan")
    messages = db.relationship("Message", backref="project", lazy="dynamic", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id":          self.id,
            "name":        self.name,
            "description": self.description,
            "owner_id":    self.owner_id,
            "status":      self.status.value,
            "created_at":  self.created_at.isoformat(),
            "updated_at":  self.updated_at.isoformat(),
        }