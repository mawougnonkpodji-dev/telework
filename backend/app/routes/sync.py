from datetime import datetime

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.extensions import db, limiter
from app.models import Project, Task
from app.models.message import Message
from app.models.task import Comment
from app.models.sync_operation import SyncOperation
from app.models.task import TaskPriority, TaskStatus
from app.utils.project_access import is_project_member, can_edit_project

sync_bp = Blueprint("sync", __name__)


def _parse_status(value):
    aliases = {
        "todo": "assigned",
        "review": "delivered",
        "done": "validated",
    }
    if value is None:
        return TaskStatus.assigned
    try:
        return TaskStatus(aliases.get(value, value))
    except ValueError:
        return TaskStatus.assigned


def _parse_priority(value):
    if value is None:
        return TaskPriority.medium
    try:
        return TaskPriority(value)
    except ValueError:
        return TaskPriority.medium


def _parse_iso_datetime(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _build_result(op, status, resource_id=None, entity=None, error=None, conflict=False, field_conflicts=None):
    return {
        "client_operation_id": op.get("client_operation_id"),
        "action": op.get("action"),
        "resource": op.get("resource"),
        "local_id": op.get("local_id"),
        "resource_id": resource_id,
        "status": status,
        "conflict": conflict,
        "field_conflicts": field_conflicts or [],
        "error": error,
        "server_state": entity.to_dict() if entity else None,
    }


def _can_apply_field(updated_at, client_base_updated_at, field_name, field_timestamps):
    field_ts = _parse_iso_datetime(field_timestamps.get(field_name)) if isinstance(field_timestamps, dict) else None
    if not updated_at:
        return True
    if field_ts:
        return field_ts >= updated_at
    if client_base_updated_at:
        return client_base_updated_at >= updated_at
    return False


def _apply_with_conflict_policy(entity, payload, mapping, client_base_updated_at, strategy, field_timestamps):
    field_conflicts = []
    for field_name, parser in mapping.items():
        if field_name not in payload:
            continue
        new_value = parser(payload.get(field_name))
        if strategy == "client_wins":
            setattr(entity, field_name, new_value)
            continue
        if strategy == "merge_non_conflicting":
            if _can_apply_field(entity.updated_at, client_base_updated_at, field_name, field_timestamps):
                setattr(entity, field_name, new_value)
            else:
                field_conflicts.append(field_name)
            continue
        field_conflicts.append(field_name)
    return field_conflicts


def _record_sync_operation(project_id, user_id, client_op_id, resource, resource_id, action, status, error=None):
    db.session.add(
        SyncOperation(
            project_id=project_id,
            user_id=user_id,
            client_operation_id=client_op_id,
            resource_type=resource,
            resource_id=resource_id,
            action=action,
            status=status,
            error=error,
        )
    )


def _handle_task_op(project_id, user_id, op, action, payload, strategy, client_base_updated_at, field_timestamps):
    if action == "create":
        task = Task(
            project_id=project_id,
            title=(payload.get("title") or "").strip() or "Sans titre",
            description=payload.get("description") or "",
            status=_parse_status(payload.get("status")),
            priority=_parse_priority(payload.get("priority")),
            progress=max(0, min(int(payload.get("progress", 0)), 100)),
        )
        if payload.get("deadline"):
            deadline = _parse_iso_datetime(payload.get("deadline"))
            if deadline:
                task.deadline = deadline
        db.session.add(task)
        db.session.flush()
        return _build_result(op, "applied", resource_id=task.id, entity=task), task.id, "applied", None

    task_id = op.get("resource_id")
    if not task_id:
        raise ValueError("resource_id est requis pour update/delete")
    task = Task.query.filter_by(id=task_id, project_id=project_id).first()
    if not task:
        raise ValueError("Ressource introuvable")

    if action == "delete":
        if strategy == "server_wins" and client_base_updated_at and task.updated_at and client_base_updated_at < task.updated_at:
            return (
                _build_result(op, "conflict", resource_id=task.id, entity=task, error="Conflit de version", conflict=True),
                task.id,
                "conflict",
                "Version serveur plus récente",
            )
        db.session.delete(task)
        db.session.flush()
        return _build_result(op, "applied", resource_id=task_id), task_id, "applied", None

    mapping = {
        "title": lambda v: (v or "").strip() or task.title,
        "description": lambda v: v or "",
        "status": _parse_status,
        "priority": _parse_priority,
        "progress": lambda v: max(0, min(int(v or 0), 100)),
        "deadline": lambda v: _parse_iso_datetime(v) if v else None,
    }
    field_conflicts = _apply_with_conflict_policy(
        task, payload, mapping, client_base_updated_at, strategy, field_timestamps
    )
    if strategy == "server_wins" and field_conflicts:
        return (
            _build_result(
                op,
                "conflict",
                resource_id=task.id,
                entity=task,
                error="Conflit de version",
                conflict=True,
                field_conflicts=field_conflicts,
            ),
            task.id,
            "conflict",
            "Version serveur plus récente",
        )

    db.session.flush()
    status = "partial_conflict" if field_conflicts else "applied"
    return (
        _build_result(op, status, resource_id=task.id, entity=task, field_conflicts=field_conflicts),
        task.id,
        status,
        "Conflit partiel résolu côté serveur" if field_conflicts else None,
    )


def _handle_message_op(project_id, user_id, op, action, payload, strategy, client_base_updated_at, field_timestamps):
    if action == "create":
        content = (payload.get("content") or "").strip()
        if not content:
            raise ValueError("content est requis")
        message = Message(
            project_id=project_id,
            channel_id=payload.get("channel_id"),
            sender_id=user_id,
            content=content,
        )
        db.session.add(message)
        db.session.flush()
        return _build_result(op, "applied", resource_id=message.id, entity=message), message.id, "applied", None

    message_id = op.get("resource_id")
    message = Message.query.filter_by(id=message_id, project_id=project_id, direct_conversation_id=None).first()
    if not message:
        raise ValueError("Message introuvable")
    if message.sender_id != user_id:
        raise ValueError("Seul l'auteur peut modifier/supprimer ce message")

    if action == "delete":
        if strategy == "server_wins" and client_base_updated_at and message.updated_at and client_base_updated_at < message.updated_at:
            return (
                _build_result(op, "conflict", resource_id=message.id, entity=message, error="Conflit de version", conflict=True),
                message.id,
                "conflict",
                "Version serveur plus récente",
            )
        db.session.delete(message)
        db.session.flush()
        return _build_result(op, "applied", resource_id=message_id), message_id, "applied", None

    mapping = {
        "content": lambda v: (v or "").strip() or message.content,
    }
    field_conflicts = _apply_with_conflict_policy(
        message, payload, mapping, client_base_updated_at, strategy, field_timestamps
    )
    if strategy == "server_wins" and field_conflicts:
        return (
            _build_result(
                op,
                "conflict",
                resource_id=message.id,
                entity=message,
                error="Conflit de version",
                conflict=True,
                field_conflicts=field_conflicts,
            ),
            message.id,
            "conflict",
            "Version serveur plus récente",
        )
    db.session.flush()
    status = "partial_conflict" if field_conflicts else "applied"
    return (
        _build_result(op, status, resource_id=message.id, entity=message, field_conflicts=field_conflicts),
        message.id,
        status,
        "Conflit partiel résolu côté serveur" if field_conflicts else None,
    )


def _handle_comment_op(project_id, user_id, op, action, payload, strategy, client_base_updated_at, field_timestamps):
    if action == "create":
        task_id = payload.get("task_id")
        if not task_id:
            raise ValueError("task_id est requis")
        task = Task.query.filter_by(id=task_id, project_id=project_id).first()
        if not task:
            raise ValueError("task_id invalide")
        content = (payload.get("content") or "").strip()
        if not content:
            raise ValueError("content est requis")
        comment = Comment(task_id=task_id, author_id=user_id, content=content)
        db.session.add(comment)
        db.session.flush()
        return _build_result(op, "applied", resource_id=comment.id, entity=comment), comment.id, "applied", None

    comment_id = op.get("resource_id")
    comment = Comment.query.join(Task, Comment.task_id == Task.id).filter(
        Comment.id == comment_id, Task.project_id == project_id
    ).first()
    if not comment:
        raise ValueError("Commentaire introuvable")
    if comment.author_id != user_id:
        raise ValueError("Seul l'auteur peut modifier/supprimer ce commentaire")

    if action == "delete":
        if strategy == "server_wins" and client_base_updated_at and comment.updated_at and client_base_updated_at < comment.updated_at:
            return (
                _build_result(op, "conflict", resource_id=comment.id, entity=comment, error="Conflit de version", conflict=True),
                comment.id,
                "conflict",
                "Version serveur plus récente",
            )
        db.session.delete(comment)
        db.session.flush()
        return _build_result(op, "applied", resource_id=comment_id), comment_id, "applied", None

    mapping = {
        "content": lambda v: (v or "").strip() or comment.content,
    }
    field_conflicts = _apply_with_conflict_policy(
        comment, payload, mapping, client_base_updated_at, strategy, field_timestamps
    )
    if strategy == "server_wins" and field_conflicts:
        return (
            _build_result(
                op,
                "conflict",
                resource_id=comment.id,
                entity=comment,
                error="Conflit de version",
                conflict=True,
                field_conflicts=field_conflicts,
            ),
            comment.id,
            "conflict",
            "Version serveur plus récente",
        )

    db.session.flush()
    status = "partial_conflict" if field_conflicts else "applied"
    return (
        _build_result(op, status, resource_id=comment.id, entity=comment, field_conflicts=field_conflicts),
        comment.id,
        status,
        "Conflit partiel résolu côté serveur" if field_conflicts else None,
    )


@sync_bp.route("/batch", methods=["POST"])
@jwt_required()
@limiter.limit("120 per hour")
def sync_batch():
    user_id = int(get_jwt_identity())
    data = request.get_json() or {}
    project_id = data.get("project_id")
    operations = data.get("operations") or []

    if not project_id:
        return jsonify({"error": "project_id est requis"}), 400
    if not isinstance(operations, list):
        return jsonify({"error": "operations doit être une liste"}), 400

    project = Project.query.get_or_404(project_id)
    if not is_project_member(user_id, project):
        return jsonify({"error": "Accès refusé"}), 403
    if not can_edit_project(user_id, project_id):
        return jsonify({"error": "Le rôle observateur ne peut pas effectuer des opérations sync en écriture"}), 403

    handlers = {
        "task": _handle_task_op,
        "message": _handle_message_op,
        "comment": _handle_comment_op,
    }

    results = []
    for op in operations:
        client_op_id = (op.get("client_operation_id") or "").strip()
        action = (op.get("action") or "").strip().lower()
        resource = (op.get("resource") or "").strip().lower()
        payload = op.get("data") or {}
        strategy = (op.get("conflict_strategy") or "server_wins").strip().lower()
        client_base_updated_at = _parse_iso_datetime(op.get("client_updated_at"))
        field_timestamps = op.get("field_timestamps") or {}

        if not client_op_id:
            results.append(_build_result(op, "rejected", error="client_operation_id est requis"))
            continue
        if resource not in handlers:
            results.append(_build_result(op, "rejected", error="resource non supportée"))
            continue
        if action not in {"create", "update", "delete"}:
            results.append(_build_result(op, "rejected", error="action non supportée"))
            continue
        if strategy not in {"server_wins", "client_wins", "merge_non_conflicting"}:
            results.append(_build_result(op, "rejected", error="conflict_strategy non supportée"))
            continue

        existing_op = SyncOperation.query.filter_by(project_id=project_id, client_operation_id=client_op_id).first()
        if existing_op:
            results.append(
                _build_result(op, "duplicate", resource_id=existing_op.resource_id, error="opération déjà traitée")
            )
            continue

        try:
            result, resource_id, op_status, op_error = handlers[resource](
                project_id,
                user_id,
                op,
                action,
                payload,
                strategy,
                client_base_updated_at,
                field_timestamps,
            )
            _record_sync_operation(project_id, user_id, client_op_id, resource, resource_id, action, op_status, op_error)
            results.append(result)
        except Exception as exc:
            _record_sync_operation(
                project_id,
                user_id,
                client_op_id,
                resource or "unknown",
                op.get("resource_id"),
                action or "unknown",
                "failed",
                str(exc),
            )
            results.append(_build_result(op, "failed", error=str(exc)))

    db.session.commit()
    return jsonify({"project_id": project_id, "results": results}), 200


@sync_bp.route("/changes", methods=["GET"])
@jwt_required()
@limiter.limit("240 per hour")
def sync_changes_since():
    user_id = int(get_jwt_identity())
    project_id = request.args.get("project_id", type=int)
    since = _parse_iso_datetime(request.args.get("since"))
    limit = min(request.args.get("limit", 200, type=int), 500)

    if not project_id:
        return jsonify({"error": "project_id est requis"}), 400
    if not since:
        return jsonify({"error": "since (ISO datetime) est requis"}), 400

    project = Project.query.get_or_404(project_id)
    if not is_project_member(user_id, project):
        return jsonify({"error": "Accès refusé"}), 403

    tasks = Task.query.filter(Task.project_id == project_id, Task.updated_at > since).order_by(Task.updated_at.asc()).limit(limit).all()
    messages = Message.query.filter(
        Message.project_id == project_id,
        Message.direct_conversation_id.is_(None),
        Message.updated_at > since,
    ).order_by(Message.updated_at.asc()).limit(limit).all()
    comments = (
        Comment.query.join(Task, Comment.task_id == Task.id)
        .filter(Task.project_id == project_id, Comment.updated_at > since)
        .order_by(Comment.updated_at.asc())
        .limit(limit)
        .all()
    )
    tombstones = (
        SyncOperation.query.filter(
            SyncOperation.project_id == project_id,
            SyncOperation.action == "delete",
            SyncOperation.processed_at > since,
        )
        .order_by(SyncOperation.processed_at.asc())
        .limit(limit)
        .all()
    )

    latest_candidates = [since]
    latest_candidates.extend([t.updated_at for t in tasks if t.updated_at])
    latest_candidates.extend([m.updated_at for m in messages if m.updated_at])
    latest_candidates.extend([c.updated_at for c in comments if c.updated_at])
    latest_candidates.extend([d.processed_at for d in tombstones if d.processed_at])
    next_cursor = max(latest_candidates).isoformat()

    return jsonify(
        {
            "project_id": project_id,
            "since": since.isoformat(),
            "next_cursor": next_cursor,
            "changes": {
                "tasks": [task.to_dict() for task in tasks],
                "messages": [message.to_dict() for message in messages],
                "comments": [comment.to_dict() for comment in comments],
                "deleted": [
                    {
                        "resource": row.resource_type,
                        "resource_id": row.resource_id,
                        "deleted_at": row.processed_at.isoformat() if row.processed_at else None,
                        "client_operation_id": row.client_operation_id,
                    }
                    for row in tombstones
                ],
            },
        }
    ), 200
