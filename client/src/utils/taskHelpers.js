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

export const KANBAN_COLUMNS = ['todo', 'inProgress', 'review', 'done'];

export const EMPTY_BOARD = { todo: [], inProgress: [], review: [], done: [] };

export function statusToColumn(status) {
  switch (status) {
    case 'in_progress':
      return 'inProgress';
    case 'delivered':
      return 'review';
    case 'validated':
      return 'done';
    default:
      return 'todo';
  }
}

export function cloneBoard(board) {
  const b = board || EMPTY_BOARD;
  return {
    todo: [...(b.todo || [])],
    inProgress: [...(b.inProgress || [])],
    review: [...(b.review || [])],
    done: [...(b.done || [])],
  };
}

export function findTaskInBoard(board, taskId) {
  const id = Number(taskId);
  for (const col of KANBAN_COLUMNS) {
    const list = board[col] || [];
    const idx = list.findIndex((t) => Number(t.id) === id);
    if (idx !== -1) return { column: col, index: idx, task: list[idx] };
  }
  return null;
}

export function moveTaskInBoard(board, taskId, toColumn, patch = {}) {
  const next = cloneBoard(board);
  let task = null;
  for (const col of KANBAN_COLUMNS) {
    const idx = next[col].findIndex((t) => Number(t.id) === Number(taskId));
    if (idx !== -1) {
      task = { ...next[col][idx], ...patch, column_name: toColumn };
      next[col] = next[col].filter((_, i) => i !== idx);
      break;
    }
  }
  if (!task) return board;
  next[toColumn] = [...next[toColumn], task];
  return next;
}

export function addTaskToBoard(board, task, column = 'todo') {
  const next = cloneBoard(board);
  const tid = Number(task.id);
  for (const col of KANBAN_COLUMNS) {
    next[col] = next[col].filter((t) => Number(t.id) !== tid);
  }
  next[column] = [...next[column], { ...task, column_name: column }];
  return next;
}

export function removeTaskFromBoard(board, taskId) {
  const next = cloneBoard(board);
  for (const col of KANBAN_COLUMNS) {
    next[col] = next[col].filter((t) => Number(t.id) !== Number(taskId));
  }
  return next;
}

export function replaceTaskIdInBoard(board, tempId, realTask) {
  const col = statusToColumn(realTask.status);
  let next = cloneBoard(board);
  let replaced = false;
  for (const c of KANBAN_COLUMNS) {
    next[c] = next[c].map((t) => {
      if (Number(t.id) !== Number(tempId)) return t;
      replaced = true;
      return { ...t, ...realTask, id: realTask.id, column_name: col, _pending: false };
    });
  }
  if (!replaced) return addTaskToBoard(board, realTask, col);
  const found = findTaskInBoard(next, realTask.id);
  if (found && found.column !== col) {
    next = moveTaskInBoard(next, realTask.id, col, realTask);
  }
  return next;
}

export function patchTaskInBoard(board, taskId, patch, toColumn = null) {
  const found = findTaskInBoard(board, taskId);
  if (!found) return board;
  const col = toColumn || found.column;
  if (col === found.column) {
    const next = cloneBoard(board);
    next[col] = next[col].map((t) =>
      Number(t.id) === Number(taskId) ? { ...t, ...patch } : t
    );
    return next;
  }
  return moveTaskInBoard(board, taskId, col, patch);
}