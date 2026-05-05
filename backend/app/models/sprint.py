from app.extensions import db
from datetime import datetime, timezone


class Sprint(db.Model):
    query = None
    __tablename__ = "sprints"

    __table_args__ = {'extend_existing': True}

    id         = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name       = db.Column(db.String(150), nullable=False)
    goal       = db.Column(db.Text)
    start_date = db.Column(db.DateTime, nullable=False)
    end_date   = db.Column(db.DateTime, nullable=False)
    ai_summary = db.Column(db.Text)   # Résumé généré par Claude
    created_at = db.Column(db.DateTime, default=datetime.now(timezone.utc))

    tasks = db.relationship("Task", backref="sprint", lazy="dynamic")

    def to_dict(self):
        return {
            "id":         self.id,
            "project_id": self.project_id,
            "name":       self.name,
            "goal":       self.goal,
            "start_date": self.start_date.isoformat(),
            "end_date":   self.end_date.isoformat(),
            "ai_summary": self.ai_summary,
        }