from app.extensions import db
from app.models.board_column import ProjectBoardColumn
from app.models.task import TaskStatus


DEFAULT_BOARD = [
    ("Assignées", "#64748B", TaskStatus.assigned),
    ("En cours", "#2563EB", TaskStatus.in_progress),
    ("Livrées", "#D97706", TaskStatus.delivered),
    ("Validées", "#16A34A", TaskStatus.validated),
    ("Rejetées", "#DC2626", TaskStatus.rejected),
]


def seed_default_board(project_id: int) -> None:
    """Crée les 4 colonnes par défaut si le projet n’en a aucune."""
    if ProjectBoardColumn.query.filter_by(project_id=project_id).first():
        return
    for pos, (title, color, st) in enumerate(DEFAULT_BOARD):
        db.session.add(
            ProjectBoardColumn(
                project_id=project_id,
                title=title,
                position=pos,
                color=color,
                maps_to_status=st,
            )
        )


def column_for_status(project_id: int, status: TaskStatus):
    """Première colonne du projet qui correspond au statut."""
    return (
        ProjectBoardColumn.query.filter_by(project_id=project_id, maps_to_status=status)
        .order_by(ProjectBoardColumn.position)
        .first()
    )


def resolve_column_on_create(project_id: int, status: TaskStatus, column_id=None):
    """
    Retourne (column_orm_or_none, status_effectif).
    Si column_id est fourni, il doit appartenir au projet ; le statut suit maps_to_status.
    """
    if column_id is not None:
        col = ProjectBoardColumn.query.filter_by(id=column_id, project_id=project_id).first()
        if col:
            return col, col.maps_to_status
    col = column_for_status(project_id, status)
    return col, status


def resolve_column_on_update(project_id: int, task, data: dict):
    """Met à jour column_id / status depuis le payload. Retourne True si ok."""
    if "column_id" not in data:
        return True
    cid = data["column_id"]
    if cid is None:
        task.column_id = None
        return True
    col = ProjectBoardColumn.query.filter_by(id=cid, project_id=project_id).first()
    if not col:
        return False
    task.column_id = col.id
    task.status = col.maps_to_status
    return True
