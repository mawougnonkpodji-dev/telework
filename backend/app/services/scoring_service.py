from datetime import date, datetime, timedelta

from app.models.task import TaskStatus


def month_bounds(month_str: str | None):
    """
    Retourne (start_dt, end_dt, month_label).
    month_str attendu: YYYY-MM, sinon mois courant.
    """
    if month_str:
        year, month = [int(x) for x in month_str.split("-")]
        start = date(year, month, 1)
    else:
        today = date.today()
        start = date(today.year, today.month, 1)

    if start.month == 12:
        next_month = date(start.year + 1, 1, 1)
    else:
        next_month = date(start.year, start.month + 1, 1)
    end = next_month - timedelta(days=1)
    return (
        datetime.combine(start, datetime.min.time()),
        datetime.combine(end, datetime.max.time()),
        start.strftime("%Y-%m"),
    )


def compute_member_scoring(tasks_for_member):
    """
    Formule v1:
      - ponctualite: part des taches validees livrees avant/echeance
      - taux_validation: validated / (validated + rejected)
      - volume: ratio des taches validees vs max de l'equipe (injecte apres)
    """
    assigned = len(tasks_for_member)
    validated = [t for t in tasks_for_member if t.status == TaskStatus.validated]
    rejected = [t for t in tasks_for_member if t.status == TaskStatus.rejected]
    delivered = [t for t in tasks_for_member if t.status == TaskStatus.delivered]
    in_progress = [t for t in tasks_for_member if t.status == TaskStatus.in_progress]

    overdue = [
        t
        for t in tasks_for_member
        if t.deadline and t.deadline.date() < date.today() and t.status != TaskStatus.validated
    ]

    on_time_validated = [
        t
        for t in validated
        if (not t.deadline) or (t.updated_at and t.updated_at <= t.deadline)
    ]

    punctuality = round((len(on_time_validated) / len(validated) * 100) if validated else 0, 1)
    validation_base = len(validated) + len(rejected)
    validation_rate = round((len(validated) / validation_base * 100) if validation_base else 0, 1)

    return {
        "assigned": assigned,
        "in_progress": len(in_progress),
        "delivered": len(delivered),
        "validated": len(validated),
        "rejected": len(rejected),
        "overdue": len(overdue),
        "punctuality": punctuality,
        "validation_rate": validation_rate,
    }


def finalize_scores(member_rows):
    max_validated = max([r["validated"] for r in member_rows], default=0)
    for row in member_rows:
        volume_score = round((row["validated"] / max_validated * 100) if max_validated else 0, 1)
        total = round(
            (0.4 * row["punctuality"]) + (0.4 * row["validation_rate"]) + (0.2 * volume_score),
            1,
        )
        row["volume_score"] = volume_score
        row["score"] = total
    return member_rows
