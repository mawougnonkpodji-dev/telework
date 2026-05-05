import enum
from datetime import datetime, timezone

from sqlalchemy import Enum

from app.extensions import db


class PayrollRunStatus(enum.Enum):
    generated = "generated"
    closed = "closed"


class PayrollRun(db.Model):
    __tablename__ = "payroll_runs"
    __table_args__ = (
        db.UniqueConstraint("project_id", "month", name="uq_payroll_run_project_month"),
        {"extend_existing": True}
    )

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    month = db.Column(db.String(7), nullable=False)  # YYYY-MM
    currency = db.Column(db.String(10), default="XOF", nullable=False)
    status = db.Column(Enum(PayrollRunStatus), default=PayrollRunStatus.generated, nullable=False)
    generated_by_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.now(timezone.utc))

    project = db.relationship("Project", backref=db.backref("payroll_runs", lazy="dynamic", cascade="all, delete-orphan"))
    generated_by = db.relationship("User", backref="generated_payroll_runs")

    def to_dict(self):
        return {
            "id": self.id,
            "project_id": self.project_id,
            "month": self.month,
            "currency": self.currency,
            "status": self.status.value,
            "generated_by_id": self.generated_by_id,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class PayrollSlip(db.Model):
    __tablename__ = "payroll_slips"
    __table_args__ = (
        db.UniqueConstraint("payroll_run_id", "user_id", name="uq_payroll_slip_run_user"),
    )

    id = db.Column(db.Integer, primary_key=True)
    payroll_run_id = db.Column(db.Integer, db.ForeignKey("payroll_runs.id", ondelete="CASCADE"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    base_amount = db.Column(db.Float, nullable=False, default=0)
    bonus_amount = db.Column(db.Float, nullable=False, default=0)
    penalty_amount = db.Column(db.Float, nullable=False, default=0)
    net_amount = db.Column(db.Float, nullable=False, default=0)
    details_json = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.now(timezone.utc))

    payroll_run = db.relationship("PayrollRun", backref=db.backref("slips", lazy="dynamic", cascade="all, delete-orphan"))
    user = db.relationship("User", backref="payroll_slips")

    def to_dict(self):
        return {
            "id": self.id,
            "payroll_run_id": self.payroll_run_id,
            "user_id": self.user_id,
            "base_amount": self.base_amount,
            "bonus_amount": self.bonus_amount,
            "penalty_amount": self.penalty_amount,
            "net_amount": self.net_amount,
            "details_json": self.details_json,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
