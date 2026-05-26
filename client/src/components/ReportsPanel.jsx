import { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { Download, FileText, RefreshCw, TrendingUp, CheckCircle, Users, AlertTriangle, Trophy, Loader2 } from 'lucide-react';
import {
  fetchReportBurndown,
  fetchReportVelocity,
  fetchReportExportCsv,
  fetchReportDashboard,
  fetchReportMonthlyScoring,
  fetchReportExportPdf,
  fetchProjectSprints,
} from '../services/backendApi.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
function EmptyChart({ label }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--c-text4)' }}>
      <TrendingUp size={28} style={{ opacity: 0.3 }} />
      <p style={{ fontSize: '12px' }}>{label}</p>
    </div>
  );
}

function KpiCard({ value, label, color, icon: Icon, sub }) {
  return (
    <div style={{ background: 'var(--c-surface2)', border: '1px solid var(--c-border)', borderRadius: '12px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={16} style={{ color }} />
        </div>
        <span style={{ fontSize: '12px', color: 'var(--c-text4)' }}>{label}</span>
      </div>
      <div style={{ fontSize: '26px', fontWeight: '800', color }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: '11px', color: 'var(--c-text5)' }}>{sub}</div>}
    </div>
  );
}

const STATUS_COLOR = { assigned: '#64748b', in_progress: '#3b82f6', delivered: '#f59e0b', validated: '#22c55e', rejected: '#ef4444', overdue: '#f87171' };
const STATUS_LABEL = { assigned: 'À faire', in_progress: 'En cours', delivered: 'Livré', validated: 'Validé', rejected: 'Rejeté', overdue: 'En retard' };

// ── Composant principal ───────────────────────────────────────────────────────
export default function ReportsPanel({ projectId }) {
  const [loading,     setLoading]     = useState(false);
  const [dashboard,   setDashboard]   = useState(null);
  const [burndown,    setBurndown]    = useState(null);
  const [velocity,    setVelocity]    = useState(null);
  const [scoring,     setScoring]     = useState(null);
  const [sprints,     setSprints]     = useState([]);
  const [sprintId,    setSprintId]    = useState('');
  const [refreshKey,  setRefreshKey]  = useState(0);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  // Recharge quand les tâches changent
  useEffect(() => {
    const bump = () => setRefreshKey((k) => k + 1);
    window.addEventListener('taskUpdated', bump);
    window.addEventListener('taskCreated', bump);
    window.addEventListener('taskDeleted', bump);
    return () => {
      window.removeEventListener('taskUpdated', bump);
      window.removeEventListener('taskCreated', bump);
      window.removeEventListener('taskDeleted', bump);
    };
  }, []);

  const loadAll = useCallback(async () => {
    if (!projectId) {
      setDashboard(null); setBurndown(null); setVelocity(null); setScoring(null);
      return;
    }
    setLoading(true);
    const [dash, bd, vel, sc, spr] = await Promise.all([
      fetchReportDashboard(projectId),
      fetchReportBurndown(projectId, sprintId ? { sprint_id: sprintId } : {}),
      fetchReportVelocity(projectId),
      fetchReportMonthlyScoring(projectId),
      fetchProjectSprints(projectId),
    ]);
    setDashboard(dash);
    setBurndown(bd);
    setVelocity(vel);
    setScoring(sc);
    setSprints(spr);
    setLoading(false);
  }, [projectId, sprintId, refreshKey]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Export CSV ──────────────────────────────────────────────────────────────
  const handleExportCsv = async () => {
    if (!projectId || exportingCsv) return;
    setExportingCsv(true);
    const res = await fetchReportExportCsv(projectId);
    if (res.ok) {
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `rapport-projet-${projectId}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    }
    setExportingCsv(false);
  };

  // ── Export PDF ──────────────────────────────────────────────────────────────
  const handleExportPdf = async () => {
    if (!projectId || exportingPdf) return;
    setExportingPdf(true);
    const res = await fetchReportExportPdf(projectId);
    if (res.ok) {
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `rapport-projet-${projectId}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
    }
    setExportingPdf(false);
  };

  // ── Données dérivées ────────────────────────────────────────────────────────
  const summary  = dashboard?.summary || {};
  const members  = dashboard?.member_load || [];
  const total    = summary.total_tasks ?? 0;
  const validated = summary.validated_tasks ?? 0;
  const inProgress = summary.in_progress_tasks ?? 0;
  const delivered = summary.delivered_tasks ?? 0;
  const rejected = summary.rejected_tasks ?? 0;
  const overdue  = summary.overdue_tasks ?? 0;
  const pct      = summary.completion_percent ?? 0;

  const burndownSeries = (burndown?.series || []).map((r, i) => ({
    day: r.date ? String(r.date).slice(5) : `J${i + 1}`,
    remaining: r.remaining,
    ideal: r.ideal,
  }));

  const velocitySeries = (velocity?.velocity || []).map((r) => ({
    sprint: r.sprint_name || `Sprint ${r.sprint_id}`,
    planifié: r.planned ?? 0,
    complété: r.completed ?? 0,
    taux: r.velocity_percent ?? 0,
  }));

  const scoringMembers = scoring?.members || [];

  const statusBars = [
    { key: 'assigned',    value: summary.assigned_tasks ?? 0 },
    { key: 'in_progress', value: inProgress },
    { key: 'delivered',   value: delivered },
    { key: 'validated',   value: validated },
    { key: 'rejected',    value: rejected },
    { key: 'overdue',     value: overdue },
  ].filter((s) => s.value > 0);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="reports-container">

      {/* ── Barre d'outils ── */}
      <div className="report-card" style={{ padding: '14px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: '700', fontSize: '15px', color: 'var(--c-text)', flex: 1 }}>
            Rapport du projet
          </span>

          {/* Sélecteur sprint pour burndown */}
          {sprints.length > 0 && (
            <select
              value={sprintId}
              onChange={(e) => setSprintId(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--c-border2)', background: 'var(--c-surface)', color: 'var(--c-text)', fontSize: '12px', cursor: 'pointer' }}
            >
              <option value="">Burndown — 14 derniers jours</option>
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={loadAll}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', background: 'var(--c-hover)', border: '1px solid var(--c-border2)', color: 'var(--c-text3)', fontSize: '12px', cursor: 'pointer' }}
          >
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            Actualiser
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!projectId || exportingCsv}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.25)', color: '#06b6d4', fontSize: '12px', cursor: projectId ? 'pointer' : 'not-allowed' }}
          >
            {exportingCsv ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={13} />}
            CSV
          </button>

          <button
            type="button"
            onClick={handleExportPdf}
            disabled={!projectId || exportingPdf}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', fontSize: '12px', cursor: projectId ? 'pointer' : 'not-allowed' }}
          >
            {exportingPdf ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <FileText size={13} />}
            PDF
          </button>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>

      {/* ── KPI Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
        <KpiCard value={total}     label="Total tâches"  color="#22d3ee"  icon={FileText}     sub={`${pct}% complétées`} />
        <KpiCard value={validated} label="Validées"       color="#22c55e"  icon={CheckCircle}  sub={`${inProgress} en cours`} />
        <KpiCard value={overdue}   label="En retard"      color="#f87171"  icon={AlertTriangle} sub={`${rejected} rejetées`} />
        <KpiCard value={members.length} label="Membres actifs" color="#a78bfa" icon={Users}   sub={`${delivered} livrées`} />
      </div>

      {/* ── Barre de progression globale ── */}
      {total > 0 && (
        <div className="report-card">
          <h3 className="report-title" style={{ marginBottom: '12px' }}>Distribution des statuts</h3>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
            {statusBars.map((s) => (
              <div key={s.key} style={{ flex: `${s.value} 0 0`, minWidth: '8px', height: '10px', borderRadius: '4px', background: STATUS_COLOR[s.key], title: STATUS_LABEL[s.key] }} title={`${STATUS_LABEL[s.key]} : ${s.value}`} />
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {statusBars.map((s) => (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--c-text3)' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: STATUS_COLOR[s.key] }} />
                {STATUS_LABEL[s.key]} : <strong style={{ color: STATUS_COLOR[s.key] }}>{s.value}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Burndown Chart ── */}
      <div className="report-card">
        <h3 className="report-title">
          Burndown Chart
          {sprintId && sprints.find((s) => String(s.id) === String(sprintId)) && (
            <span style={{ fontSize: '11px', color: 'var(--c-text4)', marginLeft: '8px', fontWeight: '400' }}>
              — {sprints.find((s) => String(s.id) === String(sprintId))?.name}
            </span>
          )}
        </h3>
        <div className="report-chart">
          {burndownSeries.length === 0 ? (
            <EmptyChart label={sprints.length === 0 ? "Créez un sprint pour voir le burndown" : "Aucune donnée pour cette période"} />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={burndownSeries}>
                <defs>
                  <linearGradient id="gradRemaining" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#06b6d4" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="day"      stroke="var(--c-text4)" fontSize={11} />
                <YAxis                    stroke="var(--c-text4)" fontSize={11} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--c-bg)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }} />
                <Legend />
                <Area type="monotone" dataKey="remaining" stroke="#06b6d4" strokeWidth={2} fill="url(#gradRemaining)" name="Restant" />
                <Area type="monotone" dataKey="ideal"     stroke="var(--c-text5)" strokeWidth={1} strokeDasharray="5 5" fill="none" name="Idéal" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        {burndown?.scope != null && (
          <p style={{ fontSize: '11px', color: 'var(--c-text4)', marginTop: '6px' }}>
            Périmètre : <strong style={{ color: 'var(--c-text3)' }}>{burndown.scope} tâche{burndown.scope > 1 ? 's' : ''}</strong>
          </p>
        )}
      </div>

      {/* ── Velocity Chart ── */}
      <div className="report-card">
        <h3 className="report-title">Vélocité par sprint</h3>
        <div className="report-chart">
          {velocitySeries.length === 0 ? (
            <EmptyChart label="Aucun sprint créé — créez des sprints pour visualiser la vélocité" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={velocitySeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="sprint" stroke="var(--c-text4)" fontSize={11} />
                <YAxis stroke="var(--c-text4)" fontSize={11} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--c-bg)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }} />
                <Legend />
                <Bar dataKey="planifié" fill="#64748b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="complété" fill="#06b6d4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Charge par membre ── */}
      <div className="report-card">
        <h3 className="report-title">Charge de travail par membre</h3>
        {members.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--c-text4)', padding: '16px 0' }}>
            Aucun membre ou aucune tâche assignée.
          </p>
        ) : (
          <div className="team-stats" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {members.map((m) => {
              const total_m  = m.assigned_tasks || 0;
              const done_m   = m.validated_tasks || 0;
              const pct_m    = total_m > 0 ? Math.round((done_m / total_m) * 100) : 0;
              const color_m  = pct_m >= 75 ? '#22c55e' : pct_m >= 40 ? '#f59e0b' : '#64748b';
              return (
                <div key={m.user_id} className="team-member" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '10px', background: 'var(--c-hover)', border: '1px solid var(--c-border3)' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(34,211,238,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '14px', color: '#22d3ee', flexShrink: 0 }}>
                    {(m.name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--c-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                      <span style={{ fontSize: '11px', color: 'var(--c-text4)', flexShrink: 0, marginLeft: '8px' }}>{done_m}/{total_m} tâches</span>
                    </div>
                    <div style={{ height: '5px', background: 'var(--c-border)', borderRadius: '9999px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct_m}%`, background: color_m, borderRadius: '9999px', transition: 'width 0.4s' }} />
                    </div>
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: color_m, flexShrink: 0, minWidth: '38px', textAlign: 'right' }}>
                    {pct_m}%
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Performance & Scoring mensuel ── */}
      <div className="report-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h3 className="report-title" style={{ marginBottom: 0 }}>Performance mensuelle</h3>
          {scoring?.month && (
            <span style={{ fontSize: '11px', color: 'var(--c-text4)', background: 'var(--c-hover)', padding: '3px 8px', borderRadius: '6px', border: '1px solid var(--c-border2)' }}>
              {scoring.month}
            </span>
          )}
        </div>

        {scoringMembers.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--c-text4)', padding: '12px 0' }}>
            Aucune donnée de performance — assignez et validez des tâches pour voir les scores.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {scoringMembers.map((m, i) => {
              const score = m.score ?? 0;
              const scoreColor = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#f87171';
              const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
              return (
                <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '10px', background: i === 0 ? 'rgba(34,211,238,0.05)' : 'var(--c-hover)', border: `1px solid ${i === 0 ? 'rgba(34,211,238,0.15)' : 'var(--c-border3)'}` }}>
                  <span style={{ fontSize: '16px', flexShrink: 0, minWidth: '24px' }}>{medal}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--c-text)' }}>{m.name}</span>
                      <span style={{ fontSize: '13px', fontWeight: '800', color: scoreColor }}>{score.toFixed(1)} pts</span>
                    </div>
                    <div style={{ height: '4px', background: 'var(--c-border)', borderRadius: '9999px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(score, 100)}%`, background: scoreColor, borderRadius: '9999px' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '12px', marginTop: '4px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '10px', color: 'var(--c-text5)' }}>
                        ✅ {m.validated ?? 0} validées
                      </span>
                      <span style={{ fontSize: '10px', color: 'var(--c-text5)' }}>
                        ❌ {m.rejected ?? 0} rejetées
                      </span>
                      <span style={{ fontSize: '10px', color: 'var(--c-text5)' }}>
                        ⏱ {m.punctuality != null ? `${Number.isInteger(m.punctuality) ? m.punctuality : m.punctuality.toFixed(1)}% ponctuel` : ''}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {scoringMembers.length > 0 && (
          <div style={{ marginTop: '14px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(34,211,238,0.04)', border: '1px solid rgba(34,211,238,0.1)', fontSize: '11px', color: 'var(--c-text4)' }}>
            <Trophy size={12} style={{ display: 'inline', marginRight: '4px', color: '#22d3ee' }} />
            Formule : Ponctualité (40%) + Taux de validation (40%) + Volume (20%)
          </div>
        )}
      </div>

    </div>
  );
}
