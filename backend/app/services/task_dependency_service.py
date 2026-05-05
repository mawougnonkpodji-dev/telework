from app.models.task import TaskDependency


def dependency_would_cycle(dependent_task_id: int, prerequisite_task_id: int) -> bool:
    """
    True si ajouter « dependent_task_id dépend de prerequisite_task_id » créerait un cycle.

    Graphe : une ligne (dependent, prerequisite) représente l'arête prerequisite → dependent.
    Cycle si prerequisite_task_id est déjà atteignable depuis dependent_task_id en suivant
    ces arêtes (une chaîne dependent → … → prerequisite existe déjà).
    """
    if dependent_task_id == prerequisite_task_id:
        return True

    stack = [dependent_task_id]
    seen = set()

    while stack:
        cur = stack.pop()
        if cur == prerequisite_task_id:
            return True
        if cur in seen:
            continue
        seen.add(cur)
        for row in TaskDependency.query.filter_by(prerequisite_task_id=cur).all():
            stack.append(row.dependent_task_id)

    return False
