import json
import random
import re
from datetime import datetime
from decimal import Decimal, InvalidOperation

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.extensions import db
from app.models import MobileMoneyTransaction
from app.models.mobile_money import MobileMoneyTransactionStatus
from app.services.audit_service import log_business_event
from app.utils.project_access import can_manage_project, get_project_for_user

mobile_money_bp = Blueprint("mobile_money", __name__)
ALLOWED_CURRENCIES = {"XOF", "XAF", "USD", "EUR"}
ALLOWED_PROVIDERS = {"SIMULATED_MOMO", "MTN_MOMO", "ORANGE_MONEY", "WAVE"}
MAX_AMOUNT = Decimal("100000000")
PHONE_RE = re.compile(r"^\+?[0-9]{8,15}$")


def _resolve_simulated_result(mode: str) -> str:
    if mode == "success":
        return "success"
    if mode == "failed":
        return "failed"
    return random.choice(["success", "failed"])


@mobile_money_bp.route("/projects/<int:project_id>/transactions", methods=["GET"])
@jwt_required()
def list_transactions(project_id):
    user_id = int(get_jwt_identity())
    if not get_project_for_user(user_id, project_id):
        return jsonify({"error": "Accès refusé"}), 403

    page = max(request.args.get("page", 1, type=int), 1)
    per_page = min(max(request.args.get("per_page", 50, type=int), 1), 100)
    rows = (
        MobileMoneyTransaction.query.filter_by(project_id=project_id)
        .order_by(MobileMoneyTransaction.created_at.desc())
        .paginate(page=page, per_page=per_page, error_out=False)
    )
    return jsonify(
        {
            "transactions": [r.to_dict() for r in rows.items],
            "pagination": {"page": page, "per_page": per_page, "total": rows.total, "pages": rows.pages},
        }
    ), 200


@mobile_money_bp.route("/projects/<int:project_id>/transactions", methods=["POST"])
@jwt_required()
def create_transaction(project_id):
    user_id = int(get_jwt_identity())
    if not get_project_for_user(user_id, project_id):
        return jsonify({"error": "Accès refusé"}), 403
    if not can_manage_project(user_id, project_id):
        return jsonify({"error": "Seul un admin peut initier un paiement Mobile Money"}), 403

    data = request.get_json() or {}
    try:
        amount_decimal = Decimal(str(data.get("amount", 0)))
    except (TypeError, ValueError, InvalidOperation):
        return jsonify({"error": "amount invalide"}), 400
    if amount_decimal <= 0 or amount_decimal > MAX_AMOUNT:
        return jsonify({"error": f"amount doit être > 0 et <= {MAX_AMOUNT}"}), 400
    if amount_decimal.as_tuple().exponent < -2:
        return jsonify({"error": "amount doit avoir au plus 2 décimales"}), 400

    currency = (data.get("currency") or "XOF").strip().upper()[:10]
    if currency not in ALLOWED_CURRENCIES:
        return jsonify({"error": f"currency invalide. Valeurs: {', '.join(sorted(ALLOWED_CURRENCIES))}"}), 400

    provider = (data.get("provider") or "SIMULATED_MOMO").strip().upper()[:30]
    if provider not in ALLOWED_PROVIDERS:
        return jsonify({"error": f"provider invalide. Valeurs: {', '.join(sorted(ALLOWED_PROVIDERS))}"}), 400

    phone_number = (data.get("phone_number") or "").strip()[:30] or None
    if phone_number and not PHONE_RE.match(phone_number):
        return jsonify({"error": "phone_number invalide (format attendu: +XXXXXXXX ou XXXXXXXXX)"}), 400

    beneficiary_user_id = data.get("beneficiary_user_id")
    if beneficiary_user_id is not None:
        project = get_project_for_user(user_id, project_id)
        if not any(m.id == int(beneficiary_user_id) for m in project.members):
            return jsonify({"error": "beneficiary_user_id doit être membre du projet"}), 400

    metadata_raw = data.get("metadata", {})
    try:
        metadata_json = json.dumps(metadata_raw)
    except (TypeError, ValueError):
        return jsonify({"error": "metadata invalide (doit être sérialisable JSON)"}), 400
    if len(metadata_json) > 4000:
        return jsonify({"error": "metadata trop volumineux (max 4000 caractères JSON)"}), 400

    simulated_result = (data.get("simulated_result") or "random").strip().lower()
    if simulated_result not in {"success", "failed", "random"}:
        return jsonify({"error": "simulated_result doit être success, failed ou random"}), 400

    tx = MobileMoneyTransaction(
        project_id=project_id,
        initiated_by_id=user_id,
        beneficiary_user_id=beneficiary_user_id,
        amount=float(amount_decimal),
        currency=currency,
        provider=provider,
        phone_number=phone_number,
        simulated_result=simulated_result,
        external_reference=f"MM-{project_id}-{int(datetime.utcnow().timestamp() * 1000)}-{random.randint(1000, 9999)}",
        metadata_json=metadata_json,
    )
    db.session.add(tx)
    db.session.flush()

    resolved = _resolve_simulated_result(simulated_result)
    tx.status = (
        MobileMoneyTransactionStatus.success
        if resolved == "success"
        else MobileMoneyTransactionStatus.failed
    )
    tx.failure_reason = None if resolved == "success" else "Simulation d'échec Mobile Money"
    tx.processed_at = datetime.utcnow()

    db.session.commit()
    log_business_event(
        user_id=user_id,
        action="mobile_money_transaction_created",
        path=f"/api/mobile-money/projects/{project_id}/transactions",
        endpoint="mobile_money.create_transaction",
        status_code=201,
    )
    return jsonify({"message": "Transaction Mobile Money simulée", "transaction": tx.to_dict()}), 201

