from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy.orm import joinedload

from app.extensions import db, socketio
from app.models import Task, Project
from app.models.project import project_members as _project_members_table, MemberRole
from app.models.board_column import ProjectBoardColumn
from app.models.label import Label
from app.models.task import task_assignees, TaskStatus, TaskPriority, TaskDependency
from app.services.board_service import (
    seed_default_board,
    column_for_status,
    resolve_column_on_create,
    resolve_column_on_update,
)
from app.services.task_service import log_history
from app.services.notification_service import send_notification
from app.services.task_dependency_service import dependency_would_cycle
from app.services.attachment_service import delete_stored_file
from app.utils.project_access import (
    task_project_member_or_403,
    get_project_for_user,
    can_edit_project,
    can_manage_project,
)
from datetime import datetime

tasks_bp = Blueprint("tasks", __name__)


def _parse_status(val):
    aliases = {
        "todo": TaskStatus.assigned,
        "review": TaskStatus.delivered,
        "done": TaskStatus.validated,
    }
    if val is None:
        return TaskStatus.assigned
    if isinstance(val, TaskStatus):
        return val
    try:
        return TaskStatus(aliases.get(val, val))
    except ValueError:
        return TaskStatus.assigned


def _parse_priority(val):
    if val is None:
        return TaskPriority.medium
    if isinstance(val, TaskPriority):
        return val
    try:
        return TaskPriority(val)
    except ValueError:
        return TaskPriority.medium


def _assignees_allowed(project, assignee_ids):
    """Vérifie que tous les assignés sont membres ET non-observateurs."""
    from app.utils.project_access import get_member_role
    from app.models.project import MemberRole
    mids = {m.id for m in project.members}
    for uid in assignee_ids:
        if uid not in mids:
            return False
        role = get_member_role(uid, project.id)
        if role == MemberRole.observateur:
            return False
    return True


def _sync_task_labels(task, label_ids):
    if label_ids is None:
        return
    ids = [int(x) for x in label_ids]
    labels = Label.query.filter(
        Label.id.in_(ids),
        Label.project_id == task.project_id,
    ).all()
    task.labels = labels


def _can_transition_status(old_status: TaskStatus, new_status: TaskStatus) -> bool:
    if old_status == new_status:
        return True
    allowed = {
        TaskStatus.assigned: {TaskStatus.in_progress},
        TaskStatus.in_progress: {TaskStatus.delivered, TaskStatus.rejected},
        TaskStatus.delivered: {TaskStatus.validated, TaskStatus.rejected, TaskStatus.in_progress},
        TaskStatus.rejected: {TaskStatus.in_progress},
        TaskStatus.validated: set(),
    }
    return new_status in allowed.get(old_status, set())


def _enforce_status_permissions(user_id: int, task, target_status: TaskStatus):
    assignee_ids = {u.id for u in task.assignees}
    is_assignee = user_id in assignee_ids
    is_admin = can_manage_project(user_id, task.project_id)

    if target_status in {TaskStatus.in_progress, TaskStatus.delivered} and not is_assignee:
        return (
            jsonify(
                {
                    "error": "Seul le membre assigné peut démarrer/exécuter/livrer cette tâche"
                }
            ),
            403,
        )

    if target_status in {TaskStatus.validated, TaskStatus.rejected} and not is_admin:
        return jsonify({"error": "Seul un admin peut valider ou rejeter une tâche"}), 403

    return None


def _task_light_dict(task):
    return {
        "id": task.id,
        "project_id": task.project_id,
        "title": task.title,
        "status": task.status.value,
        "priority": task.priority.value,
        "progress": task.progress,
        "deadline": task.deadline.isoformat() if task.deadline else None,
        "column_id": task.column_id,
        "assignees": [u.id for u in task.assignees],
        "sprint_id": task.sprint_id,
        "depends_on": [d.prerequisite_task_id for d in task.depends_on_links],
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "updated_at": task.updated_at.isoformat() if task.updated_at else None,
    }


# ─── CRÉER UNE TÂCHE ──────────────────────────────────────────────────────────
@tasks_bp.route("/", methods=["POST"])
@jwt_required()
def create_task():
    user_id = int(get_jwt_identity())
    data = request.get_json() or {}

    required = ["project_id", "title"]
    for field in required:
        if not data.get(field):
            return jsonify({"error": f"'{field}' est requis"}), 400

    project = Project.query.get_or_404(data["project_id"])
    if not get_project_for_user(user_id, project.id):
        return jsonify({"error": "Accès refusé"}), 403
    if not can_manage_project(user_id, project.id):
        return jsonify({"error": "Seul un admin peut créer une tâche"}), 403

    if data.get("parent_id"):
        parent = Task.query.get(data["parent_id"])
        if not parent or parent.project_id != project.id:
            return jsonify({"error": "parent_id invalide"}), 400

    if data.get("sprint_id"):
        from app.models.sprint import Sprint

        sp = Sprint.query.get(data["sprint_id"])
        if not sp or sp.project_id != project.id:
            return jsonify({"error": "sprint_id invalide"}), 400

    seed_default_board(project.id)

    base_status = _parse_status(data.get("status"))
    col, resolved_status = resolve_column_on_create(
        project.id, base_status, data.get("column_id")
    )

    task = Task(
        project_id=data["project_id"],
        title=data["title"],
        description=data.get("description", ""),
        status=resolved_status,
        priority=_parse_priority(data.get("priority")),
        parent_id=data.get("parent_id"),
        sprint_id=data.get("sprint_id"),
        column_id=col.id if col else None,
    )

    if data.get("deadline"):
        task.deadline = datetime.fromisoformat(data["deadline"])

    if "progress" in data:
        task.progress = data["progress"]

    db.session.add(task)
    db.session.flush()

    assignee_ids = data.get("assignees", [])
    if assignee_ids and not _assignees_allowed(project, assignee_ids):
        return jsonify({"error": "Un observateur ne peut pas se voir assigner une tâche"}), 400

    for uid in assignee_ids:
        db.session.execute(
            task_assignees.insert().values(user_id=uid, task_id=task.id)
        )

    _sync_task_labels(task, data.get("label_ids"))

    log_history(task.id, user_id, "Tâche créée")

    for uid in assignee_ids:
        send_notification(
            user_id=uid,
            title="Nouvelle tâche assignée",
            content=f"La tâche '{task.title}' vous a été assignée",
            notif_type="task_assigned",
            link=f"/projects/{task.project_id}/tasks/{task.id}",
        )

    db.session.commit()

    socketio.emit(
        "task_changed",
        {"action": "created", "task_id": task.id, "project_id": task.project_id},
        to=f"project_{task.project_id}",
    )

    return jsonify({"message": "Tâche créée", "task": task.to_dict()}), 201


# ─── TÂCHES D'UN PROJET (Kanban) ──────────────────────────────────────────────
@tasks_bp.route("/project/<int:project_id>", methods=["GET"])
@jwt_required()
def get_tasks(project_id):
    user_id = int(get_jwt_identity())
    project = Project.query.get_or_404(project_id)

    if not get_project_for_user(user_id, project.id):
        return jsonify({"error": "Accès refusé"}), 403

    seed_default_board(project_id)
    db.session.commit()

    page = max(request.args.get("page", 1, type=int), 1)
    per_page = min(max(request.args.get("per_page", 100, type=int), 1), 200)
    light = request.args.get("light", "false").lower() == "true"

    columns = (
        ProjectBoardColumn.query.filter_by(project_id=project_id)
        .order_by(ProjectBoardColumn.position, ProjectBoardColumn.id)
        .all()
    )
    tasks_page = (
        Task.query.filter_by(project_id=project_id, parent_id=None)
        .options(joinedload(Task.assignees), joinedload(Task.depends_on_links))
        .order_by(Task.updated_at.desc())
        .paginate(page=page, per_page=per_page, error_out=False)
    )
    tasks = tasks_page.items

    tasks_by_column = {str(c.id): [] for c in columns}
    for task in tasks:
        td = _task_light_dict(task) if light else task.to_dict()
        if task.column_id and str(task.column_id) in tasks_by_column:
            tasks_by_column[str(task.column_id)].append(td)
            continue
        sc = column_for_status(project_id, task.status)
        if sc and str(sc.id) in tasks_by_column:
            tasks_by_column[str(sc.id)].append(td)
        elif columns:
            tasks_by_column[str(columns[0].id)].append(td)

    kanban = {"assigned": [], "in_progress": [], "delivered": [], "validated": [], "rejected": []}
    for task in tasks:
        kanban[task.status.value].append(_task_light_dict(task) if light else task.to_dict())

    return (
        jsonify(
            {
                "board": {
                    "columns": [c.to_dict() for c in columns],
                    "tasks_by_column": tasks_by_column,
                },
                "kanban": kanban,
                "pagination": {
                    "page": page,
                    "per_page": per_page,
                    "total": tasks_page.total,
                    "pages": tasks_page.pages,
                },
            }
        ),
        200,
    )


# ─── DÉTAIL D'UNE TÂCHE ───────────────────────────────────────────────────────
@tasks_bp.route("/<int:task_id>", methods=["GET"])
@jwt_required()
def get_task(task_id):
    user_id = int(get_jwt_identity())
    task = Task.query.get_or_404(task_id)
    if not task_project_member_or_403(user_id, task):
        return jsonify({"error": "Accès refusé"}), 403

    # Matérialiser toutes les relations en une passe (lazy="dynamic" → .all())
    subtasks    = task.subtasks.all()
    comments    = task.comments.order_by("created_at").all()
    history     = task.history.order_by("created_at").all()
    attachments = task.attachments.all()

    data = task.to_dict()
    data["subtasks"]    = [t.to_dict() for t in subtasks]
    data["comments"]    = [c.to_dict() for c in comments]
    data["history"]     = [{"action": h.action, "by": h.user_id, "at": h.created_at.isoformat()} for h in history]
    base = f"/api/tasks/{task.id}/attachments"
    data["attachments"] = [a.to_dict(download_path=f"{base}/{a.id}/file") for a in attachments]
    return jsonify({"task": data}), 200


# ─── MODIFIER UNE TÂCHE ───────────────────────────────────────────────────────
@tasks_bp.route("/<int:task_id>", methods=["PUT"])
@jwt_required()
def update_task(task_id):
    user_id = int(get_jwt_identity())
    task = Task.query.get_or_404(task_id)
    if not task_project_member_or_403(user_id, task):
        return jsonify({"error": "Accès refusé"}), 403
    if not can_edit_project(user_id, task.project_id):
        return jsonify({"error": "Le rôle observateur ne peut pas modifier une tâche"}), 403

    data = request.get_json() or {}
    old_assignees = {u.id for u in task.assignees}
    is_admin = can_manage_project(user_id, task.project_id)
    _new_status_for_notif = None  # set below if a status transition actually occurs
    is_assignee = user_id in old_assignees

    if not is_admin:
        admin_only_fields = {
            "title",
            "priority",
            "assignees",
            "deadline",
            "sprint_id",
            "label_ids",
            "parent_id",
        }
        touched_admin_only = [k for k in admin_only_fields if k in data]
        if touched_admin_only:
            return (
                jsonify(
                    {
                        "error": "Seul un admin peut modifier titre/priorité/assignations/champs structurants",
                        "fields": touched_admin_only,
                    }
                ),
                403,
            )

        if ("description" in data or "progress" in data) and not is_assignee:
            return (
                jsonify(
                    {
                        "error": "Seul le membre assigné peut mettre à jour la description/progression",
                    }
                ),
                403,
            )

    if "title" in data:
        task.title = data["title"]
    if "description" in data:
        task.description = data["description"]
    if "priority" in data:
        task.priority = _parse_priority(data["priority"])
    if "progress" in data:
        task.progress = data["progress"]
    if "sprint_id" in data:
        sid = data["sprint_id"]
        if sid is None:
            task.sprint_id = None
        else:
            from app.models.sprint import Sprint

            sp = Sprint.query.get(sid)
            if not sp or sp.project_id != task.project_id:
                return jsonify({"error": "sprint_id invalide"}), 400
            task.sprint_id = sid

    if "deadline" in data:
        if data["deadline"]:
            task.deadline = datetime.fromisoformat(data["deadline"])
        else:
            task.deadline = None

    if "column_id" in data:
        old_status = task.status
        if not resolve_column_on_update(task.project_id, task, data):
            return jsonify({"error": "column_id invalide pour ce projet"}), 400
        status_perm_error = _enforce_status_permissions(user_id, task, task.status)
        if status_perm_error:
            return status_perm_error
        if not _can_transition_status(old_status, task.status):
            return (
                jsonify(
                    {
                        "error": (
                            f"Transition de statut invalide: {old_status.value} -> {task.status.value}"
                        )
                    }
                ),
                400,
            )
        log_history(task.id, user_id, "Colonne / statut (tableau) mis à jour")
        if task.status != old_status:
            _new_status_for_notif = task.status
    elif "status" in data:
        old_status = task.status
        new_status = _parse_status(data["status"])
        status_perm_error = _enforce_status_permissions(user_id, task, new_status)
        if status_perm_error:
            return status_perm_error
        if not _can_transition_status(old_status, new_status):
            return (
                jsonify(
                    {
                        "error": (
                            f"Transition de statut invalide: {old_status.value} -> {new_status.value}"
                        )
                    }
                ),
                400,
            )
        task.status = new_status
        col = column_for_status(task.project_id, task.status)
        if col:
            task.column_id = col.id
        log_history(
            task.id,
            user_id,
            f"Statut changé : {old_status.value} → {task.status.value}",
        )
        if new_status != old_status:
            _new_status_for_notif = new_status

    if "label_ids" in data:
        _sync_task_labels(task, data["label_ids"])

    if "assignees" in data:
        project = Project.query.get(task.project_id)
        new_ids = list(data["assignees"])
        if new_ids and not _assignees_allowed(project, new_ids):
            return jsonify({"error": "Un observateur ne peut pas se voir assigner une tâche"}), 400

        db.session.execute(task_assignees.delete().where(task_assignees.c.task_id == task_id))
        for uid in new_ids:
            db.session.execute(
                task_assignees.insert().values(user_id=uid, task_id=task_id)
            )
        new_set = set(new_ids)
        for uid in new_set - old_assignees:
            send_notification(
                user_id=uid,
                title="Nouvelle tâche assignée",
                content=f"La tâche « {task.title} » vous a été assignée.",
                notif_type="task_assigned",
                link=f"/projects/{task.project_id}/tasks/{task.id}",
            )

    # ── Pre-load notification data while the task object is still attached ────
    _notif_status   = _new_status_for_notif  # may be None
    _notif_title    = task.title
    _notif_proj_id  = task.project_id
    _notif_task_id  = task.id
    _notif_assignee_ids = (
        [u.id for u in task.assignees] if _notif_status else []
    )

    # Collect all manager IDs (owner + admin members) for task_delivered
    _notif_manager_ids: set[int] = set()
    if _notif_status == TaskStatus.delivered:
        _proj = Project.query.get(_notif_proj_id)
        if _proj and _proj.owner_id:
            _notif_manager_ids.add(int(_proj.owner_id))
        admin_rows = db.session.execute(
            _project_members_table.select().where(
                _project_members_table.c.project_id == _notif_proj_id,
                _project_members_table.c.role == MemberRole.admin,
            )
        ).fetchall()
        for _row in admin_rows:
            _notif_manager_ids.add(int(_row.user_id))

    db.session.commit()

    socketio.emit(
        "task_changed",
        {"action": "updated", "task_id": _notif_task_id, "project_id": _notif_proj_id},
        to=f"project_{_notif_proj_id}",
    )

    # ── Post-commit status-change notifications ───────────────────────────────
    if _notif_status == TaskStatus.validated:
        for uid in _notif_assignee_ids:
            if uid != user_id:
                send_notification(
                    user_id=uid,
                    title="Tâche validée ✓",
                    content=f"La tâche « {_notif_title} » a été validée.",
                    notif_type="task_validated",
                    link=f"/projects/{_notif_proj_id}/tasks/{_notif_task_id}",
                )
    elif _notif_status == TaskStatus.rejected:
        for uid in _notif_assignee_ids:
            if uid != user_id:
                send_notification(
                    user_id=uid,
                    title="Tâche rejetée",
                    content=f"La tâche « {_notif_title} » a été rejetée. Vérifiez les commentaires.",
                    notif_type="task_rejected",
                    link=f"/projects/{_notif_proj_id}/tasks/{_notif_task_id}",
                )
    elif _notif_status == TaskStatus.delivered:
        for _mgr_id in _notif_manager_ids:
            if _mgr_id != user_id:
                send_notification(
                    user_id=_mgr_id,
                    title="Livraison à réviser 📦",
                    content=f"La tâche « {_notif_title} » a été livrée et attend votre révision.",
                    notif_type="task_delivered",
                    link=f"/projects/{_notif_proj_id}/tasks/{_notif_task_id}",
                )

    return jsonify({"message": "Tâche mise à jour", "task": task.to_dict()}), 200


# ─── SUPPRIMER UNE TÂCHE ──────────────────────────────────────────────────────
@tasks_bp.route("/<int:task_id>", methods=["DELETE"])
@jwt_required()
def delete_task(task_id):
    from flask import current_app
    import os

    user_id = int(get_jwt_identity())
    task = Task.query.get_or_404(task_id)
    if not task_project_member_or_403(user_id, task):
        return jsonify({"error": "Accès refusé"}), 403
    if not can_edit_project(user_id, task.project_id):
        return jsonify({"error": "Le rôle observateur ne peut pas supprimer une tâche"}), 403

    _del_proj_id = task.project_id
    _del_task_id = task.id

    root = os.path.abspath(current_app.config["UPLOAD_FOLDER"])
    for att in list(task.attachments):
        delete_stored_file(root, att.stored_path)

    db.session.delete(task)
    db.session.commit()

    socketio.emit(
        "task_changed",
        {"action": "deleted", "task_id": _del_task_id, "project_id": _del_proj_id},
        to=f"project_{_del_proj_id}",
    )

    return jsonify({"message": "Tâche supprimée"}), 200


# ─── DÉPENDANCES ──────────────────────────────────────────────────────────────
@tasks_bp.route("/<int:task_id>/dependencies", methods=["GET"])
@jwt_required()
def list_dependencies(task_id):
    user_id = int(get_jwt_identity())
    task = Task.query.get_or_404(task_id)
    if not task_project_member_or_403(user_id, task):
        return jsonify({"error": "Accès refusé"}), 403

    rows = TaskDependency.query.filter_by(dependent_task_id=task_id).all()
    return jsonify({"dependencies": [r.to_dict() for r in rows]}), 200


@tasks_bp.route("/<int:task_id>/dependencies", methods=["POST"])
@jwt_required()
def add_dependency(task_id):
    user_id = int(get_jwt_identity())
    task = Task.query.get_or_404(task_id)
    if not task_project_member_or_403(user_id, task):
        return jsonify({"error": "Accès refusé"}), 403
    if not can_edit_project(user_id, task.project_id):
        return jsonify({"error": "Le rôle observateur ne peut pas modifier les dépendances"}), 403

    data = request.get_json() or {}
    prereq_id = data.get("prerequisite_task_id")
    if prereq_id is None:
        return jsonify({"error": "prerequisite_task_id est requis"}), 400

    prereq = Task.query.get_or_404(prereq_id)
    if prereq.project_id != task.project_id:
        return jsonify({"error": "Les tâches doivent appartenir au même projet"}), 400

    if dependency_would_cycle(task_id, prereq_id):
        return jsonify({"error": "Cette dépendance créerait un cycle"}), 400

    exists = TaskDependency.query.filter_by(
        dependent_task_id=task_id,
        prerequisite_task_id=prereq_id,
    ).first()
    if exists:
        return jsonify({"error": "Dépendance déjà définie"}), 409

    row = TaskDependency(dependent_task_id=task_id, prerequisite_task_id=prereq_id)
    db.session.add(row)
    log_history(task_id, user_id, f"Dépendance ajoutée : tâche #{prereq_id} requise avant")
    db.session.commit()
    return jsonify({"message": "Dépendance ajoutée", "dependency": row.to_dict()}), 201


@tasks_bp.route("/<int:task_id>/dependencies/<int:prerequisite_task_id>", methods=["DELETE"])
@jwt_required()
def remove_dependency(task_id, prerequisite_task_id):
    user_id = int(get_jwt_identity())
    task = Task.query.get_or_404(task_id)
    if not task_project_member_or_403(user_id, task):
        return jsonify({"error": "Accès refusé"}), 403
    if not can_edit_project(user_id, task.project_id):
        return jsonify({"error": "Le rôle observateur ne peut pas modifier les dépendances"}), 403

    row = TaskDependency.query.filter_by(
        dependent_task_id=task_id,
        prerequisite_task_id=prerequisite_task_id,
    ).first_or_404()
    db.session.delete(row)
    log_history(task_id, user_id, f"Dépendance retirée : tâche #{prerequisite_task_id}")
    db.session.commit()
    return jsonify({"message": "Dépendance supprimée"}), 200


# ─── COMMENTAIRES ─────────────────────────────────────────────────────────────
@tasks_bp.route("/<int:task_id>/comments", methods=["POST"])
@jwt_required()
def add_comment(task_id):
    from app.models.task import Comment

    user_id = int(get_jwt_identity())
    task = Task.query.get_or_404(task_id)
    if not task_project_member_or_403(user_id, task):
        return jsonify({"error": "Accès refusé"}), 403
    if not can_edit_project(user_id, task.project_id):
        return jsonify({"error": "Le rôle observateur ne peut pas commenter"}), 403

    data = request.get_json() or {}
    if not data.get("content"):
        return jsonify({"error": "Le contenu est requis"}), 400

    comment = Comment(task_id=task_id, author_id=user_id, content=data["content"])
    db.session.add(comment)
    log_history(task_id, user_id, "Commentaire ajouté")
    db.session.commit()

    return jsonify({"message": "Commentaire ajouté", "comment": comment.to_dict()}), 201
