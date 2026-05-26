/** Mapping rôle projet (valeur DB) → label français affiché. */
export const ROLE_LABELS = {
  admin:       'Gestionnaire',
  member:      'Membre',
  observateur: 'Observateur',
};

/** Base URL du backend Flask (voir VITE_API_URL dans .env du client). */
export function getApiUrl() {
  return import.meta.env.VITE_API_URL || 'http://localhost:3001';
}

export function authJsonHeaders() {
  const t = localStorage.getItem('auth_token');
  const h = { 'Content-Type': 'application/json' };
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

/** Pour FormData / upload : ne pas fixer Content-Type. */
export function authBearerHeaders() {
  const t = localStorage.getItem('auth_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/** Colonnes Kanban UI → statut tâche API (PUT /api/tasks/:id). */
export const DROPPABLE_TO_TASK_STATUS = {
  todo: 'assigned',
  inProgress: 'in_progress',
  review: 'delivered',
  done: 'validated',
};

export function xpToPriority(xp) {
  const n = Number(xp) || 30;
  if (n >= 80) return 'high';
  if (n >= 45) return 'medium';
  return 'low';
}

/**
 * Liste plate de tâches (graphe de dépendances, etc.) depuis GET /api/tasks/project/:id.
 */
export function flattenKanbanTasks(apiJson) {
  const k = apiJson?.kanban || {};
  const colByStatus = {
    assigned: 'todo',
    in_progress: 'inProgress',
    delivered: 'review',
    validated: 'done',
    rejected: 'todo',
  };
  const seen = new Map();
  for (const st of Object.keys(k)) {
    const col = colByStatus[st] || 'todo';
    for (const t of k[st] || []) {
      if (seen.has(t.id)) continue;
      const depends_on = Array.isArray(t.depends_on) ? [...t.depends_on] : [];
      seen.set(t.id, {
        ...t,
        column_name: col,
        depends_on,
        dependency_id: depends_on[0] ?? null,
      });
    }
  }
  return Array.from(seen.values());
}

/**
 * Liste des projets : l'API renvoie { projects: [...] }.
 * Garde la compatibilité si jamais une route renvoie un tableau brut.
 */
export function normalizeProjectsList(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.projects)) return payload.projects;
  return [];
}

/** Réponse POST /api/projects/ : { message, project } */
export function normalizeCreatedProject(payload) {
  if (!payload) return null;
  if (payload.project) return payload.project;
  if (payload.id && payload.name) return payload;
  return null;
}

/**
 * GET /api/tasks/project/:id renvoie { kanban: { assigned, in_progress, ... } }.
 * Le Kanban local attend todo | inProgress | review | done.
 */
export function kanbanApiToBoardShape(apiJson) {
  const k = apiJson?.kanban || {};
  const rejected = k.rejected || [];
  const assigned = k.assigned || [];
  return {
    todo: [...assigned, ...rejected],
    inProgress: k.in_progress || [],
    review: k.delivered || [],
    done: k.validated || [],
  };
}

/** Admin projet (backend: propriétaire ou rôle admin dans project_members). */
export function canManageProjectMembers(user, project, teamMembersFromProject) {
  if (!user?.id || !project?.id) return false;
  if (user.role === 'admin') return true;
  const ownerId = project.owner_id;
  if (ownerId != null && Number(ownerId) === Number(user.id)) return true;
  const me = (teamMembersFromProject || []).find((m) => Number(m.id) === Number(user.id));
  return me?.role === 'admin';
}

/** Adapte les tâches API (assignees[], deadline) au modèle attendu par le Kanban historique. */
export function enrichBoardTasks(board, members = []) {
  if (!board) return board;
  const byId = new Map((members || []).map((m) => [Number(m.id), m]));
  const mapTask = (t) => {
    const ids = Array.isArray(t.assignees) ? t.assignees : [];
    const first = ids.length ? Number(ids[0]) : null;
    const m = first != null ? byId.get(first) : null;
    const deadline = t.deadline || t.due_date;
    return {
      ...t,
      assignee_id: first ?? t.assignee_id ?? null,
      assignee_name: m?.name || (first ? `Utilisateur #${first}` : '—'),
      due_date: deadline,
      validation_status: t.validation_status || t.status,
    };
  };
  const keys = ['todo', 'inProgress', 'review', 'done'];
  const out = { ...board };
  for (const k of keys) {
    out[k] = (board[k] || []).map(mapTask);
  }
  return out;
}

/** Adapte la réponse de GET /api/reports/projects/:id/dashboard au modèle attendu par DashboardRH. */
export function adaptReportsDashboardPayload(apiJson) {
  if (!apiJson || !apiJson.summary) return null;
  const s = apiJson.summary;
  const members = apiJson.member_load || [];
  const withLoad = members.filter((m) => (m.assigned_tasks || 0) > 0);
  const xp = members.reduce((acc, m) => acc + (m.validated_tasks || 0) * 10, 0);
  return {
    summary: {
      completionRate: s.completion_percent ?? 0,
      blockedCount: s.overdue_tasks ?? 0,
      totalXp: xp,
      activeMembers: withLoad.length,
      totalMembers: members.length || 1,
    },
    workload: members.map((m) => ({
      name: m.name,
      activeTasks: m.assigned_tasks || 0,
      completedTasks: m.validated_tasks || 0,
      xp: (m.validated_tasks || 0) * 10,
    })),
    leaderboard: (apiJson.member_load || []).map((m) => ({
      userId: m.user_id ?? m.id,
      name: m.name,
      role: ROLE_LABELS[m.role] || m.role || 'Membre',
      xp: (m.validated_tasks || 0) * 10,
      activeTasks: m.assigned_tasks || 0,
      // status is managed in real-time via socket (not hardcoded here)
    })),
    statusDistribution: {
      todo: s.assigned_tasks ?? 0,
      inProgress: s.in_progress_tasks ?? 0,
      review: s.delivered_tasks ?? 0,
      done: s.validated_tasks ?? 0,
    },
  };
}
