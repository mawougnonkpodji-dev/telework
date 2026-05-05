import os

from flask import current_app, jsonify, request, send_from_directory
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename

from app.extensions import db
from app.extensions import limiter
from app.models.task_attachment import TaskAttachment
from app.services.attachment_service import save_uploaded_file, delete_stored_file
from app.utils.project_access import task_project_member_or_403

from app.routes.tasks import tasks_bp


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
