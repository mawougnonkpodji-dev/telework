import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, AlertCircle, Star, Users, Loader2, RefreshCw, Receipt, Smartphone, Brain, ChevronDown, ChevronUp } from 'lucide-react';
import { getAuthSocket, joinProjectRoom } from '../utils/socket.js';
import { useProject } from '../contexts/ProjectContext';
import { useAuth } from '../contexts/AuthContext.jsx';
import {
  getApiUrl,
  normalizeProjectsList,
  adaptReportsDashboardPayload,
  canManageProjectMembers,
  authJsonHeaders,
} from '../utils/apiHelpers.js';
import {
  listPayrollRuns,
  generatePayrollRun,
  getPayrollRun,
  openPayrollSlipInNewTab,
  downloadPayrollSlipPdf,
  listMobileMoneyTransactions,
} from '../services/backendApi.js';
import MobileMoneyModal from './MobileMoneyModal.jsx';

const API_URL = getApiUrl();

export default function DashboardRH() {
  const { user } = useAuth();
  const { activeProjectId, setActiveProjectId } = useProject();
  const [dashboardData, setDashboardData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [availableProjects, setAvailableProjects] = React.useState([]);
  const [selectedProjectId, setSelectedProjectId] = React.useState(null);
  const [projectDetail, setProjectDetail] = React.useState(null);
  const [payrollRuns, setPayrollRuns] = React.useState([]);
  const [mobileTx, setMobileTx] = React.useState([]);
  const [payrollMsg, setPayrollMsg] = React.useState('');
  const [mmOpen, setMmOpen] = React.useState(false);
  const [slipTable, setSlipTable] = React.useState(null);
  // Per-member payment flow
  const [payMember, setPayMember] = React.useState(null); // { member, slip }
  const [latestSlipByUserId, setLatestSlipByUserId] = React.useState({});
  // Ref avoids stale-closure in onSuccess callback when payMember changes
  const payMemberRef = React.useRef(null);
  React.useEffect(() => { payMemberRef.current = payMember; }, [payMember]);


  // ── AI Scoring ───────────────────────────────────────────────────────────────
  const [aiScores,       setAiScores]       = React.useState([]);
  const [aiLoading,      setAiLoading]      = React.useState(false);
  const [aiError,        setAiError]        = React.useState('');
  const [aiSectionOpen,  setAiSectionOpen]  = React.useState(true);

  const fetchAiScores = React.useCallback(async (projectId = selectedProjectId) => {
    if (!projectId) return;
    const token = localStorage.getItem('auth_token');
    const res = await fetch(`${API_URL}/api/scoring/project/${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setAiScores(data.scores || []);
    }
  }, [selectedProjectId]);

  const computeAiScores = React.useCallback(async () => {
    if (!selectedProjectId) return;
    setAiLoading(true);
    setAiError('');
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`${API_URL}/api/scoring/compute`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: selectedProjectId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setAiScores(data.scores || []);
      } else {
        setAiError(data.error || `Erreur ${res.status}`);
      }
    } catch {
      setAiError('Erreur réseau');
    } finally {
      setAiLoading(false);
    }
  }, [selectedProjectId]);

  // Load existing scores when project changes
  React.useEffect(() => {
    if (selectedProjectId) fetchAiScores(selectedProjectId);
  }, [selectedProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Set of user IDs who already have at least one successful transaction this project. */
  const paidUserIds = React.useMemo(() => {
    const set = new Set();
    (mobileTx || []).forEach((t) => {
      if (t.status === 'success' && t.beneficiary_user_id != null) {
        set.add(Number(t.beneficiary_user_id));
      }
    });
    return set;
  }, [mobileTx]);

  // Charger la liste des projets de l'équipe
  React.useEffect(() => {
    console.log('[DASHBOARD] Loading projects list...');
    const token = localStorage.getItem('auth_token');
    fetch(`${API_URL}/api/projects/`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(r => {
      console.log('[DASHBOARD] Projects response status:', r.status);
      return r.json();
    })
    .then(raw => {
      const projects = normalizeProjectsList(raw);
      console.log('[DASHBOARD] Projects loaded:', projects);
      setAvailableProjects(projects);
      // Si un activeProjectId est déjà défini et fait partie des projets, le garder
      if (activeProjectId && projects.some(p => p.id === Number(activeProjectId))) {
        console.log('[DASHBOARD] Using existing activeProjectId:', activeProjectId);
        setSelectedProjectId(activeProjectId);
      } else if (projects.length > 0) {
        // Sinon, prendre le premier projet
        const firstProjectId = projects[0].id;
        console.log('[DASHBOARD] Setting first project:', firstProjectId, projects[0].name);
        setSelectedProjectId(firstProjectId);
        setActiveProjectId(firstProjectId);
      } else {
        console.log('[DASHBOARD] No projects found!');
      }
    })
    .catch(err => {
      console.error('[DASHBOARD] Failed to load projects:', err);
      if (activeProjectId) setSelectedProjectId(activeProjectId);
    });
  }, []); // Only run once on mount

  // Sync selectedProjectId when activeProjectId changes from outside (e.g., ProjectSwitcher)
  React.useEffect(() => {
    if (activeProjectId && activeProjectId !== selectedProjectId) {
      setSelectedProjectId(activeProjectId);
    }
  }, [activeProjectId, selectedProjectId]);

  React.useEffect(() => {
    if (!selectedProjectId) {
      setProjectDetail(null);
      return undefined;
    }
    let cancelled = false;
    fetch(`${API_URL}/api/projects/${selectedProjectId}`, {
      headers: authJsonHeaders(),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.project) setProjectDetail(d.project);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProjectId]);

  const canManagePayroll = React.useMemo(
    () => canManageProjectMembers(user, projectDetail, projectDetail?.members),
    [user, projectDetail],
  );

  /** Load the slip map from a specific run id. Never clears the map on failure. */
  const loadSlipMap = React.useCallback(async (runId) => {
    if (!runId) return;
    const latestRun = await getPayrollRun(runId);
    if (!latestRun) return; // API error — keep previous slip map
    const slips = latestRun.slips || [];
    if (slips.length === 0) return; // empty — keep previous slip map rather than wiping buttons
    const slipMap = {};
    slips.forEach((s) => {
      // Normalise to number so lookup is consistent regardless of JSON type
      slipMap[Number(s.user_id)] = { ...s, run: latestRun.run };
    });
    setLatestSlipByUserId(slipMap);
  }, []);

  const refreshPayrollMobile = React.useCallback(async () => {
    if (!selectedProjectId || !canManagePayroll) return;
    const [pr, mm] = await Promise.all([listPayrollRuns(selectedProjectId), listMobileMoneyTransactions(selectedProjectId)]);
    const runs = pr?.runs || [];
    setPayrollRuns(runs);
    setMobileTx(mm?.transactions || []);
    if (runs.length > 0) {
      await loadSlipMap(runs[0].id);
    }
  }, [selectedProjectId, canManagePayroll, loadSlipMap]);

  const handleGeneratePayroll = React.useCallback(async () => {
    setPayrollMsg('');
    if (!selectedProjectId) return;
    const res = await generatePayrollRun(selectedProjectId, {
      base_amount: 100000,
      bonus_per_validated: 2000,
      penalty_per_rejected: 1000,
      penalty_per_overdue: 1500,
      currency: 'XOF',
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 409) setPayrollMsg(data.error || 'La paie existe déjà.');
    else if (!res.ok) setPayrollMsg(data.error || `Erreur ${res.status}`);
    else setPayrollMsg(data.message || 'Paie générée.');
    await refreshPayrollMobile();
  }, [selectedProjectId, refreshPayrollMobile]);

  const handleShowSlips = React.useCallback(
    async (runId) => {
      const data = await getPayrollRun(runId);
      if (data) setSlipTable({ runId, run: data.run, slips: data.slips || [] });
    },
    [],
  );

  React.useEffect(() => {
    if (!selectedProjectId || !canManagePayroll) {
      setPayrollRuns([]);
      setMobileTx([]);
      return undefined;
    }
    let cancelled = false;
    Promise.all([listPayrollRuns(selectedProjectId), listMobileMoneyTransactions(selectedProjectId)]).then(async ([pr, mm]) => {
      if (cancelled) return;
      const runs = pr?.runs || [];
      setPayrollRuns(runs);
      setMobileTx(mm?.transactions || []);
      if (runs.length > 0 && !cancelled) {
        const latestRun = await getPayrollRun(runs[0].id);
        if (!cancelled && latestRun?.slips?.length > 0) {
          const slipMap = {};
          latestRun.slips.forEach((s) => {
            slipMap[Number(s.user_id)] = { ...s, run: latestRun.run };
          });
          setLatestSlipByUserId(slipMap);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedProjectId, canManagePayroll]);

  const fetchDashboardData = React.useCallback(async (projectIdToFetch = selectedProjectId) => {
    console.log('[DASHBOARD] Fetching data for projectId:', projectIdToFetch, 'selectedProjectId:', selectedProjectId);
    if (!projectIdToFetch) {
      console.log('[DASHBOARD] No projectId, aborting');
      setLoading(false);
      setDashboardData(null);
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      console.log('[DASHBOARD] Token:', token ? 'present' : 'MISSING');
      const response = await fetch(`${API_URL}/api/reports/projects/${projectIdToFetch}/dashboard`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      console.log('[DASHBOARD] Response status:', response.status);

      if (response.status === 404 || response.status === 204) {
        console.log('[DASHBOARD] Project not found or empty');
        setDashboardData(null);
        setLoading(false);
        return;
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[DASHBOARD] Error response:', errorText);
        throw new Error(`Failed to fetch dashboard data: ${response.status} ${errorText}`);
      }

      const raw = await response.json();
      console.log('[DASHBOARD] Data received:', raw);

      const data = adaptReportsDashboardPayload(raw);
      if (!data) {
        console.log('[DASHBOARD] No summary in data, treating as empty');
        setDashboardData(null);
      } else {
        console.log('[DASHBOARD] Setting dashboard data');
        setDashboardData(data);
      }
    } catch (err) {
      console.error('[DASHBOARD] Caught error:', err);
      setDashboardData(null);
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  React.useEffect(() => {
    const s = getAuthSocket();
    if (selectedProjectId) joinProjectRoom(selectedProjectId);
    fetchDashboardData();

    const handleProjectChange = () => {
      fetchDashboardData();
    };
    window.addEventListener('projectChanged', handleProjectChange);

    const bump = () => {
      fetchDashboardData();
    };
    if (s) {
      s.on('task_changed', bump);
      s.on('new_notification', bump);
    }
    window.addEventListener('taskUpdated', bump);
    window.addEventListener('taskCreated', bump);
    window.addEventListener('taskDeleted', bump);

    return () => {
      window.removeEventListener('projectChanged', handleProjectChange);
      if (s) {
        s.off('task_changed', bump);
        s.off('new_notification', bump);
      }
      window.removeEventListener('taskUpdated', bump);
      window.removeEventListener('taskCreated', bump);
      window.removeEventListener('taskDeleted', bump);
    };
  }, [fetchDashboardData, selectedProjectId]);

  if (loading) {
    return (
      <div style={{
        minHeight: '60vh',
        backgroundColor: '#0f111a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ textAlign: 'center' }}>
          <Loader2 style={{ width: '48px', height: '48px', color: '#2563eb', animation: 'spin 1s linear infinite', marginBottom: '16px' }} />
          <p style={{ color: 'var(--c-text4)' }}>Chargement du tableau de bord...</p>
        </div>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div style={{
        minHeight: '60vh',
        backgroundColor: '#0f111a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <p style={{ color: 'var(--c-text4)' }}>Aucune donnée disponible</p>
      </div>
    );
  }

  const { summary, workload, leaderboard, statusDistribution } = dashboardData;

  const workloadData = workload?.map(w => ({
    name: w.name?.split(' ')[0] || 'Membre',
    Actives: w.activeTasks || 0,
    Terminées: w.completedTasks || 0,
    XP: w.xp || 0
  })) || [];

  const healthData = [
    { name: 'À Faire', value: statusDistribution?.todo || 0, color: 'var(--c-text4)' },
    { name: 'En Cours', value: statusDistribution?.inProgress || 0, color: '#3b82f6' },
    { name: 'En Revue', value: statusDistribution?.review || 0, color: '#f59e0b' },
    { name: 'Terminé', value: statusDistribution?.done || 0, color: '#10b981' }
  ].filter(item => item.value > 0);

  const getXpLevel = (xp) => {
    if (xp >= 300) return { color: '#a855f7', level: 'Expert' };
    if (xp >= 200) return { color: '#f59e0b', level: 'Avancé' };
    if (xp >= 100) return { color: '#3b82f6', level: 'Intermédiaire' };
    return { color: '#10b981', level: 'Débutant' };
  };

  return (
    <div style={{
      minHeight: '100%',
      backgroundColor: '#0f111a',
      color: 'var(--c-text2)',
      padding: '32px',
      fontFamily: 'DM Sans, -apple-system, BlinkMacSystemFont, sans-serif'
    }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '32px'
        }}>
          <h1 style={{
            fontSize: '30px',
            fontWeight: '800',
            color: '#ffffff',
            letterSpacing: '-0.02em'
          }}>Pilotage RH - Dashboard</h1>
          <button onClick={() => fetchDashboardData()} disabled={loading} style={{
            backgroundColor: '#2563eb',
            color: '#ffffff',
            padding: '10px 24px',
            borderRadius: '12px',
            fontWeight: '500',
            border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s',
            boxShadow: '0 10px 15px -3px rgba(37, 99, 235, 0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <RefreshCw size={16} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            Rafraîchir
          </button>
        </div>

        {/* Project Selector */}
        <div style={{ marginBottom: '32px' }}>
          <select
            value={selectedProjectId || ''}
            onChange={(e) => {
              const projectId = parseInt(e.target.value);
              setSelectedProjectId(projectId);
              setActiveProjectId(projectId);
            }}
            disabled={availableProjects.length === 0}
            style={{
              backgroundColor: '#1a1d2e',
              border: '1px solid var(--c-surface)',
              color: '#ffffff',
              borderRadius: '8px',
              padding: '8px 16px',
              outline: 'none',
              minWidth: '200px'
            }}
          >
            {availableProjects.map(project => (
              <option key={project.id} value={project.id} style={{ backgroundColor: '#1a1d2e' }}>
                {project.name}
              </option>
            ))}
          </select>
        </div>

        {/* KPI Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '16px',
          marginBottom: '32px'
        }}>
          {/* KPI 1: Efficacité Équipe */}
          <div style={{
            backgroundColor: 'rgba(22, 25, 39, 0.5)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            padding: '24px',
            borderRadius: '16px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: 'rgba(16, 185, 129, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TrendingUp style={{ width: '20px', height: '20px', color: '#34d399' }} />
              </div>
              <span style={{ fontSize: '14px', color: 'var(--c-text3)' }}>Efficacité Équipe</span>
            </div>
            <div style={{ fontSize: '30px', fontWeight: '700', color: '#34d399', marginBottom: '8px' }}>{summary.completionRate}%</div>
            <div style={{ width: '100%', height: '4px', backgroundColor: '#334155', borderRadius: '9999px', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'linear-gradient(90deg, #10b981, #34d399)', width: `${summary.completionRate}%` }} />
            </div>
          </div>

          {/* KPI 2: Missions Critiques */}
          <div style={{
            backgroundColor: 'rgba(22, 25, 39, 0.5)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            padding: '24px',
            borderRadius: '16px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: 'rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AlertCircle style={{ width: '20px', height: '20px', color: '#f87171' }} />
              </div>
              <span style={{ fontSize: '14px', color: 'var(--c-text3)' }}>Missions Critiques</span>
            </div>
            <div style={{ fontSize: '30px', fontWeight: '700', color: '#f87171' }}>{summary.blockedCount}</div>
            <p style={{ fontSize: '12px', color: 'var(--c-text4)', marginTop: '4px' }}>Tâches prioritaires ou bloquées</p>
          </div>

          {/* KPI 3: XP Global */}
          <div style={{
            backgroundColor: 'rgba(22, 25, 39, 0.5)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            padding: '24px',
            borderRadius: '16px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: 'rgba(245, 158, 11, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Star style={{ width: '20px', height: '20px', color: '#fbbf24' }} />
              </div>
              <span style={{ fontSize: '14px', color: 'var(--c-text3)' }}>XP Global</span>
            </div>
            <div style={{ fontSize: '30px', fontWeight: '700', color: '#fbbf24' }}>{summary.totalXp}</div>
            <p style={{ fontSize: '12px', color: 'var(--c-text4)', marginTop: '4px' }}>Points cumulés par l'équipe</p>
          </div>

          {/* KPI 4: Activité */}
          <div style={{
            backgroundColor: 'rgba(22, 25, 39, 0.5)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            padding: '24px',
            borderRadius: '16px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: 'rgba(59, 130, 246, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Users style={{ width: '20px', height: '20px', color: '#60a5fa' }} />
              </div>
              <span style={{ fontSize: '14px', color: 'var(--c-text3)' }}>Activité</span>
            </div>
            <div style={{ fontSize: '30px', fontWeight: '700', color: '#60a5fa' }}>{summary.activeMembers}</div>
            <p style={{ fontSize: '12px', color: 'var(--c-text4)', marginTop: '4px' }}>membres connectés / {summary.totalMembers}</p>
          </div>
        </div>

        {/* Charts */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr',
          gap: '24px',
          marginBottom: '32px'
        }}>
          {/* BarChart */}
          <div style={{
            backgroundColor: 'rgba(22, 25, 39, 0.5)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            padding: '24px',
            borderRadius: '16px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#ffffff', marginBottom: '16px' }}>Charge de travail par membre</h3>
            {workloadData.length > 0 ? (
              <ResponsiveContainer width="100%" height={256}>
                <BarChart data={workloadData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="name" stroke="var(--c-text3)" fontSize={12} />
                  <YAxis stroke="var(--c-text3)" fontSize={12} />
                  <Tooltip contentStyle={{ backgroundColor: 'var(--c-surface)', border: '1px solid #334155' }} />
                  <Bar dataKey="Actives" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Terminées" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '256px', color: 'var(--c-text4)' }}>Aucune donnée</div>
            )}
          </div>

          {/* PieChart */}
          <div style={{
            backgroundColor: 'rgba(22, 25, 39, 0.5)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            padding: '24px',
            borderRadius: '16px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#ffffff', marginBottom: '16px' }}>Répartition des Tâches</h3>
            {healthData.length > 0 ? (
              <ResponsiveContainer width="100%" height={256}>
                <PieChart>
                  <Pie data={healthData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={2} dataKey="value">
                    {healthData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: 'var(--c-surface)', border: '1px solid #334155' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '256px', color: 'var(--c-text4)' }}>Aucune tâche</div>
            )}
          </div>
        </div>

        {/* Legend */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '8px',
          marginBottom: '32px',
          maxWidth: '480px'
        }}>
          {healthData.map((entry, index) => (
            <div key={index} style={{ display: 'flex', alignItems: 'center', fontSize: '12px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', marginRight: '8px', backgroundColor: entry.color }} />
              <span style={{ color: 'var(--c-text4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
              <span style={{ marginLeft: 'auto', fontWeight: '500', color: 'var(--c-text2)' }}>{entry.value}</span>
            </div>
          ))}
        </div>

        {/* Leaderboard */}
        <div style={{
          width: '100%',
          backgroundColor: 'rgba(22, 25, 39, 0.3)',
          borderRadius: '16px',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          overflow: 'hidden'
        }}>
          <div style={{ padding: '24px', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#ffffff' }}>Membres du projet</h3>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', fontSize: '14px', color: 'var(--c-text4)' }}>
                  <th style={{ textAlign: 'left', padding: '12px 24px' }}>Nom/Rôle</th>
                  <th style={{ textAlign: 'center', padding: '12px' }}>Barre XP</th>
                  {canManagePayroll && <th style={{ textAlign: 'center', padding: '12px' }}>Paie</th>}
                </tr>
              </thead>
              <tbody>
                {leaderboard && leaderboard.length > 0 ? (
                  leaderboard.map((member, index) => {
                    const xpLevel = getXpLevel(member.xp || 0);
                    const xpPercentage = Math.max(5, ((member.xp || 0) / (summary.totalXp || 1)) * 100);
                    const memberSlip = latestSlipByUserId[Number(member.userId)];
                    const isPaid = paidUserIds.has(Number(member.userId));
                    return (
                      <tr key={member.userId || index} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', transition: 'background-color 0.2s' }}>
                        <td style={{ padding: '16px 24px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <span style={{ fontSize: '14px', fontWeight: '600', color: '#cbd5e1' }}>{member.name?.charAt(0).toUpperCase() || '?'}</span>
                            </div>
                            <div>
                              <span style={{ color: 'var(--c-text2)', fontWeight: '500' }}>{member.name || 'Inconnu'}</span>
                              <div style={{ fontSize: '12px', color: 'var(--c-text4)' }}>{member.role || 'Membre'}</div>
                              {member.activeTasks > 0 && (
                                <div style={{ fontSize: '10px', color: '#3b82f6' }}>{member.activeTasks} tâche{member.activeTasks > 1 ? 's' : ''} active{member.activeTasks > 1 ? 's' : ''}</div>
                              )}
                              {memberSlip && (
                                <div style={{ fontSize: '11px', color: '#34d399', fontWeight: '600', marginTop: '2px' }}>
                                  Net : {Number(memberSlip.net_amount).toLocaleString('fr-FR')} {memberSlip.run?.currency || 'XOF'}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ flex: 1, height: '8px', backgroundColor: '#334155', borderRadius: '9999px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', backgroundColor: xpLevel.color, transition: 'width 0.5s', width: `${xpPercentage}%` }} />
                            </div>
                            <span style={{ fontSize: '14px', fontWeight: '500', color: '#fbbf24', width: '48px', textAlign: 'right' }}>{member.xp || 0}</span>
                          </div>
                        </td>
                        {canManagePayroll && (
                          <td style={{ padding: '16px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
                              {memberSlip ? (
                                <>
                                  {isPaid && (
                                    <span style={{
                                      padding: '3px 8px',
                                      borderRadius: '9999px',
                                      background: 'rgba(16, 185, 129, 0.15)',
                                      color: '#34d399',
                                      fontSize: '10px',
                                      fontWeight: '700',
                                      border: '1px solid rgba(16, 185, 129, 0.35)',
                                      whiteSpace: 'nowrap',
                                    }}>
                                      ✓ Payé
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setPayMember({ member, slip: memberSlip })}
                                    title={isPaid ? 'Déjà payé — cliquer pour repayer' : 'Envoyer le salaire via Mobile Money'}
                                    style={{
                                      padding: '6px 12px',
                                      borderRadius: '8px',
                                      border: isPaid ? '1px solid #374151' : 'none',
                                      background: isPaid
                                        ? 'rgba(55,65,81,0.4)'
                                        : 'linear-gradient(135deg, #059669, #10b981)',
                                      color: isPaid ? '#6b7280' : '#fff',
                                      fontSize: '11px',
                                      fontWeight: '600',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                    }}
                                  >
                                    <Smartphone size={12} /> {isPaid ? 'Repayer' : 'Payer'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => downloadPayrollSlipPdf(memberSlip.run?.id || memberSlip.payroll_run_id, member.userId)}
                                    style={{
                                      padding: '6px 12px',
                                      borderRadius: '8px',
                                      border: '1px solid #334155',
                                      background: 'transparent',
                                      color: 'var(--c-text3)',
                                      fontSize: '11px',
                                      fontWeight: '500',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                    }}
                                  >
                                    <Receipt size={12} /> PDF
                                  </button>
                                </>
                              ) : (
                                <span style={{ fontSize: '11px', color: 'var(--c-text5)' }}>Générer la paie d&apos;abord</span>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={canManagePayroll ? 4 : 3} style={{ padding: '32px', textAlign: 'center', color: 'var(--c-text4)' }}>Aucun membre assigné à ce projet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── AI Scoring Section ─────────────────────────────────────────────── */}
        {selectedProjectId && (
          <div style={{
            marginTop: '28px',
            borderRadius: '16px',
            border: '1px solid rgba(34,211,238,0.15)',
            backgroundColor: 'rgba(8,145,178,0.04)',
            overflow: 'hidden',
          }}>
            {/* Header */}
            <button
              type="button"
              onClick={() => setAiSectionOpen((v) => !v)}
              style={{
                width: '100%', padding: '18px 24px', border: 'none',
                background: 'transparent', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '12px',
                borderBottom: aiSectionOpen ? '1px solid rgba(34,211,238,0.1)' : 'none',
              }}
            >
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(34,211,238,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Brain size={18} style={{ color: '#22d3ee' }} />
              </div>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontSize: '16px', fontWeight: '700', color: '#ffffff' }}>Scoring IA — Comportement &amp; Performance</div>
                <div style={{ fontSize: '12px', color: 'var(--c-text4)', marginTop: '2px' }}>
                  6 variables comportementales · Modèle LinearRegression sklearn · Score 0–100
                </div>
              </div>
              {aiSectionOpen
                ? <ChevronUp size={16} style={{ color: 'var(--c-text4)', flexShrink: 0 }} />
                : <ChevronDown size={16} style={{ color: 'var(--c-text4)', flexShrink: 0 }} />}
            </button>

            {aiSectionOpen && (
              <div style={{ padding: '20px 24px' }}>
                {/* Weights legend */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '18px' }}>
                  {[
                    { label: 'Ponctualité', pct: 15, color: '#a78bfa' },
                    { label: 'Achèvement', pct: 25, color: '#34d399' },
                    { label: 'Rejet (–)', pct: 25, color: '#f87171' },
                    { label: 'Interactions', pct: 10, color: '#38bdf8' },
                    { label: 'Qualité msgs', pct: 10, color: '#fbbf24' },
                    { label: 'Révisions', pct: 15, color: '#fb923c' },
                  ].map((v) => (
                    <div key={v.label} style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '4px 10px', borderRadius: '9999px',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: v.color }} />
                      <span style={{ fontSize: '11px', color: 'var(--c-text3)' }}>{v.label}</span>
                      <span style={{ fontSize: '11px', fontWeight: '700', color: v.color }}>{v.pct}%</span>
                    </div>
                  ))}
                </div>

                {/* Compute button + error */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                  {canManagePayroll && (
                    <button
                      type="button"
                      onClick={computeAiScores}
                      disabled={aiLoading}
                      style={{
                        padding: '10px 20px', borderRadius: '10px', border: 'none',
                        background: aiLoading ? 'rgba(34,211,238,0.15)' : 'linear-gradient(135deg,#22d3ee,#0891b2)',
                        color: aiLoading ? 'var(--c-text4)' : '#0f172a',
                        fontWeight: '700', fontSize: '13px', cursor: aiLoading ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', gap: '8px',
                      }}
                    >
                      {aiLoading
                        ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Calcul en cours…</>
                        : <><Brain size={14} /> Calculer les scores IA</>}
                    </button>
                  )}
                  {aiScores.length > 0 && (
                    <span style={{ fontSize: '12px', color: 'var(--c-text4)' }}>
                      {aiScores.length} membre{aiScores.length > 1 ? 's' : ''} scoré{aiScores.length > 1 ? 's' : ''}
                      {aiScores[0]?.computed_at && (
                        <> · mis à jour {new Date(aiScores[0].computed_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</>
                      )}
                    </span>
                  )}
                  {aiError && (
                    <span style={{ fontSize: '12px', color: '#f87171' }}>{aiError}</span>
                  )}
                </div>

                {/* Scores table */}
                {aiScores.length > 0 ? (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ fontSize: '11px', color: 'var(--c-text4)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: '600' }}>Membre</th>
                          <th style={{ textAlign: 'center', padding: '8px 12px', fontWeight: '600' }}>Score IA</th>
                          <th style={{ textAlign: 'center', padding: '8px 8px', fontWeight: '600', color: '#a78bfa' }}>Ponct.</th>
                          <th style={{ textAlign: 'center', padding: '8px 8px', fontWeight: '600', color: '#34d399' }}>Achèv.</th>
                          <th style={{ textAlign: 'center', padding: '8px 8px', fontWeight: '600', color: '#f87171' }}>Rejet</th>
                          <th style={{ textAlign: 'center', padding: '8px 8px', fontWeight: '600', color: '#38bdf8' }}>Interact.</th>
                          <th style={{ textAlign: 'center', padding: '8px 8px', fontWeight: '600', color: '#fbbf24' }}>Qual.</th>
                          <th style={{ textAlign: 'center', padding: '8px 8px', fontWeight: '600', color: '#fb923c' }}>Révisions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aiScores.map((s, i) => {
                          const scoreColor = s.score >= 75 ? '#34d399' : s.score >= 50 ? '#fbbf24' : '#f87171';
                          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
                          return (
                            <tr key={s.user_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.15s' }}
                              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(34,211,238,0.04)'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                            >
                              <td style={{ padding: '10px 12px', color: 'var(--c-text2)' }}>
                                <span style={{ marginRight: '6px' }}>{medal}</span>
                                {s.user_name || `#${s.user_id}`}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                                  <div style={{ flex: 1, maxWidth: '80px', height: '5px', background: 'rgba(255,255,255,0.08)', borderRadius: '9999px', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${s.score}%`, background: `linear-gradient(90deg, ${scoreColor}99, ${scoreColor})`, borderRadius: '9999px' }} />
                                  </div>
                                  <span style={{ fontWeight: '700', fontSize: '13px', color: scoreColor, minWidth: '36px' }}>
                                    {s.score.toFixed(1)}
                                  </span>
                                </div>
                              </td>
                              {[
                                { val: s.punctuality_score,    color: '#a78bfa' },
                                { val: s.completion_rate,      color: '#34d399' },
                                { val: s.rejection_rate,       color: '#f87171' },
                                { val: s.interaction_freq,     color: '#38bdf8' },
                                { val: s.interaction_quality,  color: '#fbbf24' },
                                { val: s.review_participation, color: '#fb923c' },
                              ].map((cell, ci) => (
                                <td key={ci} style={{ padding: '10px 8px', textAlign: 'center', color: cell.color, fontWeight: '600' }}>
                                  {(cell.val * 100).toFixed(0)}%
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : !aiLoading && (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--c-text4)', fontSize: '13px' }}>
                    <Brain size={28} style={{ opacity: 0.3, marginBottom: '8px' }} />
                    <p>Aucun score calculé pour ce projet.</p>
                    {canManagePayroll && <p style={{ fontSize: '12px' }}>Cliquez sur « Calculer les scores IA » pour lancer l'analyse.</p>}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {canManagePayroll && selectedProjectId && (
          <div
            style={{
              marginTop: '28px',
              padding: '24px',
              borderRadius: '16px',
              border: '1px solid rgba(255,255,255,0.08)',
              backgroundColor: 'rgba(22,25,39,0.4)',
            }}
          >
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#ffffff', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Receipt size={20} style={{ color: '#34d399' }} /> Paie &amp; Mobile Money
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--c-text3)', marginBottom: '16px' }}>
              Gérez la paie mensuelle et les transactions Mobile Money de votre équipe.
            </p>
            {payrollMsg ? <p style={{ fontSize: '13px', color: '#fbbf24', marginBottom: '12px' }}>{payrollMsg}</p> : null}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
              <button
                type="button"
                onClick={handleGeneratePayroll}
                style={{
                  padding: '10px 16px',
                  borderRadius: '10px',
                  border: 'none',
                  background: '#059669',
                  color: '#fff',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                Générer la paie (mois courant)
              </button>
              <button
                type="button"
                onClick={() => setMmOpen(true)}
                style={{
                  padding: '10px 16px',
                  borderRadius: '10px',
                  border: '1px solid #22d3ee',
                  background: 'rgba(34,211,238,0.1)',
                  color: '#22d3ee',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Smartphone size={16} /> Simulation Mobile Money
              </button>
            </div>

            <h4 style={{ color: '#cbd5e1', fontSize: '14px', marginBottom: '8px' }}>Historique paie</h4>
            <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
              <table style={{ width: '100%', fontSize: '12px', color: 'var(--c-text3)' }}>
                <thead>
                  <tr style={{ textAlign: 'left' }}>
                    <th style={{ padding: '8px' }}>Mois</th>
                    <th style={{ padding: '8px' }}>Statut</th>
                    <th style={{ padding: '8px' }} />
                  </tr>
                </thead>
                <tbody>
                  {payrollRuns.map((r) => (
                    <tr key={r.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '8px', color: 'var(--c-text2)' }}>{r.month}</td>
                      <td style={{ padding: '8px' }}>{r.status}</td>
                      <td style={{ padding: '8px' }}>
                        <button
                          type="button"
                          onClick={() => handleShowSlips(r.id)}
                          style={{ background: 'transparent', border: 'none', color: '#38bdf8', cursor: 'pointer', textDecoration: 'underline' }}
                        >
                          Bulletins
                        </button>
                      </td>
                    </tr>
                  ))}
                  {payrollRuns.length === 0 ? (
                    <tr>
                      <td colSpan={3} style={{ padding: '8px' }}>
                        Aucun run
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {slipTable ? (
              <div style={{ marginBottom: '16px' }}>
                <h4 style={{ color: '#cbd5e1', fontSize: '14px', marginBottom: '8px' }}>Fiches — {slipTable.run?.month}</h4>
                <table style={{ width: '100%', fontSize: '12px' }}>
                  <tbody>
                    {(slipTable.slips || []).map((s) => {
                      const nm = projectDetail?.members?.find((m) => m.id === s.user_id)?.name;
                      return (
                        <tr key={s.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '8px', color: 'var(--c-text2)' }}>{nm || `Utilisateur #${s.user_id}`}</td>
                          <td style={{ padding: '8px', color: 'var(--c-text3)' }}>
                            Net {s.net_amount} {slipTable.run?.currency}
                          </td>
                          <td style={{ padding: '8px' }}>
                            <button
                              type="button"
                              onClick={() => openPayrollSlipInNewTab(slipTable.runId, s.user_id)}
                              style={{
                                background: '#334155',
                                border: 'none',
                                color: '#fff',
                                padding: '6px 10px',
                                borderRadius: '8px',
                                cursor: 'pointer',
                              }}
                            >
                              Voir fiche HTML
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}

            <h4 style={{ color: '#cbd5e1', fontSize: '14px', marginBottom: '8px' }}>Transactions Mobile Money</h4>
            <div style={{ maxHeight: '180px', overflowY: 'auto', fontSize: '12px', color: 'var(--c-text3)' }}>
              {(mobileTx || []).slice(0, 20).map((t) => (
                <div key={t.id} style={{ padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  {t.external_reference} — {t.amount} {t.currency} —{' '}
                  <span style={{ color: t.status === 'success' ? '#34d399' : '#f87171' }}>{t.status}</span>
                </div>
              ))}
              {mobileTx.length === 0 ? <div>Aucune transaction</div> : null}
            </div>
          </div>
        )}

        {/* Generic Mobile Money modal (from the "Simulation" button) */}
        <MobileMoneyModal
          isOpen={mmOpen}
          onClose={() => setMmOpen(false)}
          projectId={selectedProjectId}
          amount={75000}
          beneficiaries={projectDetail?.members || []}
          defaultBeneficiaryId={user?.id}
          onSuccess={() => {
            refreshPayrollMobile();
          }}
        />

        {/* Per-member payment modal */}
        <MobileMoneyModal
          isOpen={!!payMember}
          onClose={() => {
            setPayMember(null);
            payMemberRef.current = null;
          }}
          projectId={selectedProjectId}
          amount={payMember?.slip?.net_amount ? Number(payMember.slip.net_amount) : 0}
          beneficiaries={projectDetail?.members || []}
          defaultBeneficiaryId={payMember?.member?.userId || null}
          onSuccess={() => {
            // Refresh the transactions list; modal stays open (shows success screen)
            // PDF download is handled by onSlipDownload below (direct user click, no popup-block)
            refreshPayrollMobile();
          }}
          onSlipDownload={(() => {
            // Read from payMember state directly — this IIFE runs at render time,
            // so payMember is already the current value (no stale-closure risk here).
            const pm = payMember;
            if (!pm?.slip) return null;
            const runId = Number(pm.slip.run?.id || pm.slip.payroll_run_id) || null;
            const userId = Number(pm.member?.userId) || null;
            if (!runId || !userId) return null;
            return () => downloadPayrollSlipPdf(runId, userId);
          })()}
        />
      </div>
    </div>
  );
}
