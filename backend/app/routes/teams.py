"""Onboarding équipe — métadonnées (aucune table Team pour l'instant)."""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

teams_bp = Blueprint("teams", __name__)


@teams_bp.route("/", methods=["POST"])
@jwt_required()
def save_team_onboarding():
    """Enregistre le profil d'équipe saisi au wizard ; le travail métier repose sur les projets."""
    uid = int(get_jwt_identity())
    data = request.get_json() or {}
    if not data.get("teamName"):
        return jsonify({"error": "teamName requis"}), 400

    return (
        jsonify(
            {
                "ok": True,
                "user_id": uid,
                "teamName": data.get("teamName"),
                "sector": data.get("sector"),
                "currency": data.get("currency"),
            }
        ),
        200,
    )
