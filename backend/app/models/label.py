from datetime import datetime, timezone

from app.extensions import db

task_labels = db.Table(
    "task_labels",
    db.Column("task_id", db.Integer, db.ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True),
    db.Column("label_id", db.Integer, db.ForeignKey("labels.id", ondelete="CASCADE"), primary_key=True),
)


class Label(db.Model):
    query = None
    __tablename__ = "labels"

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name = db.Column(db.String(80), nullable=False)
    color = db.Column(db.String(20), nullable=False, default="#6B7280")
    created_at = db.Column(db.DateTime, default=datetime.now(timezone.utc))

    tasks = db.relationship("Task", secondary=task_labels, back_populates="labels")

    def to_dict(self):
        return {
            "id": self.id,
            "project_id": self.project_id,
            "name": self.name,
            "color": self.color,
            "created_at": self.created_at.isoformat(),
        }
