from flask import Blueprint, jsonify

from app.extensions import db, limiter

health_bp = Blueprint("health", __name__)


@health_bp.route("/", methods=["GET"])
@limiter.exempt
def health():
    try:
        db.session.execute(db.text("SELECT 1"))
        db.session.commit()
        return jsonify({"status": "ok"}), 200
    except Exception as exc:
        db.session.rollback()
        return jsonify({"status": "degraded", "error": str(exc)}), 200
