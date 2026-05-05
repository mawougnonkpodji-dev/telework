from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db
from app.models import Project
from app.models.sprint import Sprint
from app.models.task import Task
from datetime import datetime
from app.utils.project_access import get_project_for_user
from app.utils.project_access import can_edit_project

sprints_bp = Blueprint("sprints", __name__)


# ─── CRÉER UN SPRINT ──────────────────────────────────────────────────────────
@sprints_bp.route("/", methods=["POST"])
@jwt_required()
def create_sprint():
    user_id = int(get_jwt_identity())
    data    = request.get_json()

    required = ["project_id", "name", "start_date", "end_date"]
    for field in required:
        if not data.get(field):
            return jsonify({"error": f"'{field}' est requis"}), 400

    project = Project.query.get_or_404(data["project_id"])
    if not any(m.id == user_id for m in project.members):
        return jsonify({"error": "Accès refusé"}), 403
    if not can_edit_project(user_id, project.id):
        return jsonify({"error": "Le rôle observateur ne peut pas créer de sprint"}), 403

    sprint = Sprint(
        project_id = data["project_id"],
        name       = data["name"],
        goal       = data.get("goal", ""),
        start_date = datetime.fromisoformat(data["start_date"]),
        end_date   = datetime.fromisoformat(data["end_date"])
    )
    db.session.add(sprint)
    db.session.commit()

    return jsonify({"message": "Sprint créé", "sprint": sprint.to_dict()}), 201


# ─── LISTER LES SPRINTS D'UN PROJET ──────────────────────────────────────────
@sprints_bp.route("/project/<int:project_id>", methods=["GET"])
@jwt_required()
def get_sprints(project_id):
    user_id = int(get_jwt_identity())
    project = Project.query.get_or_404(project_id)

    if not any(m.id == user_id for m in project.members):
        return jsonify({"error": "Accès refusé"}), 403

    sprints = Sprint.query.filter_by(project_id=project_id).all()
    return jsonify({"sprints": [s.to_dict() for s in sprints]}), 200


# ─── DÉTAIL D'UN SPRINT ───────────────────────────────────────────────────────
@sprints_bp.route("/<int:sprint_id>", methods=["GET"])
@jwt_required()
def get_sprint(sprint_id):
    user_id = int(get_jwt_identity())
    sprint = Sprint.query.get_or_404(sprint_id)
    if not get_project_for_user(user_id, sprint.project_id):
        return jsonify({"error": "Accès refusé"}), 403
    if not can_edit_project(user_id, sprint.project_id):
        return jsonify({"error": "Le rôle observateur ne peut pas modifier le sprint"}), 403
    data = sprint.to_dict()

    # Tâches du sprint avec stats pour le Burndown chart
    tasks        = Task.query.filter_by(sprint_id=sprint_id).all()
    total        = len(tasks)
    validated    = sum(1 for t in tasks if t.status.value == "validated")
    delivered    = sum(1 for t in tasks if t.status.value == "delivered")
    in_progress  = sum(1 for t in tasks if t.status.value == "in_progress")

    data["tasks"] = [t.to_dict() for t in tasks]
    data["stats"] = {
        "total":       total,
        "validated":   validated,
        "delivered":   delivered,
        "in_progress": in_progress,
        "assigned":    max(total - validated - delivered - in_progress, 0),
        "completion":  round((validated / total * 100) if total > 0 else 0, 1)
    }
    return jsonify({"sprint": data}), 200


# ─── MODIFIER UN SPRINT ───────────────────────────────────────────────────────
@sprints_bp.route("/<int:sprint_id>", methods=["PUT"])
@jwt_required()
def update_sprint(sprint_id):
    user_id = int(get_jwt_identity())
    sprint = Sprint.query.get_or_404(sprint_id)
    if not get_project_for_user(user_id, sprint.project_id):
        return jsonify({"error": "Accès refusé"}), 403
    if not can_edit_project(user_id, sprint.project_id):
        return jsonify({"error": "Le rôle observateur ne peut pas supprimer le sprint"}), 403
    data = request.get_json() or {}

    if "name"       in data: sprint.name       = data["name"]
    if "goal"       in data: sprint.goal       = data["goal"]
    if "start_date" in data: sprint.start_date = datetime.fromisoformat(data["start_date"])
    if "end_date"   in data: sprint.end_date   = datetime.fromisoformat(data["end_date"])

    db.session.commit()
    return jsonify({"message": "Sprint mis à jour", "sprint": sprint.to_dict()}), 200


# ─── SUPPRIMER UN SPRINT ──────────────────────────────────────────────────────
@sprints_bp.route("/<int:sprint_id>", methods=["DELETE"])
@jwt_required()
def delete_sprint(sprint_id):
    user_id = int(get_jwt_identity())
    sprint = Sprint.query.get_or_404(sprint_id)
    if not get_project_for_user(user_id, sprint.project_id):
        return jsonify({"error": "Accès refusé"}), 403
    if not can_edit_project(user_id, sprint.project_id):
        return jsonify({"error": "Le rôle observateur ne peut pas assigner des tâches au sprint"}), 403

    # Les tâches du sprint ne sont pas supprimées, juste détachées
    Task.query.filter_by(sprint_id=sprint_id).update({"sprint_id": None})

    db.session.delete(sprint)
    db.session.commit()
    return jsonify({"message": "Sprint supprimé"}), 200


# ─── ASSIGNER DES TÂCHES À UN SPRINT ─────────────────────────────────────────
@sprints_bp.route("/<int:sprint_id>/tasks", methods=["POST"])
@jwt_required()
def assign_tasks(sprint_id):
    user_id = int(get_jwt_identity())
    sprint = Sprint.query.get_or_404(sprint_id)
    if not get_project_for_user(user_id, sprint.project_id):
        return jsonify({"error": "Accès refusé"}), 403

    data = request.get_json() or {}
    task_ids = data.get("task_ids", [])

    if not task_ids:
        return jsonify({"error": "task_ids est requis"}), 400

    pid = sprint.project_id
    tasks = Task.query.filter(Task.id.in_(task_ids)).all()
    if len(tasks) != len(task_ids):
        return jsonify({"error": "Une ou plusieurs tâches sont introuvables"}), 400
    for t in tasks:
        if t.project_id != pid:
            return jsonify({"error": "Toutes les tâches doivent appartenir au projet du sprint"}), 400

    Task.query.filter(Task.id.in_(task_ids)).update(
        {"sprint_id": sprint_id}, synchronize_session=False
    )
    db.session.commit()
    return jsonify({"message": f"{len(task_ids)} tâche(s) assignée(s) au sprint"}), 200