import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Hash, Send, Users, MessageCircle, Phone, Video,
  FileText, Smile, MessageSquare, ChevronRight, Search,
} from 'lucide-react';
import { getApiUrl, authJsonHeaders } from '../utils/apiHelpers.js';
import { getAuthSocket, joinProjectRoom, leaveProjectRoom } from '../utils/socket.js';

const EMOJI_LIST = [
  '😀','😂','😊','😍','🤔','😅','🥳','😎','🙁','😡',
  '👍','👎','👏','🙏','🤝','✌️','💪','👀','🫡','🙌',
  '❤️','🔥','✅','⚠️','📌','🚀','💡','🎉','📊','🎯',
];

const API = getApiUrl();

const agendaItems = [
  { title: 'Point Sprint',    time: '10:00 - 10:20' },
  { title: 'Revue des bugs',  time: '10:20 - 10:40' },
  { title: 'Planification',   time: '10:40 - 11:00' },
];

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

/* ═══════════════════════════════════════════════════════════════════════════
   CHANNEL PANEL (existing behavior, extracted to sub-component)
═══════════════════════════════════════════════════════════════════════════ */
function ChannelPanel({ projectId, user, channels, activeChannelId, setActiveChannelId }) {
  const [messages,  setMessages]  = useState([]);
  const [input,     setInput]     = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [error,     setError]     = useState('');
  const endRef    = useRef(null);
  const inputRef  = useRef(null);

  const loadMessages = useCallback(async () => {
    if (!projectId) return;
    const qs = new URLSearchParams({ per_page: '100', page: '1' });
    if (activeChannelId) qs.set('channel_id', String(activeChannelId));
    const res = await fetch(`${API}/api/messages/project/${projectId}?${qs}`, { headers: authJsonHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    setMessages(data.messages || []);
  }, [projectId, activeChannelId]);

  useEffect(() => { loadMessages(); }, [loadMessages]);
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
      setMessages(prev => prev.some(m => m.id === payload.id) ? prev : [...prev, payload]);
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

  const send = () => {
    const text = input.trim();
    if (!text || !projectId) return;
    const token = localStorage.getItem('auth_token');
    const s = getAuthSocket();
    setInput(''); setError('');
    if (s?.connected && token) {
      s.emit('send_message', { token, project_id: projectId, channel_id: activeChannelId || undefined, content: text });
      return;
    }
    fetch(`${API}/api/messages/project/${projectId}`, {
      method: 'POST', headers: authJsonHeaders(),
      body: JSON.stringify({ content: text, channel_id: activeChannelId || undefined }),
    }).then(r => r.json()).then(d => {
      if (d.id) setMessages(prev => [...prev, d]);
      else setError(d.error || 'Erreur envoi');
    }).catch(() => setError('Erreur réseau'));
  };

  const activeChannel = channels.find(c => c.id === activeChannelId);

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0 }}>
      {messages.length === 0
        ? <MeetingMascotte />
        : (
          <>
            <div className="current-channel">
              <Hash size={18} />
              <span>{activeChannel?.name || 'reunion-generale'}</span>
            </div>
            <div className="messages-area">
              {messages.map(msg => {
                const sid = msg.sender?.id ?? msg.sender_id;
                const name = msg.sender?.name || 'Membre';
                const own = Number(sid) === Number(user?.id);
                return (
                  <div key={msg.id} className={`meeting-message ${own ? 'own' : ''}`}>
                    <div className="message-avatar">{avatar(name)}</div>
                    <div className="message-content">
                      <div className="message-header">
                        <span className="message-user">{name}</span>
                        <span className="message-time">{timeLabel(msg.created_at)}</span>
                      </div>
                      <p className="message-text">{msg.content}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>
          </>
        )}

      {error && <div style={{ padding:'0 20px 8px', fontSize:'12px', color:'#f87171' }}>{error}</div>}

      <div className="meeting-input-area" style={{ position:'relative' }}>
        {showEmoji && (
          <div style={{ position:'absolute', bottom:'72px', left:'20px', background:'rgba(2,6,23,0.98)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:'12px', padding:'10px', zIndex:200, display:'grid', gridTemplateColumns:'repeat(10,1fr)', gap:'4px', boxShadow:'0 8px 32px rgba(0,0,0,0.7)' }}>
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
          <button type="button" onClick={() => setShowEmoji(v => !v)} style={{ background:'none', border:'none', cursor:'pointer', color: showEmoji ? '#06b6d4' : 'var(--c-text5)', padding:'0 4px', display:'flex', alignItems:'center' }} title="Emoji">
            <Smile size={18} />
          </button>
          <input ref={inputRef} type="text" value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') send(); if (e.key === 'Escape') setShowEmoji(false); }}
            placeholder={`Message dans #${activeChannel?.name || 'reunion-generale'}…`}
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
  const [input,     setInput]     = useState('');
  const [loading,   setLoading]   = useState(true);
  const [showEmoji, setShowEmoji] = useState(false);
  const [error,     setError]     = useState('');
  const endRef   = useRef(null);
  const inputRef = useRef(null);

  /* load history */
  const loadMessages = useCallback(async () => {
    if (!target?.id) return;
    setLoading(true);
    const res = await fetch(`${API}/api/messages/dm/${target.id}`, { headers: authJsonHeaders() });
    const data = res.ok ? await res.json() : {};
    setMessages(data.messages || []);
    setLoading(false);
  }, [target?.id]);

  useEffect(() => { loadMessages(); }, [loadMessages]);
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
      setMessages(prev => prev.some(m => m.id === payload.id) ? prev : [...prev, payload]);
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
    if (res.ok && data.id) setMessages(prev => [...prev, data]);
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
        <div style={{ width:'34px', height:'34px', borderRadius:'50%', background:'linear-gradient(135deg,#06b6d4,#8b5cf6)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:'700', fontSize:'14px', flexShrink:0 }}>
          {avatar(target.name || target.email)}
        </div>
        <div>
          <div style={{ fontSize:'14px', fontWeight:'600', color:'var(--c-text)' }}>{target.name || target.email}</div>
          <div style={{ fontSize:'11px', color:'var(--c-text5)' }}>Message direct</div>
        </div>
      </div>

      {/* Messages */}
      {loading ? (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ width:'28px', height:'28px', border:'3px solid rgba(6,182,212,0.2)', borderTopColor:'#06b6d4', borderRadius:'50%', animation:'spin 1s linear infinite' }} />
        </div>
      ) : messages.length === 0 ? (
        <MeetingMascotte label={`Commencez à discuter avec ${target.name || target.email} !`} />
      ) : (
        <div className="messages-area">
          {messages.map(msg => {
            const sid = msg.sender?.id ?? msg.sender_id;
            const name = msg.sender?.name || (Number(sid) === Number(target.id) ? (target.name || target.email) : 'Moi');
            const own = Number(sid) === Number(user?.id);
            return (
              <div key={msg.id} className={`meeting-message ${own ? 'own' : ''}`}>
                <div className="message-avatar">{avatar(own ? (user?.name || 'M') : name)}</div>
                <div className="message-content">
                  <div className="message-header">
                    <span className="message-user">{own ? (user?.name || 'Moi') : name}</span>
                    <span className="message-time">{timeLabel(msg.created_at)}</span>
                  </div>
                  <p className="message-text" style={own ? { background:'rgba(6,182,212,0.2)', borderRadius:'12px', borderTopRightRadius:'4px' } : {}}>{msg.content}</p>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      )}

      {error && <div style={{ padding:'0 20px 8px', fontSize:'12px', color:'#f87171' }}>{error}</div>}

      <div className="meeting-input-area" style={{ position:'relative' }}>
        {showEmoji && (
          <div style={{ position:'absolute', bottom:'72px', left:'20px', background:'rgba(2,6,23,0.98)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:'12px', padding:'10px', zIndex:200, display:'grid', gridTemplateColumns:'repeat(10,1fr)', gap:'4px', boxShadow:'0 8px 32px rgba(0,0,0,0.7)' }}>
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
          <button type="button" onClick={() => setShowEmoji(v => !v)} style={{ background:'none', border:'none', cursor:'pointer', color: showEmoji ? '#06b6d4' : 'var(--c-text5)', padding:'0 4px', display:'flex', alignItems:'center' }} title="Emoji">
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
export default function MeetingView({ projectId, user, members = [] }) {
  /* channel state */
  const [channels,       setChannels]       = useState([]);
  const [activeChannelId, setActiveChannelId] = useState(null);
  /* sidebar mode: 'channels' | 'dm' */
  const [sidebarMode,    setSidebarMode]    = useState('channels');
  /* DM state */
  const [dmTarget,       setDmTarget]       = useState(null);     // member object
  const [dmSearch,       setDmSearch]       = useState('');
  const [dmUnread,       setDmUnread]       = useState({});       // { userId: count }
  /* shared */
  const [showMembers,    setShowMembers]    = useState(false);

  const openCall = (audioOnly = false) => {
    if (!projectId) return;
    const roomName = `telework-project-${projectId}`;
    const url = audioOnly
      ? `https://meet.jit.si/${roomName}#config.startWithVideoMuted=true`
      : `https://meet.jit.si/${roomName}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const loadChannels = useCallback(async () => {
    if (!projectId) return;
    const res = await fetch(`${API}/api/messages/channels/${projectId}`, { headers: authJsonHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    const list = data.channels || [];
    setChannels(list);
    if (list.length > 0)
      setActiveChannelId(prev => (prev && list.some(c => c.id === prev) ? prev : list[0].id));
    else
      setActiveChannelId(null);
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

  /* filter members for DM contact list */
  const dmContacts = members.filter(m => {
    if (Number(m.id) === Number(user?.id)) return false;
    if (!dmSearch.trim()) return true;
    return (m.name || m.email || '').toLowerCase().includes(dmSearch.toLowerCase());
  });

  const totalUnread = Object.values(dmUnread).reduce((a, b) => a + b, 0);

  return (
    <div className="meeting-container">
      <style>{`
        .meeting-container{display:flex;flex-direction:column;height:100%;background:linear-gradient(180deg,#030a1f 0%,#020617 100%)}
        .meeting-header{display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid rgba(255,255,255,0.08);background:rgba(2,6,23,0.8);backdrop-filter:blur(10px)}
        .meeting-title{display:flex;align-items:center;gap:12px}
        .meeting-title h2{font-size:18px;font-weight:600;color:#fff;margin:0}
        .channel-info{display:flex;align-items:center;gap:8px;color:var(--c-text4);font-size:13px}
        .channel-info .dot{width:8px;height:8px;border-radius:50%;background:#22c55e}
        .meeting-actions{display:flex;gap:8px}
        .meeting-action-btn{width:36px;height:36px;border-radius:8px;background:var(--c-hover);border:1px solid var(--c-border2);color:var(--c-text4);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s}
        .meeting-action-btn:hover{background:var(--c-border2);color:#fff}
        .meeting-action-btn.active{background:rgba(6,182,212,0.2);color:#06b6d4}
        .meeting-content{display:flex;flex:1;min-height:0}
        .meeting-sidebar{width:260px;background:rgba(2,6,23,0.5);border-right:1px solid rgba(255,255,255,0.08);display:flex;flex-direction:column;backdrop-filter:blur(10px);overflow:hidden}
        .sidebar-tabs{display:flex;border-bottom:1px solid rgba(255,255,255,0.08)}
        .sidebar-tab{flex:1;padding:10px 0;background:none;border:none;font-size:12px;font-weight:600;cursor:pointer;color:var(--c-text5);text-transform:uppercase;letter-spacing:0.06em;transition:all 0.2s;display:flex;align-items:center;justify-content:center;gap:5px}
        .sidebar-tab.active{color:#06b6d4;border-bottom:2px solid #06b6d4}
        .sidebar-tab:hover:not(.active){color:var(--c-text3)}
        .agenda-section{padding:14px;border-bottom:1px solid rgba(255,255,255,0.08)}
        .agenda-title{display:flex;align-items:center;gap:8px;color:#06b6d4;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px}
        .agenda-item{padding:10px;background:rgba(255,255,255,0.03);border:1px solid var(--c-hover);border-radius:8px;margin-bottom:6px}
        .agenda-item-title{font-size:12px;color:var(--c-text2);font-weight:500;margin-bottom:3px}
        .agenda-item-time{font-size:11px;color:var(--c-text4)}
        .channels-header{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;color:var(--c-text4);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px}
        .channels-list{flex:1;overflow-y:auto;padding:0 6px 8px}
        .channel-btn{width:100%;display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:6px;background:transparent;border:none;color:var(--c-text3);font-size:13px;cursor:pointer;transition:all 0.2s;text-align:left}
        .channel-btn:hover{background:var(--c-hover);color:var(--c-text2)}
        .channel-btn.active{background:rgba(6,182,212,0.15);color:#06b6d4}
        .dm-search{margin:8px 10px;display:flex;align-items:center;gap:6px;background:var(--c-hover);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:6px 10px}
        .dm-search input{background:none;border:none;color:var(--c-text2);font-size:13px;flex:1;outline:none}
        .dm-search input::placeholder{color:var(--c-text5)}
        .dm-contact{width:100%;display:flex;align-items:center;gap:10px;padding:9px 12px;background:none;border:none;cursor:pointer;transition:all 0.2s;border-radius:8px;margin:0 2px;text-align:left}
        .dm-contact:hover{background:var(--c-hover)}
        .dm-contact.active{background:rgba(6,182,212,0.15)}
        .dm-avatar{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#06b6d4,#8b5cf6);display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:700;flex-shrink:0}
        .meeting-main{flex:1;display:flex;flex-direction:column;min-width:0}
        .current-channel{display:flex;align-items:center;gap:8px;padding:12px 20px;border-bottom:1px solid var(--c-hover);font-size:15px;font-weight:600;color:var(--c-text2)}
        .messages-area{flex:1;overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;gap:16px}
        .meeting-message{display:flex;gap:12px}
        .meeting-message.own{flex-direction:row-reverse}
        .message-avatar{width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,#06b6d4,#8b5cf6);display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:600;flex-shrink:0}
        .message-content{max-width:70%}
        .meeting-message.own .message-content{text-align:right}
        .message-header{display:flex;align-items:center;gap:8px;margin-bottom:4px}
        .meeting-message.own .message-header{flex-direction:row-reverse}
        .message-user{font-size:13px;font-weight:600;color:var(--c-text2)}
        .message-time{font-size:11px;color:var(--c-text5)}
        .message-text{padding:10px 14px;background:var(--c-hover);border-radius:12px;border-top-left-radius:4px;font-size:14px;color:var(--c-text2);line-height:1.5;margin:0}
        .meeting-message.own .message-text{background:rgba(6,182,212,0.15);border-radius:12px;border-top-right-radius:4px}
        .meeting-input-area{padding:16px 20px;border-top:1px solid var(--c-hover)}
        .meeting-input-wrapper{display:flex;gap:12px;background:var(--c-hover);border:1px solid var(--c-border2);border-radius:12px;padding:8px 12px}
        .meeting-input{flex:1;background:transparent;border:none;color:#fff;font-size:14px;outline:none}
        .meeting-input::placeholder{color:var(--c-text5)}
        .meeting-send-btn{width:32px;height:32px;border-radius:8px;background:rgba(6,182,212,0.2);border:none;color:#06b6d4;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s}
        .meeting-send-btn:hover{background:rgba(6,182,212,0.4)}
        .members-panel{width:220px;background:rgba(2,6,23,0.5);border-left:1px solid rgba(255,255,255,0.08);backdrop-filter:blur(10px)}
        .members-header{display:flex;align-items:center;gap:8px;padding:14px;color:var(--c-text4);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid var(--c-hover)}
        .members-list{padding:6px}
        .member-item{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:6px;cursor:pointer;transition:background 0.2s}
        .member-item:hover{background:var(--c-hover)}
        .member-avatar{width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#06b6d4,#8b5cf6);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:600;position:relative;flex-shrink:0}
        .status-dot-small{position:absolute;bottom:0;right:0;width:8px;height:8px;border-radius:50%;border:2px solid #020617;background:#22c55e}
        .member-name{font-size:12px;color:var(--c-text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>

      {/* ── HEADER ── */}
      <div className="meeting-header">
        <div className="meeting-title">
          <MessageCircle size={22} color="#06b6d4" />
          <h2>Salle de réunion</h2>
          <div className="channel-info">
            {sidebarMode === 'channels'
              ? <><Hash size={13} /><span>{channels.find(c => c.id === activeChannelId)?.name || 'reunion-generale'}</span></>
              : dmTarget
                ? <><MessageSquare size={13} /><span>{dmTarget.name || dmTarget.email}</span></>
                : <><MessageSquare size={13} /><span>Messages directs</span></>
            }
            <span className="dot" />
            <span>{members.length} membres</span>
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
                <span style={{ position:'absolute', top:'6px', right:'12px', background:'#ef4444', color:'#fff', borderRadius:'9999px', fontSize:'10px', fontWeight:'700', padding:'1px 5px', lineHeight:'14px' }}>
                  {totalUnread}
                </span>
              )}
            </button>
          </div>

          {/* CHANNELS mode: agenda + channel list */}
          {sidebarMode === 'channels' && (
            <>
              <div className="agenda-section">
                <div className="agenda-title"><FileText size={13} /><span>Ordre du jour</span></div>
                {agendaItems.map((item, i) => (
                  <div key={i} className="agenda-item">
                    <div className="agenda-item-title">{item.title}</div>
                    <div className="agenda-item-time">{item.time}</div>
                  </div>
                ))}
              </div>
              <div className="channels-header"><span>Canaux</span></div>
              <div className="channels-list">
                {channels.length === 0
                  ? <div style={{ padding:'10px 12px', fontSize:'12px', color:'var(--c-text5)' }}>Aucun canal — l'admin peut en créer.</div>
                  : channels.map(c => (
                    <button key={c.id} className={`channel-btn ${activeChannelId === c.id ? 'active' : ''}`} onClick={() => setActiveChannelId(c.id)}>
                      <Hash size={15} /><span>{c.name}</span>
                    </button>
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
                    <div className="dm-avatar">{avatar(m.name || m.email)}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:'13px', color:'var(--c-text2)', fontWeight:'500', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{m.name || m.email}</div>
                      <div style={{ fontSize:'11px', color:'var(--c-text5)' }}>{m.role || 'Membre'}</div>
                    </div>
                    {dmUnread[m.id] > 0 && (
                      <span style={{ background:'#ef4444', color:'#fff', borderRadius:'9999px', fontSize:'10px', fontWeight:'700', padding:'1px 6px', lineHeight:'14px', flexShrink:0 }}>
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
            />
          )}

          {sidebarMode === 'dm' && !dmTarget && (
            <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'40px', gap:'16px' }}>
              <div style={{ width:'64px', height:'64px', borderRadius:'50%', background:'rgba(6,182,212,0.1)', border:'1px solid rgba(6,182,212,0.25)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <MessageSquare size={28} style={{ color:'#06b6d4' }} />
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
        {showMembers && (
          <div className="members-panel">
            <div className="members-header"><Users size={16} /><span>Membres ({members.length})</span></div>
            <div className="members-list">
              {members.length === 0 && <div style={{ padding:'10px 12px', fontSize:'12px', color:'var(--c-text5)' }}>Aucun membre</div>}
              {members.map(m => (
                <div
                  key={m.id}
                  className="member-item"
                  title={Number(m.id) === Number(user?.id) ? 'Vous' : `Envoyer un DM à ${m.name || m.email}`}
                  onClick={() => {
                    if (Number(m.id) === Number(user?.id)) return;
                    openDM(m); setShowMembers(false);
                  }}
                  style={{ cursor: Number(m.id) === Number(user?.id) ? 'default' : 'pointer' }}
                >
                  <div className="member-avatar">
                    {avatar(m.name || m.email)}
                    <span className="status-dot-small" />
                  </div>
                  <span className="member-name">{m.name || m.email}</span>
                  {Number(m.id) !== Number(user?.id) && (
                    <MessageSquare size={12} style={{ color:'var(--c-text5)', marginLeft:'auto', flexShrink:0 }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
