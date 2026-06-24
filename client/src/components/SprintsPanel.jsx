import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Pencil, Trash2, ChevronDown, ChevronUp,
  CalendarRange, Target, CheckCircle, Loader2, X, Save,
  ListTodo, Zap,
} from 'lucide-react';
import {
  fetchProjectSprints,
  fetchSprintDetail,
  createSprint,
  updateSprint,
  deleteSprint,
  assignTasksToSprint,
  fetchProjectTasksKanban,
  fetchReportVelocity,
} from '../services/backendApi.js';
import { flattenKanbanTasks } from '../utils/apiHelpers.js';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function sprintStatus(sprint) {
  const now = new Date();
  const start = new Date(sprint.start_date);
  const end   = new Date(sprint.end_date);
  if (now < start) return { label: 'À venir',   color: '#64748b', bg: 'rgba(100,116,139,0.12)' };
  if (now > end)   return { label: 'Terminé',   color: '#22c55e', bg: 'rgba(34,197,94,0.12)' };
  return               { label: 'En cours',  color: '#06b6d4', bg: 'rgba(6,182,212,0.12)' };
}

function progressColor(pct) {
  if (pct >= 75) return '#22c55e';
  if (pct >= 40) return '#f59e0b';
  return '#64748b';
}

// ── Formulaire sprint ─────────────────────────────────────────────────────────
function SprintForm({ projectId, initial, onSave, onCancel }) {
  const today = new Date().toISOString().slice(0, 10);
  const twoWeeks = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

  const [form, setForm] = useState({
    name:       initial?.name       || '',
    goal:       initial?.goal       || '',
    start_date: initial?.start_date ? initial.start_date.slice(0, 10) : today,
    end_date:   initial?.end_date   ? initial.end_date.slice(0, 10)   : twoWeeks,
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Le nom est requis'); return; }
    if (form.end_date < form.start_date) { setError('La date de fin doit être après la date de début'); return; }
    setSaving(true);
    setError('');
    try {
      if (initial) {
        const res = await updateSprint(initial.id, form);
        onSave(res.sprint);
      } else {
        const res = await createSprint({ ...form, project_id: projectId });
        onSave(res.sprint);
      }
    } catch (err) {
      setError(err.message || 'Erreur serveur');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '9px 12px', borderRadius: '8px',
    border: '1px solid var(--c-border2)', background: 'var(--c-surface)',
    color: 'var(--c-text)', fontSize: '13px', outline: 'none',
    boxSizing: 'border-box',
  };
  const labelStyle = { fontSize: '11px', color: 'var(--c-text4)', marginBottom: '4px', display: 'block' };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <label style={labelStyle}>Nom du sprint *</label>
        <input style={inputStyle} value={form.name} onChange={set('name')} placeholder="ex : Sprint 1 – Authentification" />
      </div>
      <div>
        <label style={labelStyle}>Objectif (optionnel)</label>
        <textarea
          style={{ ...inputStyle, minHeight: '64px', resize: 'vertical' }}
          value={form.goal}
          onChange={set('goal')}
          placeholder="Objectif principal de ce sprint…"
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label style={labelStyle}>Date de début *</label>
          <input type="date" style={inputStyle} value={form.start_date} onChange={set('start_date')} />
        </div>
        <div>
          <label style={labelStyle}>Date de fin *</label>
          <input type="date" style={inputStyle} value={form.end_date} onChange={set('end_date')} />
        </div>
      </div>
      {error && (
        <p style={{ fontSize: '12px', color: '#f87171', padding: '8px 10px', background: 'rgba(239,68,68,0.08)', borderRadius: '7px', border: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </p>
      )}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel}
          style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--c-border2)', background: 'transparent', color: 'var(--c-text4)', fontSize: '13px', cursor: 'pointer' }}>
          Annuler
        </button>
        <button type="submit" disabled={saving}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#06b6d4', color: '#000', fontSize: '13px', fontWeight: '600', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
          {initial ? 'Enregistrer' : 'Créer le sprint'}
        </button>
      </div>
    </form>
  );
}

// ── Carte sprint ───────────────────────────────────────────────────────────────
function SprintCard({ sprint, isAdmin, projectId, allTasks, onUpdated, onDeleted, onAssigned }) {
  const [open,        setOpen]        = useState(false);
  const [editing,     setEditing]     = useState(false);
  const [detail,      setDetail]      = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [deleting,    setDeleting]    = useState(false);
  const [assignMode,  setAssignMode]  = useState(false);
  const [selected,    setSelected]    = useState([]);
  const [assigning,   setAssigning]   = useState(false);
  const [assignMsg,   setAssignMsg]   = useState('');

  const status = sprintStatus(sprint);

  const loadDetail = useCallback(async (force = false) => {
    if (detail && !force) return;
    setLoadingDetail(true);
    const d = await fetchSprintDetail(sprint.id);
    setDetail(d?.sprint || null);
    setLoadingDetail(false);
  }, [sprint.id, detail]);

  const handleToggle = () => {
    if (!open) loadDetail();
    setOpen((v) => !v);
    setEditing(false);
    setAssignMode(false);
  };

  const handleDelete = async () => {
    if (!window.confirm(`Supprimer le sprint "${sprint.name}" ? Les tâches seront détachées.`)) return;
    setDeleting(true);
    try { await deleteSprint(sprint.id); onDeleted(sprint.id); }
    catch (err) { alert(err.message); setDeleting(false); }
  };

  const handleAssign = async () => {
    if (selected.length === 0) return;
    setAssigning(true);
    setAssignMsg('');
    try {
      await assignTasksToSprint(sprint.id, selected);
      setAssignMsg(`${selected.length} tâche(s) ajoutée(s) au sprint.`);
      setSelected([]);
      setDetail(null);
      const d = await fetchSprintDetail(sprint.id);
      setDetail(d?.sprint || null);
      onAssigned?.();
    } catch (err) {
      setAssignMsg(err.message);
    } finally {
      setAssigning(false);
    }
  };

  const tasks  = detail?.tasks  || [];
  const stats  = detail?.stats  || {};
  const pct    = stats.completion || 0;
  const color  = progressColor(pct);

  // Tâches du projet non encore dans un sprint (ou dans ce sprint)
  const unassigned = (allTasks || []).filter(
    (t) => !t.sprint_id || Number(t.sprint_id) === Number(sprint.id)
  );

  const daysLeft = Math.ceil((new Date(sprint.end_date) - new Date()) / 86400000);

  return (
    <div style={{
      background: 'var(--c-surface2)',
      border: `1px solid ${open ? 'rgba(6,182,212,0.3)' : 'var(--c-border)'}`,
      borderRadius: '14px',
      overflow: 'hidden',
      transition: 'border-color 0.2s',
    }}>
      {/* ── En-tête sprint ── */}
      <div
        onClick={handleToggle}
        style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 18px', cursor: 'pointer', userSelect: 'none' }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: '700', fontSize: '14px', color: 'var(--c-text)' }}>{sprint.name}</span>
            <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: status.bg, color: status.color, fontWeight: '600' }}>
              {status.label}
            </span>
            {status.label === 'En cours' && daysLeft > 0 && (
              <span style={{ fontSize: '10px', color: 'var(--c-text5)' }}>{daysLeft}j restant{daysLeft > 1 ? 's' : ''}</span>
            )}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--c-text4)', marginTop: '3px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <span><CalendarRange size={10} style={{ display: 'inline', marginRight: '3px' }} />{fmtDate(sprint.start_date)} → {fmtDate(sprint.end_date)}</span>
            {sprint.goal && <span style={{ fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '220px' }}>🎯 {sprint.goal}</span>}
          </div>
        </div>

        {/* Mini progress bar */}
        {pct > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            <div style={{ width: '60px', height: '5px', background: 'var(--c-border)', borderRadius: '9999px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '9999px' }} />
            </div>
            <span style={{ fontSize: '11px', color, fontWeight: '700' }}>{pct}%</span>
          </div>
        )}

        {isAdmin && (
          <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => { setEditing((v) => !v); setOpen(true); if (!detail) loadDetail(); }}
              style={{ padding: '5px', borderRadius: '6px', border: 'none', background: 'rgba(99,102,241,0.1)', color: '#818cf8', cursor: 'pointer' }}
              title="Modifier"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{ padding: '5px', borderRadius: '6px', border: 'none', background: 'rgba(239,68,68,0.1)', color: '#f87171', cursor: 'pointer' }}
              title="Supprimer"
            >
              {deleting ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={13} />}
            </button>
          </div>
        )}

        {open ? <ChevronUp size={16} style={{ color: 'var(--c-text4)', flexShrink: 0 }} /> : <ChevronDown size={16} style={{ color: 'var(--c-text4)', flexShrink: 0 }} />}
      </div>

      {/* ── Contenu déplié ── */}
      {open && (
        <div style={{ padding: '0 18px 18px', borderTop: '1px solid var(--c-border)' }}>

          {/* Formulaire d'édition */}
          {editing && (
            <div style={{ padding: '16px 0' }}>
              <SprintForm
                projectId={projectId}
                initial={sprint}
                onSave={(updated) => { onUpdated(updated); setEditing(false); setDetail(null); }}
                onCancel={() => setEditing(false)}
              />
            </div>
          )}

          {!editing && (
            <>
              {loadingDetail ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
                  <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--c-text4)' }} />
                </div>
              ) : (
                <>
                  {/* Stats */}
                  {stats.total > 0 && (
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', padding: '12px 0 10px' }}>
                      {[
                        { label: 'Total',      value: stats.total,       color: '#94a3b8' },
                        { label: 'Validées',   value: stats.validated,   color: '#22c55e' },
                        { label: 'Livrées',    value: stats.delivered,   color: '#f59e0b' },
                        { label: 'En cours',   value: stats.in_progress, color: '#3b82f6' },
                        { label: 'À faire',    value: stats.assigned,    color: '#64748b' },
                      ].map((s) => (
                        <div key={s.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 14px', borderRadius: '10px', background: 'var(--c-hover)', border: '1px solid var(--c-border3)', minWidth: '60px' }}>
                          <span style={{ fontSize: '18px', fontWeight: '800', color: s.color }}>{s.value ?? 0}</span>
                          <span style={{ fontSize: '10px', color: 'var(--c-text5)' }}>{s.label}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Barre de progression */}
                  {stats.total > 0 && (
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--c-text4)', marginBottom: '4px' }}>
                        <span>Complétion</span>
                        <span style={{ color, fontWeight: '700' }}>{pct}%</span>
                      </div>
                      <div style={{ height: '6px', background: 'var(--c-border)', borderRadius: '9999px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '9999px', transition: 'width 0.4s' }} />
                      </div>
                    </div>
                  )}

                  {/* Liste des tâches */}
                  {tasks.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '10px' }}>
                      {tasks.map((t) => {
                        const statusColors = { assigned: '#64748b', in_progress: '#3b82f6', delivered: '#f59e0b', validated: '#22c55e', rejected: '#f87171' };
                        const sc = statusColors[t.status] || '#64748b';
                        return (
                          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderRadius: '8px', background: 'var(--c-hover)', border: '1px solid var(--c-border3)' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: sc, flexShrink: 0 }} />
                            <span style={{ fontSize: '12px', color: 'var(--c-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                            <span style={{ fontSize: '10px', color: sc, flexShrink: 0 }}>{t.status}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p style={{ fontSize: '12px', color: 'var(--c-text5)', padding: '8px 0', fontStyle: 'italic' }}>
                      Aucune tâche dans ce sprint.
                    </p>
                  )}

                  {/* Assign tasks (admin) */}
                  {isAdmin && (
                    <div style={{ marginTop: '8px' }}>
                      <button
                        onClick={() => setAssignMode((v) => !v)}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--c-border2)', background: 'var(--c-hover)', color: 'var(--c-text3)', fontSize: '12px', cursor: 'pointer' }}
                      >
                        <ListTodo size={13} />
                        {assignMode ? 'Annuler' : 'Assigner des tâches'}
                      </button>

                      {assignMode && (
                        <div style={{ marginTop: '10px', padding: '12px', borderRadius: '10px', background: 'rgba(6,182,212,0.04)', border: '1px solid rgba(6,182,212,0.12)' }}>
                          <p style={{ fontSize: '11px', color: 'var(--c-text4)', marginBottom: '8px' }}>
                            Sélectionnez les tâches à ajouter au sprint :
                          </p>
                          {unassigned.length === 0 ? (
                            <p style={{ fontSize: '12px', color: 'var(--c-text5)', fontStyle: 'italic' }}>Toutes les tâches sont déjà dans un sprint.</p>
                          ) : (
                            <>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '180px', overflowY: 'auto', marginBottom: '10px' }}>
                                {unassigned.map((t) => (
                                  <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '7px', background: selected.includes(t.id) ? 'rgba(6,182,212,0.08)' : 'var(--c-hover)', cursor: 'pointer', fontSize: '12px', color: 'var(--c-text)' }}>
                                    <input
                                      type="checkbox"
                                      checked={selected.includes(t.id)}
                                      onChange={(e) => setSelected((prev) => e.target.checked ? [...prev, t.id] : prev.filter((id) => id !== t.id))}
                                      style={{ accentColor: '#06b6d4' }}
                                    />
                                    {t.title}
                                    {t.sprint_id === sprint.id && <span style={{ fontSize: '10px', color: '#06b6d4' }}>(déjà dans ce sprint)</span>}
                                  </label>
                                ))}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <button
                                  onClick={handleAssign}
                                  disabled={assigning || selected.length === 0}
                                  style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 14px', borderRadius: '7px', border: 'none', background: '#06b6d4', color: '#000', fontSize: '12px', fontWeight: '600', cursor: selected.length === 0 ? 'not-allowed' : 'pointer', opacity: assigning ? 0.7 : 1 }}
                                >
                                  {assigning ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={12} />}
                                  Ajouter {selected.length > 0 ? `(${selected.length})` : ''}
                                </button>
                                {assignMsg && <span style={{ fontSize: '11px', color: '#22c55e' }}>{assignMsg}</span>}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────
export default function SprintsPanel({ projectId, isAdmin = false }) {
  const [sprints,     setSprints]     = useState([]);
  const [allTasks,    setAllTasks]    = useState([]);
  const [velocity,    setVelocity]    = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [showForm,    setShowForm]    = useState(false);
  const [error,       setError]       = useState('');

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    const [spr, tasks, vel] = await Promise.all([
      fetchProjectSprints(projectId),
      fetchProjectTasksKanban(projectId, 500),
      fetchReportVelocity(projectId),
    ]);
    setSprints(spr || []);
    setAllTasks(flattenKanbanTasks(tasks || {}));
    setVelocity(vel);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const handleCreated = (sprint) => {
    setSprints((prev) => [sprint, ...prev]);
    setShowForm(false);
    setError('');
    load();
  };

  const handleUpdated = (updated) => {
    setSprints((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  };

  const handleDeleted = (id) => {
    setSprints((prev) => prev.filter((s) => s.id !== id));
    load();
  };

  // Tri: en cours en premier, puis à venir, puis terminés
  const sorted = [...sprints].sort((a, b) => {
    const order = { 'En cours': 0, 'À venir': 1, 'Terminé': 2 };
    return (order[sprintStatus(a).label] ?? 3) - (order[sprintStatus(b).label] ?? 3);
  });

  const activeSprint = sorted.find((s) => sprintStatus(s).label === 'En cours');

  const velocitySeries = (velocity?.velocity || []).map((r) => ({
    sprint: r.sprint_name || `Sprint ${r.sprint_id}`,
    planifié: r.planned ?? 0,
    complété: r.completed ?? 0,
    taux: r.velocity_percent ?? 0,
  }));

  const hasAssignedTasks = velocitySeries.some((r) => r.planifié > 0);

  return (
    <div style={{ padding: '24px', maxWidth: '860px', margin: '0 auto' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* ── En-tête ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--c-text)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Zap size={20} style={{ color: '#06b6d4' }} /> Sprints
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--c-text4)', margin: '3px 0 0' }}>
            {sprints.length === 0
              ? 'Aucun sprint — créez-en un pour organiser vos itérations.'
              : `${sprints.length} sprint${sprints.length > 1 ? 's' : ''} · ${activeSprint ? `Sprint actif : ${activeSprint.name}` : 'Aucun sprint en cours'}`}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowForm((v) => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 16px', borderRadius: '10px', border: 'none', background: '#06b6d4', color: '#000', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}
          >
            {showForm ? <X size={15} /> : <Plus size={15} />}
            {showForm ? 'Annuler' : 'Nouveau sprint'}
          </button>
        )}
      </div>

      {/* ── Formulaire de création ── */}
      {showForm && (
        <div style={{ padding: '20px', borderRadius: '14px', background: 'var(--c-surface2)', border: '1px solid rgba(6,182,212,0.25)', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--c-text)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Target size={15} style={{ color: '#06b6d4' }} /> Créer un nouveau sprint
          </h3>
          <SprintForm
            projectId={projectId}
            onSave={handleCreated}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {/* ── Graphe vélocité ── */}
      {!loading && sprints.length > 0 && (
        <div style={{
          padding: '18px 20px',
          borderRadius: '14px',
          background: 'var(--c-surface2)',
          border: '1px solid var(--c-border)',
          marginBottom: '20px',
        }}>
          <h3 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--c-text)', margin: '0 0 12px' }}>
            Vélocité par sprint
          </h3>
          {!hasAssignedTasks ? (
            <p style={{ fontSize: '12px', color: 'var(--c-text4)', margin: 0 }}>
              Assignez des tâches à vos sprints (ci-dessous) pour alimenter ce graphique.
            </p>
          ) : (
            <div style={{ height: '240px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={velocitySeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="sprint" stroke="var(--c-text4)" fontSize={11} />
                  <YAxis stroke="var(--c-text4)" fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={{ backgroundColor: 'var(--c-bg)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }} />
                  <Legend />
                  <Bar dataKey="planifié" fill="#64748b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="complété" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ── Contenu ── */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '60px 0', color: 'var(--c-text4)' }}>
          <Loader2 size={28} style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: '13px' }}>Chargement des sprints…</span>
        </div>
      ) : sorted.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--c-text4)' }}>
          <CalendarRange size={40} style={{ opacity: 0.25, marginBottom: '12px' }} />
          <p style={{ fontSize: '14px', fontWeight: '600' }}>Aucun sprint créé</p>
          {isAdmin && <p style={{ fontSize: '12px', marginTop: '4px' }}>Cliquez sur "Nouveau sprint" pour commencer.</p>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {sorted.map((sprint) => (
            <SprintCard
              key={sprint.id}
              sprint={sprint}
              isAdmin={isAdmin}
              projectId={projectId}
              allTasks={allTasks}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
              onAssigned={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}
