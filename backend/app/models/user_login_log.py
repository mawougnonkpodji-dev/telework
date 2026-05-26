"""
Journalise chaque connexion utilisateur pour le calcul de ponctualité.
Une ligne est insérée à chaque /login ou /verify-2fa réussi.
"""
from datetime import datetime, timezone
from app.extensions import db


class UserLoginLog(db.Model):
    __tablename__ = "user_login_logs"
    __table_args__ = (
        db.Index("ix_login_log_user_date", "user_id", "logged_in_at"),
        {'extend_existing': True},
    )

    id           = db.Column(db.Integer, primary_key=True)
    user_id      = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Toujours stocké en UTC — converti en heure locale dans le service de scoring
    logged_in_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    user = db.relationship("User", backref=db.backref("login_logs", lazy="dynamic"))

    def to_dict(self):
        return {
            "id":          self.id,
            "user_id":     self.user_id,
            "logged_in_at": self.logged_in_at.isoformat(),
        }
