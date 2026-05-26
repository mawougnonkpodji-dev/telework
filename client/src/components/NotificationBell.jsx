import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, BellRing, CheckCheck, X, ExternalLink } from 'lucide-react';
import { fetchNotifications, markNotificationRead, markAllNotificationsRead } from '../services/backendApi.js';
import { getAuthSocket } from '../utils/socket.js';

// ── helpers ────────────────────────────────────────────────────────────────────
function timeAgo(isoString) {
  if (!isoString) return '';
  const diff = Math.floor((Date.now() - new Date(isoString)) / 1000);
  if (diff < 60)  return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}j`;
}

const TYPE_ICON = {
  task_assigned:   '📋',
  task_validated:  '✅',
  task_rejected:   '❌',
  task_delivered:  '📦',
  dm_received:     '💬',
  channel_message: '💬',
  mention:         '🔔',
};

// ── component ──────────────────────────────────────────────────────────────────
export default function NotificationBell() {
  const [open,          setOpen]          = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading,       setLoading]       = useState(false);
  const panelRef = useRef(null);
  const bellRef  = useRef(null);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // ── Load from API ────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchNotifications(1);
      setNotifications(data?.notifications ?? []);
    } catch (_) {
      // silent fail — bell stays visible but empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Real-time socket ─────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = getAuthSocket();
    if (!socket) return;

    const handler = (notif) => {
      setNotifications((prev) => {
        // avoid duplicates (e.g. if HTTP fallback already added it)
        if (prev.find((n) => n.id === notif.id)) return prev;
        return [notif, ...prev];
      });
    };

    socket.on('new_notification', handler);
    return () => socket.off('new_notification', handler);
  }, []);

  // ── Close on outside click ───────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target) &&
        bellRef.current  && !bellRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // ── Mark one as read ─────────────────────────────────────────────────────────
  const handleClick = async (notif) => {
    if (!notif.is_read) {
      await markNotificationRead(notif.id).catch(() => {});
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
      );
    }
    if (notif.link) {
      // Internal navigation: dispatch event or just set hash
      setOpen(false);
      // Simple fallback: open in same page via href (SPA will handle routing if configured)
      window.dispatchEvent(new CustomEvent('navigateTo', { detail: notif.link }));
    }
  };

  // ── Mark all as read ─────────────────────────────────────────────────────────
  const handleMarkAll = async () => {
    await markAllNotificationsRead().catch(() => {});
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      {/* ── Bell button ── */}
      <button
        ref={bellRef}
        onClick={() => setOpen((v) => !v)}
        title="Notifications"
        style={{
          position: 'relative',
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          border: open
            ? '1px solid rgba(34,211,238,0.5)'
            : '1px solid var(--c-border2)',
          background: open
            ? 'rgba(34,211,238,0.12)'
            : 'var(--c-ba7)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s',
          backdropFilter: 'blur(8px)',
        }}
      >
        {unreadCount > 0
          ? <BellRing size={18} color="#22d3ee" style={{ animation: 'bellShake 0.6s ease infinite' }} />
          : <Bell size={18} color={open ? 'var(--c-accent)' : 'var(--c-text3)'} />}

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: '2px',
            right: '2px',
            minWidth: '17px',
            height: '17px',
            borderRadius: '9999px',
            background: 'linear-gradient(135deg, #ef4444, #dc2626)',
            color: '#fff',
            fontSize: '10px',
            fontWeight: '700',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 4px',
            lineHeight: 1,
            border: '1.5px solid var(--c-bg)',
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* ── Dropdown panel ── */}
      {open && (
        <div
          ref={panelRef}
          style={{
            position: 'absolute',
            top: 'calc(100% + 10px)',
            right: 0,
            width: '340px',
            maxHeight: '480px',
            borderRadius: '16px',
            background: 'var(--c-sidebar)',
            border: '1px solid rgba(34,211,238,0.18)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            backdropFilter: 'blur(16px)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 9999,
            overflow: 'hidden',
            animation: 'notifSlideDown 0.18s ease',
          }}
        >
          <style>{`
            @keyframes bellShake {
              0%,100% { transform: rotate(0deg); }
              20%      { transform: rotate(-14deg); }
              40%      { transform: rotate(14deg); }
              60%      { transform: rotate(-8deg); }
              80%      { transform: rotate(8deg); }
            }
            @keyframes notifSlideDown {
              from { opacity:0; transform:translateY(-8px); }
              to   { opacity:1; transform:translateY(0); }
            }
          `}</style>

          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: '1px solid var(--c-border)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bell size={15} color="#22d3ee" />
              <span style={{ fontWeight: '700', fontSize: '14px', color: 'var(--c-text)' }}>
                Notifications
              </span>
              {unreadCount > 0 && (
                <span style={{
                  fontSize: '11px',
                  background: 'rgba(239,68,68,0.2)',
                  color: '#f87171',
                  padding: '1px 7px',
                  borderRadius: '9999px',
                  fontWeight: '600',
                }}>
                  {unreadCount} non lue{unreadCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAll}
                  title="Tout marquer comme lu"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--c-text4)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                    padding: '4px 6px',
                    borderRadius: '6px',
                    transition: 'color 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#22d3ee'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--c-text4)'}
                >
                  <CheckCheck size={13} />
                  Tout lire
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#64748b', display: 'flex', padding: '4px',
                  borderRadius: '6px', transition: 'color 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#f87171'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--c-text4)'}
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading ? (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--c-text4)', fontSize: '13px' }}>
                Chargement…
              </div>
            ) : notifications.length === 0 ? (
              <div style={{
                padding: '40px 24px',
                textAlign: 'center',
                color: 'var(--c-text4)',
              }}>
                <Bell size={32} style={{ opacity: 0.3, marginBottom: '10px' }} />
                <p style={{ fontSize: '13px' }}>Aucune notification pour le moment</p>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => handleClick(notif)}
                  style={{
                    display: 'flex',
                    gap: '12px',
                    padding: '12px 18px',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--c-border3)',
                    background: notif.is_read
                      ? 'transparent'
                      : 'rgba(34,211,238,0.04)',
                    transition: 'background 0.15s',
                    alignItems: 'flex-start',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(34,211,238,0.07)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = notif.is_read ? 'transparent' : 'rgba(34,211,238,0.04)'}
                >
                  {/* Type icon */}
                  <div style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '10px',
                    background: notif.is_read
                      ? 'var(--c-hover)'
                      : 'rgba(34,211,238,0.1)',
                    border: notif.is_read
                      ? '1px solid var(--c-border)'
                      : '1px solid rgba(34,211,238,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '16px',
                    flexShrink: 0,
                  }}>
                    {TYPE_ICON[notif.type] || '🔔'}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: '8px',
                      marginBottom: '2px',
                    }}>
                      <span style={{
                        fontSize: '13px',
                        fontWeight: notif.is_read ? '500' : '700',
                        color: notif.is_read ? 'var(--c-text3)' : 'var(--c-text)',
                        lineHeight: '1.3',
                      }}>
                        {notif.title}
                      </span>
                      <span style={{ fontSize: '10px', color: 'var(--c-text5)', flexShrink: 0 }}>
                        {timeAgo(notif.created_at)}
                      </span>
                    </div>
                    <p style={{
                      fontSize: '12px',
                      color: notif.is_read ? 'var(--c-text5)' : 'var(--c-text4)',
                      lineHeight: '1.4',
                      margin: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {notif.content}
                    </p>
                    {notif.link && (
                      <div style={{
                        marginTop: '5px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '11px',
                        fontWeight: '600',
                        color: '#22d3ee',
                        background: 'rgba(34,211,238,0.1)',
                        border: '1px solid rgba(34,211,238,0.2)',
                        borderRadius: '5px',
                        padding: '2px 7px',
                        cursor: 'pointer',
                      }}>
                        <ExternalLink size={10} />
                        Voir
                      </div>
                    )}
                  </div>

                  {/* Unread dot */}
                  {!notif.is_read && (
                    <div style={{
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      background: '#22d3ee',
                      flexShrink: 0,
                      marginTop: '6px',
                    }} />
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div style={{
              padding: '10px 18px',
              borderTop: '1px solid var(--c-border3)',
              flexShrink: 0,
              textAlign: 'center',
            }}>
              <button
                onClick={() => { load(); }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '11px',
                  color: '#64748b',
                  transition: 'color 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#22d3ee'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--c-text4)'}
              >
                Actualiser
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
