from flask import Blueprint, jsonify

from app.extensions import db

health_bp = Blueprint("health", __name__)


@health_bp.route("/", methods=["GET"])
def health():
    db.session.execute(db.text("SELECT 1"))
    return jsonify({"status": "ok"}), 200
