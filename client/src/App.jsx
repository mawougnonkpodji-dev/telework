import { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from 'react';
import { useAuth } from './contexts/AuthContext.jsx';
import { useProject } from './contexts/ProjectContext.jsx';
import NoProjectPrompt from './components/NoProjectPrompt';
import KanbanBoard from './components/KanbanBoard';
import Sidebar from './components/Sidebar';
import GlobalSearchBar from './components/GlobalSearchBar.jsx';
import ProjectSwitcherModal from './components/ProjectSwitcherModal.jsx';
import ProjectWizard from './components/ProjectWizard.jsx';
import NotificationBell from './components/NotificationBell.jsx';
import { getAuthSocket, joinProjectRoom, leaveProjectRoom } from './utils/socket.js';
import {
  getApiUrl,
  normalizeProjectsList,
  normalizeCreatedProject,
  kanbanApiToBoardShape,
  authJsonHeaders,
  authBearerHeaders,
  DROPPABLE_TO_TASK_STATUS,
  canManageProjectMembers,
  xpToPriority,
} from './utils/apiHelpers.js';
import { setCachedKanbanPayload } from './utils/graphCache.js';
import {
  EMPTY_BOARD,
  moveTaskInBoard,
  addTaskToBoard,
  removeTaskFromBoard,
  replaceTaskIdInBoard,
  patchTaskInBoard,
  findTaskInBoard,
} from './utils/taskHelpers.js';

const DashboardRH = lazy(() => import('./components/DashboardRH'));
const ReportsPanel = lazy(() => import('./components/ReportsPanel'));
const SprintsPanel = lazy(() => import('./components/SprintsPanel'));
const TeamView = lazy(() => import('./components/TeamView'));
const SettingsView = lazy(() => import('./components/SettingsView'));
const InvitationPanel = lazy(() => import('./components/InvitationPanel'));
const ProjectChatPanel = lazy(() => import('./components/ProjectChatPanel.jsx'));
const MeetingView = lazy(() => import('./components/MeetingView.jsx'));
const ResourceCenter = lazy(() => import('./components/ResourceCenter'));
const TaskGraphExplorer = lazy(() => import('./components/TaskGraphExplorer'));

const API_URL = getApiUrl();

function ViewLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '240px' }}>
      <div style={{
        width: '32px',
        height: '32px',
        border: '3px solid rgba(34, 211, 238, 0.2)',
        borderTopColor: '#22d3ee',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function App() {
  const { user, token, loading, refreshUser, logout } = useAuth();
  const { setActiveProjectId } = useProject();
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [serverStatus, setServerStatus] = useState('connecting');
  const [initialized, setInitialized] = useState(false);
  const [currentView, setCurrentView] = useState('workspace');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [projectTasks, setProjectTasks] = useState({});
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  // Navigation depuis les notifications
  const [meetingTarget, setMeetingTarget] = useState(null); // { type:'channel'|'dm', id:number|string }
  const mountedRef = useRef(true);
  const initialViewBootstrapped = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!token) {
      initialViewBootstrapped.current = false;
    }
  }, [token]);

  useEffect(() => {
    if (!loading) {
      if (!token) {
        setInitialized(true);
        return;
      }
      fetchData();
    }
  }, [loading, token]);

  /** Utilisateur avec au moins un projet : premier écran = tableau de bord (vue Pilotage RH). */
  useEffect(() => {
    if (!initialized || !token || !user || projects.length === 0) return;
    if (initialViewBootstrapped.current) return;
    setCurrentView('management');
    initialViewBootstrapped.current = true;
  }, [initialized, token, user, projects.length]);

  useEffect(() => {
    const handleProjectChanged = (e) => {
      if (e.detail && mountedRef.current) {
        const project = Array.isArray(e.detail) ? e.detail[0] : e.detail;
        setActiveProject(project);
        setProjects(prev => {
          const exists = prev.find(p => p.id === project.id);
          if (exists) {
            return prev.map(p => p.id === project.id ? project : p);
          }
          return [...prev, project];
        });
        fetchProjectTasks(project.id);
      }
    };
    window.addEventListener('projectChanged', handleProjectChanged);
    return () => window.removeEventListener('projectChanged', handleProjectChanged);
  }, [token]);

  // ── Navigation depuis les notifications ───────────────────────────────────
  useEffect(() => {
    const handleNavigateTo = (e) => {
      const link = e.detail;
      if (!link || typeof link !== 'string') return;

      // Format 1 : project/{id}/meeting/channel/{channelId}
      const chanMatch = link.match(/^project\/(\d+)\/meeting\/channel\/(\d*)$/);
      if (chanMatch) {
        const pid = parseInt(chanMatch[1]);
        const cid = chanMatch[2] ? parseInt(chanMatch[2]) : null;
        const p = projects.find((pr) => pr.id === pid);
        if (p) {
          setActiveProject(p);
          setActiveProjectId(p.id);
          localStorage.setItem('last_project_id', String(p.id));
          window.dispatchEvent(new CustomEvent('projectChanged', { detail: p }));
        }
        setMeetingTarget({ type: 'channel', id: cid });
        setCurrentView('meeting');
        return;
      }

      // Format 2 : project/{id}/meeting/dm/{userId}
      const dmProjMatch = link.match(/^project\/(\d+)\/meeting\/dm\/(\d+)$/);
      if (dmProjMatch) {
        const pid = parseInt(dmProjMatch[1]);
        const uid = parseInt(dmProjMatch[2]);
        const p = projects.find((pr) => pr.id === pid);
        if (p) {
          setActiveProject(p);
          setActiveProjectId(p.id);
          localStorage.setItem('last_project_id', String(p.id));
          window.dispatchEvent(new CustomEvent('projectChanged', { detail: p }));
        }
        setMeetingTarget({ type: 'dm', id: uid });
        setCurrentView('meeting');
        return;
      }

      // Format 3 : dm/{userId} — DM sans contexte projet, ouvre réunion courante
      const dmMatch = link.match(/^dm\/(\d+)$/);
      if (dmMatch) {
        setMeetingTarget({ type: 'dm', id: parseInt(dmMatch[1]) });
        setCurrentView('meeting');
        return;
      }

      // Format 4 : project/{id}/workspace
      const wsMatch = link.match(/^project\/(\d+)\/workspace$/);
      if (wsMatch) {
        const pid = parseInt(wsMatch[1]);
        const p = projects.find((pr) => pr.id === pid);
        if (p) {
          setActiveProject(p);
          setActiveProjectId(p.id);
          localStorage.setItem('last_project_id', String(p.id));
          window.dispatchEvent(new CustomEvent('projectChanged', { detail: p }));
        }
        setCurrentView('workspace');
      }
    };

    window.addEventListener('navigateTo', handleNavigateTo);
    return () => window.removeEventListener('navigateTo', handleNavigateTo);
  }, [projects]);

  useEffect(() => {
    // 30 s interval — 5 s was triggering the rate-limiter (200 req/h cap)
    const pingInterval = setInterval(() => {
      fetch(`${API_URL}/api/health/`, { method: 'GET' })
        .then(() => setServerStatus('online'))
        .catch(() => setServerStatus('offline'));
    }, 30000);
    return () => clearInterval(pingInterval);
  }, []);

  useEffect(() => {
    if (!activeProject?.id || !token) {
      setTeamMembers([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await fetch(`${API_URL}/api/projects/${activeProject.id}`, {
        headers: authJsonHeaders(),
      });
      if (!cancelled && res.ok) {
        const data = await res.json();
        setTeamMembers(data?.project?.members || []);
      }
    })();
    return () => { cancelled = true; };
  }, [activeProject?.id, token]);

  // ── Join/leave project socket room when active project changes ───────────────
  useEffect(() => {
    if (!token || !activeProject?.id) return;
    joinProjectRoom(activeProject.id);
    return () => leaveProjectRoom(activeProject.id);
  }, [token, activeProject?.id]);

  // ── Global task_changed listener → refresh KanbanBoard + all views ──────────
  useEffect(() => {
    if (!token) return;
    const socket = getAuthSocket();
    if (!socket) return;

    const handler = (data) => {
      const projId = data?.project_id;
      const taskId = data?.task_id;
      if (projId && taskId && data.action === 'deleted') {
        setProjectTasks((prev) => {
          const board = prev[projId];
          if (!board) return prev;
          return { ...prev, [projId]: removeTaskFromBoard(board, taskId) };
        });
      } else if (projId && taskId && data.action === 'created') {
        setProjectTasks((prev) => {
          const board = prev[projId];
          if (board && findTaskInBoard(board, taskId)) return prev;
          queueMicrotask(() => fetchProjectTasks(projId));
          return prev;
        });
      }
      window.dispatchEvent(new CustomEvent('taskUpdated',  { detail: data }));
      if (data.action === 'created') {
        window.dispatchEvent(new CustomEvent('taskCreated', { detail: data }));
      } else if (data.action === 'deleted') {
        window.dispatchEvent(new CustomEvent('taskDeleted', { detail: data }));
      }
    };

    socket.on('task_changed', handler);
    return () => socket.off('task_changed', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const refreshTeamMembers = useCallback(async () => {
    if (!activeProject?.id) return;
    const res = await fetch(`${API_URL}/api/projects/${activeProject.id}`, {
      headers: authJsonHeaders(),
    });
    if (res.ok) {
      const data = await res.json();
      setTeamMembers(data?.project?.members || []);
    }
  }, [activeProject?.id]);

  const isProjectAdmin = useMemo(
    () => canManageProjectMembers(user, activeProject, teamMembers),
    [user, activeProject, teamMembers],
  );

  const myProjectMemberRole = useMemo(
    () => teamMembers.find((m) => Number(m.id) === Number(user?.id))?.role,
    [teamMembers, user?.id],
  );

  const handleSearchSelectTask = (task) => {
    if (!task?.project_id) return;
    const p = projects.find((x) => x.id === task.project_id);
    if (p) handleProjectChange(p);
    setCurrentView('workspace');
  };

  const fetchData = async () => {
    try {
      await fetchProjects();
    } catch (e) {
      setInitialized(true);
    }
  };

  const fetchProjects = async (options = {}) => {
    const { preserveOnError = false } = options;
    let projectsList = [];
    try {
      const authToken = localStorage.getItem('auth_token');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`${API_URL}/api/projects/`, {
        headers: { 'Authorization': `Bearer ${authToken}` },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const projectsData = await res.json();
        projectsList = normalizeProjectsList(projectsData);
        setProjects(projectsList);

        // Priority 1: ?project=ID set after invitation acceptance
        const urlParams = new URLSearchParams(window.location.search);
        const urlProjectId = urlParams.get('project');
        if (urlProjectId) {
          // Clean the URL without reloading
          const cleanUrl = window.location.pathname;
          window.history.replaceState({}, '', cleanUrl);
        }

        const lastProjectId = localStorage.getItem('last_project_id');
        let projectToActivate = null;

        if (urlProjectId && projectsList.length > 0) {
          projectToActivate = projectsList.find(p => p.id === parseInt(urlProjectId, 10));
        }

        if (!projectToActivate && lastProjectId && projectsList.length > 0) {
          projectToActivate = projectsList.find(p => p.id === parseInt(lastProjectId, 10));
        }

        if (!projectToActivate && projectsList.length > 0) {
          projectToActivate = projectsList[0];
        }

        if (projectToActivate) {
          setActiveProject(projectToActivate);
          setActiveProjectId(projectToActivate.id);
          await Promise.all([
            fetchProjectTasks(projectToActivate.id),
            fetchProjectMembers(projectToActivate.id),
          ]);
        }
      } else if (!preserveOnError) {
        setProjects([]);
      }
    } catch (e) {
      if (!preserveOnError) setProjects([]);
    } finally {
      setInitialized(true);
    }
    return projectsList;
  };

  const fetchProjectMembers = async (projectId) => {
    if (!projectId) return;
    const authToken = localStorage.getItem('auth_token');
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTeamMembers(data?.project?.members || []);
      }
    } catch (_) {
      setTeamMembers([]);
    }
  };

  const fetchProjectTasks = async (projectId) => {
    const authToken = localStorage.getItem('auth_token');
    try {
      const taskRes = await fetch(`${API_URL}/api/tasks/project/${projectId}?light=true`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (taskRes.ok) {
        const tasksData = await taskRes.json();
        setCachedKanbanPayload(projectId, tasksData);
        const board = kanbanApiToBoardShape(tasksData);
        setProjectTasks(prev => ({ ...prev, [projectId]: board }));
      } else {
        setProjectTasks(prev => ({ ...prev, [projectId]: { todo: [], inProgress: [], review: [], done: [] } }));
      }
    } catch (e) {
      setProjectTasks(prev => ({ ...prev, [projectId]: { todo: [], inProgress: [], review: [], done: [] } }));
    }
  };

  const handleLogin = () => {
    window.location.href = '/auth';
  };

  const handleProjectCreate = async (projectData) => {
      const authToken = localStorage.getItem('auth_token');
      try {
        const res = await fetch(`${API_URL}/api/projects/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
          body: JSON.stringify(projectData)
        });
        if (res.ok) {
          const body = await res.json();
          const newProject = normalizeCreatedProject(body);
          if (!newProject?.id) {
            setIsWizardOpen(false);
            return;
          }
          setProjects(prev => [...prev, newProject]);
          setProjectTasks(prev => ({ ...prev, [newProject.id]: { todo: [], inProgress: [], review: [], done: [] } }));
          localStorage.setItem('last_project_id', newProject.id.toString());
          setActiveProjectId(newProject.id);
          handleProjectChange(newProject);
          // Rafraîchit le rôle user (le créateur devient admin)
          if (body.user) refreshUser();
        }
      } catch (e) {
        console.log('Error creating project');
      }
      setIsWizardOpen(false);
    };

  const handleProjectChange = (project) => {
    setActiveProject(project);
    localStorage.setItem('last_project_id', project.id.toString());
    setActiveProjectId(project.id);
    window.dispatchEvent(new CustomEvent('projectChanged', { detail: project }));
    if (!projectTasks[project.id]) {
      fetchProjectTasks(project.id);
    }
    fetchProjectMembers(project.id);
    setIsSwitcherOpen(false);
  };

  const handleProjectDeleted = (projectId) => {
    const remaining = projects.filter((p) => p.id !== projectId);
    setProjects(remaining);
    setProjectTasks((prev) => {
      const next = { ...prev };
      delete next[projectId];
      return next;
    });
    if (activeProject?.id === projectId) {
      const next = remaining[0] || null;
      if (next) handleProjectChange(next);
      else {
        setActiveProject(null);
        setActiveProjectId(null);
        setTeamMembers([]);
      }
    }
  };

  const updateProjectBoard = useCallback((projectId, updater) => {
    if (!projectId) return;
    setProjectTasks((prev) => {
      const board = prev[projectId] || EMPTY_BOARD;
      const nextBoard = typeof updater === 'function' ? updater(board) : updater;
      return { ...prev, [projectId]: nextBoard };
    });
  }, []);

  const rollbackBoard = useCallback((projectId, snapshot) => {
    if (!projectId || !snapshot) {
      fetchProjectTasks(projectId);
      return;
    }
    setProjectTasks((prev) => ({ ...prev, [projectId]: snapshot }));
  }, []);

  const memberLabel = useCallback((assigneeId) => {
    const m = teamMembers.find((x) => Number(x.id) === Number(assigneeId));
    return m?.name || m?.nom || (assigneeId ? `Utilisateur #${assigneeId}` : '—');
  }, [teamMembers]);

  const handleTaskStart = useCallback(async (task) => {
    const pid = activeProject?.id;
    if (!pid || !task?.id) return;

    let snapshot = null;
    setProjectTasks((prev) => {
      snapshot = prev[pid] || EMPTY_BOARD;
      return {
        ...prev,
        [pid]: moveTaskInBoard(snapshot, task.id, 'inProgress', {
          status: 'in_progress',
          start_time: new Date().toISOString(),
        }),
      };
    });

    try {
      const res = await fetch(`${API_URL}/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: authJsonHeaders(),
        body: JSON.stringify({ status: 'in_progress' }),
      });
      if (!res.ok) {
        rollbackBoard(pid, snapshot);
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Erreur lors du démarrage de la tâche');
        return;
      }
      window.dispatchEvent(new CustomEvent('taskUpdated'));
    } catch {
      rollbackBoard(pid, snapshot);
      alert('Erreur réseau');
    }
  }, [activeProject?.id, rollbackBoard]);

  const handleTaskSave = useCallback(async (taskData, editingTask) => {
    const pid = activeProject?.id;
    if (!pid) return;

    const deadlineIso = taskData.deadline
      ? new Date(taskData.deadline).toISOString()
      : null;
    const assigneeId = taskData.assignee_id ? Number(taskData.assignee_id) : null;
    const assignees = assigneeId ? [assigneeId] : [];
    const priority = xpToPriority(taskData.xp ?? 30);
    const basePayload = {
      title: taskData.title,
      description: taskData.description || '',
      deadline: deadlineIso,
      priority,
      assignees,
    };

    if (taskData.id && editingTask) {
      let snapshot = null;
      setProjectTasks((prev) => {
        snapshot = prev[pid] || EMPTY_BOARD;
        return {
          ...prev,
          [pid]: patchTaskInBoard(snapshot, editingTask.id, {
            ...basePayload,
            assignee_id: assigneeId,
            assignee_name: memberLabel(assigneeId),
            due_date: deadlineIso,
          }),
        };
      });

      try {
        const res = await fetch(`${API_URL}/api/tasks/${taskData.id}`, {
          method: 'PUT',
          headers: authJsonHeaders(),
          body: JSON.stringify(basePayload),
        });
        if (!res.ok) {
          rollbackBoard(pid, snapshot);
          alert('Échec de la mise à jour de la tâche');
          return;
        }
        window.dispatchEvent(new CustomEvent('taskUpdated'));
      } catch {
        rollbackBoard(pid, snapshot);
        alert('Erreur réseau');
      }
      return;
    }

    const tempId = -Date.now();
    const optimistic = {
      id: tempId,
      title: taskData.title,
      description: taskData.description || '',
      status: 'assigned',
      deadline: deadlineIso,
      due_date: deadlineIso,
      assignee_id: assigneeId,
      assignees,
      assignee_name: memberLabel(assigneeId),
      priority,
      created_at: new Date().toISOString(),
      _pending: true,
    };

    updateProjectBoard(pid, (b) => addTaskToBoard(b, optimistic, 'todo'));

    try {
      const res = await fetch(`${API_URL}/api/tasks/`, {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({
          project_id: pid,
          ...basePayload,
          status: 'assigned',
        }),
      });
      if (!res.ok) {
        updateProjectBoard(pid, (b) => removeTaskFromBoard(b, tempId));
        alert('Échec de la création de la tâche');
        return;
      }
      const body = await res.json().catch(() => ({}));
      const real = body.task;
      if (!real?.id) {
        updateProjectBoard(pid, (b) => removeTaskFromBoard(b, tempId));
        return;
      }

      const dep = taskData.dependency_id ? parseInt(taskData.dependency_id, 10) : null;
      if (dep && !Number.isNaN(dep)) {
        await fetch(`${API_URL}/api/tasks/${real.id}/dependencies`, {
          method: 'POST',
          headers: authJsonHeaders(),
          body: JSON.stringify({ prerequisite_task_id: dep }),
        });
      }

      updateProjectBoard(pid, (b) =>
        replaceTaskIdInBoard(b, tempId, {
          ...real,
          assignee_id: assigneeId,
          assignee_name: memberLabel(assigneeId),
          due_date: real.deadline || deadlineIso,
        })
      );
      window.dispatchEvent(new CustomEvent('taskCreated', { detail: { task_id: real.id, project_id: pid } }));
    } catch {
      updateProjectBoard(pid, (b) => removeTaskFromBoard(b, tempId));
      alert('Erreur réseau');
    }
  }, [activeProject?.id, memberLabel, rollbackBoard, updateProjectBoard]);

  const handleTaskDeliver = useCallback((taskId, deliverable, deliverableType) => {
    const pid = activeProject?.id;
    if (!pid || !taskId) return;

    let snapshot = null;
    setProjectTasks((prev) => {
      snapshot = prev[pid] || EMPTY_BOARD;
      return {
        ...prev,
        [pid]: moveTaskInBoard(snapshot, taskId, 'review', { status: 'delivered' }),
      };
    });

    (async () => {
      try {
        if (deliverableType === 'fichier' && deliverable instanceof File) {
          const fd = new FormData();
          fd.append('file', deliverable);
          const uploadRes = await fetch(`${API_URL}/api/tasks/${taskId}/attachments`, {
            method: 'POST',
            headers: authBearerHeaders(),
            body: fd,
          });
          if (!uploadRes.ok) {
            const err = await uploadRes.json().catch(() => ({}));
            throw new Error(err.error || `Upload échoué (${uploadRes.status})`);
          }
          const statusRes = await fetch(`${API_URL}/api/tasks/${taskId}`, {
            method: 'PUT',
            headers: authJsonHeaders(),
            body: JSON.stringify({ status: 'delivered' }),
          });
          if (!statusRes.ok) {
            const err = await statusRes.json().catch(() => ({}));
            throw new Error(err.error || `Mise à jour statut (${statusRes.status})`);
          }
        } else {
          const text =
            deliverableType === 'rapport'
              ? String(deliverable || '')
              : deliverableType === 'url'
                ? `Livrable (URL): ${deliverable}`
                : String(deliverable || '');
          const ures = await fetch(`${API_URL}/api/tasks/${taskId}`, {
            method: 'PUT',
            headers: authJsonHeaders(),
            body: JSON.stringify({ description: text, status: 'delivered' }),
          });
          if (!ures.ok) {
            const err = await ures.json().catch(() => ({}));
            throw new Error(err.error || `Mise à jour échouée (${ures.status})`);
          }
        }
        window.dispatchEvent(new CustomEvent('taskUpdated'));
      } catch (err) {
        rollbackBoard(pid, snapshot);
        alert('Erreur lors de la livraison : ' + err.message);
      }
    })();
  }, [activeProject?.id, rollbackBoard]);

  const handleTaskApprove = useCallback(async (taskId) => {
    const pid = activeProject?.id;
    if (!pid || !taskId) return;

    let snapshot = null;
    setProjectTasks((prev) => {
      snapshot = prev[pid] || EMPTY_BOARD;
      return {
        ...prev,
        [pid]: moveTaskInBoard(snapshot, taskId, 'done', { status: 'validated' }),
      };
    });

    try {
      const res = await fetch(`${API_URL}/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: authJsonHeaders(),
        body: JSON.stringify({ status: 'validated' }),
      });
      if (!res.ok) {
        rollbackBoard(pid, snapshot);
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Erreur lors de la validation');
        return;
      }
      window.dispatchEvent(new CustomEvent('taskUpdated'));
    } catch {
      rollbackBoard(pid, snapshot);
      alert('Erreur réseau');
    }
  }, [activeProject?.id, rollbackBoard]);

  const handleTaskReject = useCallback(async (taskId, comment) => {
    const pid = activeProject?.id;
    if (!pid || !taskId) return;

    let snapshot = null;
    setProjectTasks((prev) => {
      snapshot = prev[pid] || EMPTY_BOARD;
      return {
        ...prev,
        [pid]: moveTaskInBoard(snapshot, taskId, 'todo', { status: 'rejected' }),
      };
    });

    try {
      const res = await fetch(`${API_URL}/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: authJsonHeaders(),
        body: JSON.stringify({ status: 'rejected' }),
      });
      if (!res.ok) {
        rollbackBoard(pid, snapshot);
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Erreur lors du rejet');
        return;
      }
      if (comment?.trim()) {
        await fetch(`${API_URL}/api/tasks/${taskId}/comments`, {
          method: 'POST',
          headers: authJsonHeaders(),
          body: JSON.stringify({ content: comment.trim() }),
        });
      }
      window.dispatchEvent(new CustomEvent('taskUpdated'));
    } catch {
      rollbackBoard(pid, snapshot);
      alert('Erreur réseau');
    }
  }, [activeProject?.id, rollbackBoard]);

  const handleTaskDelete = useCallback(async (taskId) => {
    const pid = activeProject?.id;
    if (!pid || !taskId) return;

    let snapshot = null;
    setProjectTasks((prev) => {
      snapshot = prev[pid] || EMPTY_BOARD;
      return { ...prev, [pid]: removeTaskFromBoard(snapshot, taskId) };
    });

    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`${API_URL}/api/tasks/${taskId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        rollbackBoard(pid, snapshot);
        alert('Échec de la suppression');
        return;
      }
      window.dispatchEvent(new CustomEvent('taskDeleted', { detail: { task_id: taskId, project_id: pid } }));
    } catch {
      rollbackBoard(pid, snapshot);
      alert('Erreur réseau');
    }
  }, [activeProject?.id, rollbackBoard]);

  const handleTaskMove = async (taskId, fromColumn, toColumn) => {
    const status = DROPPABLE_TO_TASK_STATUS[toColumn];
    if (!status) return;

    const pid = activeProject?.id;
    if (!pid) return;

    let snapshot = null;
    setProjectTasks((prev) => {
      snapshot = prev[pid] || EMPTY_BOARD;
      const currentTasks = { ...snapshot };
      const taskIndex = currentTasks[fromColumn]?.findIndex((t) => t.id === taskId);
      if (taskIndex === -1 || taskIndex === undefined) return prev;
      const task = currentTasks[fromColumn][taskIndex];
      currentTasks[fromColumn] = currentTasks[fromColumn].filter((_, i) => i !== taskIndex);
      currentTasks[toColumn] = [...(currentTasks[toColumn] || []), { ...task, status, column_name: toColumn }];
      return { ...prev, [pid]: currentTasks };
    });

    try {
      const res = await fetch(`${API_URL}/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: authJsonHeaders(),
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        rollbackBoard(pid, snapshot);
        return;
      }
      window.dispatchEvent(new CustomEvent('taskUpdated'));
    } catch {
      rollbackBoard(pid, snapshot);
    }
  };

  if (loading || !initialized) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'var(--c-bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '3px solid rgba(34, 211, 238, 0.2)',
          borderTopColor: '#22d3ee',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!token) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, var(--c-bg) 0%, var(--c-surface) 50%, var(--c-bg) 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ color: '#22d3ee', fontSize: '48px', fontWeight: '700', marginBottom: '16px', letterSpacing: '-0.02em' }}>
            TELEWORK
          </h1>
          <p style={{ color: 'var(--c-text4)', marginBottom: '32px' }}>Glass-OS Control Center</p>
          <button
            onClick={handleLogin}
            style={{
              padding: '14px 32px',
              background: 'linear-gradient(135deg, #22d3ee 0%, #0891b2 100%)',
              border: 'none',
              borderRadius: '8px',
              color: 'var(--c-bg)',
              fontSize: '14px',
              fontWeight: '700',
              cursor: 'pointer'
            }}
          >
            Se connecter
          </button>
        </div>
      </div>
    );
  }

  const currentTasks = projectTasks[activeProject?.id] || { todo: [], inProgress: [], review: [], done: [] };
  const isGestionnaire = user?.userRole === 'gestionnaire' || user?.role === 'admin';

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, var(--c-bg) 0%, var(--c-surface) 50%, var(--c-bg) 100%)',
      display: 'flex'
    }}>
      <Sidebar 
        currentView={currentView}
        onViewChange={setCurrentView}
        user={user}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        onSwitcherOpen={() => setIsSwitcherOpen(true)}
        isProjectAdmin={isProjectAdmin}
        activeProject={activeProject}
        onLogout={logout}
      />

      {/* ── Notification bell — fixed, always visible ── */}
      <div style={{
        position: 'fixed',
        top: '16px',
        right: '20px',
        zIndex: 1000,
      }}>
        <NotificationBell />
      </div>

      {isSwitcherOpen && (
        <ProjectSwitcherModal
          isOpen={isSwitcherOpen}
          onClose={() => setIsSwitcherOpen(false)}
          activeProject={activeProject}
          onProjectChange={handleProjectChange}
          onProjectDeleted={handleProjectDeleted}
          projects={projects}
          onCreateProject={handleProjectCreate}
          user={user}
        />
      )}

      {isWizardOpen && (
        <ProjectWizard
          onComplete={handleProjectCreate}
          onCancel={() => setIsWizardOpen(false)}
        />
      )}

{/* ── Zone principale — contenu dynamique selon la vue ── */}
      <div style={{
        flex: 1,
        marginLeft: sidebarCollapsed ? '60px' : '220px',
        transition: 'margin-left 0.28s ease',
        minHeight: '100vh',
        height: '100vh',
        overflowY: 'auto',
        overflowX: 'hidden',
      }}>

        {/* ── Aucun projet : invite à créer ou attendre ── */}
        {projects.length === 0 && (
          <NoProjectPrompt onCreateProject={() => setIsWizardOpen(true)} />
        )}

        {/* ── Vues principales (uniquement si un projet existe) ── */}
        {projects.length > 0 && <>

        {/* ── Vue Workspace (Kanban) ── */}
        {currentView === 'workspace' && (
          <div style={{ padding: '22px' }}>

            {/* En-tête du workspace : projet actif + recherche + avatar */}
            <div style={{
              padding: '14px 20px',
              marginBottom: '4px',
              borderBottom: '1px solid var(--c-border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
            }}>

              {/* Côté gauche : icône projet + nom + slug + recherche */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                flexWrap: 'wrap',
                flex: '1 1 260px',
              }}>
                {/* Icône / lettre du projet actif */}
                <div style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '10px',
                  background: `linear-gradient(135deg, ${activeProject?.color_theme || '#22d3ee'}, ${activeProject?.color_theme || '#22d3ee'}cc)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '17px',
                  flexShrink: 0,
                }}>
                  {activeProject?.icon || activeProject?.name?.charAt(0).toUpperCase() || '?'}
                </div>

                {/* Nom du projet + indicateur statut serveur */}
                <div className="glass-card" style={{
                  padding: '7px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '9px',
                }}>
                  {/* Point vert/rouge selon connectivité serveur */}
                  <div style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    flexShrink: 0,
                    background: serverStatus === 'online' ? '#10b981' : '#ef4444',
                    boxShadow: serverStatus === 'online'
                      ? '0 0 0 2px rgba(16,185,129,0.2)'
                      : '0 0 0 2px rgba(239,68,68,0.2)',
                  }} />
                  <span style={{ fontSize: '13px', color: 'var(--c-text2)', fontWeight: '500' }}>
                    {activeProject?.name || 'Sélectionner un espace'}
                  </span>
                </div>

                {/* Slug du projet (identifiant court) */}
                {activeProject?.slug && (
                  <div style={{
                    fontSize: '11px',
                    color: 'var(--c-text4)',
                    padding: '3px 9px',
                    background: 'rgba(34,211,238,0.08)',
                    borderRadius: '6px',
                    border: '1px solid rgba(34,211,238,0.18)',
                    letterSpacing: '0.04em',
                    fontWeight: '500',
                  }}>
                    {activeProject.slug}
                  </div>
                )}

                <GlobalSearchBar
                  projects={projects}
                  activeProject={activeProject}
                  onSelectProject={handleProjectChange}
                  onSelectTask={handleSearchSelectTask}
                />
              </div>

              {/* Côté droit : avatar utilisateur connecté */}
              <div
                title={user?.name || user?.email || ''}
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '50%',
                  background: user?.avatar
                    ? 'transparent'
                    : 'linear-gradient(135deg, #22d3ee, #0891b2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: 'var(--c-bg)',
                  flexShrink: 0,
                  overflow: 'hidden',
                  cursor: 'default',
                }}
              >
                {user?.avatar
                  ? <img src={user.avatar} alt={user?.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : (user?.name || user?.nom || 'U').charAt(0).toUpperCase()
                }
              </div>
            </div>

            {/* Corps du workspace — KanbanBoard */}
            <div style={{ position: 'relative' }}>
            <KanbanBoard
              tasks={currentTasks}
              projects={projects}
              activeProject={activeProject}
              teamMembers={teamMembers}
              canManageProject={isProjectAdmin}
              myRole={myProjectMemberRole}
              onProjectChange={handleProjectChange}
              onProjectCreate={handleProjectCreate}
              onTaskMove={handleTaskMove}
              onTaskStart={handleTaskStart}
              onTaskSave={handleTaskSave}
              user={user}
              onDeleteTask={handleTaskDelete}
              onTaskSubmit={handleTaskDeliver}
              onTaskApprove={handleTaskApprove}
              onTaskReject={handleTaskReject}
            />

            {/* ── Bulle chat flottante ── */}
            <div style={{ position: 'fixed', bottom: '28px', right: '32px', zIndex: 300 }}>
              {/* Panneau chat */}
              {chatOpen && (
                <div style={{
                  position: 'absolute', bottom: '64px', right: 0,
                  width: '360px', height: '520px',
                  borderRadius: '16px', overflow: 'hidden',
                  boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                  animation: 'chatSlideUp 0.2s ease',
                }}>
                  <style>{`
                    @keyframes chatSlideUp {
                      from { opacity: 0; transform: translateY(16px); }
                      to   { opacity: 1; transform: translateY(0); }
                    }
                  `}</style>
                  <Suspense fallback={<ViewLoader />}>
                    <ProjectChatPanel
                      projectId={activeProject?.id}
                      user={user}
                      canPost={myProjectMemberRole !== 'observateur'}
                      canCreateChannel={isProjectAdmin}
                      members={teamMembers}
                    />
                  </Suspense>
                </div>
              )}
              {/* Bouton bulle */}
              <button
                onClick={() => setChatOpen((v) => !v)}
                title={chatOpen ? 'Fermer le chat' : 'Ouvrir le chat'}
                style={{
                  width: '52px', height: '52px', borderRadius: '50%',
                  background: chatOpen
                    ? 'linear-gradient(135deg, #4f46e5, #7c3aed)'
                    : 'linear-gradient(135deg, #22d3ee, #0891b2)',
                  border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                  transition: 'transform 0.2s, background 0.2s',
                  transform: chatOpen ? 'rotate(180deg) scale(1.05)' : 'scale(1)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = chatOpen ? 'rotate(180deg) scale(1.1)' : 'scale(1.1)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = chatOpen ? 'rotate(180deg) scale(1.05)' : 'scale(1)'; }}
              >
                {chatOpen
                  ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                }
              </button>
            </div>
            </div>
          </div>
        )}

{currentView === 'management' && (
           <Suspense fallback={<ViewLoader />}>
             <DashboardRH
               projects={projects}
               projectMembers={teamMembers}
               activeProject={activeProject}
             />
           </Suspense>
         )}

        {currentView === 'structure-map' && (
          <Suspense fallback={<ViewLoader />}>
            <TaskGraphExplorer
              projectId={activeProject?.id}
              user={user}
            />
          </Suspense>
        )}

        {currentView === 'team' && isProjectAdmin && (
          <Suspense fallback={<ViewLoader />}>
            <TeamView
              projectId={activeProject?.id}
              projectTasks={projectTasks[activeProject?.id]}
            />
          </Suspense>
        )}

        {currentView === 'reports' && (isProjectAdmin || myProjectMemberRole === 'observateur') && (
          <Suspense fallback={<ViewLoader />}>
            <ReportsPanel projectId={activeProject?.id} myRole={myProjectMemberRole} />
          </Suspense>
        )}

        {currentView === 'sprints' && isProjectAdmin && (
          <Suspense fallback={<ViewLoader />}>
            <SprintsPanel projectId={activeProject?.id} isAdmin={isProjectAdmin} />
          </Suspense>
        )}

        {currentView === 'invitations' && isProjectAdmin && (
          <div style={{ padding: '24px' }}>
            <div style={{
              padding: '16px 24px',
              borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
              marginBottom: '24px'
            }}>
              <h2 style={{ color: 'var(--c-text)', fontSize: '20px', fontWeight: '700' }}>Invitations</h2>
              <p style={{ color: 'var(--c-text4)', fontSize: '13px', marginTop: '4px' }}>
                Générez des liens sécurisés pour inviter des collaborateurs
              </p>
            </div>
            <div style={{
              background: 'rgba(30, 41, 59, 0.6)',
              borderRadius: '16px',
              padding: '24px',
              border: '1px solid rgba(148, 163, 184, 0.1)'
            }}>
              <Suspense fallback={<ViewLoader />}>
                <InvitationPanel
                  teamName={user?.teamName || 'Équipe'}
                  projectId={activeProject?.id}
                  onMembersChanged={refreshTeamMembers}
                />
              </Suspense>
            </div>
          </div>
        )}

        {currentView === 'meeting' && (
          <div style={{ height: '100vh' }}>
            <Suspense fallback={<ViewLoader />}>
              <MeetingView
                projectId={activeProject?.id}
                user={user}
                members={teamMembers}
                isAdmin={isProjectAdmin}
                meetingTarget={meetingTarget}
                onMeetingTargetConsumed={() => setMeetingTarget(null)}
              />
            </Suspense>
          </div>
        )}

        {currentView === 'resources' && (
          <Suspense fallback={<ViewLoader />}>
            <ResourceCenter user={user} projectId={activeProject?.id} myRole={myProjectMemberRole} />
          </Suspense>
        )}

        {currentView === 'settings' && (
          <Suspense fallback={<ViewLoader />}>
            <SettingsView user={user} activeProject={activeProject} myProjectRole={myProjectMemberRole} />
          </Suspense>
        )}

        </>}
      </div>
    </div>
  );
}

export default App;