import { useState, useEffect, useRef, useCallback } from 'react';
import { Hash, Send, MessageCircle, Plus, Smile } from 'lucide-react';

const EMOJI_LIST = [
  '😀','😂','😊','😍','🤔','😅','🥳','😎','🙁','😡',
  '👍','👎','👏','🙏','🤝','✌️','💪','👀','🫡','🙌',
  '❤️','🔥','✅','⚠️','📌','🚀','💡','🎉','📊','🎯',
];
import { getApiUrl, authJsonHeaders } from '../utils/apiHelpers.js';
import { getAuthSocket, joinProjectRoom, leaveProjectRoom } from '../utils/socket.js';

const API = getApiUrl();

export default function ProjectChatPanel({
  projectId,
  user,
  canPost = true,
  canCreateChannel = false,
  members = [],
}) {
  const [channels, setChannels] = useState([]);
  const [channelId, setChannelId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [channelName, setChannelName] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [showEmoji, setShowEmoji] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const loadChannels = useCallback(async () => {
    if (!projectId) {
      setChannels([]);
      return;
    }
    const res = await fetch(`${API}/api/messages/channels/${projectId}`, {
      headers: authJsonHeaders(),
    });
    if (!res.ok) {
      setChannels([]);
      return;
    }
    const data = await res.json();
    const list = data.channels || [];
    setChannels(list);
    if (list.length > 0) {
      setChannelId((prev) => (prev && list.some((c) => c.id === prev) ? prev : list[0].id));
    } else {
      setChannelId(null);
    }
  }, [projectId]);

  const loadMessages = useCallback(async () => {
    if (!projectId) {
      setMessages([]);
      return;
    }
    const qs = new URLSearchParams({ per_page: '100', page: '1' });
    if (channelId) qs.set('channel_id', String(channelId));
    const res = await fetch(`${API}/api/messages/project/${projectId}?${qs}`, {
      headers: authJsonHeaders(),
    });
    if (!res.ok) {
      setMessages([]);
      setError('Impossible de charger les messages');
      return;
    }
    const data = await res.json();
    setMessages(data.messages || []);
    setError('');
  }, [projectId, channelId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await loadChannels();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadChannels]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!projectId) return undefined;
    joinProjectRoom(projectId);
    const s = getAuthSocket();
    if (!s) return undefined;

    const onNew = (payload) => {
      if (!payload || Number(payload.project_id) !== Number(projectId)) return;
      const p = payload.channel_id == null ? null : Number(payload.channel_id);
      const a = channelId == null ? null : Number(channelId);
      if (p !== a) return;
      setMessages((prev) => (prev.some((m) => m.id === payload.id) ? prev : [...prev, payload]));
    };

    const onErr = (payload) => {
      if (payload?.message) setError(String(payload.message));
    };

    s.on('new_message', onNew);
    s.on('error', onErr);
    return () => {
      s.off('new_message', onNew);
      s.off('error', onErr);
      leaveProjectRoom(projectId);
    };
  }, [projectId, channelId]);

  const createChannel = async () => {
    const name = channelName.trim();
    if (!name) return;
    setError('');
    const res = await fetch(`${API}/api/messages/channels/${projectId}`, {
      method: 'POST',
      headers: authJsonHeaders(),
      body: JSON.stringify({ name }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || `Erreur ${res.status}`);
      return;
    }
    setChannelName('');
    setShowCreate(false);
    await loadChannels();
    setChannelId(data.id);

    // Mentionner les membres concernés dans un premier message de cadrage
    if (selectedMembers.length > 0) {
      await fetch(`${API}/api/messages/project/${projectId}`, {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({
          channel_id: data.id,
          content: `Canal créé pour coordination ciblée.`,
          mention_user_ids: selectedMembers,
        }),
      });
      setSelectedMembers([]);
      await loadMessages();
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || !projectId || !canPost) return;
    const token = localStorage.getItem('auth_token');
    const s = getAuthSocket();
    setInput('');
    setError('');

    if (s?.connected && token) {
      s.emit('send_message', {
        token,
        project_id: projectId,
        channel_id: channelId || undefined,
        content: text,
      });
      return;
    }

    // Fallback si socket indisponible: envoi HTTP pour éviter l'impression "les messages ne partent pas"
    const res = await fetch(`${API}/api/messages/project/${projectId}`, {
      method: 'POST',
      headers: authJsonHeaders(),
      body: JSON.stringify({ content: text, channel_id: channelId || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || 'Impossible d’envoyer le message');
      return;
    }
    setMessages((prev) => [...prev, data]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '520px', background: 'rgba(15, 23, 42, 0.75)', borderRadius: '16px', border: '1px solid rgba(148, 163, 184, 0.15)', overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(148, 163, 184, 0.12)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <MessageCircle size={18} style={{ color: '#22d3ee' }} />
        <span style={{ fontWeight: '700', fontSize: '13px', color: 'var(--c-text)' }}>Canaux & chat temps réel</span>
        {canCreateChannel && (
          <button type="button" onClick={() => setShowCreate((v) => !v)} style={{ marginLeft: 'auto', border: 'none', borderRadius: '8px', background: 'rgba(34,211,238,0.15)', color: '#22d3ee', padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
            <Plus size={13} /> Canal
          </button>
        )}
      </div>

      {showCreate && canCreateChannel && (
        <div style={{ padding: '10px', borderBottom: '1px solid var(--c-border)', display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(79,70,229,0.05)', borderRadius: '0 0 8px 8px' }}>
          <input value={channelName} onChange={(e) => setChannelName(e.target.value)} placeholder="Nom du canal (ex: design, backend…)" style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--c-border2)', background: 'rgba(15,23,42,0.6)', color: 'var(--c-text)', fontSize: '13px' }} />
          <div>
            <p style={{ fontSize: '11px', color: 'var(--c-text4)', marginBottom: '4px' }}>Membres ajoutés au canal (Ctrl+clic pour plusieurs)</p>
            <select multiple value={selectedMembers.map(String)} onChange={(e) => setSelectedMembers(Array.from(e.target.selectedOptions).map((o) => Number(o.value)))} style={{ minHeight: '70px', width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid var(--c-border2)', background: 'rgba(15,23,42,0.6)', color: 'var(--c-text)', fontSize: '12px' }}>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name || m.email}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={createChannel} style={{ border: 'none', borderRadius: '8px', background: '#4f46e5', color: '#fff', padding: '7px 14px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>Créer le canal</button>
            <button type="button" onClick={() => setShowCreate(false)} style={{ border: '1px solid var(--c-border2)', borderRadius: '8px', background: 'transparent', color: 'var(--c-text3)', padding: '7px 12px', cursor: 'pointer', fontSize: '12px' }}>Annuler</button>
          </div>
        </div>
      )}

      {channels.length > 0 && (
        <div style={{ padding: '8px 10px', borderBottom: '1px solid rgba(148,163,184,0.1)', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {channels.map((c) => (
            <button key={c.id} type="button" onClick={() => setChannelId(c.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 10px', borderRadius: '8px', border: channelId === c.id ? '1px solid #22d3ee' : '1px solid transparent', background: channelId === c.id ? 'rgba(34,211,238,0.12)' : 'rgba(255,255,255,0.04)', color: 'var(--c-text2)', fontSize: '12px', cursor: 'pointer' }}>
              <Hash size={12} /> {c.name}
            </button>
          ))}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {loading ? <p style={{ color: 'var(--c-text4)', fontSize: '12px' }}>Chargement…</p> : messages.map((m) => {
          const mine = Number(m.sender?.id || m.sender_id) === Number(user?.id);
          return (
            <div key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '92%', background: mine ? 'rgba(79, 70, 229, 0.35)' : 'rgba(30, 41, 59, 0.9)', border: '1px solid var(--c-border)', borderRadius: '12px', padding: '8px 10px' }}>
              <div style={{ fontSize: '11px', color: 'var(--c-text3)', marginBottom: '4px' }}>{m.sender?.name || 'Membre'}</div>
              <div style={{ fontSize: '13px', color: 'var(--c-text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.content}</div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {error && <div style={{ padding: '0 12px 8px', fontSize: '12px', color: '#f87171' }}>{error}</div>}

      <div style={{ padding: '10px', borderTop: '1px solid var(--c-border)', display: 'flex', gap: '8px', position: 'relative' }}>
        {showEmoji && (
          <div style={{
            position: 'absolute', bottom: '56px', left: '10px',
            background: 'rgba(15,23,42,0.97)', border: '1px solid var(--c-border2)',
            borderRadius: '12px', padding: '10px', zIndex: 200,
            display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '4px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}>
            {EMOJI_LIST.map((e) => (
              <button
                key={e} type="button"
                onClick={() => { setInput((prev) => prev + e); setShowEmoji(false); inputRef.current?.focus(); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', padding: '4px', borderRadius: '6px' }}
                onMouseEnter={(ev) => { ev.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                onMouseLeave={(ev) => { ev.currentTarget.style.background = 'none'; }}
              >{e}</button>
            ))}
          </div>
        )}
        {canPost && (
          <button type="button" onClick={() => setShowEmoji((v) => !v)} style={{ padding: '0 10px', borderRadius: '10px', border: '1px solid var(--c-border2)', background: showEmoji ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.04)', color: showEmoji ? '#22d3ee' : 'var(--c-text3)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <Smile size={16} />
          </button>
        )}
        <input ref={inputRef} type="text" value={input} disabled={!canPost} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send(); if (e.key === 'Escape') setShowEmoji(false); }} placeholder={canPost ? 'Votre message…' : 'Lecture seule (observateur)'} style={{ flex: 1, padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--c-border2)', background: 'rgba(15,23,42,0.6)', color: 'var(--c-text)', fontSize: '13px', outline: 'none' }} />
        <button type="button" onClick={send} disabled={!canPost || !input.trim()} style={{ padding: '0 14px', borderRadius: '10px', border: 'none', background: canPost && input.trim() ? '#4f46e5' : 'var(--c-text5)', color: '#fff', cursor: canPost && input.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center' }}>
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
