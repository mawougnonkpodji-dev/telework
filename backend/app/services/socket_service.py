from flask_socketio import emit, join_room, leave_room
from flask_jwt_extended import decode_token
from app.extensions import db
from app.models import User
from app.models.message import Message, ChatChannel, DirectConversation, MessageMention
from app.models import Project

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
            print(f"✅ {user.name} connecté via Socket.io")
        except Exception as e:
            print(f"❌ Connexion refusée : {e}")
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
        emit("system_message", {
            "message": f"Vous avez rejoint le projet #{project_id}"
        })
        print(f"👥 Utilisateur a rejoint la room {room}")


    # ─── QUITTER UN PROJET ────────────────────────────────────────────────────
    @socketio.on("leave_project")
    def on_leave(data):
        project_id = data.get("project_id")
        if not project_id:
            return

        room = f"project_{project_id}"
        leave_room(room)
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
    def on_disconnect():
        print("🔌 Utilisateur déconnecté")