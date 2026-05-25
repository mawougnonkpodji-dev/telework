/**
 * Détermine si une tâche peut être démarrée.
 * @param {Object} task - La tâche cible
 * @param {Array} allTasks - Liste de toutes les tâches du projet
 * @returns {boolean} - true si la dépendance est remplie ou inexistante
 */
export const checkDependencyMet = (task, allTasks) => {
  const deps =
    Array.isArray(task.depends_on) && task.depends_on.length > 0
      ? task.depends_on
      : task.dependency_id
        ? [task.dependency_id]
        : [];
  if (!deps.length) return true;
  const isDone = (t) =>
    t && (t.column_name === 'done' || t.status === 'validated');

  for (const did of deps) {
    const parentTask = allTasks.find((t) => t.id === did);
    if (!parentTask) continue;
    if (!isDone(parentTask)) return false;
  }
  return true;
};