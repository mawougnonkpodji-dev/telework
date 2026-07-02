import { useState, useEffect, useRef } from 'react';
import { X, MessageSquare, Send, Clock, User, Calendar, Tag, AlertCircle } from 'lucide-react';
import { fetchTaskById, addTaskComment } from '../services/backendApi.js';
import { getInProgressStatus, getDeadlineUrgency } from '../utils/deadlineColors.js';

/* ── helpers ─────────────────────────────────────────────────── */

function timeAgo(isoString) {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'À l\'instant';
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days}j`;
}

function formatDeadline(str) {
  if (!str) return null;
  const d = new Date(str);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_LABELS = {
  assigned:   { label: 'Assignée',    color: '#6366f1', bg: 'rgba(99,102,241,0.15)' },
  in_progress:{ label: 'En cours',    color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
  delivered:  { label: 'Livrée',      color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  review:     { label: 'En révision', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  validated:  { label: 'Validée',     color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
  done:       { label: 'Terminée',    color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
  rejected:   { label: 'Rejetée',     color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
};

const PRIORITY_LABELS = {
  low:    { label: 'Basse',    color: '#3b82f6' },
  medium: { label: 'Moyenne',  color: '#f59e0b' },
  high:   { label: 'Haute',    color: '#ef4444' },
  urgent: { label: 'Urgente',  color: '#dc2626' },
};

/* ── component ───────────────────────────────────────────────── */

/**
 * TaskDetailPanel — panneau latéral pour voir les détails + commentaires d'une tâche.
 *
 * Props:
 *   isOpen        {boolean}
 *   onClose       {() => void}
 *   task          {object}   — task object (from Kanban card)
 *   currentUser   {object}   — authenticated user
 *   isObservateur {boolean}  — read-only mode if true
 */
export default function TaskDetailPanel({ isOpen, onClose, task, currentUser, isObservateur = false }) {
  const [detail, setDetail]       = useState(null);
  const [loading, setLoading]     = useState(false);
  const [comments, setComments]   = useState([]);
  const [newComment, setNewComment] = useState('');
  const [sending, setSending]     = useState(false);
  const [sendError, setSendError] = useState('');
  const textareaRef = useRef(null);
  const commentsEndRef = useRef(null);

  /* fetch full task detail (with comments) when panel opens */
  useEffect(() => {
    if (!isOpen || !task?.id) return;
    let cancelled = false;
    setLoading(true);
    setDetail(null);
    setComments([]);
    setNewComment('');
    setSendError('');

    fetchTaskById(task.id).then(data => {
      if (cancelled) return;
      if (data?.task) {
        setDetail(data.task);
        setComments(data.task.comments || []);
      }
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [isOpen, task?.id]);

  /* scroll to bottom when new comment arrives */
  useEffect(() => {
    if (comments.length > 0) {
      commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [comments.length]);

  const handleSend = async () => {
    const content = newComment.trim();
    if (!content || sending) return;
    setSending(true);
    setSendError('');
    try {
      const res = await addTaskComment(task.id, content);
      setComments(prev => [...prev, res.comment]);
      setNewComment('');
    } catch (err) {
      setSendError(err.message || 'Erreur lors de l\'envoi');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const t = detail || task;
  const status = t?.status === 'in_progress'
    ? getInProgressStatus(t)
    : (STATUS_LABELS[t?.status] || { label: t?.status, color: 'var(--c-text4)', bg: 'var(--c-hover)' });
  const priority = PRIORITY_LABELS[t?.priority] || null;
  const deadlineUrgency = (t?.status === 'in_progress' && (t?.deadline || t?.due_date))
    ? getDeadlineUrgency(t)
    : null;

  return (
    <>
      {/* backdrop */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 1100,
          background: isOpen ? 'rgba(0,0,0,0.4)' : 'transparent',
          backdropFilter: isOpen ? 'blur(3px)' : 'none',
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'background 0.25s, backdrop-filter 0.25s',
        }}
        onClick={onClose}
      />

      {/* drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'min(480px, 100vw)',
        background: 'var(--c-surface)',
        borderLeft: '1px solid var(--c-border2)',
        boxShadow: '-20px 0 60px rgba(0,0,0,0.18)',
        zIndex: 1101,
        display: 'flex', flexDirection: 'column',
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1), background 0.22s ease',
      }}>

        {/* ── Header ── */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--c-border3)',
          display: 'flex', alignItems: 'flex-start', gap: '12px',
          flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              {/* status badge */}
              <span style={{
                padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '700',
                background: status.bg, color: status.color,
              }}>
                {status.label}
              </span>
              {/* priority badge */}
              {priority && (
                <span style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600',
                  background: `${priority.color}22`, color: priority.color,
                }}>
                  <AlertCircle size={10} />
                  {priority.label}
                </span>
              )}
            </div>
            <h2 style={{
              margin: 0, fontSize: '17px', fontWeight: '700',
              color: 'var(--c-text)', lineHeight: '1.4',
              overflow: 'hidden', textOverflow: 'ellipsis',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            }}>
              {t?.title || 'Tâche'}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '32px', height: '32px', borderRadius: '8px', border: '1px solid var(--c-border2)',
              background: 'var(--c-hover)', color: 'var(--c-text4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Meta info ── */}
        {(t?.assignee_name || t?.deadline || t?.due_date) && (
          <div style={{
            padding: '14px 24px',
            borderBottom: '1px solid var(--c-border3)',
            display: 'flex', gap: '20px', flexWrap: 'wrap',
            flexShrink: 0,
          }}>
            {t?.assignee_name && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <div style={{
                  width: '22px', height: '22px', borderRadius: '50%',
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '9px', fontWeight: '700', color: '#fff',
                }}>
                  {(t.assignee_name || 'N').charAt(0).toUpperCase()}
                </div>
                <span style={{ fontSize: '13px', color: 'var(--c-text3)' }}>{t.assignee_name}</span>
              </div>
            )}
            {(t?.deadline || t?.due_date) && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                color: deadlineUrgency?.isOverdue ? deadlineUrgency.color : 'var(--c-text4)',
                fontSize: '13px', fontWeight: deadlineUrgency?.isOverdue ? '600' : '400',
              }}>
                <Calendar size={13} />
                <span>{formatDeadline(t.deadline || t.due_date)}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Scrollable content ── */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--c-text4)', fontSize: '14px' }}>
              Chargement…
            </div>
          ) : (
            <>
              {/* Description */}
              {t?.description?.trim() && (
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--c-border3)' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    marginBottom: '10px', color: 'var(--c-text4)', fontSize: '11px',
                    fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em',
                  }}>
                    <Tag size={11} />
                    Description
                  </div>
                  <p style={{
                    margin: 0, fontSize: '14px', color: 'var(--c-text3)',
                    lineHeight: '1.65', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}>
                    {t.description}
                  </p>
                </div>
              )}

              {/* Comments section */}
              <div style={{ flex: 1, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '0' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: '16px',
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '7px',
                    color: 'var(--c-text4)', fontSize: '11px',
                    fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em',
                  }}>
                    <MessageSquare size={11} />
                    Commentaires
                  </div>
                  {comments.length > 0 && (
                    <span style={{
                      background: 'rgba(99,102,241,0.2)', color: '#818cf8',
                      fontSize: '11px', fontWeight: '700',
                      padding: '2px 8px', borderRadius: '10px',
                    }}>
                      {comments.length}
                    </span>
                  )}
                </div>

                {/* comment list */}
                {comments.length === 0 ? (
                  <div style={{
                    flex: 1, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    padding: '32px 0', gap: '8px',
                  }}>
                    <MessageSquare size={28} style={{ color: 'var(--c-text5)' }} />
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--c-text4)', textAlign: 'center' }}>
                      Aucun commentaire pour l'instant.
                    </p>
                    {!isObservateur && (
                      <p style={{ margin: 0, fontSize: '12px', color: 'var(--c-text5)', textAlign: 'center' }}>
                        Soyez le premier à commenter.
                      </p>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '12px' }}>
                    {comments.map((c) => {
                      const isMe = c.author_id === currentUser?.id;
                      return (
                        <div
                          key={c.id}
                          style={{
                            display: 'flex', gap: '10px',
                            flexDirection: isMe ? 'row-reverse' : 'row',
                          }}
                        >
                          {/* avatar */}
                          <div style={{
                            width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
                            background: isMe
                              ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                              : 'linear-gradient(135deg, #334155, #475569)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '11px', fontWeight: '700', color: '#fff',
                          }}>
                            {(c.author_name || '?').charAt(0).toUpperCase()}
                          </div>

                          {/* bubble */}
                          <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '11px', fontWeight: '600', color: isMe ? 'var(--c-accent)' : 'var(--c-text4)' }}>
                                {isMe ? 'Vous' : (c.author_name || 'Inconnu')}
                              </span>
                              <span style={{ fontSize: '10px', color: 'var(--c-text5)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <Clock size={9} />
                                {timeAgo(c.created_at)}
                              </span>
                            </div>
                            <div style={{
                              padding: '10px 13px',
                              borderRadius: isMe ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
                              background: isMe ? 'rgba(99,102,241,0.12)' : 'var(--c-hover)',
                              border: `1px solid ${isMe ? 'rgba(99,102,241,0.25)' : 'var(--c-border2)'}`,
                              fontSize: '13px', color: 'var(--c-text2)',
                              lineHeight: '1.55', wordBreak: 'break-word', whiteSpace: 'pre-wrap',
                            }}>
                              {c.content}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={commentsEndRef} />
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Comment input ── */}
        {!isObservateur && !loading && (
          <div style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--c-border3)',
            background: 'var(--c-muted-bg)',
            flexShrink: 0,
          }}>
            {sendError && (
              <div style={{ color: 'var(--c-danger)', fontSize: '12px', marginBottom: '8px' }}>
                {sendError}
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
              {/* current user avatar */}
              <div style={{
                width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '11px', fontWeight: '700', color: '#fff',
              }}>
                {(currentUser?.name || currentUser?.nom || 'M').charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, position: 'relative' }}>
                <textarea
                  ref={textareaRef}
                  rows={2}
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ajouter un commentaire… (Ctrl+Entrée pour envoyer)"
                  style={{
                    width: '100%', padding: '10px 42px 10px 14px',
                    background: 'var(--c-input-bg)',
                    border: '1px solid var(--c-input-border)',
                    borderRadius: '12px', color: 'var(--c-text)',
                    fontSize: '13px', lineHeight: '1.5',
                    resize: 'none', outline: 'none',
                    fontFamily: 'inherit', boxSizing: 'border-box',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={e => e.target.style.borderColor = 'var(--c-accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--c-input-border)'}
                />
                <button
                  onClick={handleSend}
                  disabled={!newComment.trim() || sending}
                  style={{
                    position: 'absolute', right: '10px', bottom: '10px',
                    width: '28px', height: '28px', borderRadius: '8px',
                    background: newComment.trim() && !sending ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'var(--c-hover)',
                    border: 'none',
                    color: newComment.trim() && !sending ? '#fff' : 'var(--c-text5)',
                    cursor: newComment.trim() && !sending ? 'pointer' : 'not-allowed',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background 0.2s',
                  }}
                >
                  {sending
                    ? <div style={{ width: '12px', height: '12px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    : <Send size={13} />
                  }
                </button>
              </div>
            </div>
            <p style={{ margin: '6px 0 0 40px', fontSize: '10px', color: 'var(--c-text5)' }}>
              Ctrl + Entrée pour envoyer
            </p>
          </div>
        )}

        {isObservateur && !loading && (
          <div style={{
            padding: '14px 24px',
            borderTop: '1px solid var(--c-border3)',
            textAlign: 'center', fontSize: '12px', color: 'var(--c-text5)', flexShrink: 0,
          }}>
            Les observateurs sont en lecture seule
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
