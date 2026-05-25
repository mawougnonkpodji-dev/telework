from datetime import datetime, timezone

from app.extensions import db


class AIUsageLog(db.Model):
    __tablename__ = "ai_usage_logs"

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    endpoint = db.Column(db.String(80), nullable=False)
    status = db.Column(db.String(20), nullable=False, default="success")
    error = db.Column(db.Text, nullable=True)
    response_json = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.now(timezone.utc))

    project = db.relationship("Project", backref=db.backref("ai_usage_logs", lazy="dynamic", cascade="all, delete-orphan"))
    user = db.relationship("User", backref="ai_usage_logs")
