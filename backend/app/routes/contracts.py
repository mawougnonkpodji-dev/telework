from datetime import datetime

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.extensions import db
from app.models import Contract
from app.models.contract import ContractStatus
from app.services.audit_service import log_business_event
from app.utils.project_access import can_manage_project, get_project_for_user

contracts_bp = Blueprint("contracts", __name__)

MAX_CONTRACT_TITLE_LEN = 200
MAX_CONTRACT_CONTENT_LEN = 20000
MAX_REJECTION_REASON_LEN = 255


def _can_view_contract_content(user_id: int, row: Contract) -> bool:
    if can_manage_project(user_id, row.project_id):
        return True
    if row.created_by_id == user_id:
        return True
    if row.signee_user_id == user_id:
        return True
    return False


def _serialize_contract_for_user(user_id: int, row: Contract):
    data = row.to_dict()
    if not _can_view_contract_content(user_id, row):
        data["content"] = None
    return data


@contracts_bp.route("/projects/<int:project_id>", methods=["GET"])
@jwt_required()
def list_contracts(project_id):
    user_id = int(get_jwt_identity())
    if not get_project_for_user(user_id, project_id):
        return jsonify({"error": "Accès refusé"}), 403
    page = max(request.args.get("page", 1, type=int), 1)
    per_page = min(max(request.args.get("per_page", 50, type=int), 1), 100)
    rows = (
        Contract.query.filter_by(project_id=project_id)
        .order_by(Contract.created_at.desc())
        .paginate(page=page, per_page=per_page, error_out=False)
    )
    return jsonify(
        {
            "contracts": [_serialize_contract_for_user(user_id, r) for r in rows.items],
            "pagination": {"page": page, "per_page": per_page, "total": rows.total, "pages": rows.pages},
        }
    ), 200


@contracts_bp.route("/projects/<int:project_id>", methods=["POST"])
@jwt_required()
def create_contract(project_id):
    user_id = int(get_jwt_identity())
    project = get_project_for_user(user_id, project_id)
    if not project:
        return jsonify({"error": "Accès refusé"}), 403
    if not can_manage_project(user_id, project_id):
        return jsonify({"error": "Seul un admin peut créer un contrat"}), 403

    data = request.get_json() or {}
    title = (data.get("title") or "").strip()
    content = (data.get("content") or "").strip()
    if not title or not content:
        return jsonify({"error": "title et content sont requis"}), 400
    if len(title) > MAX_CONTRACT_TITLE_LEN:
        return jsonify({"error": f"title trop long (max {MAX_CONTRACT_TITLE_LEN})"}), 400
    if len(content) > MAX_CONTRACT_CONTENT_LEN:
        return jsonify({"error": f"content trop long (max {MAX_CONTRACT_CONTENT_LEN})"}), 400

    signee_user_id = data.get("signee_user_id")
    if signee_user_id is not None and not any(m.id == int(signee_user_id) for m in project.members):
        return jsonify({"error": "signee_user_id doit être un membre du projet"}), 400

    row = Contract(
        project_id=project_id,
        title=title[:200],
        content=content,
        created_by_id=user_id,
        signee_user_id=signee_user_id,
    )
    db.session.add(row)
    db.session.commit()
    log_business_event(
        user_id=user_id,
        action="contract_created",
        path=f"/api/contracts/projects/{project_id}",
        endpoint="contracts.create_contract",
        status_code=201,
    )
    return jsonify({"message": "Contrat créé", "contract": row.to_dict()}), 201


@contracts_bp.route("/<int:contract_id>", methods=["GET"])
@jwt_required()
def get_contract(contract_id):
    user_id = int(get_jwt_identity())
    row = Contract.query.get_or_404(contract_id)
    if not get_project_for_user(user_id, row.project_id):
        return jsonify({"error": "Accès refusé"}), 403
    return jsonify({"contract": _serialize_contract_for_user(user_id, row)}), 200


@contracts_bp.route("/<int:contract_id>/send", methods=["PUT"])
@jwt_required()
def send_contract(contract_id):
    user_id = int(get_jwt_identity())
    row = Contract.query.get_or_404(contract_id)
    if not get_project_for_user(user_id, row.project_id):
        return jsonify({"error": "Accès refusé"}), 403
    if not can_manage_project(user_id, row.project_id):
        return jsonify({"error": "Seul un admin peut envoyer un contrat"}), 403
    if row.status != ContractStatus.draft:
        return jsonify({"error": "Seul un contrat en brouillon peut être envoyé"}), 409

    if not row.signee_user_id:
        return jsonify({"error": "Un contrat doit avoir un signataire avant envoi"}), 400
    row.status = ContractStatus.sent
    db.session.commit()
    log_business_event(
        user_id=user_id,
        action="contract_sent",
        path=f"/api/contracts/{contract_id}/send",
        endpoint="contracts.send_contract",
        status_code=200,
    )
    return jsonify({"message": "Contrat envoyé", "contract": row.to_dict()}), 200


@contracts_bp.route("/<int:contract_id>/sign", methods=["PUT"])
@jwt_required()
def sign_contract(contract_id):
    user_id = int(get_jwt_identity())
    row = Contract.query.get_or_404(contract_id)
    if not get_project_for_user(user_id, row.project_id):
        return jsonify({"error": "Accès refusé"}), 403
    if row.status != ContractStatus.sent:
        return jsonify({"error": "Le contrat doit être en statut sent pour être signé"}), 409
    if row.signee_user_id and row.signee_user_id != user_id and not can_manage_project(user_id, row.project_id):
        return jsonify({"error": "Seul le signataire désigné peut signer ce contrat"}), 403

    row.status = ContractStatus.signed
    row.signed_at = datetime.utcnow()
    row.rejected_at = None
    row.rejection_reason = None
    db.session.commit()
    log_business_event(
        user_id=user_id,
        action="contract_signed",
        path=f"/api/contracts/{contract_id}/sign",
        endpoint="contracts.sign_contract",
        status_code=200,
    )
    return jsonify({"message": "Contrat signé", "contract": row.to_dict()}), 200


@contracts_bp.route("/<int:contract_id>/reject", methods=["PUT"])
@jwt_required()
def reject_contract(contract_id):
    user_id = int(get_jwt_identity())
    row = Contract.query.get_or_404(contract_id)
    if not get_project_for_user(user_id, row.project_id):
        return jsonify({"error": "Accès refusé"}), 403
    if row.status != ContractStatus.sent:
        return jsonify({"error": "Le contrat doit être en statut sent pour être rejeté"}), 409
    if row.signee_user_id and row.signee_user_id != user_id and not can_manage_project(user_id, row.project_id):
        return jsonify({"error": "Seul le signataire désigné peut rejeter ce contrat"}), 403

    reason = (request.get_json() or {}).get("reason")
    reason = (reason or "Contrat rejeté").strip()
    if len(reason) > MAX_REJECTION_REASON_LEN:
        return jsonify({"error": f"reason trop long (max {MAX_REJECTION_REASON_LEN})"}), 400
    row.status = ContractStatus.rejected
    row.rejected_at = datetime.utcnow()
    row.rejection_reason = reason
    db.session.commit()
    log_business_event(
        user_id=user_id,
        action="contract_rejected",
        path=f"/api/contracts/{contract_id}/reject",
        endpoint="contracts.reject_contract",
        status_code=200,
    )
    return jsonify({"message": "Contrat rejeté", "contract": row.to_dict()}), 200
