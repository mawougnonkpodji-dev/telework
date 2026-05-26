import { useState, useEffect, useMemo } from 'react';
import {
  Mail, Briefcase, Clock, CheckCircle, AlertCircle, ChevronRight, X,
} from 'lucide-react';
import { fetchProjectMembers } from '../services/backendApi.js';

export default function TeamView({ projectId, projectTasks }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMember, setSelectedMember] = useState(null);

  useEffect(() => {
    if (!projectId) {
      setMembers([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const list = await fetchProjectMembers(projectId);
      if (!cancelled) {
        setMembers(Array.isArray(list) ? list : []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const flatTasks = useMemo(() => {
    const t = projectTasks || {};
    return [
      ...(t.todo || []),
      ...(t.inProgress || []),
      ...(t.review || []),
      ...(t.done || []),
    ];
  }, [projectTasks]);

  const getMemberTasks = (memberId) =>
    flatTasks.filter((task) => Array.isArray(task.assignees) && task.assignees.includes(memberId));

  const getMemberStats = (memberId) => {
    const memberTasks = getMemberTasks(memberId);
    const validated = memberTasks.filter((t) => t.status === 'validated').length;
    const inProgress = memberTasks.filter((t) => t.status === 'in_progress').length;
    const pending = memberTasks.filter((t) => t.status === 'assigned').length;
    return { total: memberTasks.length, completed: validated, inProgress, pending };
  };

  if (!projectId) {
    return (
      <div className="team-container">
        <h2 className="view-title" style={{ color: 'var(--c-text)' }}>Membres de l&apos;équipe</h2>
        <p style={{ color: 'var(--c-text4)' }}>Sélectionnez un projet pour voir les membres.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="team-container">
        <h2 className="view-title" style={{ color: 'var(--c-text)' }}>Membres de l&apos;équipe</h2>
        <p style={{ color: 'var(--c-text4)' }}>Chargement…</p>
      </div>
    );
  }

  return (
    <div className="team-container">
      <h2 className="view-title" style={{ color: 'var(--c-text)' }}>Membres du projet</h2>
      <div className="team-list">
        {members.map((member) => {
          const memberName = member.name || member.nom || '?';
          const stats = getMemberStats(member.id);

          return (
            <div
              key={member.id}
              className="team-card clickable"
              onClick={() => setSelectedMember(member)}
              role="presentation"
            >
              <div className="team-card-header">
                <div className="team-avatar-lg">{memberName.charAt(0)}</div>
                <div className="team-card-info">
                  <h3 className="team-name-lg">{memberName}</h3>
                  <p className="team-role-lg">{member.role || 'Membre'}</p>
                </div>
              </div>

              <div className="team-stats-row">
                <div className="stat-item">
                  <span className="stat-value">{stats.total}</span>
                  <span className="stat-label">Total</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value completed">{stats.completed}</span>
                  <span className="stat-label">Validées</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value in-progress">{stats.inProgress}</span>
                  <span className="stat-label">En cours</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value pending">{stats.pending}</span>
                  <span className="stat-label">À faire</span>
                </div>
              </div>

              <button type="button" className="view-details-btn">
                Voir les détails <ChevronRight size={15} />
              </button>
            </div>
          );
        })}
      </div>

      {members.length === 0 && (
        <p style={{ color: 'var(--c-text4)' }}>Aucun membre renvoyé par l&apos;API pour ce projet.</p>
      )}

      {selectedMember && (
        <div className="member-modal-overlay" onClick={() => setSelectedMember(null)} role="presentation">
          <div className="member-modal" onClick={(e) => e.stopPropagation()} role="presentation">
            <button type="button" className="member-modal-close" onClick={() => setSelectedMember(null)}>
              <X size={20} />
            </button>

            <div className="member-modal-header">
              <div className="member-avatar-large">
                {(selectedMember.name || '?').charAt(0)}
              </div>
              <div className="member-info-large">
                <h2>{selectedMember.name}</h2>
                <p>{selectedMember.role}</p>
              </div>
            </div>

            <div className="member-contact-info">
              <div className="contact-item">
                <Mail size={16} />
                <span>{selectedMember.email || '—'}</span>
              </div>
            </div>

            <div className="member-tasks-section">
              <h3 className="section-title">
                <Briefcase size={18} />
                Tâches assignées ({getMemberTasks(selectedMember.id).length})
              </h3>

              <div className="member-tasks-list">
                {getMemberTasks(selectedMember.id).map((task) => (
                  <div key={task.id} className="member-task-item">
                    <div className="task-priority-indicator" data-priority={task.priority} />
                    <div className="task-info">
                      <h4>{task.title}</h4>
                      <p>{task.description}</p>
                    </div>
                    <div className="task-status">
                      <span className={`priority-badge ${task.priority}`}>{task.priority}</span>
                    </div>
                    <div className="task-progress">
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${task.progress || 0}%` }} />
                      </div>
                      <span>{task.progress || 0}%</span>
                    </div>
                  </div>
                ))}

                {getMemberTasks(selectedMember.id).length === 0 && (
                  <div className="no-tasks-message">Aucune tâche assignée (assignees)</div>
                )}
              </div>
            </div>

            <div className="member-stats-summary">
              <div className="summary-stat">
                <CheckCircle size={20} className="completed-icon" />
                <span className="summary-value">{getMemberStats(selectedMember.id).completed}</span>
                <span className="summary-label">Validées</span>
              </div>
              <div className="summary-stat">
                <Clock size={20} className="inprogress-icon" />
                <span className="summary-value">{getMemberStats(selectedMember.id).inProgress}</span>
                <span className="summary-label">En cours</span>
              </div>
              <div className="summary-stat">
                <AlertCircle size={20} className="pending-icon" />
                <span className="summary-value">{getMemberStats(selectedMember.id).pending}</span>
                <span className="summary-label">À faire</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
