import { useState, useEffect } from 'react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { Download, FileText } from 'lucide-react';
import { fetchReportBurndown, fetchReportVelocity, fetchReportExportCsv } from '../services/backendApi.js';

export default function ReportsPanel({ projectId, team }) {
  const [sprintData, setSprintData] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Auto-refresh when tasks change (fired by App.jsx socket listener)
  useEffect(() => {
    const bump = () => setRefreshKey((k) => k + 1);
    window.addEventListener('taskUpdated',  bump);
    window.addEventListener('taskCreated',  bump);
    window.addEventListener('taskDeleted',  bump);
    return () => {
      window.removeEventListener('taskUpdated',  bump);
      window.removeEventListener('taskCreated',  bump);
      window.removeEventListener('taskDeleted',  bump);
    };
  }, []);

  useEffect(() => {
    if (!projectId) {
      setSprintData(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const [burndown, velocity] = await Promise.all([
        fetchReportBurndown(projectId),
        fetchReportVelocity(projectId),
      ]);
      if (cancelled) return;
      const burndownChart = (burndown?.series || []).map((r, i) => ({
        day: r.date ? String(r.date).slice(5) : `J${i + 1}`,
        remaining: r.remaining,
        ideal: r.ideal,
      }));
      const velocityChart = (velocity?.velocity || []).map((r) => ({
        sprint: r.sprint_name || `Sprint ${r.sprint_id}`,
        points: r.completed ?? 0,
      }));
      setSprintData({
        burndown: burndownChart,
        velocity: velocityChart,
        teamPerformance: [],
      });
    })();
    return () => { cancelled = true; };
  }, [projectId, refreshKey]);

  const teamMembers = team || [];
  const totalTasks = teamMembers.reduce((acc, m) => acc + (m.tasks || 0), 0);
  const completedTasks = teamMembers.reduce((acc, m) => acc + (m.completed || 0), 0);
  const progression = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div className="reports-container">
      <div className="report-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 className="report-title">Aperçu Sprint</h3>
          <button
            type="button"
            disabled={!projectId}
            onClick={async () => {
              if (!projectId) return;
              const res = await fetchReportExportCsv(projectId);
              if (!res.ok) return;
              const blob = await res.blob();
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `export-projet-${projectId}.csv`;
              a.click();
              URL.revokeObjectURL(a.href);
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '6px', background: 'rgba(6, 182, 212, 0.1)', border: '1px solid rgba(6, 182, 212, 0.2)', color: '#06b6d4', fontSize: '12px', cursor: projectId ? 'pointer' : 'not-allowed' }}
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>

        <div className="report-grid">
          <div className="report-stat">
            <p className="report-stat-value">{totalTasks}</p>
            <p className="report-stat-label">Total tâches</p>
          </div>
          <div className="report-stat">
            <p className="report-stat-value">{completedTasks}</p>
            <p className="report-stat-label">Terminées</p>
          </div>
          <div className="report-stat">
            <p className="report-stat-value">{progression}%</p>
            <p className="report-stat-label">Progression</p>
          </div>
          <div className="report-stat">
            <p className="report-stat-value">{teamMembers.length}</p>
            <p className="report-stat-label">Membres équipe</p>
          </div>
        </div>
      </div>

      <div className="report-card">
        <h3 className="report-title">Burndown Chart</h3>
        <div className="report-chart">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sprintData?.burndown || []}>
              <defs>
                <linearGradient id="colorRemaining" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="day" stroke="var(--c-text4)" fontSize={11} />
              <YAxis stroke="var(--c-text4)" fontSize={11} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--c-bg)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
              />
              <Area
                type="monotone"
                dataKey="remaining"
                stroke="#06b6d4"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorRemaining)"
                name="Restant"
              />
              <Area
                type="monotone"
                dataKey="ideal"
                stroke="var(--c-text5)"
                strokeWidth={1}
                strokeDasharray="5 5"
                fill="none"
                name="Ideal"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="report-card">
        <h3 className="report-title">Velocity</h3>
        <div className="report-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sprintData?.velocity || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="sprint" stroke="var(--c-text4)" fontSize={11} />
              <YAxis stroke="var(--c-text4)" fontSize={11} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--c-bg)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px'
                }}
              />
              <Bar dataKey="points" fill="#06b6d4" radius={[4, 4, 0, 0]} name="Points" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="report-card">
        <h3 className="report-title">Performance Équipe</h3>
        <div className="team-stats">
          {sprintData?.teamPerformance?.map((member, index) => (
            <div key={index} className="team-member">
              <div className="team-avatar">{member.member.charAt(0)}</div>
              <div className="team-info">
                <p className="team-name">{member.member}</p>
                <p className="team-role">{member.tasks} tâches • {member.completed} terminées</p>
              </div>
              <div className="team-progress">
                <div className="team-progress-bar" style={{ width: `${(member.completed / member.tasks) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}