import enum
from datetime import datetime, timezone

from sqlalchemy import Enum

from app.extensions import db


class MobileMoneyTransactionStatus(enum.Enum):
    pending = "pending"
    success = "success"
    failed = "failed"


class MobileMoneyTransaction(db.Model):
    __tablename__ = "mobile_money_transactions"

    __table_args__ = {'extend_existing': True}

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    initiated_by_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    beneficiary_user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    amount = db.Column(db.Float, nullable=False)
    currency = db.Column(db.String(10), nullable=False, default="XOF")
    provider = db.Column(db.String(30), nullable=False, default="SIMULATED_MOMO")
    phone_number = db.Column(db.String(30), nullable=True)
    status = db.Column(Enum(MobileMoneyTransactionStatus), nullable=False, default=MobileMoneyTransactionStatus.pending)
    simulated_result = db.Column(db.String(20), nullable=False, default="random")
    failure_reason = db.Column(db.String(255), nullable=True)
    external_reference = db.Column(db.String(64), nullable=False, unique=True)
    metadata_json = db.Column(db.Text, nullable=True)
    processed_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.now(timezone.utc))

    project = db.relationship(
        "Project",
        backref=db.backref("mobile_money_transactions", lazy="dynamic", cascade="all, delete-orphan"),
    )
    initiated_by = db.relationship("User", foreign_keys=[initiated_by_id], backref="initiated_mobile_money_transactions")
    beneficiary = db.relationship("User", foreign_keys=[beneficiary_user_id], backref="received_mobile_money_transactions")

    def to_dict(self):
        return {
            "id": self.id,
            "project_id": self.project_id,
            "initiated_by_id": self.initiated_by_id,
            "beneficiary_user_id": self.beneficiary_user_id,
            "amount": self.amount,
            "currency": self.currency,
            "provider": self.provider,
            "phone_number": self.phone_number,
            "status": self.status.value,
            "simulated_result": self.simulated_result,
            "failure_reason": self.failure_reason,
            "external_reference": self.external_reference,
            "metadata_json": self.metadata_json,
            "processed_at": self.processed_at.isoformat() if self.processed_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
