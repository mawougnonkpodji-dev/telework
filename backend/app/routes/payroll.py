import io
import json

from flask import Blueprint, jsonify, request, make_response
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy.orm import joinedload
from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

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


# ── PDF payslip ────────────────────────────────────────────────────────────────

def _build_slip_pdf(run, slip, employee) -> bytes:
    """Generate a professional PDF payslip using reportlab."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
    )

    styles = getSampleStyleSheet()
    accent = HexColor("#0891b2")
    dark = HexColor("#0f172a")
    muted = HexColor("#64748b")

    title_style = ParagraphStyle(
        "title",
        parent=styles["Normal"],
        fontSize=22,
        textColor=colors.white,
        fontName="Helvetica-Bold",
        spaceAfter=2,
    )
    sub_style = ParagraphStyle(
        "sub",
        parent=styles["Normal"],
        fontSize=11,
        textColor=HexColor("#cbd5e1"),
        fontName="Helvetica",
    )
    label_style = ParagraphStyle(
        "label",
        parent=styles["Normal"],
        fontSize=10,
        textColor=muted,
        fontName="Helvetica",
    )
    value_style = ParagraphStyle(
        "value",
        parent=styles["Normal"],
        fontSize=10,
        textColor=dark,
        fontName="Helvetica-Bold",
    )

    details = json.loads(slip.details_json or "{}")

    story = []

    # ── Header band ────────────────────────────────────────────────────────────
    header_data = [
        [
            Paragraph("Fiche de Paie", title_style),
            Paragraph(
                f"<font color='#94a3b8'>Réf.</font> {run.id}-{slip.user_id}",
                ParagraphStyle("ref", parent=styles["Normal"], fontSize=9,
                               textColor=HexColor("#94a3b8"), fontName="Helvetica"),
            ),
        ]
    ]
    header_table = Table(header_data, colWidths=[12 * cm, 5 * cm])
    header_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), dark),
        ("TOPPADDING", (0, 0), (-1, -1), 16),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 16),
        ("LEFTPADDING", (0, 0), (0, -1), 18),
        ("RIGHTPADDING", (-1, 0), (-1, -1), 18),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (-1, 0), (-1, -1), "RIGHT"),
    ]))
    story.append(header_table)

    # Project + month band
    period_data = [
        [
            Paragraph(f"Projet : {run.project.name}", sub_style),
            Paragraph(f"Période : {run.month}", sub_style),
        ]
    ]
    period_table = Table(period_data, colWidths=[8.5 * cm, 8.5 * cm])
    period_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), accent),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (0, -1), 18),
        ("RIGHTPADDING", (-1, 0), (-1, -1), 18),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(period_table)
    story.append(Spacer(1, 0.6 * cm))

    # ── Employee info ───────────────────────────────────────────────────────────
    info_data = [
        [Paragraph("Employé", label_style), Paragraph(employee.name, value_style)],
        [Paragraph("Email", label_style), Paragraph(employee.email, value_style)],
        [Paragraph("Devise", label_style), Paragraph(run.currency, value_style)],
    ]
    info_table = Table(info_data, colWidths=[4 * cm, 13 * cm])
    info_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), HexColor("#f1f5f9")),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("GRID", (0, 0), (-1, -1), 0.5, HexColor("#e2e8f0")),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 0.6 * cm))

    # ── Pay breakdown ──────────────────────────────────────────────────────────
    story.append(
        Paragraph(
            "Détail de la Rémunération",
            ParagraphStyle("sec", parent=styles["Normal"], fontSize=12,
                           textColor=accent, fontName="Helvetica-Bold", spaceAfter=4),
        )
    )
    story.append(HRFlowable(width="100%", thickness=1, color=accent))
    story.append(Spacer(1, 0.3 * cm))

    pay_data = [
        ["Élément", "Montant"],
        ["Salaire de base", f"{slip.base_amount:,.2f} {run.currency}"],
        [f"Bonus (tâches validées: {details.get('validated', 0)})",
         f"+ {slip.bonus_amount:,.2f} {run.currency}"],
        [f"Pénalités (rejetées: {details.get('rejected', 0)}, retard: {details.get('overdue', 0)})",
         f"- {slip.penalty_amount:,.2f} {run.currency}"],
    ]
    pay_table = Table(pay_data, colWidths=[13 * cm, 4 * cm])
    pay_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), HexColor("#1e293b")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("GRID", (0, 0), (-1, -1), 0.5, HexColor("#e2e8f0")),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("BACKGROUND", (0, 1), (-1, 1), HexColor("#f8fafc")),
        ("BACKGROUND", (0, 2), (-1, 2), HexColor("#ecfdf5")),
        ("TEXTCOLOR", (0, 2), (-1, 2), HexColor("#059669")),
        ("BACKGROUND", (0, 3), (-1, 3), HexColor("#fef2f2")),
        ("TEXTCOLOR", (0, 3), (-1, 3), HexColor("#dc2626")),
    ]))
    story.append(pay_table)
    story.append(Spacer(1, 0.4 * cm))

    # ── Net total ──────────────────────────────────────────────────────────────
    net_data = [
        [
            Paragraph("NET A PAYER", ParagraphStyle(
                "netlabel", parent=styles["Normal"], fontSize=14,
                textColor=colors.white, fontName="Helvetica-Bold")),
            Paragraph(
                f"{slip.net_amount:,.2f} {run.currency}",
                ParagraphStyle("netval", parent=styles["Normal"], fontSize=16,
                               textColor=colors.white, fontName="Helvetica-Bold"),
            ),
        ]
    ]
    net_table = Table(net_data, colWidths=[10 * cm, 7 * cm])
    net_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), HexColor("#059669")),
        ("TOPPADDING", (0, 0), (-1, -1), 14),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
        ("LEFTPADDING", (0, 0), (-1, -1), 14),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("RIGHTPADDING", (1, 0), (1, 0), 14),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(net_table)
    story.append(Spacer(1, 0.6 * cm))

    # ── Performance ────────────────────────────────────────────────────────────
    story.append(
        Paragraph(
            "Indicateurs de Performance",
            ParagraphStyle("sec2", parent=styles["Normal"], fontSize=12,
                           textColor=accent, fontName="Helvetica-Bold", spaceAfter=4),
        )
    )
    story.append(HRFlowable(width="100%", thickness=1, color=accent))
    story.append(Spacer(1, 0.3 * cm))

    scoring = details.get("scoring_snapshot", {})
    perf_data = [
        ["Taux de ponctualité", f"{scoring.get('punctuality', 0):.1f}%"],
        ["Taux de validation", f"{scoring.get('validation_rate', 0):.1f}%"],
        ["Tâches validées ce mois", str(details.get("validated", 0))],
        ["Tâches rejetées ce mois", str(details.get("rejected", 0))],
        ["Tâches en retard", str(details.get("overdue", 0))],
    ]
    perf_table = Table(perf_data, colWidths=[11 * cm, 6 * cm])
    perf_table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("GRID", (0, 0), (-1, -1), 0.5, HexColor("#e2e8f0")),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("BACKGROUND", (0, 0), (-1, -1), HexColor("#f8fafc")),
        ("BACKGROUND", (0, 0), (0, -1), HexColor("#f1f5f9")),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, 0), (0, -1), dark),
    ]))
    story.append(perf_table)

    # ── Footer ─────────────────────────────────────────────────────────────────
    story.append(Spacer(1, 1 * cm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=HexColor("#e2e8f0")))
    story.append(Spacer(1, 0.3 * cm))
    story.append(
        Paragraph(
            "Document généré automatiquement par TELEWORK — usage strictement confidentiel.",
            ParagraphStyle("footer", parent=styles["Normal"], fontSize=8,
                           textColor=muted, fontName="Helvetica", alignment=1),
        )
    )

    doc.build(story)
    buf.seek(0)
    return buf.read()


@payroll_bp.route("/runs/<int:run_id>/slips/<int:user_id>/pdf", methods=["GET"])
@jwt_required()
def get_payroll_slip_pdf(run_id, user_id):
    requester_id = int(get_jwt_identity())
    run = PayrollRun.query.get_or_404(run_id)
    if not get_project_for_user(requester_id, run.project_id):
        return jsonify({"error": "Accès refusé"}), 403
    if requester_id != user_id and not can_manage_project(requester_id, run.project_id):
        return jsonify({"error": "Accès refusé"}), 403

    slip = PayrollSlip.query.filter_by(payroll_run_id=run_id, user_id=user_id).first_or_404()
    employee = slip.user

    pdf_bytes = _build_slip_pdf(run, slip, employee)
    filename = f"fiche-paie-{run.month}-{employee.name.replace(' ', '_')}.pdf"

    response = make_response(pdf_bytes, 200)
    response.headers["Content-Type"] = "application/pdf"
    response.headers["Content-Disposition"] = f'attachment; filename="{filename}"'
    log_business_event(
        user_id=requester_id,
        action="payroll_slip_pdf_downloaded",
        path=f"/api/payroll/runs/{run_id}/slips/{user_id}/pdf",
        endpoint="payroll.get_payroll_slip_pdf",
        status_code=200,
    )
    return response


# ── Auto-génération de fiche (membre / observateur) ───────────────────────────

@payroll_bp.route("/projects/<int:project_id>/my-slip", methods=["POST"])
@jwt_required()
def generate_my_slip(project_id):
    """Any project member can trigger payroll generation for the current month.

    Behaviour:
    - First call of the month: generates a PayrollRun + PayrollSlip for EVERY
      member of the project (identical to the admin flow), then returns the
      calling user's own slip.
    - Subsequent calls: the run already exists → idempotent, just returns the
      calling user's existing slip.
    - If the calling user has no slip in the run (e.g. the run was created by
      the admin before this user was added), a slip is computed on-the-fly for
      them only and appended to the existing run.
    """
    user_id = int(get_jwt_identity())
    project = get_project_for_user(user_id, project_id)
    if not project:
        return jsonify({"error": "Accès refusé ou projet introuvable"}), 403

    # generate_payroll_for_project is idempotent: returns the existing run when
    # already_existed=True, creates a new one otherwise.
    run, _slips_data, already_existed = generate_payroll_for_project(
        project,
        generated_by_id=user_id,
        month=None,  # current month
    )

    # Resolve project name BEFORE the session potentially expires
    project_name = project.name

    # Find this user's slip (might not exist if they were added after the run)
    user_slip = PayrollSlip.query.filter_by(
        payroll_run_id=run.id, user_id=user_id
    ).first()

    if user_slip is None:
        # Edge-case: user not in project.members when run was built → create
        # their slip individually with the same params as an existing slip.
        from app.services.payroll_service import get_or_create_my_slip
        run, user_slip, _ = get_or_create_my_slip(project, user_id)

    run_dict = run.to_dict()
    run_dict["project_name"] = project_name

    slip_dict = user_slip.to_dict()
    slip_dict["run"] = run_dict
    slip_dict["project_name"] = project_name

    log_business_event(
        user_id=user_id,
        action="payroll_my_slip_fetched" if already_existed else "payroll_run_generated_by_member",
        path=f"/api/payroll/projects/{project_id}/my-slip",
        endpoint="payroll.generate_my_slip",
        status_code=200 if already_existed else 201,
    )
    return jsonify({
        "slip": slip_dict,
        "run": run_dict,
        "already_existed": already_existed,
        "message": (
            "Fiche de paie déjà générée pour ce mois."
            if already_existed
            else "Paie générée pour toute l'équipe."
        ),
    }), 200 if already_existed else 201


# ── Mes fiches de paie (espace personnel) ─────────────────────────────────────

@payroll_bp.route("/my-slips", methods=["GET"])
@jwt_required()
def get_my_slips():
    """Return all payslips for the authenticated user (across all projects)."""
    user_id = int(get_jwt_identity())
    page = max(request.args.get("page", 1, type=int), 1)
    per_page = min(max(request.args.get("per_page", 50, type=int), 1), 100)

    # Eager-load payroll_run + its project in one query to avoid N+1 / DetachedInstanceError
    rows = (
        PayrollSlip.query
        .filter_by(user_id=user_id)
        .options(
            joinedload(PayrollSlip.payroll_run).joinedload(PayrollRun.project)
        )
        .order_by(PayrollSlip.created_at.desc())
        .paginate(page=page, per_page=per_page, error_out=False)
    )

    slips_data = []
    for s in rows.items:
        try:
            d = s.to_dict()
            run = s.payroll_run
            if run:
                run_dict = run.to_dict()
                d["run"] = run_dict
                d["project_name"] = run.project.name if run.project else None
            else:
                d["run"] = None
                d["project_name"] = None
            slips_data.append(d)
        except Exception as exc:
            # Ne pas bloquer toute la liste si un slip pose problème
            slips_data.append({
                "id": s.id,
                "payroll_run_id": s.payroll_run_id,
                "user_id": s.user_id,
                "base_amount": s.base_amount,
                "bonus_amount": s.bonus_amount,
                "penalty_amount": s.penalty_amount,
                "net_amount": s.net_amount,
                "details_json": s.details_json,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "run": None,
                "project_name": None,
                "_error": str(exc),
            })

    return jsonify({
        "slips": slips_data,
        "pagination": {"page": page, "per_page": per_page, "total": rows.total, "pages": rows.pages},
    }), 200
