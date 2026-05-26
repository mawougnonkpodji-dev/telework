"""
Service de scoring IA :
  - Charge le modèle LinearRegression depuis scoring_model.pkl
  - Extrait les 6 features comportementales depuis la DB
  - Calcule le score et le persiste dans member_scores

Ponctualité :
  Définie comme le fait de se connecter à 09h00 ou avant (heure locale du serveur).
  Score = jours où la 1ère connexion ≤ 09:00  /  jours avec au moins une connexion.
  (Journée de 8h : 09h00 → 17h00)
"""

import os
import logging
from datetime import datetime, timezone, timedelta, time as dt_time

import joblib
import numpy as np

from app.extensions import db
from app.models.task import Task, TaskStatus
from app.models.member_score import MemberScore

logger = logging.getLogger(__name__)

# ── Chemin du modèle ──────────────────────────────────────────────────────────
HERE       = os.path.dirname(os.path.abspath(__file__))
BACKEND    = os.path.abspath(os.path.join(HERE, "..", ".."))
MODEL_PATH = os.path.join(BACKEND, "scoring_model.pkl")

_model = None  # Cache module-level


def _load_model():
    """Charge le modèle une seule fois et le met en cache."""
    global _model
    if _model is None:
        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(
                f"scoring_model.pkl introuvable à {MODEL_PATH}. "
                "Lancez d'abord : python -m app.services.ai_scoring_trainer"
            )
        _model = joblib.load(MODEL_PATH)
        logger.info("Modèle de scoring chargé depuis %s", MODEL_PATH)
    return _model


# ── Extraction des features ────────────────────────────────────────────────────

PUNCTUALITY_HOUR = dt_time(9, 0, 0)   # 09:00:00 heure locale


def _local_tz():
    """Retourne le fuseau horaire local du serveur (stdlib pure)."""
    return datetime.now().astimezone().tzinfo


def _compute_punctuality(user_id: int, since: datetime) -> float:
    """
    Ponctualité = % de jours (dans la période) où la 1ère connexion
    de l'utilisateur est ≤ 09:00 heure locale du serveur.

    - Jours sans aucune connexion : ignorés (pas pénalisés — absence ≠ retard).
    - Si aucune connexion sur toute la période : retourne 0.5 (neutre).
    """
    from app.models.user_login_log import UserLoginLog

    logs = UserLoginLog.query.filter(
        UserLoginLog.user_id == user_id,
        UserLoginLog.logged_in_at >= since,
    ).order_by(UserLoginLog.logged_in_at.asc()).all()

    if not logs:
        return 0.5  # Aucune donnée → score neutre

    local_tz = _local_tz()

    # Grouper par date locale → garder la 1ère connexion de chaque jour
    first_login_per_day: dict[str, dt_time] = {}
    for log in logs:
        # Convertir UTC → heure locale
        utc_dt = log.logged_in_at
        if utc_dt.tzinfo is None:
            utc_dt = utc_dt.replace(tzinfo=timezone.utc)
        local_dt = utc_dt.astimezone(local_tz)
        day_key  = local_dt.date().isoformat()
        t        = local_dt.time().replace(second=0, microsecond=0)
        if day_key not in first_login_per_day:
            first_login_per_day[day_key] = t

    total_days   = len(first_login_per_day)
    on_time_days = sum(
        1 for t in first_login_per_day.values() if t <= PUNCTUALITY_HOUR
    )

    return on_time_days / total_days


def _extract_features(user_id: int, project_id: int, since: datetime) -> dict:
    """
    Retourne un dict contenant les 6 variables comportementales (float 0–1).

    Définitions :
      x1  punctuality_score    — % de jours où la 1ère connexion ≤ 09:00 (heure locale)
      x2  completion_rate      — (tâches validées) / (tâches assignées)
      x3  rejection_rate       — (tâches rejetées) / (tâches livrées)
      x4  interaction_freq     — nb messages envoyés, normalisé par 100 (plafonné à 1)
      x5  interaction_quality  — tâches avec commentaires de l'utilisateur / total tâches
      x6  review_participation — nb commentaires sur tâches d'AUTRES membres / 20 (plafonné à 1)
    """
    # ── Requêtes tâches ───────────────────────────────────────────────────────
    from app.models.task import task_assignees
    from app.models.message import Message
    from sqlalchemy import text, func

    # x1 — ponctualité basée sur les connexions
    punctuality_score = _compute_punctuality(user_id, since)

    assigned_ids = db.session.execute(
        db.select(task_assignees.c.task_id)
        .join(Task, Task.id == task_assignees.c.task_id)
        .where(
            task_assignees.c.user_id == user_id,
            Task.project_id == project_id,
            Task.created_at >= since,
        )
    ).scalars().all()

    total_assigned = len(assigned_ids)

    if total_assigned == 0:
        return {
            "punctuality_score":    punctuality_score,
            "completion_rate":      0.0,
            "rejection_rate":       0.0,
            "interaction_freq":     0.0,
            "interaction_quality":  0.5,
            "review_participation": 0.0,
        }

    tasks = Task.query.filter(Task.id.in_(assigned_ids)).all()

    validated = [t for t in tasks if t.status == TaskStatus.validated]
    rejected  = [t for t in tasks if t.status == TaskStatus.rejected]
    delivered = [t for t in tasks if t.status in (
        TaskStatus.delivered, TaskStatus.validated
    )]

    # x2 — taux d'achèvement
    completion_rate = len(validated) / total_assigned

    # x3 — taux de rejet
    rejection_rate = len(rejected) / len(delivered) if delivered else 0.0

    # ── Messages envoyés (x4) ─────────────────────────────────────────────────
    msg_count = Message.query.filter(
        Message.sender_id == user_id,
        Message.project_id == project_id,
        Message.created_at >= since,
    ).count()
    interaction_freq = min(msg_count / 100.0, 1.0)

    # ── Qualité interactions (x5) : tâches avec ≥1 commentaire de l'utilisateur
    #    sur ses propres tâches (preuve de suivi actif)
    from app.models.task import Comment
    my_task_ids = [t.id for t in tasks]
    commented_tasks = db.session.execute(
        db.select(func.count(func.distinct(Comment.task_id)))
        .where(
            Comment.task_id.in_(my_task_ids),
            Comment.author_id == user_id,
        )
    ).scalar() or 0
    interaction_quality = min(commented_tasks / max(total_assigned, 1), 1.0)

    # ── Participation aux révisions (x6) : commentaires sur tâches d'AUTRES membres
    from sqlalchemy import not_
    peer_comments = db.session.execute(
        db.select(func.count(Comment.id))
        .join(Task, Comment.task_id == Task.id)
        .where(
            Task.project_id == project_id,
            Comment.author_id == user_id,
            Comment.task_id.not_in(my_task_ids),
            Comment.created_at >= since,
        )
    ).scalar() or 0
    review_participation = min(peer_comments / 20.0, 1.0)

    return {
        "punctuality_score":    float(punctuality_score),
        "completion_rate":      float(completion_rate),
        "rejection_rate":       float(rejection_rate),
        "interaction_freq":     float(interaction_freq),
        "interaction_quality":  float(interaction_quality),
        "review_participation": float(review_participation),
    }


# ── Calcul et persistance ──────────────────────────────────────────────────────

def compute_and_save_score(
    user_id: int,
    project_id: int,
    period: str = "all-time",
    lookback_days: int = 90,
) -> dict:
    """
    Calcule le score IA pour un membre dans un projet, le persiste et retourne un dict.

    Args:
        user_id       : ID du membre
        project_id    : ID du projet
        period        : label de période (ex. "2025-12" ou "all-time")
        lookback_days : fenêtre d'analyse en jours (défaut 90 jours)
    """
    model = _load_model()

    since = datetime.now(timezone.utc) - timedelta(days=lookback_days)
    feats = _extract_features(user_id, project_id, since)

    # Vecteur d'entrée pour le modèle :
    #   [ punct, completion, rejection, interact_freq, interact_qual, review ]
    x = np.array([[
        feats["punctuality_score"],
        feats["completion_rate"],
        feats["rejection_rate"],
        feats["interaction_freq"],
        feats["interaction_quality"],
        feats["review_participation"],
    ]])

    raw_score = float(model.predict(x)[0])
    score = float(np.clip(raw_score, 0, 100))

    # ── Upsert dans member_scores ─────────────────────────────────────────────
    row = MemberScore.query.filter_by(
        project_id=project_id,
        user_id=user_id,
        period=period,
    ).first()

    if row is None:
        row = MemberScore(project_id=project_id, user_id=user_id, period=period)
        db.session.add(row)

    row.score               = score
    row.punctuality_score   = feats["punctuality_score"]
    row.completion_rate     = feats["completion_rate"]
    row.rejection_rate      = feats["rejection_rate"]
    row.interaction_freq    = feats["interaction_freq"]
    row.interaction_quality = feats["interaction_quality"]
    row.review_participation = feats["review_participation"]
    row.computed_at         = datetime.now(timezone.utc)

    db.session.commit()

    result = row.to_dict()
    # Enrichi avec le nom de l'utilisateur pour faciliter l'affichage
    from app.models.user import User
    u = User.query.get(user_id)
    if u:
        result["user_name"]  = u.name or u.email
        result["user_email"] = u.email
    return result


def compute_project_scores(project_id: int, period: str = "all-time") -> list:
    """
    Calcule les scores de TOUS les membres actifs d'un projet.
    Retourne la liste triée par score décroissant.
    """
    from app.models.project import project_members

    member_ids = db.session.execute(
        db.select(project_members.c.user_id).where(
            project_members.c.project_id == project_id
        )
    ).scalars().all()

    results = []
    for uid in member_ids:
        try:
            r = compute_and_save_score(uid, project_id, period)
            results.append(r)
        except Exception as exc:
            logger.warning("Scoring échoué pour user %s projet %s : %s", uid, project_id, exc)

    results.sort(key=lambda r: r["score"], reverse=True)
    return results
