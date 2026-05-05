from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import User, Project, Task
from app.models.task import TaskStatus, TaskPriority

search_bp = Blueprint("search", __name__)


def _parse_status_filter(val):
    if not val:
        return None
    try:
        return TaskStatus(val)
    except ValueError:
        return None


def _parse_priority_filter(val):
    if not val:
        return None
    try:
        return TaskPriority(val)
    except ValueError:
        return None


# ─── RECHERCHE GLOBALE ────────────────────────────────────────────────────────
@search_bp.route("/", methods=["GET"])
@jwt_required()
def global_search():
    user_id = int(get_jwt_identity())
    query   = request.args.get("q", "").strip()

    if len(query) < 2:
        return jsonify({"error": "Requête trop courte (minimum 2 caractères)"}), 400

    search_term = f"%{query}%"

    # Recherche dans les projets dont l'utilisateur est membre
    user     = User.query.get(user_id)
    proj_ids = [p.id for p in user.projects]

    projects = Project.query.filter(
        Project.id.in_(proj_ids),
        Project.name.ilike(search_term)
    ).limit(5).all()

    # Recherche dans les tâches de ces projets
    tasks = Task.query.filter(
        Task.project_id.in_(proj_ids),
        Task.title.ilike(search_term)
    ).limit(10).all()

    # Recherche dans les membres
    members = User.query.filter(
        User.name.ilike(search_term)
    ).limit(5).all()

    return jsonify({
        "query":    query,
        "results": {
            "projects": [p.to_dict() for p in projects],
            "tasks":    [t.to_dict() for t in tasks],
            "members":  [{"id": u.id, "name": u.name, "avatar": u.avatar} for u in members]
        }
    }), 200


# ─── RECHERCHE DANS LES TÂCHES D'UN PROJET ───────────────────────────────────
@search_bp.route("/tasks", methods=["GET"])
@jwt_required()
def search_tasks():
    user_id    = int(get_jwt_identity())
    query      = request.args.get("q", "").strip()
    project_id = request.args.get("project_id", type=int)
    status     = request.args.get("status")
    priority   = request.args.get("priority")
    assignee   = request.args.get("assignee_id", type=int)

    if not project_id:
        return jsonify({"error": "project_id est requis"}), 400

    # Vérifier l'accès au projet
    user = User.query.get(user_id)
    if not any(p.id == project_id for p in user.projects):
        return jsonify({"error": "Accès refusé"}), 403

    tasks_query = Task.query.filter_by(project_id=project_id)

    if query:
        tasks_query = tasks_query.filter(
            Task.title.ilike(f"%{query}%")
        )
    st = _parse_status_filter(status)
    if st is not None:
        tasks_query = tasks_query.filter_by(status=st)
    pr = _parse_priority_filter(priority)
    if pr is not None:
        tasks_query = tasks_query.filter_by(priority=pr)
    if assignee:
        tasks_query = tasks_query.filter(
            Task.assignees.any(id=assignee)
        )

    tasks = tasks_query.order_by(Task.created_at.desc()).all()

    return jsonify({
        "tasks": [t.to_dict() for t in tasks],
        "total": len(tasks)
    }), 200