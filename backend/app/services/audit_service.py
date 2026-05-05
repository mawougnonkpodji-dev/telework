from flask import request
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request

from app.extensions import db
from app.models.audit_event import AuditEvent


AUDITED_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def resolve_jwt_user_id():
    try:
        verify_jwt_in_request(optional=True)
        identity = get_jwt_identity()
        return int(identity) if identity is not None else None
    except Exception:
        return None


def log_audit_event(response):
    if request.method not in AUDITED_METHODS:
        return response
    if request.path.startswith("/api/health"):
        return response

    event = AuditEvent(
        user_id=resolve_jwt_user_id(),
        action=f"{request.method}:{request.endpoint or 'unknown'}",
        method=request.method,
        path=request.path[:255],
        endpoint=(request.endpoint or "")[:120],
        status_code=response.status_code,
        ip_address=(request.remote_addr or "")[:64] or None,
    )
    db.session.add(event)
    db.session.commit()
    return response


def log_business_event(user_id, action, path, endpoint, status_code=200):
    """Journalisation ciblée pour opérations métier sensibles."""
    try:
        event = AuditEvent(
            user_id=user_id,
            action=action[:120],
            method="BUSINESS",
            path=(path or "")[:255],
            endpoint=(endpoint or "")[:120],
            status_code=status_code,
            ip_address=(request.remote_addr or "")[:64] or None,
        )
        db.session.add(event)
        db.session.commit()
    except Exception:
        db.session.rollback()
