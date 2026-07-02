import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Hash, Send, Users, MessageCircle, Phone, Video,
  FileText, Smile, MessageSquare, ChevronRight, Search,
  Plus, Trash2, Pencil, Check, X, GripVertical,
} from 'lucide-react';
import { getApiUrl, authJsonHeaders } from '../utils/apiHelpers.js';
import { getAuthSocket, joinProjectRoom, leaveProjectRoom } from '../utils/socket.js';
import { deleteChannel } from '../services/backendApi.js';
import {
  channelCacheKey,
  dmCacheKey,
  getCachedMessages,
  setCachedMessages,
  fetchChannelMessages,
  fetchDmMessages,
  resolveSenderName,
  prefetchChannelMessages,
} from '../utils/meetingMessages.js';

const EMOJI_LIST = [
  '😀','😂','😊','😍','🤔','😅','🥳','😎','🙁','😡',
  '👍','👎','👏','🙏','🤝','✌️','💪','👀','🫡','🙌',
  '❤️','🔥','✅','⚠️','📌','🚀','💡','🎉','📊','🎯',
];

const API = getApiUrl();

// Agenda stored per project in localStorage
function loadAgenda(projectId) {
  try {
    const raw = localStorage.getItem(`agenda_${projectId}`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveAgenda(projectId, items) {
  localStorage.setItem(`agenda_${projectId}`, JSON.stringify(items));
}

/* ── small helpers ── */
function avatar(name) {
  return (name || '?').charAt(0).toUpperCase();
}
function timeLabel(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/* ── Mascotte ── */
function MeetingMascotte({ label }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', padding:'40px' }}>
      <style>{`@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}.mfloat{animation:float 3s ease-in-out infinite}`}</style>
      <div className="mfloat" style={{ marginBottom:'24px' }}>
        <svg width="90" height="90" viewBox="0 0 100 100" fill="none">
          <defs><linearGradient id="mg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#06b6d4"/><stop offset="100%" stopColor="#8b5cf6"/></linearGradient></defs>
          <circle cx="50" cy="50" r="40" fill="var(--c-bg)" stroke="url(#mg)" strokeWidth="2"/>
          <circle cx="40" cy="45" r="6" fill="#06b6d4"/><circle cx="60" cy="45" r="6" fill="#06b6d4"/>
          <circle cx="40" cy="43" r="3" fill="#fff"/><circle cx="60" cy="43" r="3" fill="#fff"/>
          <path d="M42 58 Q50 65 58 58" stroke="#06b6d4" strokeWidth="3" fill="none" strokeLinecap="round"/>
        </svg>
      </div>
      <div style={{ background:'rgba(6,182,212,0.1)', border:'1px solid rgba(6,182,212,0.3)', borderRadius:'12px', padding:'14px 22px', maxWidth:'280px', textAlign:'center' }}>
        <p style={{ fontSize:'13px', color:'var(--c-text3)', margin:0, lineHeight:'1.5' }}>{label || "Personne n'est encore là. Je prépare le café ?"}</p>
      </div>
    </div>
  );
}

/* ── Rendu d'un message avec @mentions en surbrillance ── */
function MessageContent({ content }) {
  if (!content) return null;
  const parts = content.split(/(@\w[\w\s]*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('@') ? (
          <span key={i} style={{ color:'var(--c-accent)', background:'rgba(6,182,212,0.12)', borderRadius:'4px', padding:'0 3px', fontWeight:600 }}>{part}</span>
        ) : part
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CHANNEL PANEL — avec @mention
═══════════════════════════════════════════════════════════════════════════ */
function ChannelPanel({ projectId, user, channels, activeChannelId, setActiveChannelId, members = [] }) {
  const [messages,      setMessages]      = useState([]);
  const [ready,         setReady]         = useState(false);
  const [input,         setInput]         = useState('');
  const [showEmoji,     setShowEmoji]     = useState(false);
  const [error,         setError]         = useState('');
  // @mention
  const [mentionOpen,   setMentionOpen]   = useState(false);
  const [mentionQuery,  setMentionQuery]  = useState('');
  const [mentionIdx,    setMentionIdx]    = useState(0);
  const [pendingMentions, setPendingMentions] = useState([]);

  const endRef   = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!projectId) return undefined;
    const key = channelCacheKey(projectId, activeChannelId);
    const cached = getCachedMessages(key);
    if (cached) {
      setMessages(cached);
      setReady(true);
    } else {
      setMessages([]);
      setReady(false);
    }

    const controller = new AbortController();
    fetchChannelMessages(projectId, activeChannelId, controller.signal)
      .then((msgs) => {
        if (controller.signal.aborted) return;
        setCachedMessages(key, msgs);
        setMessages(msgs);
        setReady(true);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        if (!cached) setMessages([]);
        setReady(true);
      });

    return () => controller.abort();
  }, [projectId, activeChannelId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    if (!projectId) return;
    joinProjectRoom(projectId);
    const s = getAuthSocket();
    if (!s) return;
    const onNew = (payload) => {
      if (!payload || Number(payload.project_id) !== Number(projectId)) return;
      const p = payload.channel_id == null ? null : Number(payload.channel_id);
      const a = activeChannelId == null ? null : Number(activeChannelId);
      if (p !== a) return;
      setMessages(prev => {
        if (prev.some(m => m.id === payload.id)) return prev;
        const next = [...prev, payload];
        setCachedMessages(channelCacheKey(projectId, activeChannelId), next);
        return next;
      });
    };
    const onErr = (p) => { if (p?.message) setError(String(p.message)); };
    s.on('new_message', onNew);
    s.on('error', onErr);
    return () => {
      s.off('new_message', onNew);
      s.off('error', onErr);
      leaveProjectRoom(projectId);
    };
  }, [projectId, activeChannelId]);

  /* ── @mention helpers ── */
  const mentionSuggestions = members.filter(m =>
    Number(m.id) !== Number(user?.id) &&
    (m.name || m.email || '').toLowerCase().includes(mentionQuery.toLowerCase())
  ).slice(0, 6);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInput(val);
    const sel = e.target.selectionStart ?? val.length;
    const before = val.slice(0, sel);
    const match = before.match(/@([\w\s]*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionOpen(true);
      setMentionIdx(0);
    } else {
      setMentionOpen(false);
    }
  };

  const insertMention = (member) => {
    const sel = inputRef.current?.selectionStart ?? input.length;
    const before = input.slice(0, sel);
    const after  = input.slice(sel);
    const replaced = before.replace(/@([\w\s]*)$/, `@${member.name} `);
    setInput(replaced + after);
    setPendingMentions(prev => [...prev, { id: member.id, name: member.name }]);
    setMentionOpen(false);
    setMentionQuery('');
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleKeyDown = (e) => {
    if (mentionOpen && mentionSuggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx(i => (i + 1) % mentionSuggestions.length); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setMentionIdx(i => (i - 1 + mentionSuggestions.length) % mentionSuggestions.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionSuggestions[mentionIdx]); return; }
      if (e.key === 'Escape') { setMentionOpen(false); return; }
    }
    if (e.key === 'Enter' && !mentionOpen) send();
    if (e.key === 'Escape') setShowEmoji(false);
  };

  const send = () => {
    const text = input.trim();
    if (!text || !projectId) return;
    const token = localStorage.getItem('auth_token');
    const s = getAuthSocket();
    const mentionIds = [...new Set(pendingMentions.map(m => m.id))];
    setInput(''); setError(''); setPendingMentions([]);
    if (s?.connected && token) {
      s.emit('send_message', { token, project_id: projectId, channel_id: activeChannelId || undefined, content: text, mention_user_ids: mentionIds });
      return;
    }
    fetch(`${API}/api/messages/project/${projectId}`, {
      method: 'POST', headers: authJsonHeaders(),
      body: JSON.stringify({ content: text, channel_id: activeChannelId || undefined, mention_user_ids: mentionIds }),
    }).then(r => r.json()).then(d => {
      if (d.id) setMessages(prev => {
        const next = [...prev, d];
        setCachedMessages(channelCacheKey(projectId, activeChannelId), next);
        return next;
      });
      else setError(d.error || 'Erreur envoi');
    }).catch(() => setError('Erreur réseau'));
  };

  const activeChannel = channels.find(c => c.id === activeChannelId);

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0 }}>
      {!ready ? (
        <div className="meeting-loading">
          <div className="meeting-loading-spinner" />
        </div>
      ) : messages.length === 0 ? (
        <MeetingMascotte />
      ) : (
          <>
            <div className="current-channel">
              <Hash size={18} />
              <span>{activeChannel?.name || 'reunion-generale'}</span>
            </div>
            <div className="messages-area">
              {messages.map(msg => {
                const sid = msg.sender?.id ?? msg.sender_id;
                const name = resolveSenderName(msg, user, members);
                const own = Number(sid) === Number(user?.id);
                return (
                  <div key={msg.id} className={`meeting-message ${own ? 'own' : ''}`}>
                    <div className="message-avatar">{avatar(name)}</div>
                    <div className="message-content">
                      <div className="message-header">
                        <span className="message-user">{name}</span>
                        <span className="message-time">{timeLabel(msg.created_at)}</span>
                      </div>
                      <p className="message-text"><MessageContent content={msg.content} /></p>
                    </div>
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>
          </>
        )}

      {error && <div style={{ padding:'0 20px 8px', fontSize:'12px', color:'var(--c-danger)' }}>{error}</div>}

      <div className="meeting-input-area" style={{ position:'relative' }}>
        {showEmoji && (
          <div className="meeting-popup" style={{ display:'grid', gridTemplateColumns:'repeat(10,1fr)', gap:'4px' }}>
            {EMOJI_LIST.map(e => (
              <button key={e} type="button"
                onClick={() => { setInput(p => p + e); setShowEmoji(false); inputRef.current?.focus(); }}
                style={{ background:'none', border:'none', cursor:'pointer', fontSize:'18px', padding:'4px', borderRadius:'6px' }}
                onMouseEnter={ev => ev.currentTarget.style.background='var(--c-border2)'}
                onMouseLeave={ev => ev.currentTarget.style.background='none'}
              >{e}</button>
            ))}
          </div>
        )}

        {mentionOpen && mentionSuggestions.length > 0 && (
          <div className="meeting-mention-popup">
            {mentionSuggestions.map((m, i) => (
              <button key={m.id} type="button"
                onMouseDown={(e) => { e.preventDefault(); insertMention(m); }}
                style={{ display:'flex', alignItems:'center', gap:'8px', width:'100%', padding:'7px 10px', borderRadius:'7px', border:'none', background: i === mentionIdx ? 'var(--c-hover)' : 'transparent', cursor:'pointer', color:'var(--c-text2)', fontSize:'13px', textAlign:'left' }}
                onMouseEnter={() => setMentionIdx(i)}
              >
                <div className="dm-avatar" style={{ width:'24px', height:'24px', fontSize:'11px' }}>
                  {avatar(m.name || m.email)}
                </div>
                <span>{m.name || m.email}</span>
              </button>
            ))}
          </div>
        )}

        <div className="meeting-input-wrapper">
          <button type="button" onClick={() => setShowEmoji(v => !v)} style={{ background:'none', border:'none', cursor:'pointer', color: showEmoji ? 'var(--c-accent)' : 'var(--c-text5)', padding:'0 4px', display:'flex', alignItems:'center' }} title="Emoji">
            <Smile size={18} />
          </button>
          <input ref={inputRef} type="text" value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onBlur={() => setTimeout(() => setMentionOpen(false), 150)}
            placeholder={`Message dans #${activeChannel?.name || 'reunion-generale'}… (@nom pour mentionner)`}
            className="meeting-input"
          />
          <button className="meeting-send-btn" onClick={send}><Send size={18} /></button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   DM PANEL  — conversation with a specific member
═══════════════════════════════════════════════════════════════════════════ */
function DMPanel({ user, target, onClose }) {
  const [messages,  setMessages]  = useState([]);
  const [ready,     setReady]     = useState(false);
  const [input,     setInput]     = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [error,     setError]     = useState('');
  const endRef   = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!target?.id || !user?.id) return undefined;
    const key = dmCacheKey(user.id, target.id);
    const cached = getCachedMessages(key);
    if (cached) {
      setMessages(cached);
      setReady(true);
    } else {
      setMessages([]);
      setReady(false);
    }

    const controller = new AbortController();
    fetchDmMessages(target.id, controller.signal)
      .then((msgs) => {
        if (controller.signal.aborted) return;
        setCachedMessages(key, msgs);
        setMessages(msgs);
        setReady(true);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        if (!cached) setMessages([]);
        setReady(true);
      });

    return () => controller.abort();
  }, [target?.id, user?.id]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  /* real-time */
  useEffect(() => {
    const s = getAuthSocket();
    if (!s || !target?.id) return;
    const onDM = (payload) => {
      const sid = Number(payload?.sender?.id ?? payload?.sender_id);
      const meId = Number(user?.id);
      const otherId = Number(target.id);
      // Accept only messages from this conversation (me ↔ target)
      if (sid !== meId && sid !== otherId) return;
      setMessages(prev => {
        if (prev.some(m => m.id === payload.id)) return prev;
        const next = [...prev, payload];
        setCachedMessages(dmCacheKey(user.id, target.id), next);
        return next;
      });
    };
    s.on('new_dm_message', onDM);
    return () => s.off('new_dm_message', onDM);
  }, [target?.id, user?.id]);

  const send = async () => {
    const text = input.trim();
    if (!text || !target?.id) return;
    const token = localStorage.getItem('auth_token');
    const s = getAuthSocket();
    setInput(''); setError('');

    if (s?.connected && token) {
      s.emit('send_dm_message', { token, recipient_id: target.id, content: text });
      return;
    }
    /* HTTP fallback */
    const res = await fetch(`${API}/api/messages/dm/${target.id}`, {
      method: 'POST', headers: authJsonHeaders(),
      body: JSON.stringify({ content: text }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.id) setMessages(prev => {
      const next = [...prev, data];
      setCachedMessages(dmCacheKey(user.id, target.id), next);
      return next;
    });
    else setError(data.error || 'Erreur envoi');
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0 }}>
      {/* DM header */}
      <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'12px 20px', borderBottom:'1px solid var(--c-hover)' }}>
        <button
          type="button"
          onClick={onClose}
          style={{ background:'none', border:'none', color:'var(--c-text5)', cursor:'pointer', display:'flex', alignItems:'center', padding:'4px', borderRadius:'6px' }}
          title="Retour"
        >
          <ChevronRight size={16} style={{ transform:'rotate(180deg)' }} />
        </button>
        <div className="dm-avatar">
          {avatar(target.name || target.email)}
        </div>
        <div>
          <div style={{ fontSize:'14px', fontWeight:'600', color:'var(--c-text)' }}>{target.name || target.email}</div>
          <div style={{ fontSize:'11px', color:'var(--c-text5)' }}>Message direct</div>
        </div>
      </div>

      {/* Messages */}
      { !ready ? (
        <div className="meeting-loading">
          <div className="meeting-loading-spinner" />
        </div>
      ) : messages.length === 0 ? (
        <MeetingMascotte label={`Commencez à discuter avec ${target.name || target.email} !`} />
      ) : (
        <div className="messages-area">
          {messages.map(msg => {
            const sid = msg.sender?.id ?? msg.sender_id;
            const name = resolveSenderName(msg, user, [], target);
            const own = Number(sid) === Number(user?.id);
            return (
              <div key={msg.id} className={`meeting-message ${own ? 'own' : ''}`}>
                <div className="message-avatar">{avatar(own ? (user?.name || 'M') : name)}</div>
                <div className="message-content">
                  <div className="message-header">
                    <span className="message-user">{own ? (user?.name || 'Moi') : name}</span>
                    <span className="message-time">{timeLabel(msg.created_at)}</span>
                  </div>
                  <p className="message-text">{msg.content}</p>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      )}

      {error && <div style={{ padding:'0 20px 8px', fontSize:'12px', color:'var(--c-danger)' }}>{error}</div>}

      <div className="meeting-input-area" style={{ position:'relative' }}>
        {showEmoji && (
          <div className="meeting-popup" style={{ display:'grid', gridTemplateColumns:'repeat(10,1fr)', gap:'4px' }}>
            {EMOJI_LIST.map(e => (
              <button key={e} type="button"
                onClick={() => { setInput(p => p + e); setShowEmoji(false); inputRef.current?.focus(); }}
                style={{ background:'none', border:'none', cursor:'pointer', fontSize:'18px', padding:'4px', borderRadius:'6px' }}
                onMouseEnter={ev => ev.currentTarget.style.background='var(--c-border2)'}
                onMouseLeave={ev => ev.currentTarget.style.background='none'}
              >{e}</button>
            ))}
          </div>
        )}
        <div className="meeting-input-wrapper">
          <button type="button" onClick={() => setShowEmoji(v => !v)} style={{ background:'none', border:'none', cursor:'pointer', color: showEmoji ? 'var(--c-accent)' : 'var(--c-text5)', padding:'0 4px', display:'flex', alignItems:'center' }} title="Emoji">
            <Smile size={18} />
          </button>
          <input ref={inputRef} type="text" value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') send(); if (e.key === 'Escape') setShowEmoji(false); }}
            placeholder={`Message à ${target.name || target.email}…`}
            className="meeting-input"
          />
          <button className="meeting-send-btn" onClick={send}><Send size={18} /></button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════════════════ */
export default function MeetingView({ projectId, user, members = [], isAdmin = false, meetingTarget = null, onMeetingTargetConsumed }) {
  /* channel state */
  const [channels,       setChannels]       = useState([]);
  const [activeChannelId, setActiveChannelId] = useState(null);
  const [deletingChanId, setDeletingChanId] = useState(null);
  /* agenda state */
  const [agendaItems,    setAgendaItems]    = useState([]);
  const [agendaEditing,  setAgendaEditing]  = useState(false);
  const [agendaDraft,    setAgendaDraft]    = useState([]);  // copy while editing
  /* sidebar mode: 'channels' | 'dm' */
  const [sidebarMode,    setSidebarMode]    = useState('channels');
  /* DM state */
  const [dmTarget,       setDmTarget]       = useState(null);     // member object
  const [dmSearch,       setDmSearch]       = useState('');
  const [dmUnread,       setDmUnread]       = useState({});       // { userId: count }
  /* shared */
  const [showMembers,    setShowMembers]    = useState(false);
  /* présence en ligne : Set d'IDs (numbers) */
  const [onlineUsers,    setOnlineUsers]    = useState(() => new Set());

  const openCall = (audioOnly = false) => {
    if (!projectId) return;
    const roomName = `telework-project-${projectId}`;
    const url = audioOnly
      ? `https://meet.jit.si/${roomName}#config.startWithVideoMuted=true`
      : `https://meet.jit.si/${roomName}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // ── Agenda ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (projectId) setAgendaItems(loadAgenda(projectId));
  }, [projectId]);

  const startEditAgenda = () => {
    setAgendaDraft(agendaItems.map(i => ({ ...i })));
    setAgendaEditing(true);
  };
  const cancelEditAgenda = () => setAgendaEditing(false);
  const saveAgendaEdit = () => {
    const cleaned = agendaDraft.filter(i => i.title.trim());
    setAgendaItems(cleaned);
    saveAgenda(projectId, cleaned);
    setAgendaEditing(false);
  };
  const addAgendaItem = () => setAgendaDraft(prev => [...prev, { title: '', time: '' }]);
  const removeAgendaItem = (idx) => setAgendaDraft(prev => prev.filter((_, i) => i !== idx));
  const updateAgendaItem = (idx, field, val) =>
    setAgendaDraft(prev => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item));

  // ── Suppression canal ────────────────────────────────────────────────────────
  const handleDeleteChannel = async (e, channel) => {
    e.stopPropagation();
    if (!window.confirm(`Supprimer le canal #${channel.name} ? Les messages seront conservés.`)) return;
    setDeletingChanId(channel.id);
    try {
      await deleteChannel(projectId, channel.id);
      setChannels(prev => {
        const updated = prev.filter(c => c.id !== channel.id);
        if (activeChannelId === channel.id)
          setActiveChannelId(updated.length > 0 ? updated[0].id : null);
        return updated;
      });
    } catch (err) {
      alert(err.message);
    } finally {
      setDeletingChanId(null);
    }
  };

  const loadChannels = useCallback(async () => {
    if (!projectId) return;
    const res = await fetch(`${API}/api/messages/channels/${projectId}`, { headers: authJsonHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    const list = data.channels || [];
    setChannels(list);
    if (list.length > 0) {
      setActiveChannelId(prev => (prev && list.some(c => c.id === prev) ? prev : list[0].id));
      list.forEach((c) => prefetchChannelMessages(projectId, c.id));
    } else {
      setActiveChannelId(null);
    }
  }, [projectId]);

  useEffect(() => { loadChannels(); }, [loadChannels]);

  /* track unread DMs from socket while a DM isn't open */
  useEffect(() => {
    const s = getAuthSocket();
    if (!s) return;
    const onDM = (payload) => {
      const sid = Number(payload?.sender?.id ?? payload?.sender_id);
      if (sid === Number(user?.id)) return; // own message
      // If we're already viewing this DM → no unread
      if (dmTarget && Number(dmTarget.id) === sid) return;
      setDmUnread(prev => ({ ...prev, [sid]: (prev[sid] || 0) + 1 }));
    };
    s.on('new_dm_message', onDM);
    return () => s.off('new_dm_message', onDM);
  }, [user?.id, dmTarget]);

  /* ── Présence en ligne ────────────────────────────────────────────────── */
  useEffect(() => {
    if (!projectId) return;
    const s = getAuthSocket();
    if (!s) return;

    // Liste initiale reçue juste après join_project
    const onOnlineList = ({ online_user_ids }) => {
      setOnlineUsers(new Set((online_user_ids || []).map(Number)));
    };
    // Un membre vient de se connecter
    const onUserOnline = ({ user_id }) => {
      setOnlineUsers(prev => { const next = new Set(prev); next.add(Number(user_id)); return next; });
    };
    // Un membre s'est déconnecté
    const onUserOffline = ({ user_id }) => {
      setOnlineUsers(prev => { const next = new Set(prev); next.delete(Number(user_id)); return next; });
    };

    s.on('online_in_project', onOnlineList);
    s.on('user_online',        onUserOnline);
    s.on('user_offline',       onUserOffline);

    // Réémettre join_project APRÈS avoir attaché les listeners pour être sûr
    // de recevoir online_in_project (App.jsx l'a peut-être déjà émis avant notre montage)
    const requestList = () => s.emit('join_project', {
      project_id: projectId,
      token: localStorage.getItem('auth_token'),
    });
    if (s.connected) requestList();
    else s.once('connect', requestList);

    return () => {
      s.off('online_in_project', onOnlineList);
      s.off('user_online',        onUserOnline);
      s.off('user_offline',       onUserOffline);
    };
  }, [projectId]);

  /* clear unread when opening a DM */
  const openDM = (member) => {
    setDmTarget(member);
    setDmUnread(prev => {
      const next = { ...prev };
      delete next[member.id];
      return next;
    });
    setSidebarMode('dm');
  };

  // ── Consommer meetingTarget (navigation depuis une notification) ─────────────
  useEffect(() => {
    if (!meetingTarget) return;
    if (meetingTarget.type === 'channel') {
      setSidebarMode('channels');
      setDmTarget(null);
      if (meetingTarget.id) setActiveChannelId(meetingTarget.id);
    } else if (meetingTarget.type === 'dm') {
      const target = members.find(m => Number(m.id) === Number(meetingTarget.id));
      if (target) openDM(target);
    }
    onMeetingTargetConsumed?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingTarget]);

  /* filter members for DM contact list */
  const dmContacts = members.filter(m => {
    if (Number(m.id) === Number(user?.id)) return false;
    if (!dmSearch.trim()) return true;
    return (m.name || m.email || '').toLowerCase().includes(dmSearch.toLowerCase());
  });

  const totalUnread = Object.values(dmUnread).reduce((a, b) => a + b, 0);

  return (
    <div className="meeting-container">

      {/* ── HEADER ── */}
      <div className="meeting-header">
        <div className="meeting-title">
          <MessageCircle size={22} color="var(--c-accent)" />
          <h2>Salle de réunion</h2>
          <div className="channel-info">
            {sidebarMode === 'channels'
              ? <><Hash size={13} /><span>{channels.find(c => c.id === activeChannelId)?.name || 'reunion-generale'}</span></>
              : dmTarget
                ? <><MessageSquare size={13} /><span>{dmTarget.name || dmTarget.email}</span></>
                : <><MessageSquare size={13} /><span>Messages directs</span></>
            }
            <span className="dot" />
            <span>{onlineUsers.size > 0 ? `${onlineUsers.size} en ligne` : `${members.length} membres`}</span>
          </div>
        </div>
        <div className="meeting-actions">
          <button className="meeting-action-btn" title="Appel audio" onClick={() => openCall(true)}><Phone size={17} /></button>
          <button className="meeting-action-btn" title="Appel vidéo" onClick={() => openCall(false)}><Video size={17} /></button>
          <button className={`meeting-action-btn ${showMembers ? 'active' : ''}`} onClick={() => setShowMembers(v => !v)} title="Membres"><Users size={17} /></button>
        </div>
      </div>

      <div className="meeting-content">
        {/* ── SIDEBAR ── */}
        <div className="meeting-sidebar">
          {/* tab switcher */}
          <div className="sidebar-tabs">
            <button
              type="button"
              className={`sidebar-tab ${sidebarMode === 'channels' ? 'active' : ''}`}
              onClick={() => { setSidebarMode('channels'); setDmTarget(null); }}
            >
              <Hash size={13} /> Canaux
            </button>
            <button
              type="button"
              className={`sidebar-tab ${sidebarMode === 'dm' ? 'active' : ''}`}
              onClick={() => setSidebarMode('dm')}
              style={{ position: 'relative' }}
            >
              <MessageSquare size={13} /> DM
              {totalUnread > 0 && (
                <span style={{ position:'absolute', top:'6px', right:'12px', background:'var(--c-danger)', color:'#fff', borderRadius:'9999px', fontSize:'10px', fontWeight:'700', padding:'1px 5px', lineHeight:'14px' }}>
                  {totalUnread}
                </span>
              )}
            </button>
          </div>

          {/* CHANNELS mode: agenda + channel list */}
          {sidebarMode === 'channels' && (
            <>
              {/* ── Ordre du jour ── */}
              <div className="agenda-section">
                <div className="agenda-title" style={{ justifyContent: 'space-between' }}>
                  <span style={{ display:'flex', alignItems:'center', gap:'6px' }}><FileText size={13} />Ordre du jour</span>
                  {isAdmin && !agendaEditing && (
                    <button onClick={startEditAgenda} title="Modifier l'ordre du jour"
                      style={{ background:'none', border:'none', cursor:'pointer', color:'var(--c-text4)', padding:'2px', display:'flex', alignItems:'center' }}>
                      <Pencil size={12} />
                    </button>
                  )}
                </div>

                {/* Mode lecture */}
                {!agendaEditing && (
                  agendaItems.length === 0
                    ? <div style={{ fontSize:'12px', color:'var(--c-text5)', fontStyle:'italic', padding:'4px 0' }}>
                        {isAdmin ? 'Cliquez sur ✏️ pour définir l\'ordre du jour.' : 'Aucun ordre du jour défini.'}
                      </div>
                    : agendaItems.map((item, i) => (
                        <div key={i} className="agenda-item">
                          <div className="agenda-item-title">{item.title}</div>
                          {item.time && <div className="agenda-item-time">{item.time}</div>}
                        </div>
                      ))
                )}

                {/* Mode édition (admin) */}
                {agendaEditing && (
                  <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                    {agendaDraft.map((item, idx) => (
                      <div key={idx} style={{ display:'flex', flexDirection:'column', gap:'4px', padding:'8px', background:'rgba(255,255,255,0.03)', borderRadius:'8px', border:'1px solid var(--c-border)' }}>
                        <div style={{ display:'flex', gap:'4px', alignItems:'center' }}>
                          <input
                            value={item.title}
                            onChange={e => updateAgendaItem(idx, 'title', e.target.value)}
                            placeholder="Point de l'ordre du jour"
                            style={{ flex:1, background:'var(--c-surface)', border:'1px solid var(--c-border2)', borderRadius:'6px', padding:'5px 8px', color:'var(--c-text)', fontSize:'12px', outline:'none' }}
                          />
                          <button onClick={() => removeAgendaItem(idx)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--c-danger)', padding:'4px', display:'flex' }}>
                            <X size={13} />
                          </button>
                        </div>
                        <input
                          value={item.time}
                          onChange={e => updateAgendaItem(idx, 'time', e.target.value)}
                          placeholder="Horaire (ex: 10:00 - 10:20)"
                          style={{ background:'var(--c-surface)', border:'1px solid var(--c-border2)', borderRadius:'6px', padding:'5px 8px', color:'var(--c-text4)', fontSize:'11px', outline:'none' }}
                        />
                      </div>
                    ))}
                    <button onClick={addAgendaItem}
                      style={{ display:'flex', alignItems:'center', gap:'5px', padding:'6px 8px', borderRadius:'7px', border:'1px dashed var(--c-border2)', background:'none', color:'var(--c-accent)', fontSize:'12px', cursor:'pointer', justifyContent:'center' }}>
                      <Plus size={12} /> Ajouter un point
                    </button>
                    <div style={{ display:'flex', gap:'6px' }}>
                      <button onClick={saveAgendaEdit}
                        style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'5px', padding:'6px', borderRadius:'7px', border:'none', background:'var(--c-accent)', color:'#fff', fontSize:'12px', fontWeight:'600', cursor:'pointer' }}>
                        <Check size={12} /> Enregistrer
                      </button>
                      <button onClick={cancelEditAgenda}
                        style={{ padding:'6px 10px', borderRadius:'7px', border:'1px solid var(--c-border2)', background:'none', color:'var(--c-text4)', fontSize:'12px', cursor:'pointer' }}>
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Liste des canaux ── */}
              <div className="channels-header"><span>Canaux</span></div>
              <div className="channels-list">
                {channels.length === 0
                  ? <div style={{ padding:'10px 12px', fontSize:'12px', color:'var(--c-text5)' }}>Aucun canal — l'admin peut en créer.</div>
                  : channels.map(c => (
                    <div key={c.id} style={{ display:'flex', alignItems:'center', borderRadius:'6px', overflow:'hidden', background: activeChannelId === c.id ? 'rgba(6,182,212,0.15)' : 'transparent' }}>
                      <button
                        style={{ flex:'1 1 0', minWidth:0, display:'flex', alignItems:'center', gap:'8px', padding:'8px 10px', background:'transparent', border:'none', color: activeChannelId === c.id ? 'var(--c-accent)' : 'var(--c-text3)', fontSize:'13px', cursor:'pointer', textAlign:'left', overflow:'hidden' }}
                        onClick={() => setActiveChannelId(c.id)}
                      >
                        <Hash size={15} style={{ flexShrink:0 }} />
                        <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.name}</span>
                      </button>
                      {isAdmin && (
                        <button
                          onClick={(e) => handleDeleteChannel(e, c)}
                          disabled={deletingChanId === c.id}
                          title={`Supprimer #${c.name}`}
                          style={{ padding:'4px 7px', background:'none', border:'none', cursor: deletingChanId === c.id ? 'not-allowed' : 'pointer', color:'var(--c-text5)', flexShrink:0, display:'flex', alignItems:'center', borderRadius:'4px', opacity: deletingChanId === c.id ? 0.3 : 0.7 }}
                          onMouseEnter={e => { if (deletingChanId !== c.id) e.currentTarget.style.color='var(--c-danger)'; }}
                          onMouseLeave={e => e.currentTarget.style.color='var(--c-text5)'}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  ))}
              </div>
            </>
          )}

          {/* DM mode: search + member contact list */}
          {sidebarMode === 'dm' && (
            <>
              <div className="dm-search">
                <Search size={13} style={{ color:'var(--c-text5)', flexShrink:0 }} />
                <input
                  type="text"
                  value={dmSearch}
                  onChange={e => setDmSearch(e.target.value)}
                  placeholder="Rechercher un membre…"
                />
              </div>
              <div className="channels-list">
                {dmContacts.length === 0 && (
                  <div style={{ padding:'10px 12px', fontSize:'12px', color:'var(--c-text5)' }}>
                    {members.length <= 1 ? 'Aucun autre membre dans ce projet.' : 'Aucun résultat.'}
                  </div>
                )}
                {dmContacts.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    className={`dm-contact ${dmTarget?.id === m.id ? 'active' : ''}`}
                    onClick={() => openDM(m)}
                  >
                    <div className="dm-avatar" style={{ position:'relative' }}>
                      {avatar(m.name || m.email)}
                      <span className={`status-dot-small ${onlineUsers.has(Number(m.id)) ? 'online' : 'offline'}`} />
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:'13px', color:'var(--c-text2)', fontWeight:'500', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{m.name || m.email}</div>
                      <div style={{ fontSize:'11px', color: onlineUsers.has(Number(m.id)) ? 'var(--c-success)' : 'var(--c-text5)' }}>
                        {onlineUsers.has(Number(m.id)) ? 'En ligne' : (m.role || 'Membre')}
                      </div>
                    </div>
                    {dmUnread[m.id] > 0 && (
                      <span style={{ background:'var(--c-danger)', color:'#fff', borderRadius:'9999px', fontSize:'10px', fontWeight:'700', padding:'1px 6px', lineHeight:'14px', flexShrink:0 }}>
                        {dmUnread[m.id]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── MAIN ── */}
        <div className="meeting-main">
          {sidebarMode === 'channels' && (
            <ChannelPanel
              projectId={projectId}
              user={user}
              channels={channels}
              activeChannelId={activeChannelId}
              setActiveChannelId={setActiveChannelId}
              members={members}
            />
          )}

          {sidebarMode === 'dm' && !dmTarget && (
            <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'40px', gap:'16px' }}>
              <div style={{ width:'64px', height:'64px', borderRadius:'50%', background:'var(--c-hover)', border:'1px solid var(--c-border2)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <MessageSquare size={28} style={{ color:'var(--c-accent)' }} />
              </div>
              <p style={{ fontSize:'15px', fontWeight:'600', color:'var(--c-text2)', margin:0 }}>Messages directs</p>
              <p style={{ fontSize:'13px', color:'var(--c-text4)', textAlign:'center', maxWidth:'260px', margin:0, lineHeight:'1.5' }}>
                Sélectionnez un membre dans la liste à gauche pour démarrer une conversation privée.
              </p>
            </div>
          )}

          {sidebarMode === 'dm' && dmTarget && (
            <DMPanel
              user={user}
              target={dmTarget}
              onClose={() => setDmTarget(null)}
            />
          )}
        </div>

        {/* ── MEMBERS PANEL ── */}
        {showMembers && (() => {
          const onlineList  = members.filter(m => onlineUsers.has(Number(m.id)));
          const offlineList = members.filter(m => !onlineUsers.has(Number(m.id)));
          const renderMember = (m) => (
            <div
              key={m.id}
              className="member-item"
              title={Number(m.id) === Number(user?.id) ? 'Vous' : `Envoyer un DM à ${m.name || m.email}`}
              onClick={() => {
                if (Number(m.id) === Number(user?.id)) return;
                openDM(m); setShowMembers(false);
              }}
              style={{ cursor: Number(m.id) === Number(user?.id) ? 'default' : 'pointer',
                       opacity: onlineUsers.has(Number(m.id)) ? 1 : 0.5 }}
            >
              <div className="member-avatar">
                {avatar(m.name || m.email)}
                <span className={`status-dot-small ${onlineUsers.has(Number(m.id)) ? 'online' : 'offline'}`} />
              </div>
              <span className="member-name">{m.name || m.email}</span>
              {Number(m.id) !== Number(user?.id) && (
                <MessageSquare size={12} style={{ color:'var(--c-text5)', marginLeft:'auto', flexShrink:0 }} />
              )}
            </div>
          );
          return (
            <div className="members-panel">
              <div className="members-header"><Users size={16} /><span>Membres ({members.length})</span></div>
              <div className="members-list">
                {members.length === 0 && <div style={{ padding:'10px 12px', fontSize:'12px', color:'var(--c-text5)' }}>Aucun membre</div>}

                {/* En ligne */}
                {onlineList.length > 0 && (
                  <>
                    <div style={{ padding:'6px 10px 2px', fontSize:'10px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--c-success)', opacity:0.8 }}>
                      En ligne — {onlineList.length}
                    </div>
                    {onlineList.map(renderMember)}
                  </>
                )}

                {/* Hors ligne */}
                {offlineList.length > 0 && (
                  <>
                    <div style={{ padding:'8px 10px 2px', fontSize:'10px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--c-text5)' }}>
                      Hors ligne — {offlineList.length}
                    </div>
                    {offlineList.map(renderMember)}
                  </>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
