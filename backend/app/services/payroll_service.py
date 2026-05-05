import json

from app.extensions import db
from app.models import PayrollRun, PayrollSlip, Task
from app.services.scoring_service import compute_member_scoring, month_bounds


def generate_payroll_for_project(
    project,
    generated_by_id,
    month,
    *,
    base_amount=100000.0,
    bonus_per_validated=2000.0,
    penalty_per_rejected=1000.0,
    penalty_per_overdue=1500.0,
    currency="XOF",
    notes=None,
):
    start_dt, end_dt, month_label = month_bounds(month)
    existing = PayrollRun.query.filter_by(project_id=project.id, month=month_label).first()
    if existing:
        return existing, [s.to_dict() for s in PayrollSlip.query.filter_by(payroll_run_id=existing.id).all()], True

    run = PayrollRun(
        project_id=project.id,
        month=month_label,
        currency=(currency or "XOF").strip().upper()[:10],
        generated_by_id=generated_by_id,
        notes=notes,
    )
    db.session.add(run)
    db.session.flush()

    for member in project.members:
        member_tasks = (
            Task.query.filter(
                Task.project_id == project.id,
                Task.updated_at >= start_dt,
                Task.updated_at <= end_dt,
                Task.assignees.any(id=member.id),
            ).all()
        )
        stats = compute_member_scoring(member_tasks)
        bonus = stats["validated"] * float(bonus_per_validated)
        penalty = (stats["rejected"] * float(penalty_per_rejected)) + (
            stats["overdue"] * float(penalty_per_overdue)
        )
        net = max(float(base_amount) + bonus - penalty, 0)
        details = {
            "month": month_label,
            "validated": stats["validated"],
            "rejected": stats["rejected"],
            "overdue": stats["overdue"],
            "bonus_per_validated": float(bonus_per_validated),
            "penalty_per_rejected": float(penalty_per_rejected),
            "penalty_per_overdue": float(penalty_per_overdue),
            "scoring_snapshot": {
                "punctuality": stats["punctuality"],
                "validation_rate": stats["validation_rate"],
            },
        }
        db.session.add(
            PayrollSlip(
                payroll_run_id=run.id,
                user_id=member.id,
                base_amount=float(base_amount),
                bonus_amount=bonus,
                penalty_amount=penalty,
                net_amount=net,
                details_json=json.dumps(details),
            )
        )

    db.session.commit()
    slips = PayrollSlip.query.filter_by(payroll_run_id=run.id).all()
    return run, [s.to_dict() for s in slips], False
