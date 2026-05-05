from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import func

from app.extensions import db
from app.models import Task
from app.models.board_column import ProjectBoardColumn
from app.models.task import TaskStatus
from app.services.board_service import seed_default_board
from app.utils.project_access import get_project_for_user, can_edit_project

board_bp = Blueprint("board", __name__)


@board_bp.route("/<int:project_id>/board/columns", methods=["GET"])
@jwt_required()
def list_board_columns(project_id):
    user_id = int(get_jwt_identity())
    if not get_project_for_user(user_id, project_id):
        return jsonify({"error": "Accès refusé"}), 403

    seed_default_board(project_id)
    db.session.commit()

    rows = (
        ProjectBoardColumn.query.filter_by(project_id=project_id)
        .order_by(ProjectBoardColumn.position, ProjectBoardColumn.id)
        .all()
    )
    return jsonify({"columns": [c.to_dict() for c in rows]}), 200


@board_bp.route("/<int:project_id>/board/columns", methods=["POST"])
@jwt_required()
def create_board_column(project_id):
    user_id = int(get_jwt_identity())
    if not get_project_for_user(user_id, project_id):
        return jsonify({"error": "Accès refusé"}), 403
    if not can_edit_project(user_id, project_id):
        return jsonify({"error": "Le rôle observateur ne peut pas modifier le tableau"}), 403

    data = request.get_json() or {}
    title = (data.get("title") or "").strip()
    if not title:
        return jsonify({"error": "title est requis"}), 400

    try:
        maps_to = TaskStatus(data.get("maps_to_status", "assigned"))
    except ValueError:
        return jsonify({"error": "maps_to_status invalide"}), 400

    color = (data.get("color") or "#6B7280").strip()
    if not color.startswith("#"):
        color = "#" + color

    max_pos = db.session.query(func.max(ProjectBoardColumn.position)).filter_by(project_id=project_id).scalar()
    position = data.get("position")
    if position is None:
        position = (max_pos or -1) + 1

    col = ProjectBoardColumn(
        project_id=project_id,
        title=title[:120],
        position=int(position),
        color=color[:20],
        maps_to_status=maps_to,
    )
    db.session.add(col)
    db.session.commit()
    return jsonify({"message": "Colonne créée", "column": col.to_dict()}), 201


@board_bp.route("/<int:project_id>/board/columns/<int:column_id>", methods=["PUT"])
@jwt_required()
def update_board_column(project_id, column_id):
    user_id = int(get_jwt_identity())
    if not get_project_for_user(user_id, project_id):
        return jsonify({"error": "Accès refusé"}), 403
    if not can_edit_project(user_id, project_id):
        return jsonify({"error": "Le rôle observateur ne peut pas modifier le tableau"}), 403

    col = ProjectBoardColumn.query.filter_by(id=column_id, project_id=project_id).first_or_404()
    data = request.get_json() or {}

    if "title" in data and (data.get("title") or "").strip():
        col.title = data["title"].strip()[:120]
    if "color" in data:
        c = (data.get("color") or "").strip()
        if c:
            if not c.startswith("#"):
                c = "#" + c
            col.color = c[:20]
    if "maps_to_status" in data:
        try:
            col.maps_to_status = TaskStatus(data["maps_to_status"])
        except ValueError:
            return jsonify({"error": "maps_to_status invalide"}), 400
    if "position" in data:
        col.position = int(data["position"])

    db.session.commit()
    return jsonify({"message": "Colonne mise à jour", "column": col.to_dict()}), 200


@board_bp.route("/<int:project_id>/board/columns/reorder", methods=["PUT"])
@jwt_required()
def reorder_board_columns(project_id):
    user_id = int(get_jwt_identity())
    if not get_project_for_user(user_id, project_id):
        return jsonify({"error": "Accès refusé"}), 403
    if not can_edit_project(user_id, project_id):
        return jsonify({"error": "Le rôle observateur ne peut pas modifier le tableau"}), 403

    data = request.get_json() or {}
    ids = data.get("column_ids") or []
    if not isinstance(ids, list) or not ids:
        return jsonify({"error": "column_ids (liste d'ids) est requis"}), 400

    existing = {
        c.id
        for c in ProjectBoardColumn.query.filter_by(project_id=project_id).all()
    }
    if set(ids) != existing:
        return jsonify({"error": "La liste doit contenir exactement toutes les colonnes du projet"}), 400

    for pos, cid in enumerate(ids):
        ProjectBoardColumn.query.filter_by(id=cid, project_id=project_id).update({"position": pos})
    db.session.commit()

    rows = (
        ProjectBoardColumn.query.filter_by(project_id=project_id)
        .order_by(ProjectBoardColumn.position, ProjectBoardColumn.id)
        .all()
    )
    return jsonify({"columns": [c.to_dict() for c in rows]}), 200


@board_bp.route("/<int:project_id>/board/columns/<int:column_id>", methods=["DELETE"])
@jwt_required()
def delete_board_column(project_id, column_id):
    user_id = int(get_jwt_identity())
    if not get_project_for_user(user_id, project_id):
        return jsonify({"error": "Accès refusé"}), 403
    if not can_edit_project(user_id, project_id):
        return jsonify({"error": "Le rôle observateur ne peut pas modifier le tableau"}), 403

    col = ProjectBoardColumn.query.filter_by(id=column_id, project_id=project_id).first_or_404()
    move_to = request.args.get("move_to_column_id", type=int)

    pending = Task.query.filter_by(column_id=column_id).count()
    if pending:
        if not move_to or move_to == column_id:
            return (
                jsonify(
                    {
                        "error": "Des tâches utilisent cette colonne. Passez move_to_column_id en query.",
                        "task_count": pending,
                    }
                ),
                400,
            )
        target = ProjectBoardColumn.query.filter_by(id=move_to, project_id=project_id).first()
        if not target:
            return jsonify({"error": "Colonne de destination invalide"}), 400
        Task.query.filter_by(column_id=column_id).update(
            {"column_id": move_to, "status": target.maps_to_status},
            synchronize_session=False,
        )

    db.session.delete(col)
    db.session.commit()
    return jsonify({"message": "Colonne supprimée"}), 200
