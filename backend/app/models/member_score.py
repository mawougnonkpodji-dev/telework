from app.extensions import db
from datetime import datetime, timezone


class MemberScore(db.Model):
    """Scores comportementaux IA calculés par membre et par période."""
    __tablename__ = "member_scores"

    id          = db.Column(db.Integer, primary_key=True)
    project_id  = db.Column(db.Integer, db.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    user_id     = db.Column(db.Integer, db.ForeignKey("users.id",    ondelete="CASCADE"), nullable=False)
    # Période au format "YYYY-MM" (ex. "2025-12") ou "all-time"
    period      = db.Column(db.String(10), nullable=False, default="all-time")

    # Score global (0–100)
    score = db.Column(db.Float, nullable=False, default=0.0)

    # Les 6 variables comportementales (valeurs entre 0 et 1, sauf si indiqué)
    punctuality_score    = db.Column(db.Float, default=0.0)   # 15 %
    completion_rate      = db.Column(db.Float, default=0.0)   # 25 %
    rejection_rate       = db.Column(db.Float, default=0.0)   # 25 % (pénalité)
    interaction_freq     = db.Column(db.Float, default=0.0)   # 10 %
    interaction_quality  = db.Column(db.Float, default=0.0)   # 10 %
    review_participation = db.Column(db.Float, default=0.0)   # 15 %

    computed_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    # Relations
    user    = db.relationship("User",    backref=db.backref("member_scores", lazy="dynamic"))
    project = db.relationship("Project", backref=db.backref("member_scores", lazy="dynamic"))

    __table_args__ = (
        db.UniqueConstraint("project_id", "user_id", "period", name="uq_member_score_period"),
    )

    def to_dict(self):
        return {
            "id":                  self.id,
            "project_id":         self.project_id,
            "user_id":            self.user_id,
            "period":             self.period,
            "score":              round(self.score, 2),
            "punctuality_score":  round(self.punctuality_score, 3),
            "completion_rate":    round(self.completion_rate, 3),
            "rejection_rate":     round(self.rejection_rate, 3),
            "interaction_freq":   round(self.interaction_freq, 3),
            "interaction_quality": round(self.interaction_quality, 3),
            "review_participation": round(self.review_participation, 3),
            "computed_at":        self.computed_at.isoformat() if self.computed_at else None,
        }
