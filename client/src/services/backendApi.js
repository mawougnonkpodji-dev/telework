/**
 * Appels HTTP alignés sur le backend Flask (/api/*).
 * Préférer ces helpers aux URLs en dur dans les composants.
 */
import {
  getApiUrl,
  authJsonHeaders,
  authBearerHeaders,
  normalizeProjectsList,
} from '../utils/apiHelpers.js';

const url = (path) => `${getApiUrl()}${path.startsWith('/') ? path : `/${path}`}`;

export async function apiGlobalSearch(q) {
  const res = await fetch(`${url('/api/search/')}?q=${encodeURIComponent(q)}`, {
    headers: authJsonHeaders(),
  });
  if (!res.ok) return null;
  return res.json();
}

/** Recherche de tâches dans un projet (GET /api/search/tasks). */
export async function apiSearchTasks(projectId, params = {}) {
  const qs = new URLSearchParams();
  qs.set('project_id', String(projectId));
  Object.entries(params).forEach(([k, v]) => {
    if (v == null || v === '') return;
    qs.set(k, String(v));
  });
  const res = await fetch(`${url('/api/search/tasks')}?${qs}`, { headers: authJsonHeaders() });
  if (!res.ok) return null;
  return res.json();
}

export async function listPayrollRuns(projectId, page = 1) {
  const res = await fetch(
    `${url(`/api/payroll/projects/${projectId}/runs`)}?page=${page}&per_page=50`,
    { headers: authJsonHeaders() }
  );
  if (!res.ok) return null;
  return res.json();
}

export async function generatePayrollRun(projectId, body = {}) {
  return fetch(url(`/api/payroll/projects/${projectId}/runs/generate`), {
    method: 'POST',
    headers: authJsonHeaders(),
    body: JSON.stringify(body),
  });
}

export async function getPayrollRun(runId, page = 1) {
  const res = await fetch(
    `${url(`/api/payroll/runs/${runId}`)}?page=${page}&per_page=100`,
    { headers: authJsonHeaders() }
  );
  if (!res.ok) return null;
  return res.json();
}

export function payrollSlipHtmlPath(runId, userId) {
  return `/api/payroll/runs/${runId}/slips/${userId}/html`;
}

export async function openPayrollSlipInNewTab(runId, userId) {
  const path = payrollSlipHtmlPath(runId, userId);
  const res = await fetch(url(path), { headers: authJsonHeaders() });
  if (!res.ok) return false;
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  window.open(href, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(href), 120000);
  return true;
}

/** Download payslip PDF — triggers a browser file download. */
export async function downloadPayrollSlipPdf(runId, userId, filename) {
  const res = await fetch(url(`/api/payroll/runs/${runId}/slips/${userId}/pdf`), {
    headers: authJsonHeaders(),
  });
  if (!res.ok) return false;
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename || `fiche-paie-${runId}-${userId}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(href), 60000);
  return true;
}

/** Fetch payslips for the authenticated user (across all projects).
 *  Returns the parsed JSON on success, or throws an Error with status info on failure. */
export async function fetchMyPayslips(page = 1) {
  const res = await fetch(url(`/api/payroll/my-slips?page=${page}&per_page=50`), {
    headers: authJsonHeaders(),
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error || ''; } catch { /* noop */ }
    throw new Error(`HTTP ${res.status}${detail ? ` — ${detail}` : ''}`);
  }
  return res.json();
}

/** Any project member can call this to generate (or retrieve) their own
 *  payslip for the current month.  Returns parsed JSON on success, throws
 *  on HTTP error. */
export async function generateMyPayslip(projectId) {
  const res = await fetch(url(`/api/payroll/projects/${projectId}/my-slip`), {
    method: 'POST',
    headers: authJsonHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data; // { slip, run, already_existed, message }
}

export async function listMobileMoneyTransactions(projectId, page = 1) {
  const res = await fetch(
    `${url(`/api/mobile-money/projects/${projectId}/transactions`)}?page=${page}&per_page=50`,
    { headers: authJsonHeaders() }
  );
  if (!res.ok) return null;
  return res.json();
}

export async function createMobileMoneyTransaction(projectId, payload) {
  return fetch(url(`/api/mobile-money/projects/${projectId}/transactions`), {
    method: 'POST',
    headers: authJsonHeaders(),
    body: JSON.stringify(payload),
  });
}

/** Projets correspondant à une requête (recherche globale + filtre local). */
export async function searchProjectsForSwitcher(query, localProjects) {
  const q = (query || '').trim();
  if (q.length < 2) {
    if (!q) return localProjects || [];
    return (localProjects || []).filter((p) =>
      (p.name || '').toLowerCase().includes(q.toLowerCase())
    );
  }
  const data = await apiGlobalSearch(q);
  if (!data?.results?.projects?.length) {
    return (localProjects || []).filter((p) =>
      (p.name || '').toLowerCase().includes(q.toLowerCase())
    );
  }
  const ids = new Set(data.results.projects.map((p) => p.id));
  const merged = [];
  for (const p of localProjects || []) {
    if (ids.has(p.id)) merged.push(p);
  }
  for (const p of data.results.projects) {
    if (!merged.some((x) => x.id === p.id)) merged.push(p);
  }
  return merged;
}

export function recentProjectsFromList(projects, limit = 5) {
  const list = [...(projects || [])];
  const lastId = localStorage.getItem('last_project_id');
  list.sort((a, b) => {
    if (lastId && String(a.id) === lastId) return -1;
    if (lastId && String(b.id) === lastId) return 1;
    return (b.id || 0) - (a.id || 0);
  });
  return list.slice(0, limit);
}

export async function fetchNotifications(page = 1) {
  const res = await fetch(`${url('/api/notifications/')}?page=${page}&per_page=30`, {
    headers: authJsonHeaders(),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function markNotificationRead(id) {
  return fetch(url(`/api/notifications/${id}/read`), {
    method: 'PUT',
    headers: authJsonHeaders(),
  });
}

export async function markAllNotificationsRead() {
  return fetch(url('/api/notifications/read-all'), {
    method: 'PUT',
    headers: authJsonHeaders(),
  });
}

export async function fetchProjectMembers(projectId) {
  const res = await fetch(url(`/api/projects/${projectId}`), { headers: authJsonHeaders() });
  if (!res.ok) return [];
  const data = await res.json();
  return data?.project?.members || [];
}

export async function addProjectMember(projectId, email, role) {
  const res = await fetch(url(`/api/projects/${projectId}/members`), {
    method: 'POST',
    headers: authJsonHeaders(),
    body: JSON.stringify({ email, role }),
  });
  return res;
}

export async function listChatAttachments(projectId, page = 1) {
  const res = await fetch(
    `${url(`/api/messages/project/${projectId}/attachments`)}?page=${page}&per_page=50`,
    { headers: authJsonHeaders() }
  );
  if (!res.ok) return null;
  return res.json();
}

export async function uploadChatAttachment(projectId, file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(url(`/api/messages/project/${projectId}/attachments`), {
    method: 'POST',
    headers: authBearerHeaders(),
    body: fd,
  });
  return res;
}

export async function deleteChatAttachment(attachmentId) {
  return fetch(url(`/api/messages/attachments/${attachmentId}`), {
    method: 'DELETE',
    headers: authJsonHeaders(),
  });
}

export async function deleteChannel(projectId, channelId) {
  const res = await fetch(url(`/api/messages/channels/${projectId}/${channelId}`), {
    method: 'DELETE',
    headers: authJsonHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

export async function fetchProjectTasksKanban(projectId, perPage = 200, light = false) {
  const qs = new URLSearchParams({ per_page: String(perPage) });
  if (light) qs.set('light', 'true');
  const res = await fetch(
    `${url(`/api/tasks/project/${projectId}`)}?${qs}`,
    { headers: authJsonHeaders() }
  );
  if (!res.ok) return null;
  return res.json();
}

/** Livrables projet (GET /api/tasks/project/:id/deliverables) — une requête. */
export async function listProjectDeliverables(projectId, limit = 50) {
  const res = await fetch(
    `${url(`/api/tasks/project/${projectId}/deliverables`)}?limit=${limit}`,
    { headers: authJsonHeaders() }
  );
  if (!res.ok) return null;
  return res.json();
}

export async function fetchTaskById(taskId) {
  const res = await fetch(url(`/api/tasks/${taskId}`), { headers: authJsonHeaders() });
  if (!res.ok) return null;
  return res.json();
}

/** Ajoute un commentaire sur une tâche (POST /api/tasks/:id/comments). */
export async function addTaskComment(taskId, content) {
  const res = await fetch(url(`/api/tasks/${taskId}/comments`), {
    method: 'POST',
    headers: authJsonHeaders(),
    body: JSON.stringify({ content }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data; // { message, comment }
}

export async function deleteTaskAttachment(taskId, attachmentId) {
  return fetch(url(`/api/tasks/${taskId}/attachments/${attachmentId}`), {
    method: 'DELETE',
    headers: authJsonHeaders(),
  });
}

export async function addTaskDependency(taskId, prerequisiteTaskId) {
  return fetch(url(`/api/tasks/${taskId}/dependencies`), {
    method: 'POST',
    headers: authJsonHeaders(),
    body: JSON.stringify({ prerequisite_task_id: prerequisiteTaskId }),
  });
}

export async function removeTaskDependency(taskId, prerequisiteTaskId) {
  return fetch(url(`/api/tasks/${taskId}/dependencies/${prerequisiteTaskId}`), {
    method: 'DELETE',
    headers: authJsonHeaders(),
  });
}

export async function listContracts(projectId) {
  const res = await fetch(url(`/api/contracts/projects/${projectId}`), {
    headers: authJsonHeaders(),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function signContract(contractId) {
  return fetch(url(`/api/contracts/${contractId}/sign`), {
    method: 'PUT',
    headers: authJsonHeaders(),
  });
}

export async function fetchReportBurndown(projectId, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const path = qs
    ? `${url(`/api/reports/projects/${projectId}/burndown`)}?${qs}`
    : url(`/api/reports/projects/${projectId}/burndown`);
  const res = await fetch(path, { headers: authJsonHeaders() });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchReportVelocity(projectId) {
  const res = await fetch(url(`/api/reports/projects/${projectId}/velocity`), {
    headers: authJsonHeaders(),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchReportExportCsv(projectId) {
  const res = await fetch(url(`/api/reports/projects/${projectId}/export.csv`), {
    headers: authBearerHeaders(),
  });
  return res;
}

export async function fetchReportDashboard(projectId) {
  try {
    const res = await fetch(url(`/api/reports/projects/${projectId}/dashboard`), {
      headers: authBearerHeaders(),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export async function fetchReportMonthlyScoring(projectId, month = '') {
  try {
    const qs = month ? `?month=${month}` : '';
    const res = await fetch(url(`/api/reports/projects/${projectId}/scoring/monthly${qs}`), {
      headers: authBearerHeaders(),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export async function fetchReportExportPdf(projectId) {
  const res = await fetch(url(`/api/reports/projects/${projectId}/export.pdf`), {
    headers: authBearerHeaders(),
  });
  return res;
}

export async function fetchProjectSprints(projectId) {
  try {
    const res = await fetch(url(`/api/sprints/project/${projectId}`), {
      headers: authBearerHeaders(),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.sprints || data || [];
  } catch { return []; }
}

export async function createSprint(payload) {
  const res = await fetch(url('/api/sprints/'), {
    method: 'POST',
    headers: authJsonHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

export async function updateSprint(sprintId, payload) {
  const res = await fetch(url(`/api/sprints/${sprintId}`), {
    method: 'PUT',
    headers: authJsonHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

export async function deleteSprint(sprintId) {
  const res = await fetch(url(`/api/sprints/${sprintId}`), {
    method: 'DELETE',
    headers: authJsonHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

export async function fetchSprintDetail(sprintId) {
  const res = await fetch(url(`/api/sprints/${sprintId}`), {
    headers: authJsonHeaders(),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function assignTasksToSprint(sprintId, taskIds) {
  const res = await fetch(url(`/api/sprints/${sprintId}/tasks`), {
    method: 'POST',
    headers: authJsonHeaders(),
    body: JSON.stringify({ task_ids: taskIds }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

export { getApiUrl, normalizeProjectsList, authJsonHeaders, authBearerHeaders };
