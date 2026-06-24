import csv
from datetime import date, datetime, timedelta
from io import StringIO, BytesIO

from flask import Blueprint, jsonify, make_response, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from sqlalchemy import func, case

from app.extensions import db
from app.models import Task
from app.models.task import task_assignees
from app.models.sprint import Sprint
from app.models.task import TaskStatus
from app.models.project import project_members, MemberRole
from app.utils.project_access import get_project_for_user
from app.services.scoring_service import month_bounds, compute_member_scoring, finalize_scores

reports_bp = Blueprint("reports", __name__)


def _parse_iso_date(value: str):
    if not value:
        return None
    return datetime.fromisoformat(value).date()


@reports_bp.route("/projects/<int:project_id>/dashboard", methods=["GET"])
@jwt_required()
def project_dashboard(project_id):
    user_id = int(get_jwt_identity())
    project = get_project_for_user(user_id, project_id)
    if not project:
        return jsonify({"error": "Accès refusé"}), 403

    light = request.args.get("light", "false").lower() == "true"
    member_limit = min(max(request.args.get("member_limit", 10, type=int), 1), 100)

    counts = (
        Task.query.with_entities(
            func.count(Task.id).label("total"),
            func.sum(case((Task.status == TaskStatus.validated, 1), else_=0)).label("validated"),
            func.sum(case((Task.status == TaskStatus.in_progress, 1), else_=0)).label("in_progress"),
            func.sum(case((Task.status == TaskStatus.assigned, 1), else_=0)).label("assigned"),
            func.sum(case((Task.status == TaskStatus.delivered, 1), else_=0)).label("delivered"),
            func.sum(case((Task.status == TaskStatus.rejected, 1), else_=0)).label("rejected"),
            func.sum(
                case(
                    (
                        (Task.deadline.isnot(None))
                        & (Task.deadline < datetime.combine(date.today(), datetime.min.time()))
                        & (Task.status != TaskStatus.validated),
                        1,
                    ),
                    else_=0,
                )
            ).label("overdue"),
        )
        .filter(Task.project_id == project_id)
        .first()
    )

    total = int(counts.total or 0)
    validated = int(counts.validated or 0)
    in_progress = int(counts.in_progress or 0)
    assigned = int(counts.assigned or 0)
    delivered = int(counts.delivered or 0)
    rejected = int(counts.rejected or 0)
    overdue = int(counts.overdue or 0)

    member_rows = (
        Task.query.join(task_assignees, task_assignees.c.task_id == Task.id)
        .with_entities(
            task_assignees.c.user_id.label("user_id"),
            func.count(Task.id).label("assigned_tasks"),
            func.sum(case((Task.status == TaskStatus.validated, 1), else_=0)).label("validated_tasks"),
        )
        .filter(Task.project_id == project_id)
        .group_by(task_assignees.c.user_id)
        .all()
    )
    load_by_user = {
        int(r.user_id): {
            "assigned_tasks": int(r.assigned_tasks or 0),
            "validated_tasks": int(r.validated_tasks or 0),
        }
        for r in member_rows
    }

    # Fetch roles from project_members association table
    pm_rows = db.session.execute(
        project_members.select().where(project_members.c.project_id == project_id)
    ).fetchall()
    roles_by_user = {row.user_id: row.role.value for row in pm_rows}

    member_load = []
    for m in project.members:
        stats = load_by_user.get(m.id, {"assigned_tasks": 0, "validated_tasks": 0})
        # Owner always counts as admin/gestionnaire
        role = roles_by_user.get(m.id, MemberRole.member.value)
        if m.id == project.owner_id:
            role = MemberRole.admin.value
        member_load.append(
            {
                "user_id": m.id,
                "name": m.name,
                "role": role,
                "assigned_tasks": stats["assigned_tasks"],
                "validated_tasks": stats["validated_tasks"],
            }
        )

    member_load = sorted(member_load, key=lambda x: x["assigned_tasks"], reverse=True)
    if light:
        member_load = member_load[:member_limit]

    return (
        jsonify(
            {
                "project": {"id": project.id, "name": project.name},
                "summary": {
                    "total_tasks": total,
                    "validated_tasks": validated,
                    "assigned_tasks": assigned,
                    "in_progress_tasks": in_progress,
                    "delivered_tasks": delivered,
                    "rejected_tasks": rejected,
                    "overdue_tasks": overdue,
                    "completion_percent": round((validated / total * 100) if total else 0, 1),
                },
                "member_load": member_load,
            }
        ),
        200,
    )


@reports_bp.route("/projects/<int:project_id>/burndown", methods=["GET"])
@jwt_required()
def burndown(project_id):
    user_id = int(get_jwt_identity())
    if not get_project_for_user(user_id, project_id):
        return jsonify({"error": "Accès refusé"}), 403

    sprint_id = request.args.get("sprint_id", type=int)
    sprint = Sprint.query.filter_by(id=sprint_id, project_id=project_id).first() if sprint_id else None
    if sprint_id and not sprint:
        return jsonify({"error": "Sprint introuvable pour ce projet"}), 404

    if sprint:
        start = sprint.start_date.date()
        end = sprint.end_date.date()
        tasks = Task.query.filter_by(project_id=project_id, sprint_id=sprint.id).all()
    else:
        start = _parse_iso_date(request.args.get("start_date")) or (date.today() - timedelta(days=13))
        end = _parse_iso_date(request.args.get("end_date")) or date.today()
        if end < start:
            return jsonify({"error": "end_date doit être >= start_date"}), 400
        tasks = Task.query.filter_by(project_id=project_id).all()

    days = (end - start).days + 1
    total_scope = len(tasks)
    series = []
    for i in range(days):
        day = start + timedelta(days=i)
        remaining = 0
        for t in tasks:
            if t.status == TaskStatus.validated and t.updated_at and t.updated_at.date() <= day:
                continue
            remaining += 1
        ideal = round(max(total_scope - (total_scope / max(days - 1, 1)) * i, 0), 2)
        series.append({"date": day.isoformat(), "remaining": remaining, "ideal": ideal})

    return jsonify({"scope": total_scope, "series": series}), 200


@reports_bp.route("/projects/<int:project_id>/velocity", methods=["GET"])
@jwt_required()
def velocity(project_id):
    user_id = int(get_jwt_identity())
    if not get_project_for_user(user_id, project_id):
        return jsonify({"error": "Accès refusé"}), 403

    sprints = Sprint.query.filter_by(project_id=project_id).order_by(Sprint.start_date.asc()).all()
    velocity_rows = (
        Task.query.with_entities(
            Task.sprint_id.label("sprint_id"),
            func.count(Task.id).label("planned"),
            func.sum(case((Task.status == TaskStatus.validated, 1), else_=0)).label("completed"),
        )
        .filter(Task.project_id == project_id, Task.sprint_id.isnot(None))
        .group_by(Task.sprint_id)
        .all()
    )
    by_sprint = {
        int(r.sprint_id): {
            "planned": int(r.planned or 0),
            "completed": int(r.completed or 0),
        }
        for r in velocity_rows
    }

    rows = []
    for sp in sprints:
        data = by_sprint.get(sp.id, {"planned": 0, "completed": 0})
        planned = data["planned"]
        completed = data["completed"]
        rows.append(
            {
                "sprint_id": sp.id,
                "sprint_name": sp.name,
                "start_date": sp.start_date.date().isoformat(),
                "end_date": sp.end_date.date().isoformat(),
                "planned": planned,
                "completed": completed,
                "velocity_percent": round((completed / planned * 100) if planned else 0, 1),
            }
        )
    return jsonify({"velocity": rows, "has_sprints": len(sprints) > 0}), 200


@reports_bp.route("/projects/<int:project_id>/calendar", methods=["GET"])
@jwt_required()
def calendar_view(project_id):
    user_id = int(get_jwt_identity())
    if not get_project_for_user(user_id, project_id):
        return jsonify({"error": "Accès refusé"}), 403

    start = _parse_iso_date(request.args.get("start_date")) or (date.today() - timedelta(days=30))
    end = _parse_iso_date(request.args.get("end_date")) or (date.today() + timedelta(days=30))
    if end < start:
        return jsonify({"error": "end_date doit être >= start_date"}), 400

    start_dt = datetime.combine(start, datetime.min.time())
    end_dt = datetime.combine(end, datetime.max.time())
    tasks = (
        Task.query.filter(
            Task.project_id == project_id,
            Task.deadline.isnot(None),
            Task.deadline >= start_dt,
            Task.deadline <= end_dt,
        )
        .order_by(Task.deadline.asc())
        .all()
    )
    items = [
        {
            "task_id": t.id,
            "title": t.title,
            "deadline": t.deadline.date().isoformat(),
            "status": t.status.value,
            "priority": t.priority.value,
        }
        for t in tasks
    ]
    return jsonify({"start_date": start.isoformat(), "end_date": end.isoformat(), "items": items}), 200


@reports_bp.route("/projects/<int:project_id>/export.csv", methods=["GET"])
@jwt_required()
def export_csv(project_id):
    user_id = int(get_jwt_identity())
    if not get_project_for_user(user_id, project_id):
        return jsonify({"error": "Accès refusé"}), 403
    from app.utils.project_access import get_member_role
    from app.models.project import MemberRole
    if get_member_role(user_id, project_id) == MemberRole.observateur:
        return jsonify({"error": "Les observateurs ne peuvent pas exporter les données"}), 403

    tasks = Task.query.filter_by(project_id=project_id).order_by(Task.created_at.asc()).all()
    out = StringIO()
    writer = csv.writer(out)
    writer.writerow(
        [
            "task_id",
            "title",
            "status",
            "priority",
            "progress",
            "deadline",
            "assignees",
            "created_at",
            "updated_at",
        ]
    )
    for t in tasks:
        writer.writerow(
            [
                t.id,
                t.title,
                t.status.value,
                t.priority.value,
                t.progress,
                t.deadline.isoformat() if t.deadline else "",
                ";".join(str(a.id) for a in t.assignees),
                t.created_at.isoformat() if t.created_at else "",
                t.updated_at.isoformat() if t.updated_at else "",
            ]
        )

    resp = make_response(out.getvalue())
    resp.headers["Content-Type"] = "text/csv; charset=utf-8"
    resp.headers["Content-Disposition"] = f'attachment; filename="project_{project_id}_tasks.csv"'
    return resp


@reports_bp.route("/projects/<int:project_id>/export.pdf", methods=["GET"])
@jwt_required()
def export_pdf(project_id):
    user_id = int(get_jwt_identity())
    project = get_project_for_user(user_id, project_id)
    if not project:
        return jsonify({"error": "Accès refusé"}), 403
    from app.utils.project_access import get_member_role
    from app.models.project import MemberRole
    if get_member_role(user_id, project_id) == MemberRole.observateur:
        return jsonify({"error": "Les observateurs ne peuvent pas exporter les données"}), 403

    tasks = Task.query.filter_by(project_id=project_id).order_by(Task.created_at.asc()).all()
    validated = sum(1 for t in tasks if t.status == TaskStatus.validated)
    total = len(tasks)

    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    y = height - 40

    pdf.setFont("Helvetica-Bold", 14)
    pdf.drawString(40, y, f"Rapport Projet #{project_id} - {project.name}")
    y -= 24
    pdf.setFont("Helvetica", 10)
    pdf.drawString(40, y, f"Taches totales: {total} | Validees: {validated} | Completion: {round((validated / total * 100) if total else 0, 1)}%")
    y -= 24

    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawString(40, y, "ID")
    pdf.drawString(80, y, "Titre")
    pdf.drawString(320, y, "Statut")
    pdf.drawString(390, y, "Priorite")
    pdf.drawString(460, y, "Progress")
    y -= 16
    pdf.setFont("Helvetica", 9)

    for t in tasks:
        title = (t.title or "")[:45]
        pdf.drawString(40, y, str(t.id))
        pdf.drawString(80, y, title)
        pdf.drawString(320, y, t.status.value)
        pdf.drawString(390, y, t.priority.value)
        pdf.drawString(460, y, f"{t.progress}%")
        y -= 14
        if y < 50:
            pdf.showPage()
            y = height - 40
            pdf.setFont("Helvetica", 9)

    pdf.save()
    buffer.seek(0)
    resp = make_response(buffer.getvalue())
    resp.headers["Content-Type"] = "application/pdf"
    resp.headers["Content-Disposition"] = f'attachment; filename="project_{project_id}_report.pdf"'
    return resp


@reports_bp.route("/projects/<int:project_id>/scoring/monthly", methods=["GET"])
@jwt_required()
def monthly_scoring(project_id):
    user_id = int(get_jwt_identity())
    project = get_project_for_user(user_id, project_id)
    if not project:
        return jsonify({"error": "Accès refusé"}), 403

    light = request.args.get("light", "false").lower() == "true"
    members_limit = min(max(request.args.get("members_limit", 20, type=int), 1), 200)

    month = request.args.get("month")
    start_dt, end_dt, month_label = month_bounds(month)

    rows = []
    for member in project.members:
        member_tasks = (
            Task.query.filter(
                Task.project_id == project_id,
                Task.updated_at >= start_dt,
                Task.updated_at <= end_dt,
                Task.assignees.any(id=member.id),
            )
            .order_by(Task.updated_at.asc())
            .all()
        )
        stats = compute_member_scoring(member_tasks)
        rows.append(
            {
                "user_id": member.id,
                "name": member.name,
                **stats,
            }
        )

    rows = finalize_scores(rows)
    rows = sorted(rows, key=lambda r: r["score"], reverse=True)
    if light:
        rows = rows[:members_limit]

    return (
        jsonify(
            {
                "project": {"id": project.id, "name": project.name},
                "month": month_label,
                "formula": {
                    "punctuality_weight": 0.4,
                    "validation_rate_weight": 0.4,
                    "volume_weight": 0.2,
                },
                "members": rows,
            }
        ),
        200,
    )


@reports_bp.route("/projects/<int:project_id>/hr/monthly", methods=["GET"])
@jwt_required()
def monthly_hr_dashboard(project_id):
    user_id = int(get_jwt_identity())
    project = get_project_for_user(user_id, project_id)
    if not project:
        return jsonify({"error": "Accès refusé"}), 403

    light = request.args.get("light", "false").lower() == "true"
    members_limit = min(max(request.args.get("members_limit", 20, type=int), 1), 200)

    month = request.args.get("month")
    start_dt, end_dt, month_label = month_bounds(month)

    members_data = []
    for member in project.members:
        member_tasks = (
            Task.query.filter(
                Task.project_id == project_id,
                Task.updated_at >= start_dt,
                Task.updated_at <= end_dt,
                Task.assignees.any(id=member.id),
            )
            .all()
        )
        stats = compute_member_scoring(member_tasks)
        members_data.append(
            {
                "user_id": member.id,
                "name": member.name,
                **stats,
            }
        )

    members_data = finalize_scores(members_data)
    top_member = max(members_data, key=lambda x: x["score"], default=None)

    totals = {
        "assigned": sum(m["assigned"] for m in members_data),
        "in_progress": sum(m["in_progress"] for m in members_data),
        "delivered": sum(m["delivered"] for m in members_data),
        "validated": sum(m["validated"] for m in members_data),
        "rejected": sum(m["rejected"] for m in members_data),
        "overdue": sum(m["overdue"] for m in members_data),
    }
    validation_base = totals["validated"] + totals["rejected"]
    team_validation_rate = round((totals["validated"] / validation_base * 100) if validation_base else 0, 1)
    avg_score = round(
        (sum(m["score"] for m in members_data) / len(members_data)) if members_data else 0,
        1,
    )

    members_sorted = sorted(members_data, key=lambda x: x["score"], reverse=True)
    if light:
        members_sorted = members_sorted[:members_limit]

    return (
        jsonify(
            {
                "project": {"id": project.id, "name": project.name},
                "month": month_label,
                "team_summary": {
                    **totals,
                    "team_validation_rate": team_validation_rate,
                    "average_score": avg_score,
                    "top_performer": (
                        {
                            "user_id": top_member["user_id"],
                            "name": top_member["name"],
                            "score": top_member["score"],
                        }
                        if top_member
                        else None
                    ),
                },
                "members": members_sorted,
            }
        ),
        200,
    )

