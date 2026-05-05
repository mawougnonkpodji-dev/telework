from app.extensions import db
from app.models.notification import Notification
from app.extensions import socketio

def send_notification(user_id: int, title: str, content: str,
                      notif_type: str, link: str = None):
    """Crée une notification en BDD et la pousse via Socket.io"""

    notif = Notification(
        user_id = user_id,
        title   = title,
        content = content,
        type    = notif_type,
        link    = link
    )
    db.session.add(notif)
    db.session.commit()

    # Push temps réel via Socket.io
    socketio.emit("new_notification", notif.to_dict(), to=f"user_{user_id}")

    return notif