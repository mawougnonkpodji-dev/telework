import json

from app.extensions import db
from app.models import PayrollRun, PayrollSlip, Task
from app.services.scoring_service import compute_member_scoring, month_bounds


def _compute_slip_for_user(
    run,
    user_id,
    project_id,
    start_dt,
    end_dt,
    month_label,
    base_amount,
    bonus_per_validated,
    penalty_per_rejected,
    penalty_per_overdue,
):
    """Compute and persist a PayrollSlip for one user inside an existing run."""
    member_tasks = (
        Task.query.filter(
            Task.project_id == project_id,
            Task.updated_at >= start_dt,
            Task.updated_at <= end_dt,
            Task.assignees.any(id=user_id),
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
    slip = PayrollSlip(
        payroll_run_id=run.id,
        user_id=user_id,
        base_amount=float(base_amount),
        bonus_amount=bonus,
        penalty_amount=penalty,
        net_amount=net,
        details_json=json.dumps(details),
    )
    db.session.add(slip)
    return slip


def get_or_create_my_slip(
    project,
    user_id,
    *,
    base_amount=100000.0,
    bonus_per_validated=2000.0,
    penalty_per_rejected=1000.0,
    penalty_per_overdue=1500.0,
    currency="XOF",
):
    """Trouvez ou créez le bulletin de paie du mois en cours pour un membre.

Fonctionne pour tous les membres du projet (et pas seulement les administrateurs).

- Si aucune période de paie n'existe pour ce mois : la période est créée, puis le bulletin correspondant est généré.

- Si une période de paie existe, mais que cet utilisateur n'a pas de bulletin : les paramètres sont déduits d'un autre bulletin existant dans cette période (afin que les montants soient cohérents avec les bulletins générés par les administrateurs), puis le bulletin est créé.

- Si le bulletin existe déjà : il est renvoyé tel quel (idempotent).

Retourne : (période de paie, bulletin, déjà_existant : booléen)
    """
    start_dt, end_dt, month_label = month_bounds(None)

    run = PayrollRun.query.filter_by(project_id=project.id, month=month_label).first()
    if not run:
        run = PayrollRun(
            project_id=project.id,
            month=month_label,
            currency=(currency or "XOF").strip().upper()[:10],
            generated_by_id=user_id,
        )
        db.session.add(run)
        db.session.flush()

    # Idempotent: return existing slip unchanged
    slip = PayrollSlip.query.filter_by(payroll_run_id=run.id, user_id=user_id).first()
    if slip:
        return run, slip, True

    # Try to infer params from another slip already in this run so amounts stay
    # consistent with what the admin may have configured.
    sample = (
        PayrollSlip.query
        .filter_by(payroll_run_id=run.id)
        .filter(PayrollSlip.user_id != user_id)
        .first()
    )
    if sample and sample.details_json:
        try:
            d = json.loads(sample.details_json)
            base_amount = float(sample.base_amount)
            bonus_per_validated = float(d.get("bonus_per_validated", bonus_per_validated))
            penalty_per_rejected = float(d.get("penalty_per_rejected", penalty_per_rejected))
            penalty_per_overdue = float(d.get("penalty_per_overdue", penalty_per_overdue))
        except Exception:
            pass

    slip = _compute_slip_for_user(
        run, user_id, project.id,
        start_dt, end_dt, month_label,
        base_amount, bonus_per_validated, penalty_per_rejected, penalty_per_overdue,
    )
    db.session.commit()
    return run, slip, False


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
        _compute_slip_for_user(
            run, member.id, project.id,
            start_dt, end_dt, month_label,
            base_amount, bonus_per_validated, penalty_per_rejected, penalty_per_overdue,
        )

    db.session.commit()
    slips = PayrollSlip.query.filter_by(payroll_run_id=run.id).all()
    return run, [s.to_dict() for s in slips], False
