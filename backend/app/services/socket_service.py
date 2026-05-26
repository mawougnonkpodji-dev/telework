from flask import request
from flask_socketio import emit, join_room, leave_room
from flask_jwt_extended import decode_token
from app.extensions import db
from app.models import User
from app.models.message import Message, ChatChannel, DirectConversation, MessageMention
from app.models import Project
from app.services.notification_service import send_notification

# ── Suivi des connexions en temps réel ──────────────────────────────────────
# sid  → user_id
_sid_to_uid: dict[str, int] = {}
# user_id → ensemble de SIDs (plusieurs onglets possibles)
_uid_sids: dict[int, set] = {}
# user_id → ensemble de project_ids rejoints
_uid_projects: dict[int, set] = {}


def _add_sid(user_id: int, sid: str):
    _sid_to_uid[sid] = user_id
    _uid_sids.setdefault(user_id, set()).add(sid)


def _remove_sid(sid: str):
    """Retire un SID ; retourne (user_id, still_online) ou (None, False)."""
    uid = _sid_to_uid.pop(sid, None)
    if uid is None:
        return None, False
    sids = _uid_sids.get(uid, set())
    sids.discard(sid)
    if not sids:
        _uid_sids.pop(uid, None)
        return uid, False   # plus aucun onglet
    return uid, True        # d'autres onglets actifs


def _online_user_ids_for_project(project_id: int) -> list[int]:
    """Renvoie la liste des user_ids actuellement connectés dans ce projet."""
    return [
        uid for uid, projs in _uid_projects.items()
        if project_id in projs and uid in _uid_sids
    ]


def register_socket_events(socketio):

    # ─── CONNEXION ────────────────────────────────────────────────────────────
    @socketio.on("connect")
    def on_connect(auth):
        """Vérifie le token JWT à la connexion"""
        if not auth or not auth.get("token"):
            return False  # Refuse la connexion

        try:
            decoded = decode_token(auth["token"])
            user_id = int(decoded["sub"])
            user = User.query.get(user_id)
            if not user:
                return False
            join_room(f"user_{user_id}")
            _add_sid(user_id, request.sid)
            print(f"[socket] {user.name} connecte (sid={request.sid})")
        except Exception as e:
            print(f"[socket] connexion refusee: {e}")
            return False


    # ─── REJOINDRE UN PROJET (room) ───────────────────────────────────────────
    @socketio.on("join_project")
    def on_join(data):
        """L'utilisateur rejoint la room du projet pour recevoir les messages"""
        project_id = data.get("project_id")
        if not project_id:
            return

        room = f"project_{project_id}"
        join_room(room)

        # ── Identifier l'utilisateur via le token (plus fiable que request.sid) ──
        uid = None
        token = data.get("token")
        if token:
            try:
                decoded = decode_token(token)
                uid = int(decoded["sub"])
                # Mettre à jour le mapping SID→uid ici aussi (double sécurité)
                _add_sid(uid, request.sid)
            except Exception:
                pass
        if uid is None:
            # Fallback sur le mapping établi dans on_connect
            uid = _sid_to_uid.get(request.sid)

        online_ids = _online_user_ids_for_project(project_id)
        print(f"[socket] join_project: uid={uid} projet={project_id} en_ligne={online_ids}")

        if uid is not None:
            _uid_projects.setdefault(uid, set()).add(project_id)
            online_ids = _online_user_ids_for_project(project_id)  # re-calc après ajout
            # Envoyer au nouveau venu la liste complète des membres en ligne
            emit("online_in_project", {
                "project_id": project_id,
                "online_user_ids": online_ids,
            })
            # Notifier les autres membres que cet utilisateur est en ligne
            emit("user_online", {"user_id": uid, "project_id": project_id},
                 to=room, include_self=False)
        else:
            # Même sans uid, envoyer la liste partielle (peut être vide)
            emit("online_in_project", {
                "project_id": project_id,
                "online_user_ids": online_ids,
            })

        emit("system_message", {"message": f"Vous avez rejoint le projet #{project_id}"})


    # ─── QUITTER UN PROJET ────────────────────────────────────────────────────
    @socketio.on("leave_project")
    def on_leave(data):
        project_id = data.get("project_id")
        if not project_id:
            return

        room = f"project_{project_id}"
        leave_room(room)

        # Mettre à jour le suivi de présence
        uid = None
        token = data.get("token")
        if token:
            try:
                uid = int(decode_token(token)["sub"])
            except Exception:
                pass
        if uid is None:
            uid = _sid_to_uid.get(request.sid)
        if uid is not None:
            _uid_projects.get(uid, set()).discard(project_id)
            emit("user_offline", {"user_id": uid, "project_id": project_id}, to=room)

        emit("system_message", {
            "message": f"Vous avez quitté le projet #{project_id}"
        })


    # ─── ENVOYER UN MESSAGE ───────────────────────────────────────────────────
    @socketio.on("send_message")
    def on_message(data):
        """Reçoit un message, le sauvegarde en BDD et le broadcast à la room"""
        token      = data.get("token")
        project_id = data.get("project_id")
        content    = data.get("content", "").strip()

        if not token or not project_id or not content:
            emit("error", {"message": "Données manquantes"})
            return

        try:
            decoded = decode_token(token)
            user_id = int(decoded["sub"])
            user    = User.query.get(user_id)

            # Vérifier que l'utilisateur est membre du projet
            project = Project.query.get(project_id)
            if not project or not any(m.id == user_id for m in project.members):
                emit("error", {"message": "Accès refusé"})
                return

            channel_id = data.get("channel_id")
            if channel_id:
                channel = ChatChannel.query.filter_by(id=channel_id, project_id=project_id).first()
                if not channel:
                    emit("error", {"message": "Canal introuvable"})
                    return

            # Sauvegarder le message en BDD
            message = Message(
                project_id = project_id,
                channel_id = channel_id,
                sender_id  = user_id,
                content    = content
            )
            db.session.add(message)
            db.session.flush()

            mention_user_ids = data.get("mention_user_ids") or []
            member_ids = {m.id for m in project.members}
            for uid in mention_user_ids:
                try:
                    target_id = int(uid)
                except (TypeError, ValueError):
                    continue
                if target_id in member_ids:
                    db.session.add(MessageMention(message_id=message.id, user_id=target_id))
            db.session.commit()

            # Broadcaster à toute la room du projet
            room = f"project_{project_id}"
            channel_name = channel.name if channel_id and channel else "général"
            emit("new_message", {
                "id":         message.id,
                "content":    message.content,
                "sender": {
                    "id":     user.id,
                    "name":   user.name,
                    "avatar": user.avatar
                },
                "project_id": project_id,
                "channel_id": channel_id,
                "mentions": [{"id": m.user_id} for m in message.mentions],
                "created_at": message.created_at.isoformat()
            }, to=room)

            # ── Notifier tous les membres du projet (sauf l'expéditeur) ──────
            mentioned_ids = {int(uid) for uid in (data.get("mention_user_ids") or [])}
            for member in project.members:
                if member.id == user_id:
                    continue
                is_mention = member.id in mentioned_ids
                title = (
                    f"@Vous dans #{channel_name}" if is_mention
                    else f"{user.name} dans #{channel_name}"
                )
                send_notification(
                    user_id   = member.id,
                    title     = title,
                    content   = content[:80] + ("…" if len(content) > 80 else ""),
                    notif_type= "mention" if is_mention else "channel_message",
                    link      = f"project/{project_id}/meeting/channel/{channel_id or ''}",
                )

        except Exception as e:
            emit("error", {"message": str(e)})

    @socketio.on("send_dm_message")
    def on_dm_message(data):
        token = data.get("token")
        recipient_id = data.get("recipient_id")
        content = (data.get("content") or "").strip()

        if not token or not recipient_id or not content:
            emit("error", {"message": "Données manquantes"})
            return

        try:
            decoded = decode_token(token)
            user_id = int(decoded["sub"])
            recipient_id = int(recipient_id)
            if recipient_id == user_id:
                emit("error", {"message": "Conversation invalide"})
                return

            recipient = User.query.get(recipient_id)
            sender = User.query.get(user_id)
            if not recipient or not sender:
                emit("error", {"message": "Utilisateur introuvable"})
                return

            u1, u2 = sorted([user_id, recipient_id])
            conversation = DirectConversation.query.filter_by(user_one_id=u1, user_two_id=u2).first()
            if not conversation:
                conversation = DirectConversation(user_one_id=u1, user_two_id=u2)
                db.session.add(conversation)
                db.session.flush()

            message = Message(direct_conversation_id=conversation.id, sender_id=user_id, content=content)
            db.session.add(message)
            db.session.commit()

            payload = {
                "id": message.id,
                "content": message.content,
                "direct_conversation_id": conversation.id,
                "sender": {
                    "id": sender.id,
                    "name": sender.name,
                    "avatar": sender.avatar,
                },
                "created_at": message.created_at.isoformat(),
            }
            emit("new_dm_message", payload, to=f"user_{user_id}")
            emit("new_dm_message", payload, to=f"user_{recipient_id}")

            # Persist notification for the recipient
            send_notification(
                user_id=recipient_id,
                title=f"Message de {sender.name}",
                content=content[:80] + ("…" if len(content) > 80 else ""),
                notif_type="dm_received",
                link=f"dm/{user_id}",
            )
        except Exception as e:
            emit("error", {"message": str(e)})


    # ─── NOTIFICATION TEMPS RÉEL (changement de statut tâche) ────────────────
    @socketio.on("task_updated")
    def on_task_updated(data):
        """Notifie tous les membres du projet qu'une tâche a changé"""
        project_id = data.get("project_id")
        if not project_id:
            return

        room = f"project_{project_id}"
        emit("task_changed", {
            "task_id":   data.get("task_id"),
            "new_status": data.get("new_status"),
            "updated_by": data.get("updated_by")
        }, to=room)


    # ─── DÉCONNEXION ──────────────────────────────────────────────────────────
    @socketio.on("disconnect")
    def on_disconnect(reason=None):
        uid, still_online = _remove_sid(request.sid)
        print(f"[socket] utilisateur {uid} deconnecte: {reason} (encore en ligne: {still_online})")

        if uid is not None and not still_online:
            # Notifier toutes les rooms du projet que cet utilisateur est hors ligne
            projects = _uid_projects.pop(uid, set())
            for pid in projects:
                emit("user_offline", {"user_id": uid, "project_id": pid},
                     to=f"project_{pid}")