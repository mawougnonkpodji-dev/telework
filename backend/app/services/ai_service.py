import os
import json

import anthropic
from anthropic import APIError, AuthenticationError, RateLimitError

from app.models import Project, Task
from app.models.sprint import Sprint

AI_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514")


class AIServiceError(Exception):
    """Erreur métier explicite pour les endpoints IA."""


def _get_client():
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise AIServiceError("ANTHROPIC_API_KEY manquante dans l'environnement.")
    return anthropic.Anthropic(api_key=api_key)


def _ask_model(prompt: str, max_tokens: int) -> str:
    try:
        client = _get_client()
        response = client.messages.create(
            model=AI_MODEL,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
        if not response.content:
            raise AIServiceError("Réponse IA vide.")
        return response.content[0].text
    except AuthenticationError as exc:
        raise AIServiceError("Échec d'authentification Anthropic (clé invalide).") from exc
    except RateLimitError as exc:
        raise AIServiceError("Limite Anthropic atteinte, réessaie dans quelques instants.") from exc
    except APIError as exc:
        raise AIServiceError(f"Erreur API Anthropic: {str(exc)}") from exc


def _ask_model_json(prompt: str, max_tokens: int, fallback_key: str) -> dict:
    raw = _ask_model(prompt, max_tokens=max_tokens).strip()
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            return data
        return {fallback_key: data}
    except Exception:
        return {fallback_key: raw}

# ─── HELPER — Contexte du projet ──────────────────────────────────────────────
def _build_project_context(project_id: int) -> str:
    """Construit un résumé du projet pour le contexte de l'IA"""
    project = Project.query.get(project_id)
    if not project:
        return ""

    tasks    = Task.query.filter_by(project_id=project_id).all()
    members  = project.members
    sprints  = Sprint.query.filter_by(project_id=project_id).all()

    total     = len(tasks)
    done      = sum(1 for t in tasks if t.status.value == "validated")
    blocked   = sum(1 for t in tasks if t.status.value == "in_progress" and t.progress < 10)
    overdue   = sum(1 for t in tasks if t.deadline and t.status.value != "validated")

    # Charge par membre
    member_load = {}
    for task in tasks:
        for assignee in task.assignees:
            member_load[assignee.name] = member_load.get(assignee.name, 0) + 1

    context = f"""
    Projet : {project.name}
    Description : {project.description}
    Membres : {', '.join([m.name for m in members])}
    
    État des tâches :
    - Total : {total}
    - Terminées : {done}
    - En cours : {sum(1 for t in tasks if t.status.value == 'in_progress')}
    - Assignées : {sum(1 for t in tasks if t.status.value == 'assigned')}
    - Livrées : {sum(1 for t in tasks if t.status.value == 'delivered')}
    - Tâches bloquées (peu de progression) : {blocked}
    - Tâches en retard : {overdue}
    
    Charge par membre : {member_load}
    
    Sprints : {len(sprints)} sprint(s) au total
    """
    return context


# ─── 1. SUGGESTIONS DE DEADLINES ──────────────────────────────────────────────
def suggest_deadlines(project_id: int) -> dict:
    context = _build_project_context(project_id)
    tasks   = Task.query.filter_by(
        project_id=project_id
    ).filter(Task.deadline.is_(None)).all()

    if not tasks:
        return {"suggestions": [], "note": "Aucune tâche sans deadline trouvée pour ce projet."}

    tasks_without_deadline = "\n".join([
        f"- {t.title} (priorité: {t.priority.value})"
        for t in tasks
    ])

    prompt = f"""
    {context}
    
    Tâches sans deadline :
    {tasks_without_deadline}
    
    En tant qu'assistant de gestion de projet, suggère des deadlines réalistes 
    pour chaque tâche en tenant compte de la charge de l'équipe et des priorités.
    Réponds uniquement en JSON strict avec la structure:
    {{
      "suggestions": [{{"task_title": "...", "proposed_deadline": "YYYY-MM-DD", "reason": "..."}}],
      "global_notes": "..."
    }}
    """
    return _ask_model_json(prompt, max_tokens=1000, fallback_key="suggestions_text")


# ─── 2. DÉTECTION DE RISQUES ──────────────────────────────────────────────────
def detect_risks(project_id: int) -> dict:
    context = _build_project_context(project_id)

    prompt = f"""
    {context}
    
    En tant qu'expert en gestion de projet, analyse ce projet et identifie :
    1. Les risques critiques (tâches bloquées, membres en surcharge, retards)
    2. Les membres potentiellement en surcharge
    3. Les sprints en danger
    4. Des recommandations concrètes pour chaque risque identifié
    
    Réponds uniquement en JSON strict:
    {{
      "risks": [{{"risk": "...", "impact": "...", "solution": "...", "severity": "low|medium|high"}}],
      "summary": "..."
    }}
    """
    return _ask_model_json(prompt, max_tokens=1000, fallback_key="risks_text")


# ─── 3. RÉSUMÉ DE SPRINT ──────────────────────────────────────────────────────
def generate_sprint_summary(sprint_id: int) -> dict:
    sprint = Sprint.query.get(sprint_id)
    if not sprint:
        return {"summary": "Sprint introuvable", "sections": []}

    tasks    = Task.query.filter_by(sprint_id=sprint_id).all()
    total    = len(tasks)
    done     = sum(1 for t in tasks if t.status.value == "validated")
    velocity = round((done / total * 100) if total > 0 else 0, 1)

    tasks_detail = "\n".join([
        f"- {t.title} : {t.status.value} ({t.progress}%)"
        for t in tasks
    ])

    prompt = f"""
    Sprint : {sprint.name}
    Objectif : {sprint.goal}
    Période : {sprint.start_date.date()} → {sprint.end_date.date()}
    Vélocité : {velocity}% ({done}/{total} tâches terminées)
    
    Détail des tâches :
    {tasks_detail}
    
    Réponds uniquement en JSON strict:
    {{
      "summary": "...",
      "achievements": ["..."],
      "blockers": ["..."],
      "next_sprint_recommendations": ["..."]
    }}
    """

    summary = _ask_model_json(prompt, max_tokens=1500, fallback_key="summary_text")

    # Sauvegarder le résumé dans la BDD
    sprint.ai_summary = json.dumps(summary, ensure_ascii=False)
    from app.extensions import db
    db.session.commit()

    return summary


# ─── 4. RECOMMANDATION D'ASSIGNATION ─────────────────────────────────────────
def recommend_assignee(project_id: int, task_title: str, task_description: str) -> dict:
    context = _build_project_context(project_id)

    prompt = f"""
    {context}
    
    Nouvelle tâche à assigner :
    Titre : {task_title}
    Description : {task_description}
    
    En tenant compte de la charge actuelle de chaque membre et de leurs compétences,
    recommande le membre le plus approprié pour cette tâche et explique pourquoi.
    Réponds uniquement en JSON strict:
    {{
      "recommended_user": "...",
      "reason": "...",
      "alternatives": ["..."]
    }}
    """
    return _ask_model_json(prompt, max_tokens=500, fallback_key="recommendation_text")


# ─── 5. RÉSUMÉ HEBDOMADAIRE ───────────────────────────────────────────────────
def weekly_summary(project_id: int) -> dict:
    context = _build_project_context(project_id)

    prompt = f"""
    {context}
    
    Génère un résumé hebdomadaire professionnel du projet en français incluant :
    1. Progression globale
    2. Ce qui a été accompli cette semaine
    3. Ce qui est prévu pour la semaine prochaine
    4. Alertes et points d'attention
    
    Réponds uniquement en JSON strict:
    {{
      "email_subject": "...",
      "progression_globale": "...",
      "accomplissements": ["..."],
      "semaine_prochaine": ["..."],
      "alertes": ["..."]
    }}
    """
    return _ask_model_json(prompt, max_tokens=1000, fallback_key="summary_text")