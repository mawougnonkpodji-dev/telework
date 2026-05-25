"""
Routes d'invitation avec contrat PDF uploadé.

POST   /api/invitations/projects/<id>      — créer & envoyer (multipart/form-data)
GET    /api/invitations/projects/<id>      — lister (admin)
DELETE /api/invitations/<id>               — annuler (admin)
GET    /api/invitations/info/<token>       — infos publiques (sans JWT)
GET    /api/invitations/contract-pdf/<token> — télécharger le PDF (sans JWT)
POST   /api/invitations/accept/<token>     — accepter (JWT optionnel)
"""

import os
from datetime import datetime, timedelta

from flask import Blueprint, jsonify, request, current_app, make_response, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity, create_access_token, create_refresh_token

from app.extensions import db
from app.models import User, Project
from app.models.contract import Contract, ContractStatus
from app.models.invitation import Invitation, InvitationStatus
from app.models.project import project_members, MemberRole
from app.services.auth_service import hash_password, check_password
from app.services.email_service import send_invitation_email
from app.services.notification_service import send_notification
from app.utils.project_access import can_manage_project, get_project_for_user, is_project_member

invitations_bp = Blueprint("invitations", __name__)

_ROLE_LABELS = {
    "admin":       "Gestionnaire",
    "member":      "Membre",
    "observateur": "Observateur",
}

INVITATION_EXPIRES_DAYS = 7
PDF_MARKER = "PDF_CONTRACT"   # valeur de contract_content quand un PDF est stocké


def _contracts_dir():
    folder = os.path.join(current_app.config.get("UPLOAD_FOLDER", "uploads"),
                          "invitation_contracts")
    os.makedirs(folder, exist_ok=True)
    return folder


def _pdf_path(token: str) -> str:
    return os.path.join(_contracts_dir(), f"{token}.pdf")


def _signed_contracts_dir():
    folder = os.path.join(current_app.config.get("UPLOAD_FOLDER", "uploads"),
                          "signed_contracts")
    os.makedirs(folder, exist_ok=True)
    return folder


# ── Admin : créer & envoyer ───────────────────────────────────────────────────
@invitations_bp.route("/projects/<int:project_id>", methods=["POST"])
@jwt_required()
def create_invitation(project_id):
    user_id = int(get_jwt_identity())
    project = get_project_for_user(user_id, project_id)
    if not project:
        return jsonify({"error": "Accès refusé ou projet introuvable"}), 403
    if not can_manage_project(user_id, project_id):
        return jsonify({"error": "Seul un admin peut inviter des membres"}), 403

    # ── Lecture des champs (multipart/form-data OU JSON) ─────────────────────
    if request.content_type and "multipart" in request.content_type:
        invited_email  = (request.form.get("email")  or "").strip().lower()
        role_str       = (request.form.get("role")   or "member").strip()
        contract_title = (request.form.get("contract_title") or "").strip() or None
        pdf_file       = request.files.get("contract_pdf")
    else:
        body           = request.get_json() or {}
        invited_email  = (body.get("email")  or "").strip().lower()
        role_str       = (body.get("role")   or "member").strip()
        contract_title = (body.get("contract_title") or "").strip() or None
        pdf_file       = None

    if not invited_email:
        return jsonify({"error": "email est requis"}), 400

    try:
        role = MemberRole(role_str)
    except ValueError:
        return jsonify({"error": f"Rôle invalide : {role_str}"}), 400

    # Vérifie type MIME si fichier fourni
    if pdf_file and pdf_file.filename:
        if not pdf_file.filename.lower().endswith(".pdf"):
            return jsonify({"error": "Seuls les fichiers PDF sont acceptés"}), 400

    # Check doublon
    existing = Invitation.query.filter_by(
        project_id=project_id,
        invited_email=invited_email,
        status=InvitationStatus.pending,
    ).first()
    if existing and existing.is_valid():
        return jsonify({"error": "Une invitation en attente existe déjà pour cet email"}), 409

    existing_user = User.query.filter_by(email=invited_email).first()
    if existing_user and is_project_member(existing_user.id, project):
        return jsonify({"error": "Cet utilisateur est déjà membre du projet"}), 409

    inviter  = User.query.get(user_id)
    expires  = datetime.utcnow() + timedelta(days=INVITATION_EXPIRES_DAYS)
    inv_token = Invitation.generate_token()

    # Sauvegarde du PDF sur disque
    has_pdf = False
    if pdf_file and pdf_file.filename:
        pdf_file.save(_pdf_path(inv_token))
        has_pdf = True

    inv = Invitation(
        token            = inv_token,
        project_id       = project_id,
        invited_email    = invited_email,
        role             = role,
        invited_by_id    = user_id,
        contract_title   = contract_title or (f"Contrat — {project.name}" if has_pdf else None),
        contract_content = PDF_MARKER if has_pdf else None,
        status           = InvitationStatus.pending,
        expires_at       = expires,
    )
    db.session.add(inv)
    db.session.commit()

    # Build accept URL
    frontend_url = current_app.config.get("FRONTEND_URL", "http://localhost:5173").rstrip("/")
    accept_url   = f"{frontend_url}/invite/{inv.token}"

    # Lecture du PDF pour la pièce jointe email
    pdf_bytes = None
    if has_pdf:
        try:
            with open(_pdf_path(inv_token), "rb") as f:
                pdf_bytes = f.read()
        except OSError:
            pass

    email_sent = send_invitation_email(
        to_email       = invited_email,
        inviter_name   = inviter.name if inviter else "Un administrateur",
        project_name   = project.name,
        role_label     = role.value,
        accept_url     = accept_url,
        contract_title = inv.contract_title,
        pdf_bytes      = pdf_bytes,
    )

    return jsonify({
        "message":    "Invitation créée" + (" et email envoyé." if email_sent else
                      " (email non envoyé — SMTP non configuré)."),
        "invitation": inv.to_dict(),
        "accept_url": accept_url,
        "email_sent": email_sent,
    }), 201


# ── Admin : lister ────────────────────────────────────────────────────────────
@invitations_bp.route("/projects/<int:project_id>", methods=["GET"])
@jwt_required()
def list_invitations(project_id):
    user_id = int(get_jwt_identity())
    if not can_manage_project(user_id, project_id):
        return jsonify({"error": "Accès refusé"}), 403

    rows = (
        Invitation.query
        .filter_by(project_id=project_id)
        .order_by(Invitation.created_at.desc())
        .all()
    )
    return jsonify({"invitations": [r.to_dict() for r in rows]}), 200


# ── Admin : annuler ───────────────────────────────────────────────────────────
@invitations_bp.route("/<int:invitation_id>", methods=["DELETE"])
@jwt_required()
def cancel_invitation(invitation_id):
    user_id = int(get_jwt_identity())
    inv = Invitation.query.get_or_404(invitation_id)
    if not can_manage_project(user_id, inv.project_id):
        return jsonify({"error": "Accès refusé"}), 403
    if inv.status != InvitationStatus.pending:
        return jsonify({"error": "Seule une invitation en attente peut être annulée"}), 409

    inv.status = InvitationStatus.cancelled
    db.session.commit()
    return jsonify({"message": "Invitation annulée"}), 200


# ── Public : infos de l'invitation (sans JWT) ─────────────────────────────────
@invitations_bp.route("/info/<token>", methods=["GET"])
def invitation_info(token):
    inv = Invitation.query.filter_by(token=token).first()
    if not inv:
        return jsonify({"error": "Invitation introuvable"}), 404
    if not inv.is_valid():
        msg = {
            InvitationStatus.accepted:  "Cette invitation a déjà été acceptée.",
            InvitationStatus.cancelled: "Cette invitation a été annulée.",
            InvitationStatus.expired:   "Cette invitation a expiré.",
        }.get(inv.status, "Invitation invalide.")
        return jsonify({"error": msg}), 410

    project = Project.query.get(inv.project_id)
    inviter = User.query.get(inv.invited_by_id) if inv.invited_by_id else None

    has_pdf = (inv.contract_content == PDF_MARKER and
               os.path.exists(_pdf_path(inv.token)))

    return jsonify({
        "project_name":   project.name if project else "—",
        "inviter_name":   inviter.name if inviter else "Un administrateur",
        "invited_email":  inv.invited_email,
        "role":           inv.role.value,
        "role_label":     _ROLE_LABELS.get(inv.role.value, inv.role.value),
        "has_contract":   has_pdf,
        "contract_title": inv.contract_title,
        "expires_at":     inv.expires_at.isoformat(),
    }), 200


# ── PDF du contrat (public, sécurisé par token) ───────────────────────────────
@invitations_bp.route("/contract-pdf/<token>", methods=["GET"])
def invitation_contract_pdf(token):
    inv = Invitation.query.filter_by(token=token).first()
    if not inv:
        return jsonify({"error": "Invitation introuvable"}), 404

    path = _pdf_path(token)
    if not os.path.exists(path):
        return jsonify({"error": "Aucun contrat PDF associé à cette invitation"}), 404

    filename = (inv.contract_title or f"Contrat_{token[:8]}")[:80].replace("/", "-") + ".pdf"
    return send_file(
        path,
        mimetype="application/pdf",
        as_attachment=False,          # ouvre dans le navigateur
        download_name=filename,
    )


# ── Accepter l'invitation (JWT optionnel) ─────────────────────────────────────
@invitations_bp.route("/accept/<token>", methods=["POST"])
def accept_invitation(token):
    from flask_jwt_extended import decode_token
    from flask_jwt_extended.exceptions import JWTExtendedException
    from jwt.exceptions import PyJWTError

    authenticated_user_id = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        raw_token = auth_header.split(" ", 1)[1]
        try:
            decoded = decode_token(raw_token)
            authenticated_user_id = int(decoded["sub"])
        except (JWTExtendedException, PyJWTError, Exception):
            pass

    inv = Invitation.query.filter_by(token=token).first()
    if not inv:
        return jsonify({"error": "Invitation introuvable"}), 404
    if not inv.is_valid():
        return jsonify({"error": "Invitation expirée ou déjà utilisée"}), 410

    project = Project.query.get(inv.project_id)
    if not project:
        return jsonify({"error": "Projet introuvable"}), 404

    tokens_to_return = None

    if authenticated_user_id:
        user = User.query.get(authenticated_user_id)
        if not user:
            return jsonify({"error": "Utilisateur introuvable"}), 404
        new_account = False
    else:
        data     = request.get_json() or {}
        name     = (data.get("name")     or "").strip()
        email    = (data.get("email")    or "").strip().lower()
        password = (data.get("password") or "")

        if not email or not password:
            return jsonify({"error": "email et password sont requis"}), 400

        user = User.query.filter_by(email=email).first()
        if user:
            if not check_password(password, user.password):
                return jsonify({"error": "Mot de passe incorrect"}), 401
            new_account = False
        else:
            if not name:
                return jsonify({"error": "name est requis pour créer un compte"}), 400
            user = User(name=name, email=email, password=hash_password(password))
            db.session.add(user)
            db.session.flush()
            new_account = True

        tokens_to_return = {
            "access":  create_access_token(identity=str(user.id)),
            "refresh": create_refresh_token(identity=str(user.id)),
        }

    # ── Membership ────────────────────────────────────────────────────────────
    already_member = any(m.id == user.id for m in project.members)
    if not already_member and project.owner_id != user.id:
        db.session.execute(
            project_members.insert().values(
                user_id=user.id, project_id=project.id, role=inv.role,
            )
        )

    # ── Contrat signé : copier le PDF dans signed_contracts ──────────────────
    contract_id = None
    if inv.contract_content == PDF_MARKER and not already_member:
        contract_title = inv.contract_title or f"Contrat de travail — {project.name}"
        contract = Contract(
            project_id     = project.id,
            title          = contract_title[:200],
            content        = PDF_MARKER,          # marqueur, PDF stocké séparément
            created_by_id  = inv.invited_by_id,
            signee_user_id = user.id,
            status         = ContractStatus.signed,
            signed_at      = datetime.utcnow(),
        )
        db.session.add(contract)
        db.session.flush()
        contract_id = contract.id

        # Copie du PDF invitation → dossier contrats signés
        src = _pdf_path(inv.token)
        if os.path.exists(src):
            dst_dir = _signed_contracts_dir()
            import shutil
            shutil.copy2(src, os.path.join(dst_dir, f"{contract.id}.pdf"))

    # ── Marquer l'invitation ──────────────────────────────────────────────────
    inv.status = InvitationStatus.accepted
    db.session.commit()

    # ── Notifier l'invitant ───────────────────────────────────────────────────
    if inv.invited_by_id and inv.invited_by_id != user.id:
        send_notification(
            user_id    = inv.invited_by_id,
            title      = "Invitation acceptée ✓",
            content    = f"{user.name} a rejoint le projet « {project.name} ».",
            notif_type = "invitation_accepted",
            link       = f"/projects/{project.id}",
        )

    result = {
        "message":        f"Bienvenue dans « {project.name} » !",
        "project_id":     project.id,
        "project_name":   project.name,
        "new_account":    new_account,
        "already_member": already_member,
        "has_contract":   (contract_id is not None),
        "contract_id":    contract_id,
    }
    if tokens_to_return:
        result["tokens"] = tokens_to_return

    return jsonify(result), 201 if new_account else 200
