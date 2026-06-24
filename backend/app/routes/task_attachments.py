import os
import re

from flask import current_app, jsonify, request, send_from_directory
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename

from app.extensions import db
from app.extensions import limiter
from app.models.task_attachment import TaskAttachment
from app.services.attachment_service import save_uploaded_file, delete_stored_file
from app.utils.project_access import task_project_member_or_403

from app.routes.tasks import tasks_bp


@tasks_bp.route("/project/<int:project_id>/deliverables", methods=["GET"])
@jwt_required()
def list_project_deliverables(project_id):
    """Livrables projet en une requête (évite N+1 côté frontend)."""
    from app.models import Task
    from app.models.task import TaskStatus
    from app.utils.project_access import get_project_for_user

    user_id = int(get_jwt_identity())
    if not get_project_for_user(user_id, project_id):
        return jsonify({"error": "Accès refusé"}), 403

    limit = min(max(request.args.get("limit", 50, type=int), 1), 100)
    statuses = (TaskStatus.delivered, TaskStatus.validated, TaskStatus.in_progress)
    tasks = (
        Task.query.filter(
            Task.project_id == project_id,
            Task.parent_id.is_(None),
            Task.status.in_(statuses),
        )
        .order_by(Task.updated_at.desc())
        .limit(limit)
        .all()
    )

    deliverables = []
    for task in tasks:
        base = f"/api/tasks/{task.id}/attachments"
        for att in task.attachments.order_by(TaskAttachment.created_at.desc()).all():
            d = att.to_dict(download_path=f"{base}/{att.id}/file")
            deliverables.append(
                {
                    "type": "attachment",
                    "task_id": task.id,
                    "task_title": task.title,
                    "task_status": task.status.value,
                    "attachment": d,
                }
            )

        desc = (task.description or "").strip()
        if not desc:
            continue

        url_match = re.match(r"^Livrable \(URL\):\s*(.+)$", desc, re.M)
        if url_match:
            deliverables.append(
                {
                    "type": "url",
                    "task_id": task.id,
                    "task_title": task.title,
                    "task_status": task.status.value,
                    "url": url_match.group(1).strip(),
                    "created_at": task.updated_at.isoformat() if task.updated_at else None,
                }
            )
        elif (
            task.status in (TaskStatus.delivered, TaskStatus.validated)
            and not desc.startswith("http")
        ):
            deliverables.append(
                {
                    "type": "rapport",
                    "task_id": task.id,
                    "task_title": task.title,
                    "task_status": task.status.value,
                    "content": desc,
                    "created_at": task.updated_at.isoformat() if task.updated_at else None,
                }
            )

    return jsonify({"deliverables": deliverables}), 200


def _upload_folder():
    return current_app.config.get("UPLOAD_FOLDER") or os.path.join(
        current_app.root_path, "..", "uploads"
    )


def _abs_upload_root():
    return os.path.abspath(_upload_folder())


@tasks_bp.route("/<int:task_id>/attachments", methods=["GET"])
@jwt_required()
def list_task_attachments(task_id):
    from app.models import Task

    user_id = int(get_jwt_identity())
    task = Task.query.get_or_404(task_id)
    if not task_project_member_or_403(user_id, task):
        return jsonify({"error": "Accès refusé"}), 403

    rows = task.attachments.order_by(TaskAttachment.created_at.desc()).all()
    base = f"/api/tasks/{task_id}/attachments"
    return (
        jsonify(
            {
                "attachments": [
                    a.to_dict(download_path=f"{base}/{a.id}/file") for a in rows
                ]
            }
        ),
        200,
    )


@tasks_bp.route("/<int:task_id>/attachments", methods=["POST"])
@jwt_required()
@limiter.limit("30 per hour")
def upload_task_attachment(task_id):
    from app.models import Task

    user_id = int(get_jwt_identity())
    task = Task.query.get_or_404(task_id)
    if not task_project_member_or_403(user_id, task):
        return jsonify({"error": "Accès refusé"}), 403

    if "file" not in request.files:
        return jsonify({"error": "Champ 'file' requis (multipart)"}), 400

    f = request.files["file"]
    max_bytes = int(current_app.config.get("MAX_UPLOAD_BYTES", 10 * 1024 * 1024))
    root = _abs_upload_root()

    try:
        rel, orig_name, size, mime = save_uploaded_file(root, task_id, f, max_bytes)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    att = TaskAttachment(
        task_id=task_id,
        uploaded_by_id=user_id,
        original_filename=orig_name,
        stored_path=rel,
        mime_type=mime,
        size_bytes=size,
    )
    db.session.add(att)
    db.session.commit()

    base = f"/api/tasks/{task_id}/attachments"
    return (
        jsonify(
            {
                "message": "Fichier ajouté",
                "attachment": att.to_dict(download_path=f"{base}/{att.id}/file"),
            }
        ),
        201,
    )


@tasks_bp.route("/<int:task_id>/attachments/<int:attachment_id>/file", methods=["GET"])
@jwt_required()
def download_task_attachment(task_id, attachment_id):
    from app.models import Task

    user_id = int(get_jwt_identity())
    task = Task.query.get_or_404(task_id)
    if not task_project_member_or_403(user_id, task):
        return jsonify({"error": "Accès refusé"}), 403

    att = TaskAttachment.query.filter_by(id=attachment_id, task_id=task_id).first_or_404()
    root = _abs_upload_root()
    directory = os.path.dirname(os.path.join(root, att.stored_path))
    fname = os.path.basename(att.stored_path)
    return send_from_directory(
        directory,
        fname,
        as_attachment=True,
        download_name=secure_filename(att.original_filename) or "fichier",
        mimetype=att.mime_type or "application/octet-stream",
    )


@tasks_bp.route("/<int:task_id>/attachments/<int:attachment_id>", methods=["DELETE"])
@jwt_required()
@limiter.limit("30 per hour")
def delete_task_attachment(task_id, attachment_id):
    from app.models import Task

    user_id = int(get_jwt_identity())
    task = Task.query.get_or_404(task_id)
    if not task_project_member_or_403(user_id, task):
        return jsonify({"error": "Accès refusé"}), 403

    att = TaskAttachment.query.filter_by(id=attachment_id, task_id=task_id).first_or_404()
    root = _abs_upload_root()
    delete_stored_file(root, att.stored_path)
    db.session.delete(att)
    db.session.commit()
    return jsonify({"message": "Pièce jointe supprimée"}), 200
