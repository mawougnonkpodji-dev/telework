import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuth } from './contexts/AuthContext.jsx';
import { useProject } from './contexts/ProjectContext.jsx';
import SetupWizard from './components/SetupWizard';
import KanbanBoard from './components/KanbanBoard';
import DashboardRH from './components/DashboardRH';
import Sidebar from './components/Sidebar';
import ReportsPanel from './components/ReportsPanel';
import SprintsPanel from './components/SprintsPanel';
import TeamView from './components/TeamView';
import SettingsView from './components/SettingsView';
import InvitationPanel from './components/InvitationPanel';
import ProjectChatPanel from './components/ProjectChatPanel.jsx';
import MeetingView from './components/MeetingView.jsx';
import GlobalSearchBar from './components/GlobalSearchBar.jsx';
import ResourceCenter from './components/ResourceCenter';
import TaskGraphExplorer from './components/TaskGraphExplorer';
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
} from './utils/apiHelpers.js';

const API_URL = getApiUrl();

function App() {
  const { user, token, loading } = useAuth();
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
      if (!projId) return;
      // Re-fetch tasks → KanbanBoard & TeamView re-render via props
      fetchProjectTasks(projId);
      // Window events for DashboardRH, ReportsPanel, etc.
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
      const authToken = localStorage.getItem('auth_token');
      const res = await fetch(`${API_URL}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        await res.json();
      }
    } catch (e) {
      console.log('Error fetching team data');
    }
    try {
      await fetchProjects();
    } catch (e) {
      // Failsafe: never block the app forever on initial data loading.
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
          await fetchProjectTasks(projectToActivate.id);
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

  const fetchProjectTasks = async (projectId) => {
    const authToken = localStorage.getItem('auth_token');
    try {
      const taskRes = await fetch(`${API_URL}/api/tasks/project/${projectId}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (taskRes.ok) {
        const tasksData = await taskRes.json();
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

  const handleSetupWizardComplete = async (payload) => {
    const created = payload?.projects;
    if (Array.isArray(created) && created.length) {
      setProjects(created);
      const p = created[0];
      setActiveProject(p);
      setActiveProjectId(p.id);
      localStorage.setItem('last_project_id', String(p.id));
      fetchProjectTasks(p.id);
    }
    const list = await fetchProjects({ preserveOnError: true });
    if (!list.length && (!created || !created.length)) {
      window.alert(
        'Impossible de charger vos projets après la création. Vérifiez le réseau ou reconnectez-vous.'
      );
    }
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
          setActiveProject(newProject);
          setProjectTasks(prev => ({ ...prev, [newProject.id]: { todo: [], inProgress: [], review: [], done: [] } }));
          localStorage.setItem('last_project_id', newProject.id.toString());
          setActiveProjectId(newProject.id); // sync
          handleProjectChange(newProject);
        }
      } catch (e) {
        console.log('Error creating project');
      }
      setIsWizardOpen(false);
    };

  const handleProjectChange = (project) => {
    setActiveProject(project);
    localStorage.setItem('last_project_id', project.id.toString());
    setActiveProjectId(project.id); // sync with ProjectContext
    if (!projectTasks[project.id]) {
      fetchProjectTasks(project.id);
    }
    setIsSwitcherOpen(false);
  };

  const handleTaskMove = async (taskId, fromColumn, toColumn) => {
    try {
      const status = DROPPABLE_TO_TASK_STATUS[toColumn];
      if (!status) return;
      const res = await fetch(`${API_URL}/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: authJsonHeaders(),
        body: JSON.stringify({ status }),
      });
      if (!res.ok) return;
      setProjectTasks(prev => {
        const newTasks = { ...prev };
        const currentTasks = newTasks[activeProject?.id] || { todo: [], inProgress: [], review: [], done: [] };
        const taskIndex = currentTasks[fromColumn]?.findIndex(t => t.id === taskId);
        if (taskIndex !== -1 && taskIndex !== undefined) {
          const [task] = currentTasks[fromColumn].splice(taskIndex, 1);
          currentTasks[toColumn] = [...(currentTasks[toColumn] || []), { ...task, column_name: toColumn }];
          newTasks[activeProject.id] = currentTasks;
        }
        return newTasks;
      });
      // Notify dashboard to refresh
      window.dispatchEvent(new CustomEvent('taskUpdated'));
    } catch (e) {
      console.log('Error moving task');
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

  if (projects.length === 0) {
    return <SetupWizard onComplete={handleSetupWizardComplete} />;
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
              onTasksChanged={() => fetchProjectTasks(activeProject?.id)}
              user={user}
              onDeleteTask={async (taskId) => {
                const token = localStorage.getItem('auth_token');
                await fetch(`${API_URL}/api/tasks/${taskId}`, {
                  method: 'DELETE',
                  headers: { 'Authorization': `Bearer ${token}` }
                });
                fetchProjectTasks(activeProject?.id);
              }}
              onTaskSubmit={async (taskId, deliverable, deliverableType) => {
                try {
                  if (deliverableType === 'fichier' && deliverable instanceof File) {
                    const fd = new FormData();
                    fd.append('file', deliverable);
                    const response = await fetch(`${API_URL}/api/tasks/${taskId}/attachments`, {
                      method: 'POST',
                      headers: authBearerHeaders(),
                      body: fd,
                    });
                    if (!response.ok) {
                      const errorData = await response.json().catch(() => ({}));
                      throw new Error(errorData.error || `Upload ${response.status}`);
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
                      throw new Error(err.error || `Mise à jour ${ures.status}`);
                    }
                  }
                } catch (err) {
                  console.error('Livrable error:', err);
                  alert('Erreur livrable: ' + err.message);
                  return;
                }
                fetchData();
              }}
              onTaskApprove={async (taskId) => {
                await fetch(`${API_URL}/api/tasks/${taskId}`, {
                  method: 'PUT',
                  headers: authJsonHeaders(),
                  body: JSON.stringify({ status: 'validated' }),
                });
                fetchData();
              }}
              onTaskReject={async (taskId, comment) => {
                await fetch(`${API_URL}/api/tasks/${taskId}`, {
                  method: 'PUT',
                  headers: authJsonHeaders(),
                  body: JSON.stringify({ status: 'rejected' }),
                });
                if (comment?.trim()) {
                  await fetch(`${API_URL}/api/tasks/${taskId}/comments`, {
                    method: 'POST',
                    headers: authJsonHeaders(),
                    body: JSON.stringify({ content: comment.trim() }),
                  });
                }
                fetchData();
              }}
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
                  <ProjectChatPanel
                    projectId={activeProject?.id}
                    user={user}
                    canPost={myProjectMemberRole !== 'observateur'}
                    canCreateChannel={isProjectAdmin}
                    members={teamMembers}
                  />
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
           <DashboardRH />
         )}

        {currentView === 'structure-map' && (
          <TaskGraphExplorer
            projectId={activeProject?.id}
            user={user}
          />
        )}

        {currentView === 'team' && isProjectAdmin && (
          <TeamView
            projectId={activeProject?.id}
            projectTasks={projectTasks[activeProject?.id]}
          />
        )}

        {currentView === 'reports' && isProjectAdmin && (
          <ReportsPanel projectId={activeProject?.id} />
        )}

        {currentView === 'sprints' && isProjectAdmin && (
          <SprintsPanel projectId={activeProject?.id} isAdmin={isProjectAdmin} />
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
              <InvitationPanel
                teamName={user?.teamName || 'Équipe'}
                projectId={activeProject?.id}
                onMembersChanged={refreshTeamMembers}
              />
            </div>
          </div>
        )}

        {currentView === 'meeting' && (
          <div style={{ height: '100vh' }}>
            <MeetingView
              projectId={activeProject?.id}
              user={user}
              members={teamMembers}
              isAdmin={isProjectAdmin}
              meetingTarget={meetingTarget}
              onMeetingTargetConsumed={() => setMeetingTarget(null)}
            />
          </div>
        )}

        {currentView === 'resources' && (
          <ResourceCenter user={user} projectId={activeProject?.id} myRole={myProjectMemberRole} />
        )}

        {currentView === 'settings' && (
          <SettingsView user={user} activeProject={activeProject} myProjectRole={myProjectMemberRole} />
        )}
      </div>
    </div>
  );
}

export default App;