from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db
from app.models.notification import Notification

notifications_bp = Blueprint("notifications", __name__)


# ─── LISTER MES NOTIFICATIONS ─────────────────────────────────────────────────
@notifications_bp.route("/", methods=["GET"])
@jwt_required()
def get_notifications():
    user_id  = int(get_jwt_identity())
    unread_only = request.args.get("unread", False, type=bool)
    page = max(request.args.get("page", 1, type=int), 1)
    per_page = min(max(request.args.get("per_page", 50, type=int), 1), 100)

    query = Notification.query.filter_by(user_id=user_id)
    if unread_only:
        query = query.filter_by(is_read=False)

    rows = query.order_by(
        Notification.created_at.desc()
    ).paginate(page=page, per_page=per_page, error_out=False)

    unread_count = Notification.query.filter_by(
        user_id=user_id, is_read=False
    ).count()

    return jsonify({
        "notifications": [n.to_dict() for n in rows.items],
        "unread_count":  unread_count,
        "pagination": {"page": page, "per_page": per_page, "total": rows.total, "pages": rows.pages},
    }), 200


# ─── MARQUER UNE NOTIFICATION COMME LUE ──────────────────────────────────────
@notifications_bp.route("/<int:notif_id>/read", methods=["PUT"])
@jwt_required()
def mark_as_read(notif_id):
    user_id = int(get_jwt_identity())
    notif   = Notification.query.get_or_404(notif_id)

    if notif.user_id != user_id:
        return jsonify({"error": "Accès refusé"}), 403

    notif.is_read = True
    db.session.commit()
    return jsonify({"message": "Notification marquée comme lue"}), 200


# ─── MARQUER TOUTES COMME LUES ────────────────────────────────────────────────
@notifications_bp.route("/read-all", methods=["PUT"])
@jwt_required()
def mark_all_read():
    user_id = int(get_jwt_identity())

    Notification.query.filter_by(
        user_id=user_id, is_read=False
    ).update({"is_read": True})

    db.session.commit()
    return jsonify({"message": "Toutes les notifications marquées comme lues"}), 200


# ─── SUPPRIMER UNE NOTIFICATION ───────────────────────────────────────────────
@notifications_bp.route("/<int:notif_id>", methods=["DELETE"])
@jwt_required()
def delete_notification(notif_id):
    user_id = int(get_jwt_identity())
    notif   = Notification.query.get_or_404(notif_id)

    if notif.user_id != user_id:
        return jsonify({"error": "Accès refusé"}), 403

    db.session.delete(notif)
    db.session.commit()
    return jsonify({"message": "Notification supprimée"}), 200