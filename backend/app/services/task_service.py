from app.extensions import db
from app.models.task import TaskHistory

def log_history(task_id: int, user_id: int, action: str):
    """Enregistre une action dans l'historique d'une tâche"""
    history = TaskHistory(
        task_id = task_id,
        user_id = user_id,
        action  = action
    )
    db.session.add(history)