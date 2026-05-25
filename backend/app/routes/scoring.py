"""
Routes API scoring IA

POST  /api/scoring/compute
      Body JSON : { "project_id": int, "user_id"?: int, "period"?: "YYYY-MM"|"all-time" }
      → Calcule (et persiste) le(s) score(s), retourne les résultats.
      Si user_id absent → calcule TOUS les membres du projet.

GET   /api/scoring/project/<project_id>
      → Retourne les derniers scores persistés pour ce projet.

GET   /api/scoring/me/<project_id>
      → Retourne le score du membre connecté dans ce projet.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.extensions import db
from app.models.member_score import MemberScore
from app.models.project import Project, project_members
from app.services.ai_scoring_service import compute_and_save_score, compute_project_scores

scoring_bp = Blueprint("scoring", __name__)


def _is_project_member(user_id: int, project_id: int) -> bool:
    row = db.session.execute(
        db.select(project_members.c.user_id).where(
            project_members.c.project_id == project_id,
            project_members.c.user_id == user_id,
        )
    ).first()
    return row is not None


def _can_manage_scoring(user_id: int, project_id: int) -> bool:
    """
    Mirrors canManageProjectMembers() on the frontend:
      - platform admin  (User.role == 'admin')
      - project owner   (Project.owner_id == user_id)
      - project admin   (project_members.role == 'admin')
    """
    from app.models.user import User
    from app.models.project import MemberRole

    u = db.session.get(User, user_id)
    if u and u.role == 'admin':
        return True

    p = db.session.get(Project, project_id)
    if p and p.owner_id == user_id:
        return True

    row = db.session.execute(
        db.select(project_members.c.role).where(
            project_members.c.project_id == project_id,
            project_members.c.user_id == user_id,
        )
    ).first()
    return row is not None and row.role == MemberRole.admin


# ── POST /api/scoring/compute ─────────────────────────────────────────────────
@scoring_bp.route("/compute", methods=["POST"])
@jwt_required()
def compute_scores():
    current_user_id = int(get_jwt_identity())
    body = request.get_json(silent=True) or {}

    project_id = body.get("project_id")
    user_id    = body.get("user_id")         # None → tous les membres
    period     = body.get("period", "all-time")

    if not project_id:
        return jsonify({"error": "project_id requis"}), 400

    # Le calcul global (tous les membres) est réservé aux gestionnaires du projet.
    # Un membre peut déclencher son propre calcul.
    if user_id and int(user_id) != current_user_id:
        if not _can_manage_scoring(current_user_id, project_id):
            return jsonify({"error": "Accès non autorisé"}), 403
    elif not user_id:
        if not _can_manage_scoring(current_user_id, project_id):
            return jsonify({"error": "Réservé aux gestionnaires du projet"}), 403

    try:
        if user_id:
            result = compute_and_save_score(int(user_id), int(project_id), period)
            return jsonify({"scores": [result]}), 200
        else:
            results = compute_project_scores(int(project_id), period)
            return jsonify({"scores": results}), 200
    except FileNotFoundError as exc:
        return jsonify({"error": str(exc)}), 503
    except Exception as exc:
        return jsonify({"error": f"Erreur de calcul : {exc}"}), 500


# ── GET /api/scoring/project/<project_id> ─────────────────────────────────────
@scoring_bp.route("/project/<int:project_id>", methods=["GET"])
@jwt_required()
def get_project_scores(project_id):
    current_user_id = int(get_jwt_identity())

    if not _is_project_member(current_user_id, project_id) and \
       not _can_manage_scoring(current_user_id, project_id):
        return jsonify({"error": "Accès non autorisé"}), 403

    period = request.args.get("period", "all-time")
    rows = MemberScore.query.filter_by(
        project_id=project_id, period=period
    ).order_by(MemberScore.score.desc()).all()

    # Enrichit avec les noms utilisateurs
    from app.models.user import User
    users = {u.id: u for u in User.query.filter(
        User.id.in_([r.user_id for r in rows])
    ).all()}

    results = []
    for r in rows:
        d = r.to_dict()
        u = users.get(r.user_id)
        if u:
            d["user_name"]  = u.name or u.email
            d["user_email"] = u.email
        results.append(d)

    return jsonify({"scores": results, "period": period}), 200


# ── GET /api/scoring/me/<project_id> ─────────────────────────────────────────
@scoring_bp.route("/me/<int:project_id>", methods=["GET"])
@jwt_required()
def get_my_score(project_id):
    current_user_id = int(get_jwt_identity())
    period = request.args.get("period", "all-time")

    row = MemberScore.query.filter_by(
        project_id=project_id,
        user_id=current_user_id,
        period=period,
    ).first()

    if not row:
        return jsonify({"score": None, "message": "Aucun score calculé pour cette période"}), 200

    return jsonify({"score": row.to_dict()}), 200
