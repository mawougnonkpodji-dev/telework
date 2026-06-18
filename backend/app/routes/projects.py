import re
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy.orm import joinedload
from app.extensions import db, cache
from app.models import Project, User
from app.models.user import Role
from app.models.project import project_members, MemberRole
from app.services.board_service import seed_default_board

projects_bp = Blueprint("projects", __name__)


# ─── CRÉER UN PROJET ──────────────────────────────────────────────────────────
@projects_bp.route("/", methods=["POST"])
@jwt_required()
def create_project():
    user_id = int(get_jwt_identity())
    data    = request.get_json()

    if not data.get("name"):
        return jsonify({"error": "Le nom du projet est requis"}), 400

    raw_name = data["name"]
    auto_slug = re.sub(r'[^A-Z]', '', raw_name.upper())[:3].ljust(3, 'X')

    project = Project(
        name        = raw_name,
        description = data.get("description", ""),
        owner_id    = user_id,
        color_theme = data.get("color_theme", "#22d3ee"),
        icon        = data.get("icon", "📁"),
        slug        = data.get("slug", auto_slug),
    )
    db.session.add(project)
    db.session.flush()  # pour obtenir project.id avant commit

    # Ajouter le créateur comme membre admin (upsert pour éviter les doublons)
    existing = db.session.execute(project_members.select().where(
        project_members.c.user_id    == user_id,
        project_members.c.project_id == project.id,
    )).fetchone()
    if existing:
        db.session.execute(project_members.update().where(
            project_members.c.user_id    == user_id,
            project_members.c.project_id == project.id,
        ).values(role=MemberRole.admin))
    else:
        db.session.execute(project_members.insert().values(
            user_id    = user_id,
            project_id = project.id,
            role       = MemberRole.admin,
        ))
    # Le créateur devient gestionnaire (admin) dans la table users
    creator = db.session.get(User, user_id)
    if creator and creator.role != Role.admin:
        creator.role = Role.admin

    seed_default_board(project.id)
    db.session.commit()
    cache.delete(f"projects_{user_id}")

    return jsonify({
        "message": "Projet créé avec succès",
        "user":    creator.to_dict(),
        "project": project.to_dict()
    }), 201


# ─── CRÉATION BATCH (wizard onboarding) ───────────────────────────────────────
@projects_bp.route("/batch", methods=["POST"])
@jwt_required()
def create_projects_batch():
    user_id = int(get_jwt_identity())
    data = request.get_json() or {}
    items = data.get("projects")
    if not isinstance(items, list) or len(items) == 0:
        return jsonify({"error": "projects doit être une liste non vide"}), 400

    for item in items:
        if not item or not item.get("name"):
            return jsonify({"error": "Chaque projet doit avoir un nom"}), 400

    created = []
    for item in items:
        project = Project(
            name=item["name"],
            description=item.get("description", ""),
            owner_id=user_id,
        )
        db.session.add(project)
        db.session.flush()
        db.session.execute(
            project_members.insert().values(
                user_id=user_id,
                project_id=project.id,
                role=MemberRole.admin,
            )
        )
        seed_default_board(project.id)
        created.append(project.to_dict())

    db.session.commit()
    return (
        jsonify(
            {
                "message": f"{len(created)} projet(s) créé(s)",
                "projects": created,
            }
        ),
        201,
    )


# ─── LISTER MES PROJETS ───────────────────────────────────────────────────────
@projects_bp.route("/", methods=["GET"])
@jwt_required()
@cache.cached(timeout=30, key_prefix=lambda: f"projects_{get_jwt_identity()}")
def get_projects():
    user_id = int(get_jwt_identity())
    user    = User.query.get(user_id)

    # Membres via project_members + projets dont l'utilisateur est owner (données legacy / seed)
    by_id = {}
    for p in user.projects:
        by_id[p.id] = p
    for p in user.owned_projects or []:
        if p.id not in by_id:
            by_id[p.id] = p

    projects = [p.to_dict() for p in by_id.values()]
    return jsonify({"projects": projects}), 200


# ─── DÉTAIL D'UN PROJET ───────────────────────────────────────────────────────
@projects_bp.route("/<int:project_id>", methods=["GET"])
@jwt_required()
def get_project(project_id):
    user_id = int(get_jwt_identity())
    project = Project.query.options(joinedload(Project.members)).get_or_404(project_id)

    # Vérifier que l'utilisateur est membre
    if not _is_member(user_id, project):
        return jsonify({"error": "Accès refusé"}), 403

    data            = project.to_dict()
    data["members"] = _get_members(project)
    return jsonify({"project": data}), 200


# ─── MODIFIER UN PROJET ───────────────────────────────────────────────────────
@projects_bp.route("/<int:project_id>", methods=["PUT"])
@jwt_required()
def update_project(project_id):
    user_id = int(get_jwt_identity())
    project = Project.query.get_or_404(project_id)

    if not _is_admin(user_id, project):
        return jsonify({"error": "Seul un admin peut modifier ce projet"}), 403

    data = request.get_json()
    if "name"        in data: project.name        = data["name"]
    if "description" in data: project.description = data["description"]
    if "status"      in data: project.status      = data["status"]

    db.session.commit()
    cache.delete(f"projects_{user_id}")
    return jsonify({"message": "Projet mis à jour", "project": project.to_dict()}), 200


# ─── RÉPARER LES RÔLES OWNERS ────────────────────────────────────────────────
@projects_bp.route("/fix-owner-roles", methods=["POST"])
@jwt_required()
def fix_owner_roles():
    """
    S'assure que chaque owner de projet est dans project_members avec role=admin.
    À appeler une fois pour corriger les projets existants en base.
    """
    user_id = int(get_jwt_identity())
    from app.models import User
    caller = db.session.get(User, user_id)
    if not caller or caller.role != 'admin':
        return jsonify({"error": "Réservé aux administrateurs plateforme"}), 403

    projects = Project.query.filter(Project.owner_id.isnot(None)).all()
    fixed = 0
    for project in projects:
        existing = db.session.execute(project_members.select().where(
            project_members.c.user_id    == project.owner_id,
            project_members.c.project_id == project.id,
        )).fetchone()
        if existing:
            if existing.role != MemberRole.admin:
                db.session.execute(project_members.update().where(
                    project_members.c.user_id    == project.owner_id,
                    project_members.c.project_id == project.id,
                ).values(role=MemberRole.admin))
                fixed += 1
        else:
            db.session.execute(project_members.insert().values(
                user_id    = project.owner_id,
                project_id = project.id,
                role       = MemberRole.admin,
            ))
            fixed += 1

    db.session.commit()
    return jsonify({"message": f"{fixed} projet(s) corrigé(s).", "total": len(projects)}), 200


# ─── SUPPRIMER UN PROJET ──────────────────────────────────────────────────────
@projects_bp.route("/<int:project_id>", methods=["DELETE"])
@jwt_required()
def delete_project(project_id):
    user_id = int(get_jwt_identity())
    project = Project.query.get_or_404(project_id)

    if project.owner_id != user_id:
        return jsonify({"error": "Seul le propriétaire peut supprimer ce projet"}), 403

    db.session.delete(project)
    db.session.commit()
    return jsonify({"message": "Projet supprimé avec succès"}), 200


# ─── AJOUTER UN MEMBRE ────────────────────────────────────────────────────────
@projects_bp.route("/<int:project_id>/members", methods=["POST"])
@jwt_required()
def add_member(project_id):
    user_id = int(get_jwt_identity())
    project = Project.query.get_or_404(project_id)

    if not _is_admin(user_id, project):
        return jsonify({"error": "Seul un admin peut ajouter des membres"}), 403

    data  = request.get_json()
    email = data.get("email")
    requested_role = data.get("role", MemberRole.member.value)
    if not email:
        return jsonify({"error": "Email requis"}), 400
    try:
        role = MemberRole(requested_role)
    except ValueError:
        return jsonify({"error": "Rôle invalide. Valeurs: admin, member, observateur"}), 400

    new_member = User.query.filter_by(email=email).first()
    if not new_member:
        return jsonify({"error": "Utilisateur introuvable"}), 404

    if _is_member(new_member.id, project):
        return jsonify({"error": "Cet utilisateur est déjà membre"}), 409

    db.session.execute(project_members.insert().values(
        user_id    = new_member.id,
        project_id = project.id,
        role       = role
    ))
    db.session.commit()

    return jsonify({"message": f"{new_member.name} ajouté au projet en tant que {role.value}"}), 200


# ─── RETIRER UN MEMBRE ────────────────────────────────────────────────────────
@projects_bp.route("/<int:project_id>/members/<int:member_id>", methods=["DELETE"])
@jwt_required()
def remove_member(project_id, member_id):
    user_id = int(get_jwt_identity())
    project = Project.query.get_or_404(project_id)

    if not _is_admin(user_id, project):
        return jsonify({"error": "Seul un admin peut retirer des membres"}), 403

    if project.owner_id == member_id:
        return jsonify({"error": "Impossible de retirer le propriétaire"}), 400

    db.session.execute(project_members.delete().where(
        project_members.c.user_id    == member_id,
        project_members.c.project_id == project_id
    ))
    db.session.commit()
    return jsonify({"message": "Membre retiré avec succès"}), 200


# ─── HELPERS INTERNES ─────────────────────────────────────────────────────────
def _is_member(user_id, project):
    # Le propriétaire est toujours considéré comme membre même sans entrée project_members
    if project.owner_id == user_id:
        return True
    return any(m.id == user_id for m in project.members)

def _is_admin(user_id, project):
    if project.owner_id == user_id:
        return True
    row = db.session.execute(project_members.select().where(
        project_members.c.user_id    == user_id,
        project_members.c.project_id == project.id
    )).fetchone()
    return row and row.role == MemberRole.admin

def _get_members(project):
    rows = db.session.execute(
        project_members.select().where(project_members.c.project_id == project.id)
    ).fetchall()
    roles_by_user = {row.user_id: row.role.value for row in rows}

    members = []
    owner_included = False

    for m in project.members:
        # Le propriétaire est toujours admin, peu importe ce qui est en base
        role = MemberRole.admin.value if m.id == project.owner_id else roles_by_user.get(m.id, MemberRole.member.value)
        if m.id == project.owner_id:
            owner_included = True
        members.append({
            "id":     m.id,
            "name":   m.name,
            "email":  m.email,
            "avatar": m.avatar,
            "role":   role,
        })

    # Si le propriétaire n'est pas dans project_members (projets legacy), l'ajouter quand même
    if not owner_included and project.owner_id:
        from app.models import User
        owner = db.session.get(User, project.owner_id)
        if owner:
            members.insert(0, {
                "id":     owner.id,
                "name":   owner.name,
                "email":  owner.email,
                "avatar": owner.avatar,
                "role":   MemberRole.admin.value,
            })

    return members