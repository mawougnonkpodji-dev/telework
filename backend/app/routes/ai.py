import json
from datetime import datetime, timedelta, timezone

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity

from sqlalchemy import func

from app.models import User
from app.models.sprint import Sprint
from app.models.ai_usage_log import AIUsageLog
from app.extensions import db
from app.services.ai_service import (
    AIServiceError,
    suggest_deadlines,
    detect_risks,
    generate_sprint_summary,
    recommend_assignee,
    weekly_summary,
)
from app.utils.project_access import get_project_for_user
from app.extensions import limiter
from app.services.scheduler_service import run_weekly_summaries_job

ai_bp = Blueprint("ai", __name__)


def _ensure_ai_quota(user_id: int, project_id: int):
    quota = int(current_app.config.get("AI_DAILY_QUOTA_PER_USER_PROJECT", 50))
    since = datetime.now(timezone.utc) - timedelta(hours=24)
    used = AIUsageLog.query.filter(
        AIUsageLog.user_id == user_id,
        AIUsageLog.project_id == project_id,
        AIUsageLog.created_at >= since,
    ).count()
    if used >= quota:
        return False, quota, used
    return True, quota, used


def _log_ai_usage(user_id: int, project_id: int, endpoint: str, status: str, response=None, error=None):
    row = AIUsageLog(
        user_id=user_id,
        project_id=project_id,
        endpoint=endpoint,
        status=status,
        error=str(error) if error else None,
        response_json=json.dumps(response, ensure_ascii=False) if response is not None else None,
    )
    db.session.add(row)
    db.session.commit()


def _is_admin(user_id: int) -> bool:
    user = User.query.get(user_id)
    return bool(user and user.role and user.role.value == "admin")


@ai_bp.route("/suggest-deadlines/<int:project_id>", methods=["GET"])
@jwt_required()
@limiter.limit("20 per hour")
def ai_suggest_deadlines(project_id):
    user_id = int(get_jwt_identity())
    if not get_project_for_user(user_id, project_id):
        return jsonify({"error": "Accès refusé"}), 403
    allowed, quota, used = _ensure_ai_quota(user_id, project_id)
    if not allowed:
        return jsonify({"error": f"Quota IA atteint ({used}/{quota} sur 24h)"}), 429
    try:
        result = suggest_deadlines(project_id)
    except AIServiceError as exc:
        _log_ai_usage(user_id, project_id, "suggest-deadlines", "failed", error=exc)
        return jsonify({"error": str(exc)}), 502
    _log_ai_usage(user_id, project_id, "suggest-deadlines", "success", response=result)
    return jsonify({"format": "json", "data": result}), 200


@ai_bp.route("/detect-risks/<int:project_id>", methods=["GET"])
@jwt_required()
@limiter.limit("20 per hour")
def ai_detect_risks(project_id):
    user_id = int(get_jwt_identity())
    if not get_project_for_user(user_id, project_id):
        return jsonify({"error": "Accès refusé"}), 403
    allowed, quota, used = _ensure_ai_quota(user_id, project_id)
    if not allowed:
        return jsonify({"error": f"Quota IA atteint ({used}/{quota} sur 24h)"}), 429
    try:
        result = detect_risks(project_id)
    except AIServiceError as exc:
        _log_ai_usage(user_id, project_id, "detect-risks", "failed", error=exc)
        return jsonify({"error": str(exc)}), 502
    _log_ai_usage(user_id, project_id, "detect-risks", "success", response=result)
    return jsonify({"format": "json", "data": result}), 200


@ai_bp.route("/sprint-summary/<int:sprint_id>", methods=["GET"])
@jwt_required()
@limiter.limit("20 per hour")
def ai_sprint_summary(sprint_id):
    user_id = int(get_jwt_identity())
    sprint = Sprint.query.get_or_404(sprint_id)
    if not get_project_for_user(user_id, sprint.project_id):
        return jsonify({"error": "Accès refusé"}), 403
    allowed, quota, used = _ensure_ai_quota(user_id, sprint.project_id)
    if not allowed:
        return jsonify({"error": f"Quota IA atteint ({used}/{quota} sur 24h)"}), 429
    try:
        result = generate_sprint_summary(sprint_id)
    except AIServiceError as exc:
        _log_ai_usage(user_id, sprint.project_id, "sprint-summary", "failed", error=exc)
        return jsonify({"error": str(exc)}), 502
    _log_ai_usage(user_id, sprint.project_id, "sprint-summary", "success", response=result)
    return jsonify({"format": "json", "data": result}), 200


@ai_bp.route("/recommend-assignee", methods=["POST"])
@jwt_required()
@limiter.limit("30 per hour")
def ai_recommend_assignee():
    user_id = int(get_jwt_identity())
    data = request.get_json() or {}
    required = ["project_id", "task_title"]
    for field in required:
        if not data.get(field):
            return jsonify({"error": f"'{field}' est requis"}), 400

    if not get_project_for_user(user_id, data["project_id"]):
        return jsonify({"error": "Accès refusé"}), 403
    allowed, quota, used = _ensure_ai_quota(user_id, data["project_id"])
    if not allowed:
        return jsonify({"error": f"Quota IA atteint ({used}/{quota} sur 24h)"}), 429

    try:
        result = recommend_assignee(
            project_id=data["project_id"],
            task_title=data["task_title"],
            task_description=data.get("task_description", ""),
        )
    except AIServiceError as exc:
        _log_ai_usage(user_id, data["project_id"], "recommend-assignee", "failed", error=exc)
        return jsonify({"error": str(exc)}), 502
    _log_ai_usage(user_id, data["project_id"], "recommend-assignee", "success", response=result)
    return jsonify({"format": "json", "data": result}), 200


@ai_bp.route("/weekly-summary/<int:project_id>", methods=["GET"])
@jwt_required()
@limiter.limit("10 per hour")
def ai_weekly_summary(project_id):
    user_id = int(get_jwt_identity())
    if not get_project_for_user(user_id, project_id):
        return jsonify({"error": "Accès refusé"}), 403
    allowed, quota, used = _ensure_ai_quota(user_id, project_id)
    if not allowed:
        return jsonify({"error": f"Quota IA atteint ({used}/{quota} sur 24h)"}), 429
    try:
        result = weekly_summary(project_id)
    except AIServiceError as exc:
        _log_ai_usage(user_id, project_id, "weekly-summary", "failed", error=exc)
        return jsonify({"error": str(exc)}), 502
    _log_ai_usage(user_id, project_id, "weekly-summary", "success", response=result)
    return jsonify({"format": "json", "data": result}), 200


@ai_bp.route("/usage-logs", methods=["GET"])
@jwt_required()
@limiter.limit("60 per hour")
def ai_usage_logs():
    user_id = int(get_jwt_identity())
    if not _is_admin(user_id):
        return jsonify({"error": "Accès refusé"}), 403

    project_id = request.args.get("project_id", type=int)
    endpoint = (request.args.get("endpoint") or "").strip()
    status = (request.args.get("status") or "").strip()
    page = request.args.get("page", 1, type=int)
    per_page = min(request.args.get("per_page", 50, type=int), 100)

    query = AIUsageLog.query
    if project_id:
        query = query.filter(AIUsageLog.project_id == project_id)
    if endpoint:
        query = query.filter(AIUsageLog.endpoint == endpoint)
    if status:
        query = query.filter(AIUsageLog.status == status)

    logs = query.order_by(AIUsageLog.created_at.desc()).paginate(page=page, per_page=per_page, error_out=False)
    items = [
        {
            "id": row.id,
            "project_id": row.project_id,
            "user_id": row.user_id,
            "endpoint": row.endpoint,
            "status": row.status,
            "error": row.error,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in logs.items
    ]
    return jsonify({"logs": items, "total": logs.total, "page": page, "pages": logs.pages}), 200


@ai_bp.route("/usage-stats", methods=["GET"])
@jwt_required()
@limiter.limit("60 per hour")
def ai_usage_stats():
    user_id = int(get_jwt_identity())
    if not _is_admin(user_id):
        return jsonify({"error": "Accès refusé"}), 403

    project_id = request.args.get("project_id", type=int)
    query = db.session.query(AIUsageLog.endpoint, AIUsageLog.status, func.count(AIUsageLog.id))
    if project_id:
        query = query.filter(AIUsageLog.project_id == project_id)
    rows = query.group_by(AIUsageLog.endpoint, AIUsageLog.status).all()
    return jsonify(
        {
            "stats": [
                {"endpoint": endpoint, "status": status, "count": count}
                for endpoint, status, count in rows
            ]
        }
    ), 200


@ai_bp.route("/weekly-summary/run-now", methods=["POST"])
@jwt_required()
@limiter.limit("5 per hour")
def run_weekly_summary_now():
    user_id = int(get_jwt_identity())
    if not _is_admin(user_id):
        return jsonify({"error": "Accès refusé"}), 403
    run_weekly_summaries_job()
    return jsonify({"message": "Job résumé hebdomadaire lancé"}), 200
