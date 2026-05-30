import eventlet
from flask import request, current_app
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
    """Enregistre l'événement d'audit EN ARRIÈRE-PLAN (non-bloquant).
    La réponse est retournée immédiatement au client sans attendre l'écriture DB.
    """
    if request.method not in AUDITED_METHODS:
        return response
    if request.path.startswith("/api/health"):
        return response

    # Capture tout ce qui vient du contexte de la requête AVANT de spawner
    user_id    = resolve_jwt_user_id()
    action     = f"{request.method}:{request.endpoint or 'unknown'}"
    method     = request.method
    path       = request.path[:255]
    endpoint   = (request.endpoint or "")[:120]
    status     = response.status_code
    ip         = (request.remote_addr or "")[:64] or None
    app        = current_app._get_current_object()

    def _write():
        with app.app_context():
            try:
                ev = AuditEvent(
                    user_id=user_id,
                    action=action,
                    method=method,
                    path=path,
                    endpoint=endpoint,
                    status_code=status,
                    ip_address=ip,
                )
                db.session.add(ev)
                db.session.commit()
            except Exception:
                db.session.rollback()

    # Fire-and-forget : n'attend pas la fin de l'écriture
    eventlet.spawn_n(_write)
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
