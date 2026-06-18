import os

from flask import Blueprint, request, jsonify, current_app, send_from_directory
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename
from app.extensions import db, limiter, socketio
from app.models import Project, User
from app.models.chat_attachment import ChatAttachment
from app.models.message import (
    Message,
    ChatChannel,
    DirectConversation,
    MessageMention,
    MessageReaction,
    _iso,
)
from app.utils.project_access import is_project_member
from app.utils.project_access import can_edit_project, can_manage_project
from sqlalchemy import func
from sqlalchemy.orm import joinedload
from app.services.attachment_service import save_uploaded_file_in_subdir, delete_stored_file
from app.services.notification_service import send_notification

messages_bp = Blueprint("messages", __name__)


def _upload_root():
    return os.path.abspath(current_app.config.get("UPLOAD_FOLDER", "uploads"))


# ─── CANAUX PROJET ────────────────────────────────────────────────────────────
@messages_bp.route("/channels/<int:project_id>", methods=["GET"])
@jwt_required()
def list_channels(project_id):
    user_id = int(get_jwt_identity())
    project = Project.query.get_or_404(project_id)
    if not is_project_member(user_id, project):
        return jsonify({"error": "Accès refusé"}), 403

    page = max(request.args.get("page", 1, type=int), 1)
    per_page = min(max(request.args.get("per_page", 50, type=int), 1), 100)
    rows = (
        ChatChannel.query.filter_by(project_id=project_id)
        .order_by(ChatChannel.created_at.asc())
        .paginate(page=page, per_page=per_page, error_out=False)
    )
    return jsonify(
        {
            "channels": [_format_channel(c) for c in rows.items],
            "pagination": {"page": page, "per_page": per_page, "total": rows.total, "pages": rows.pages},
        }
    ), 200


@messages_bp.route("/channels/<int:project_id>", methods=["POST"])
@jwt_required()
@limiter.limit("30 per hour")
def create_channel(project_id):
    user_id = int(get_jwt_identity())
    project = Project.query.get_or_404(project_id)
    if not is_project_member(user_id, project):
        return jsonify({"error": "Accès refusé"}), 403
    if not can_manage_project(user_id, project_id):
        return jsonify({"error": "Seul un admin peut créer un canal"}), 403

    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Le nom du canal est requis"}), 400

    existing = ChatChannel.query.filter_by(project_id=project_id, name=name).first()
    if existing:
        return jsonify({"error": "Un canal avec ce nom existe déjà"}), 409

    channel = ChatChannel(project_id=project_id, name=name, created_by_id=user_id)
    db.session.add(channel)
    db.session.commit()
    return jsonify(_format_channel(channel)), 201


# ─── SUPPRIMER UN CANAL ────────────────────────────────────────────────────────
@messages_bp.route("/channels/<int:project_id>/<int:channel_id>", methods=["DELETE"])
@jwt_required()
def delete_channel(project_id, channel_id):
    user_id = int(get_jwt_identity())
    project = Project.query.get_or_404(project_id)
    if not is_project_member(user_id, project):
        return jsonify({"error": "Accès refusé"}), 403
    if not can_manage_project(user_id, project_id):
        return jsonify({"error": "Seul un admin peut supprimer un canal"}), 403

    channel = ChatChannel.query.filter_by(id=channel_id, project_id=project_id).first_or_404()
    if channel.is_default:
        return jsonify({"error": "Le canal par défaut ne peut pas être supprimé"}), 400

    # Detach messages from this channel (don't delete messages)
    Message.query.filter_by(channel_id=channel_id).update({"channel_id": None})
    db.session.delete(channel)
    db.session.commit()
    return jsonify({"message": f"Canal #{channel.name} supprimé"}), 200


# ─── FICHIERS CHAT ─────────────────────────────────────────────────────────────
@messages_bp.route("/project/<int:project_id>/attachments", methods=["POST"])
@jwt_required()
@limiter.limit("30 per hour")
def upload_chat_attachment(project_id):
    user_id = int(get_jwt_identity())
    project = Project.query.get_or_404(project_id)
    if not is_project_member(user_id, project):
        return jsonify({"error": "Accès refusé"}), 403
    if not can_edit_project(user_id, project_id):
        return jsonify({"error": "Le rôle observateur ne peut pas envoyer de pièces jointes"}), 403

    if "file" not in request.files:
        return jsonify({"error": "Champ 'file' requis (multipart)"}), 400
    f = request.files["file"]
    message_id = request.form.get("message_id", type=int)
    if message_id:
        msg = Message.query.filter_by(id=message_id, project_id=project_id).first()
        if not msg:
            return jsonify({"error": "message_id invalide"}), 400

    root = _upload_root()
    max_bytes = int(current_app.config.get("MAX_UPLOAD_BYTES", 10 * 1024 * 1024))
    try:
        rel, orig_name, size, mime = save_uploaded_file_in_subdir(
            upload_folder=root,
            subdir=os.path.join("chat", str(project_id)),
            file_storage=f,
            max_bytes=max_bytes,
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    row = ChatAttachment(
        project_id=project_id,
        message_id=message_id,
        uploaded_by_id=user_id,
        original_filename=orig_name,
        stored_path=rel,
        mime_type=mime,
        size_bytes=size,
    )
    db.session.add(row)
    db.session.commit()
    return jsonify({"attachment": row.to_dict(download_path=f"/api/messages/attachments/{row.id}/file")}), 201


@messages_bp.route("/project/<int:project_id>/attachments", methods=["GET"])
@jwt_required()
def list_chat_attachments(project_id):
    user_id = int(get_jwt_identity())
    project = Project.query.get_or_404(project_id)
    if not is_project_member(user_id, project):
        return jsonify({"error": "Accès refusé"}), 403

    page = max(request.args.get("page", 1, type=int), 1)
    per_page = min(max(request.args.get("per_page", 50, type=int), 1), 100)
    rows = (
        ChatAttachment.query.filter_by(project_id=project_id)
        .order_by(ChatAttachment.created_at.desc())
        .paginate(page=page, per_page=per_page, error_out=False)
    )
    return jsonify(
        {
            "attachments": [r.to_dict(download_path=f"/api/messages/attachments/{r.id}/file") for r in rows.items],
            "pagination": {"page": page, "per_page": per_page, "total": rows.total, "pages": rows.pages},
        }
    ), 200


@messages_bp.route("/attachments/<int:attachment_id>/file", methods=["GET"])
@jwt_required()
def download_chat_attachment(attachment_id):
    user_id = int(get_jwt_identity())
    row = ChatAttachment.query.get_or_404(attachment_id)
    project = Project.query.get_or_404(row.project_id)
    if not is_project_member(user_id, project):
        return jsonify({"error": "Accès refusé"}), 403
    root = _upload_root()
    directory = os.path.dirname(os.path.join(root, row.stored_path))
    fname = os.path.basename(row.stored_path)
    return send_from_directory(
        directory,
        fname,
        as_attachment=True,
        download_name=secure_filename(row.original_filename) or "fichier",
        mimetype=row.mime_type or "application/octet-stream",
    )


@messages_bp.route("/attachments/<int:attachment_id>", methods=["DELETE"])
@jwt_required()
@limiter.limit("30 per hour")
def delete_chat_attachment(attachment_id):
    user_id = int(get_jwt_identity())
    row = ChatAttachment.query.get_or_404(attachment_id)
    project = Project.query.get_or_404(row.project_id)
    if not is_project_member(user_id, project):
        return jsonify({"error": "Accès refusé"}), 403
    if row.uploaded_by_id != user_id:
        return jsonify({"error": "Suppression autorisée uniquement pour l'uploader"}), 403
    delete_stored_file(_upload_root(), row.stored_path)
    db.session.delete(row)
    db.session.commit()
    return jsonify({"message": "Fichier chat supprimé"}), 200


# ─── RECHERCHE MESSAGES PROJET ────────────────────────────────────────────────
@messages_bp.route("/search/<int:project_id>", methods=["GET"])
@jwt_required()
@limiter.limit("120 per hour")
def search_project_messages(project_id):
    user_id = int(get_jwt_identity())
    project = Project.query.get_or_404(project_id)
    if not is_project_member(user_id, project):
        return jsonify({"error": "Accès refusé"}), 403

    query = (request.args.get("q") or "").strip()
    if len(query) < 2:
        return jsonify({"error": "q doit contenir au moins 2 caractères"}), 400

    page = request.args.get("page", 1, type=int)
    per_page = min(request.args.get("per_page", 50, type=int), 100)
    light = request.args.get("light", "false").lower() == "true"
    channel_id = request.args.get("channel_id", type=int)

    base_query = Message.query.filter(
        Message.project_id == project_id,
        Message.direct_conversation_id.is_(None),
    )
    if channel_id:
        channel = ChatChannel.query.filter_by(id=channel_id, project_id=project_id).first()
        if not channel:
            return jsonify({"error": "Canal introuvable"}), 404
        base_query = base_query.filter(Message.channel_id == channel_id)

    # PostgreSQL full-text si disponible, sinon fallback ILIKE.
    dialect_name = db.engine.dialect.name
    if dialect_name == "postgresql":
        ts_query = func.plainto_tsquery("simple", query)
        base_query = base_query.filter(
            func.to_tsvector("simple", func.coalesce(Message.content, "")).op("@@")(ts_query)
        )
    else:
        base_query = base_query.filter(Message.content.ilike(f"%{query}%"))

    rows = base_query.order_by(Message.created_at.desc()).paginate(page=page, per_page=per_page, error_out=False)
    return jsonify(
        {
            "query": query,
            "messages": [_format_message(m, light=light) for m in rows.items],
            "total": rows.total,
            "pages": rows.pages,
            "page": page,
        }
    ), 200


# ─── HISTORIQUE DES MESSAGES D'UN PROJET ─────────────────────────────────────
@messages_bp.route("/project/<int:project_id>", methods=["GET"])
@jwt_required()
def get_messages(project_id):
    user_id = int(get_jwt_identity())
    project = Project.query.get_or_404(project_id)

    if not is_project_member(user_id, project):
        return jsonify({"error": "Accès refusé"}), 403

    page = request.args.get("page", 1, type=int)
    per_page = min(max(request.args.get("per_page", 50, type=int), 1), 100)
    light = request.args.get("light", "false").lower() == "true"
    channel_id = request.args.get("channel_id", type=int)

    messages_query = Message.query.filter(
        Message.project_id == project_id, Message.direct_conversation_id.is_(None)
    ).options(joinedload(Message.sender))
    if channel_id:
        channel = ChatChannel.query.filter_by(id=channel_id, project_id=project_id).first()
        if not channel:
            return jsonify({"error": "Canal introuvable"}), 404
        messages_query = messages_query.filter(Message.channel_id == channel_id)
    else:
        messages_query = messages_query.filter(Message.channel_id.is_(None))

    messages = messages_query.order_by(Message.created_at.asc()).paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        "messages": [_format_message(m, light=light) for m in messages.items],
        "total": messages.total,
        "pages": messages.pages,
        "page": page,
        "per_page": per_page,
    }), 200


# ─── ENVOYER UN MESSAGE PROJET/CANAL ──────────────────────────────────────────
@messages_bp.route("/project/<int:project_id>", methods=["POST"])
@jwt_required()
@limiter.limit("120 per minute")
def post_project_message(project_id):
    user_id = int(get_jwt_identity())
    project = Project.query.get_or_404(project_id)
    if not is_project_member(user_id, project):
        return jsonify({"error": "Accès refusé"}), 403
    if not can_edit_project(user_id, project_id):
        return jsonify({"error": "Le rôle observateur ne peut pas envoyer de messages"}), 403

    data = request.get_json() or {}
    content = (data.get("content") or "").strip()
    channel_id = data.get("channel_id")
    mention_user_ids = data.get("mention_user_ids") or []

    if not content:
        return jsonify({"error": "Le contenu du message est requis"}), 400

    if channel_id:
        channel = ChatChannel.query.filter_by(id=channel_id, project_id=project_id).first()
        if not channel:
            return jsonify({"error": "Canal introuvable"}), 404

    message = Message(project_id=project_id, channel_id=channel_id, sender_id=user_id, content=content)
    db.session.add(message)
    db.session.flush()
    _create_mentions(message.id, project, mention_user_ids)
    db.session.commit()
    payload = _format_message(message)
    socketio.emit("new_message", payload, room=f"project_{project_id}")
    return jsonify(payload), 201


# ─── DM — liste des conversations ─────────────────────────────────────────────
@messages_bp.route("/dm/conversations", methods=["GET"])
@jwt_required()
def list_dm_conversations():
    """Return all DM conversations for the current user, sorted by most recent
    message, with the other participant's info and a last-message preview."""
    from sqlalchemy import or_, desc as sa_desc

    user_id = int(get_jwt_identity())

    conversations = (
        DirectConversation.query
        .filter(
            or_(
                DirectConversation.user_one_id == user_id,
                DirectConversation.user_two_id == user_id,
            )
        )
        .all()
    )

    result = []
    for conv in conversations:
        other_id = conv.user_two_id if conv.user_one_id == user_id else conv.user_one_id
        other_user = User.query.get(other_id)
        if not other_user:
            continue

        last_msg = (
            Message.query
            .filter_by(direct_conversation_id=conv.id)
            .order_by(Message.created_at.desc())
            .first()
        )

        result.append({
            "conversation_id": conv.id,
            "other_user": {
                "id": other_user.id,
                "name": other_user.name,
                "email": other_user.email,
                "avatar": other_user.avatar,
            },
            "last_message": {
                "content": last_msg.content if last_msg else None,
                "created_at": _iso(last_msg.created_at) if last_msg else None,
                "sender_id": last_msg.sender_id if last_msg else None,
            } if last_msg else None,
        })

    # Sort: conversations with messages first (most recent), then others
    result.sort(
        key=lambda c: c["last_message"]["created_at"] if c["last_message"] else "",
        reverse=True,
    )

    return jsonify({"conversations": result}), 200


# ─── DM ────────────────────────────────────────────────────────────────────────
@messages_bp.route("/dm/<int:target_user_id>", methods=["GET"])
@jwt_required()
def get_dm_messages(target_user_id):
    user_id = int(get_jwt_identity())
    if user_id == target_user_id:
        return jsonify({"error": "Conversation invalide"}), 400

    target_user = User.query.get_or_404(target_user_id)
    conversation = _get_or_create_dm_conversation(user_id, target_user.id, create=False)
    if not conversation:
        return jsonify({"messages": [], "total": 0}), 200

    page = request.args.get("page", 1, type=int)
    per_page = min(max(request.args.get("per_page", 50, type=int), 1), 100)
    light = request.args.get("light", "false").lower() == "true"
    messages = Message.query.filter_by(direct_conversation_id=conversation.id).order_by(Message.created_at.asc()).paginate(
        page=page, per_page=per_page, error_out=False
    )
    return jsonify(
        {
            "conversation_id": conversation.id,
            "messages": [_format_message(m, light=light) for m in messages.items],
            "total": messages.total,
            "pages": messages.pages,
            "page": page,
            "per_page": per_page,
        }
    ), 200


@messages_bp.route("/dm/<int:target_user_id>", methods=["POST"])
@jwt_required()
@limiter.limit("60 per minute")
def send_dm_message(target_user_id):
    user_id = int(get_jwt_identity())
    if user_id == target_user_id:
        return jsonify({"error": "Conversation invalide"}), 400
    target_user = User.query.get_or_404(target_user_id)

    data = request.get_json() or {}
    content = (data.get("content") or "").strip()
    if not content:
        return jsonify({"error": "Le contenu du message est requis"}), 400

    conversation = _get_or_create_dm_conversation(user_id, target_user.id, create=True)
    message = Message(direct_conversation_id=conversation.id, sender_id=user_id, content=content)
    db.session.add(message)
    db.session.flush()

    # Read sender name while objects are still attached
    sender = User.query.get(user_id)
    sender_name = sender.name if sender else "Quelqu'un"

    db.session.commit()

    payload = _format_message(message)
    socketio.emit("new_dm_message", payload, room=f"user_{target_user_id}")

    # Notify recipient
    send_notification(
        user_id=target_user_id,
        title=f"Message de {sender_name}",
        content=content[:80] + ("…" if len(content) > 80 else ""),
        notif_type="dm_received",
        link=f"/messages/dm/{user_id}",
    )

    return jsonify(payload), 201


# ─── RÉACTIONS ─────────────────────────────────────────────────────────────────
@messages_bp.route("/<int:message_id>/reactions", methods=["POST"])
@jwt_required()
@limiter.limit("120 per minute")
def add_reaction(message_id):
    user_id = int(get_jwt_identity())
    message = Message.query.get_or_404(message_id)
    if not _can_access_message(user_id, message):
        return jsonify({"error": "Accès refusé"}), 403

    data = request.get_json() or {}
    emoji = (data.get("emoji") or "").strip()
    if not emoji:
        return jsonify({"error": "emoji est requis"}), 400

    existing = MessageReaction.query.filter_by(message_id=message_id, user_id=user_id, emoji=emoji).first()
    if existing:
        return jsonify({"error": "Réaction déjà ajoutée"}), 409

    reaction = MessageReaction(message_id=message_id, user_id=user_id, emoji=emoji)
    db.session.add(reaction)
    db.session.commit()
    return jsonify({"message": "Réaction ajoutée"}), 201


@messages_bp.route("/<int:message_id>/reactions", methods=["DELETE"])
@jwt_required()
@limiter.limit("120 per minute")
def remove_reaction(message_id):
    user_id = int(get_jwt_identity())
    message = Message.query.get_or_404(message_id)
    if not _can_access_message(user_id, message):
        return jsonify({"error": "Accès refusé"}), 403

    data = request.get_json() or {}
    emoji = (data.get("emoji") or "").strip()
    if not emoji:
        return jsonify({"error": "emoji est requis"}), 400

    reaction = MessageReaction.query.filter_by(message_id=message_id, user_id=user_id, emoji=emoji).first()
    if not reaction:
        return jsonify({"error": "Réaction introuvable"}), 404

    db.session.delete(reaction)
    db.session.commit()
    return jsonify({"message": "Réaction supprimée"}), 200


# ─── SUPPRIMER UN MESSAGE ─────────────────────────────────────────────────────
@messages_bp.route("/<int:message_id>", methods=["DELETE"])
@jwt_required()
@limiter.limit("60 per minute")
def delete_message(message_id):
    user_id = int(get_jwt_identity())
    message = Message.query.get_or_404(message_id)

    if message.sender_id != user_id:
        return jsonify({"error": "Vous ne pouvez supprimer que vos propres messages"}), 403

    db.session.delete(message)
    db.session.commit()
    return jsonify({"message": "Message supprimé"}), 200


# ─── HELPER ───────────────────────────────────────────────────────────────────
def _format_channel(channel):
    return {
        "id": channel.id,
        "project_id": channel.project_id,
        "name": channel.name,
        "is_default": channel.is_default,
        "created_by_id": channel.created_by_id,
        "created_at": _iso(channel.created_at),
    }


def _format_message(m, light=False):
    base = {
        "id": m.id,
        "content": m.content,
        "project_id": m.project_id,
        "channel_id": m.channel_id,
        "direct_conversation_id": m.direct_conversation_id,
        "created_at": _iso(m.created_at)
    }
    if light:
        base["sender_id"] = m.sender.id if m.sender else None
        return base
    base.update({
        "sender": {
            "id": m.sender.id,
            "name": m.sender.name,
            "avatar": m.sender.avatar
        },
        "mentions": [{"id": x.user.id, "name": x.user.name, "avatar": x.user.avatar} for x in m.mentions],
        "reactions": [{"emoji": x.emoji, "user_id": x.user_id} for x in m.reactions],
    })
    return base


def _create_mentions(message_id, project, mention_user_ids):
    if not mention_user_ids:
        return
    member_ids = {m.id for m in project.members}
    valid_ids = {int(uid) for uid in mention_user_ids if int(uid) in member_ids}
    for uid in valid_ids:
        db.session.add(MessageMention(message_id=message_id, user_id=uid))


def _get_or_create_dm_conversation(user_a, user_b, create=True):
    u1, u2 = sorted([int(user_a), int(user_b)])
    conversation = DirectConversation.query.filter_by(user_one_id=u1, user_two_id=u2).first()
    if conversation or not create:
        return conversation

    conversation = DirectConversation(user_one_id=u1, user_two_id=u2)
    db.session.add(conversation)
    db.session.flush()
    return conversation


def _can_access_message(user_id, message):
    if message.direct_conversation_id:
        conv = message.direct_conversation
        return user_id in {conv.user_one_id, conv.user_two_id}
    if not message.project_id:
        return False
    project = Project.query.get(message.project_id)
    return is_project_member(user_id, project)