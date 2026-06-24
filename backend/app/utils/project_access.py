"""Contrôle d'accès aux projets — réutilisable par les blueprints."""

from app.models import Project
from app.extensions import db
from app.models.project import project_members, MemberRole


def is_project_member(user_id: int, project: Project) -> bool:
    if not project:
        return False
    if project.owner_id is not None and int(project.owner_id) == int(user_id):
        return True
    return any(m.id == user_id for m in project.members)


def get_project_for_user(user_id: int, project_id: int):
    """Retourne le projet si l'utilisateur est membre, sinon None."""
    project = Project.query.get(project_id)
    if not project or not is_project_member(user_id, project):
        return None
    return project


def get_member_role(user_id: int, project_id: int):
    row = db.session.execute(
        project_members.select().where(
            project_members.c.user_id == user_id,
            project_members.c.project_id == project_id,
        )
    ).fetchone()
    return row.role if row else None


def can_edit_project(user_id: int, project_id: int) -> bool:
    project = Project.query.get(project_id)
    if project and project.owner_id is not None and int(project.owner_id) == int(user_id):
        return True
    role = get_member_role(user_id, project_id)
    return role in {MemberRole.admin, MemberRole.member}


def can_manage_project(user_id: int, project_id: int) -> bool:
    project = Project.query.get(project_id)
    if project and project.owner_id is not None and int(project.owner_id) == int(user_id):
        return True
    role = get_member_role(user_id, project_id)
    return role == MemberRole.admin


def is_platform_admin(user_id: int) -> bool:
    from app.models import User

    u = User.query.get(user_id)
    return bool(u and u.role and u.role.value == "admin")


def can_manage_sprints(user_id: int, project_id: int) -> bool:
    """Admin plateforme, propriétaire ou admin projet."""
    return is_platform_admin(user_id) or can_manage_project(user_id, project_id)


def task_project_member_or_403(user_id: int, task):
    """Vérifie l'accès via le projet parent de la tâche."""
    from app.models import Project

    project = Project.query.get(task.project_id)
    if not project or not is_project_member(user_id, project):
        return False
    return True


def sprint_project_member_or_403(user_id: int, sprint):
    return get_project_for_user(user_id, sprint.project_id)
