from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.extensions import limiter
from app.models import User
from app.models.audit_event import AuditEvent

audit_bp = Blueprint("audit", __name__)


def _is_admin(user):
    return bool(user and user.role and user.role.value == "admin")


@audit_bp.route("/", methods=["GET"])
@jwt_required()
@limiter.limit("60 per hour")
def list_audit_events():
    user_id = int(get_jwt_identity())
    user = User.query.get_or_404(user_id)
    if not _is_admin(user):
        return jsonify({"error": "Accès refusé"}), 403

    page = request.args.get("page", 1, type=int)
    per_page = min(request.args.get("per_page", 50, type=int), 100)
    method = (request.args.get("method") or "").strip().upper()
    action = (request.args.get("action") or "").strip()
    status_code = request.args.get("status_code", type=int)
    user_filter = request.args.get("user_id", type=int)

    query = AuditEvent.query
    if method:
        query = query.filter(AuditEvent.method == method)
    if action:
        query = query.filter(AuditEvent.action.ilike(f"%{action}%"))
    if status_code:
        query = query.filter(AuditEvent.status_code == status_code)
    if user_filter:
        query = query.filter(AuditEvent.user_id == user_filter)

    events = query.order_by(AuditEvent.created_at.desc()).paginate(page=page, per_page=per_page, error_out=False)
    return jsonify(
        {
            "events": [event.to_dict() for event in events.items],
            "total": events.total,
            "page": page,
            "pages": events.pages,
        }
    ), 200
