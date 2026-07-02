/**
 * Couleurs d'urgence basées sur la deadline d'une tâche.
 * Rouge = en retard / critique, ambre = attention, vert = dans les temps.
 */
export function getDeadlineUrgency(task) {
  const due = task?.deadline || task?.due_date;
  if (!due || !task?.created_at) {
    return { color: 'var(--c-text3)', bg: 'var(--c-hover)', state: 'unknown', isOverdue: false };
  }

  const start = new Date(task.created_at).getTime();
  const deadline = new Date(due).getTime();
  const now = Date.now();

  if (now >= deadline) {
    return { color: '#ef4444', bg: 'rgba(239,68,68,0.15)', state: 'overdue', isOverdue: true };
  }

  const totalDuration = deadline - start;
  if (totalDuration <= 0) {
    return { color: '#ef4444', bg: 'rgba(239,68,68,0.15)', state: 'overdue', isOverdue: true };
  }

  const remaining = deadline - now;
  const remainingPercentage = (remaining / totalDuration) * 100;

  if (remainingPercentage > 50) {
    return { color: '#22c55e', bg: 'rgba(34,197,94,0.15)', state: 'on_track', isOverdue: false };
  }
  if (remainingPercentage > 25) {
    return { color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', state: 'warning', isOverdue: false };
  }
  return { color: '#ef4444', bg: 'rgba(239,68,68,0.15)', state: 'critical', isOverdue: false };
}

/** Badge « En cours » : couleur dynamique si une deadline existe. */
export function getInProgressStatus(task) {
  if (task?.status === 'in_progress' && (task?.deadline || task?.due_date)) {
    const urgency = getDeadlineUrgency(task);
    if (urgency.state !== 'unknown') {
      return { label: 'En cours', color: urgency.color, bg: urgency.bg };
    }
  }
  return { label: 'En cours', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' };
}
