import json

from flask import Blueprint, jsonify, request, make_response
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.models import PayrollRun, PayrollSlip
from app.services.audit_service import log_business_event
from app.services.payroll_service import generate_payroll_for_project
from app.utils.project_access import get_project_for_user, can_manage_project

payroll_bp = Blueprint("payroll", __name__)
MAX_AMOUNT = 100000000.0


@payroll_bp.route("/projects/<int:project_id>/runs", methods=["GET"])
@jwt_required()
def list_payroll_runs(project_id):
    user_id = int(get_jwt_identity())
    if not get_project_for_user(user_id, project_id):
        return jsonify({"error": "Accès refusé"}), 403
    if not can_manage_project(user_id, project_id):
        return jsonify({"error": "Seul un admin peut consulter les runs de paie"}), 403

    page = max(request.args.get("page", 1, type=int), 1)
    per_page = min(max(request.args.get("per_page", 50, type=int), 1), 100)
    rows = (
        PayrollRun.query.filter_by(project_id=project_id)
        .order_by(PayrollRun.month.desc())
        .paginate(page=page, per_page=per_page, error_out=False)
    )
    return jsonify(
        {
            "runs": [r.to_dict() for r in rows.items],
            "pagination": {"page": page, "per_page": per_page, "total": rows.total, "pages": rows.pages},
        }
    ), 200


@payroll_bp.route("/projects/<int:project_id>/runs/generate", methods=["POST"])
@jwt_required()
def generate_payroll_run(project_id):
    user_id = int(get_jwt_identity())
    project = get_project_for_user(user_id, project_id)
    if not project:
        return jsonify({"error": "Accès refusé"}), 403
    if not can_manage_project(user_id, project_id):
        return jsonify({"error": "Seul un admin peut générer la paie"}), 403

    data = request.get_json() or {}
    try:
        base_amount = float(data.get("base_amount", 100000))
        bonus_per_validated = float(data.get("bonus_per_validated", 2000))
        penalty_per_rejected = float(data.get("penalty_per_rejected", 1000))
        penalty_per_overdue = float(data.get("penalty_per_overdue", 1500))
    except (TypeError, ValueError):
        return jsonify({"error": "Paramètres de paie invalides"}), 400

    numeric_values = {
        "base_amount": base_amount,
        "bonus_per_validated": bonus_per_validated,
        "penalty_per_rejected": penalty_per_rejected,
        "penalty_per_overdue": penalty_per_overdue,
    }
    for key, value in numeric_values.items():
        if value < 0 or value > MAX_AMOUNT:
            return jsonify({"error": f"{key} doit être entre 0 et {MAX_AMOUNT}"}), 400

    currency = (data.get("currency") or "XOF").strip().upper()
    if len(currency) < 3 or len(currency) > 10:
        return jsonify({"error": "currency invalide"}), 400

    run, slips, already_exists = generate_payroll_for_project(
        project,
        generated_by_id=user_id,
        month=data.get("month") or request.args.get("month"),
        base_amount=base_amount,
        bonus_per_validated=bonus_per_validated,
        penalty_per_rejected=penalty_per_rejected,
        penalty_per_overdue=penalty_per_overdue,
        currency=currency,
        notes=data.get("notes"),
    )
    if already_exists:
        return jsonify({"error": "La paie de ce mois existe déjà", "run": run.to_dict()}), 409
    log_business_event(
        user_id=user_id,
        action="payroll_run_generated",
        path=f"/api/payroll/projects/{project_id}/runs/generate",
        endpoint="payroll.generate_payroll_run",
        status_code=201,
    )
    return jsonify({"message": "Paie générée", "run": run.to_dict(), "slips": slips}), 201


@payroll_bp.route("/runs/<int:run_id>", methods=["GET"])
@jwt_required()
def get_payroll_run(run_id):
    user_id = int(get_jwt_identity())
    run = PayrollRun.query.get_or_404(run_id)
    if not get_project_for_user(user_id, run.project_id):
        return jsonify({"error": "Accès refusé"}), 403
    if not can_manage_project(user_id, run.project_id):
        return jsonify({"error": "Seul un admin peut consulter ce run de paie"}), 403
    page = max(request.args.get("page", 1, type=int), 1)
    per_page = min(max(request.args.get("per_page", 50, type=int), 1), 100)
    slips = (
        PayrollSlip.query.filter_by(payroll_run_id=run.id)
        .order_by(PayrollSlip.created_at.desc())
        .paginate(page=page, per_page=per_page, error_out=False)
    )
    return jsonify(
        {
            "run": run.to_dict(),
            "slips": [s.to_dict() for s in slips.items],
            "pagination": {"page": page, "per_page": per_page, "total": slips.total, "pages": slips.pages},
        }
    ), 200


@payroll_bp.route("/runs/<int:run_id>/slips/<int:user_id>/html", methods=["GET"])
@jwt_required()
def get_payroll_slip_html(run_id, user_id):
    requester_id = int(get_jwt_identity())
    run = PayrollRun.query.get_or_404(run_id)
    if not get_project_for_user(requester_id, run.project_id):
        return jsonify({"error": "Accès refusé"}), 403
    if requester_id != user_id and not can_manage_project(requester_id, run.project_id):
        return jsonify({"error": "Accès refusé"}), 403

    slip = PayrollSlip.query.filter_by(payroll_run_id=run_id, user_id=user_id).first_or_404()
    employee = slip.user
    details = json.loads(slip.details_json or "{}")

    html = f"""
    <html>
      <head><meta charset="utf-8"><title>Fiche de paie {run.month}</title></head>
      <body style="font-family: Arial, sans-serif; margin: 24px;">
        <h2>Fiche de paie - {run.month}</h2>
        <p><strong>Projet:</strong> {run.project.name}</p>
        <p><strong>Membre:</strong> {employee.name} ({employee.email})</p>
        <hr/>
        <p>Salaire de base: {slip.base_amount:.2f} {run.currency}</p>
        <p>Bonus: {slip.bonus_amount:.2f} {run.currency}</p>
        <p>Pénalités: {slip.penalty_amount:.2f} {run.currency}</p>
        <p><strong>Net à payer: {slip.net_amount:.2f} {run.currency}</strong></p>
        <hr/>
        <h4>Détails productivité</h4>
        <p>Tâches validées: {details.get("validated", 0)}</p>
        <p>Tâches rejetées: {details.get("rejected", 0)}</p>
        <p>Tâches en retard: {details.get("overdue", 0)}</p>
      </body>
    </html>
    """
    response = make_response(html, 200)
    response.headers["Content-Type"] = "text/html; charset=utf-8"
    log_business_event(
        user_id=requester_id,
        action="payroll_slip_viewed",
        path=f"/api/payroll/runs/{run_id}/slips/{user_id}/html",
        endpoint="payroll.get_payroll_slip_html",
        status_code=200,
    )
    return response
