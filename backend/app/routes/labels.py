from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.extensions import db
from app.models.label import Label
from app.utils.project_access import get_project_for_user, can_edit_project

labels_bp = Blueprint("labels", __name__)


@labels_bp.route("/projects/<int:project_id>/labels", methods=["GET"])
@jwt_required()
def list_labels(project_id):
    user_id = int(get_jwt_identity())
    if not get_project_for_user(user_id, project_id):
        return jsonify({"error": "Accès refusé"}), 403

    rows = Label.query.filter_by(project_id=project_id).order_by(Label.name).all()
    return jsonify({"labels": [r.to_dict() for r in rows]}), 200


@labels_bp.route("/projects/<int:project_id>/labels", methods=["POST"])
@jwt_required()
def create_label(project_id):
    user_id = int(get_jwt_identity())
    if not get_project_for_user(user_id, project_id):
        return jsonify({"error": "Accès refusé"}), 403
    if not can_edit_project(user_id, project_id):
        return jsonify({"error": "Le rôle observateur ne peut pas créer d'étiquettes"}), 403

    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name est requis"}), 400

    color = (data.get("color") or "#6B7280").strip()
    if not color.startswith("#"):
        color = "#" + color

    label = Label(project_id=project_id, name=name, color=color[:20])
    db.session.add(label)
    db.session.commit()
    return jsonify({"message": "Étiquette créée", "label": label.to_dict()}), 201


@labels_bp.route("/projects/<int:project_id>/labels/<int:label_id>", methods=["PUT"])
@jwt_required()
def update_label(project_id, label_id):
    user_id = int(get_jwt_identity())
    if not get_project_for_user(user_id, project_id):
        return jsonify({"error": "Accès refusé"}), 403
    if not can_edit_project(user_id, project_id):
        return jsonify({"error": "Le rôle observateur ne peut pas modifier d'étiquettes"}), 403

    label = Label.query.filter_by(id=label_id, project_id=project_id).first_or_404()
    data = request.get_json() or {}
    if "name" in data and (data.get("name") or "").strip():
        label.name = data["name"].strip()
    if "color" in data:
        c = (data.get("color") or "").strip()
        if c and not c.startswith("#"):
            c = "#" + c
        if c:
            label.color = c[:20]

    db.session.commit()
    return jsonify({"message": "Étiquette mise à jour", "label": label.to_dict()}), 200


@labels_bp.route("/projects/<int:project_id>/labels/<int:label_id>", methods=["DELETE"])
@jwt_required()
def delete_label(project_id, label_id):
    user_id = int(get_jwt_identity())
    if not get_project_for_user(user_id, project_id):
        return jsonify({"error": "Accès refusé"}), 403
    if not can_edit_project(user_id, project_id):
        return jsonify({"error": "Le rôle observateur ne peut pas supprimer d'étiquettes"}), 403

    label = Label.query.filter_by(id=label_id, project_id=project_id).first_or_404()
    db.session.delete(label)
    db.session.commit()
    return jsonify({"message": "Étiquette supprimée"}), 200
