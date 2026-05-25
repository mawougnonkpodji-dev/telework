from datetime import datetime

from sqlalchemy import Enum

from app.extensions import db
from app.models.task import TaskStatus


class ProjectBoardColumn(db.Model):
    """Colonne Kanban par projet. maps_to_status aligne la tâche sur le workflow existant (filtres, IA)."""

    __tablename__ = "project_board_columns"

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    title = db.Column(db.String(120), nullable=False)
    position = db.Column(db.Integer, nullable=False, default=0)
    color = db.Column(db.String(20), nullable=False, default="#6B7280")
    maps_to_status = db.Column(Enum(TaskStatus), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.today())

    project = db.relationship("Project", backref=db.backref("board_columns", lazy="dynamic"))

    def to_dict(self):
        return {
            "id": self.id,
            "project_id": self.project_id,
            "title": self.title,
            "position": self.position,
            "color": self.color,
            "maps_to_status": self.maps_to_status.value,
        }
