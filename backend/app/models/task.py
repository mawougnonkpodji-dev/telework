import enum
from app.extensions import db
from datetime import datetime, timezone
from sqlalchemy import Enum

class TaskStatus(enum.Enum):
    assigned    = "assigned"
    in_progress = "in_progress"
    delivered   = "delivered"
    validated   = "validated"
    rejected    = "rejected"

class TaskPriority(enum.Enum):
    low    = "low"
    medium = "medium"
    high   = "high"

# Table d'association Task <---> User (assignation)
task_assignees = db.Table(
    "task_assignees",
    db.Column("user_id", db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    db.Column("task_id", db.Integer, db.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
)

class Task(db.Model):
    __tablename__ = "tasks"

    id          = db.Column(db.Integer, primary_key=True)
    project_id  = db.Column(db.Integer, db.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    title       = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    status      = db.Column(Enum(TaskStatus),    default=TaskStatus.assigned)
    priority    = db.Column(Enum(TaskPriority),  default=TaskPriority.medium)
    progress    = db.Column(db.Integer,          default=0)  # 0 à 100
    deadline    = db.Column(db.DateTime,         nullable=True)
    parent_id   = db.Column(db.Integer, db.ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True)
    sprint_id   = db.Column(db.Integer, db.ForeignKey("sprints.id", ondelete="SET NULL"), nullable=True)
    column_id   = db.Column(db.Integer, db.ForeignKey("project_board_columns.id", ondelete="SET NULL"), nullable=True)
    created_at  = db.Column(db.DateTime, default=datetime.today())
    updated_at  = db.Column(db.DateTime, default=datetime.today(), onupdate=datetime.today())

    # Relations
    assignees = db.relationship("User", secondary=task_assignees, back_populates="tasks")
    subtasks  = db.relationship("Task", backref=db.backref("parent", remote_side=[id]), lazy="dynamic")
    comments  = db.relationship("Comment", backref="task", lazy="dynamic", cascade="all, delete-orphan")
    history   = db.relationship("TaskHistory", backref="task", lazy="dynamic", cascade="all, delete-orphan")

    labels = db.relationship("Label", secondary="task_labels", back_populates="tasks")
    # Tâches dont celle-ci est le prérequis (les successeurs)
    blocks = db.relationship(
        "TaskDependency",
        foreign_keys="TaskDependency.prerequisite_task_id",
        back_populates="prerequisite",
        cascade="all, delete-orphan",
    )
    # Dépendances : cette tâche dépend de prerequisite_task_id
    depends_on_links = db.relationship(
        "TaskDependency",
        foreign_keys="TaskDependency.dependent_task_id",
        back_populates="dependent",
        cascade="all, delete-orphan",
    )
    board_column = db.relationship("ProjectBoardColumn", backref=db.backref("tasks", lazy="dynamic"))
    attachments = db.relationship(
        "TaskAttachment",
        back_populates="task",
        lazy="dynamic",
        cascade="all, delete-orphan",
    )

    def to_dict(self):
        data = {
            "id":          self.id,
            "project_id":  self.project_id,
            "title":       self.title,
            "description": self.description,
            "status":      self.status.value,
            "priority":    self.priority.value,
            "progress":    self.progress,
            "deadline":    self.deadline.isoformat() if self.deadline else None,
            "parent_id":   self.parent_id,
            "sprint_id":   self.sprint_id,
            "column_id":   self.column_id,
            "assignees":   [u.id for u in self.assignees],
            "label_ids":   [lb.id for lb in self.labels],
            "depends_on":  [d.prerequisite_task_id for d in self.depends_on_links],
            "created_at":  self.created_at.isoformat(),
            "updated_at":  self.updated_at.isoformat(),
        }
        return data


class Comment(db.Model):
    __tablename__ = "comments"

    id         = db.Column(db.Integer, primary_key=True)
    task_id    = db.Column(db.Integer, db.ForeignKey("tasks.id",  ondelete="CASCADE"), nullable=False)
    author_id  = db.Column(db.Integer, db.ForeignKey("users.id",  ondelete="CASCADE"), nullable=False)
    content    = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=datetime.now(timezone.utc), onupdate=datetime.now(timezone.utc))

    author = db.relationship("User", backref="comments")

    def to_dict(self):
        return {
            "id":          self.id,
            "task_id":     self.task_id,
            "author_id":   self.author_id,
            "author_name": self.author.name if self.author else "Inconnu",
            "content":     self.content,
            "created_at":  self.created_at.isoformat(),
            "updated_at":  self.updated_at.isoformat(),
        }


class TaskHistory(db.Model):
    """Trace chaque modification d'une tâche — utile pour l'IA et l'audit"""
    __tablename__ = "task_history"

    id         = db.Column(db.Integer, primary_key=True)
    task_id    = db.Column(db.Integer, db.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    user_id    = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    action     = db.Column(db.String(255), nullable=False)  # ex: "status changed to done"
    created_at = db.Column(db.DateTime, default=datetime.now(timezone.utc))

    user = db.relationship("User", backref="task_actions")


class TaskDependency(db.Model):
    """dependent_task_id dépend de prerequisite_task_id (le prérequis doit être terminé avant)."""

    __tablename__ = "task_dependencies"
    __table_args__ = (
        db.UniqueConstraint("dependent_task_id", "prerequisite_task_id", name="uq_task_dep_pair"),
    )

    id = db.Column(db.Integer, primary_key=True)
    dependent_task_id = db.Column(db.Integer, db.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    prerequisite_task_id = db.Column(db.Integer, db.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.now(timezone.utc))

    dependent = db.relationship(
        "Task",
        foreign_keys=[dependent_task_id],
        back_populates="depends_on_links",
    )
    prerequisite = db.relationship(
        "Task",
        foreign_keys=[prerequisite_task_id],
        back_populates="blocks",
    )

    def to_dict(self):
        return {
            "id": self.id,
            "dependent_task_id": self.dependent_task_id,
            "prerequisite_task_id": self.prerequisite_task_id,
        }