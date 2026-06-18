import { useState, useEffect, useRef, useCallback } from 'react';
import { Hash, Send, MessageCircle, Plus, Smile, AtSign } from 'lucide-react';

const EMOJI_LIST = [
  '😀','😂','😊','😍','🤔','😅','🥳','😎','🙁','😡',
  '👍','👎','👏','🙏','🤝','✌️','💪','👀','🫡','🙌',
  '❤️','🔥','✅','⚠️','📌','🚀','💡','🎉','📊','🎯',
];

import { getApiUrl, authJsonHeaders } from '../utils/apiHelpers.js';
import { getAuthSocket, joinProjectRoom, leaveProjectRoom } from '../utils/socket.js';

const API = getApiUrl();

// ── Rendu d'un message avec mentions surlignées ───────────────────────────────
function MessageContent({ content, mentions = [] }) {
  if (!content) return null;

  // Construit un set des noms mentionnés pour le surlignage
  const mentionNames = new Set(
    (mentions || []).map((m) => m.name?.toLowerCase()).filter(Boolean)
  );

  // Remplace @Nom par un span coloré
  const parts = content.split(/(@\w[\w\s]*)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('@')) {
          const name = part.slice(1).trim().toLowerCase();
          const isMention = mentionNames.has(name) ||
            [...mentionNames].some((n) => n.startsWith(name) || name.startsWith(n));
          if (isMention) {
            return (
              <span key={i} style={{
                background: 'rgba(34,211,238,0.15)',
                color: '#22d3ee',
                borderRadius: '4px',
                padding: '0 4px',
                fontWeight: '600',
              }}>
                {part}
              </span>
            );
          }
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────
export default function ProjectChatPanel({
  projectId,
  user,
  canPost = true,
  canCreateChannel = false,
  members = [],
}) {
  const [channels,        setChannels]        = useState([]);
  const [channelId,       setChannelId]       = useState(null);
  const [messages,        setMessages]        = useState([]);
  const [input,           setInput]           = useState('');
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState('');
  const [channelName,     setChannelName]     = useState('');
  const [showCreate,      setShowCreate]      = useState(false);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [showEmoji,       setShowEmoji]       = useState(false);

  // ── Mention state ──────────────────────────────────────────────────────────
  const [mentionQuery,    setMentionQuery]    = useState('');   // texte après @
  const [mentionOpen,     setMentionOpen]     = useState(false);
  const [mentionIndex,    setMentionIndex]    = useState(0);
  const [pendingMentions, setPendingMentions] = useState([]);   // [{ id, name }]

  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  // ── Membres filtrés pour la suggestion ────────────────────────────────────
  const filteredMembers = mentionOpen
    ? members.filter((m) =>
        (m.name || m.email || '').toLowerCase().includes(mentionQuery.toLowerCase())
      ).slice(0, 6)
    : [];

  // ── Chargement canaux / messages ──────────────────────────────────────────
  const loadChannels = useCallback(async () => {
    if (!projectId) { setChannels([]); return; }
    const res  = await fetch(`${API}/api/messages/channels/${projectId}`, { headers: authJsonHeaders() });
    if (!res.ok) { setChannels([]); return; }
    const data = await res.json();
    const list = data.channels || [];
    setChannels(list);
    if (list.length > 0)
      setChannelId((prev) => (prev && list.some((c) => c.id === prev) ? prev : list[0].id));
    else
      setChannelId(null);
  }, [projectId]);

  const loadMessages = useCallback(async () => {
    if (!projectId) { setMessages([]); return; }
    const qs = new URLSearchParams({ per_page: '100', page: '1' });
    if (channelId) qs.set('channel_id', String(channelId));
    const res  = await fetch(`${API}/api/messages/project/${projectId}?${qs}`, { headers: authJsonHeaders() });
    if (!res.ok) { setMessages([]); setError('Impossible de charger les messages'); return; }
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
    return () => { cancelled = true; };
  }, [loadChannels]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Socket temps réel ──────────────────────────────────────────────────────
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
    const onErr = (payload) => { if (payload?.message) setError(String(payload.message)); };

    s.on('new_message', onNew);
    s.on('error', onErr);
    return () => {
      s.off('new_message', onNew);
      s.off('error', onErr);
      leaveProjectRoom(projectId);
    };
  }, [projectId, channelId]);

  // ── Gestion de la saisie avec détection @ ─────────────────────────────────
  const handleInputChange = (e) => {
    const val = e.target.value;
    setInput(val);

    // Détecte @query à la position du curseur
    const cursor = e.target.selectionStart;
    const before = val.slice(0, cursor);
    const match  = before.match(/@([\w\s]*)$/);

    if (match) {
      setMentionQuery(match[1]);
      setMentionOpen(true);
      setMentionIndex(0);
    } else {
      setMentionOpen(false);
      setMentionQuery('');
    }
  };

  // Insérer un membre mentionné dans le texte
  const insertMention = (member) => {
    const cursor = inputRef.current?.selectionStart ?? input.length;
    const before = input.slice(0, cursor);
    const after  = input.slice(cursor);
    // Remplace le @query en cours par @Nom
    const replaced = before.replace(/@([\w\s]*)$/, `@${member.name || member.email} `);
    setInput(replaced + after);
    setMentionOpen(false);
    setMentionQuery('');
    setPendingMentions((prev) =>
      prev.find((m) => m.id === member.id) ? prev : [...prev, { id: member.id, name: member.name }]
    );
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  // Navigation clavier dans le dropdown
  const handleKeyDown = (e) => {
    if (mentionOpen && filteredMembers.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex((i) => Math.min(i + 1, filteredMembers.length - 1)); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setMentionIndex((i) => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(filteredMembers[mentionIndex]); return; }
      if (e.key === 'Escape')    { setMentionOpen(false); return; }
    }
    if (e.key === 'Enter' && !mentionOpen) send();
    if (e.key === 'Escape') setShowEmoji(false);
  };

  // Extrait les mention_user_ids depuis le texte ET les pendingMentions
  const extractMentionIds = (text) => {
    const fromPending = pendingMentions
      .filter((m) => text.includes(`@${m.name}`))
      .map((m) => m.id);
    // Aussi chercher via les membres par nom direct dans le texte
    const fromText = members
      .filter((m) => m.name && text.includes(`@${m.name}`))
      .map((m) => m.id);
    return [...new Set([...fromPending, ...fromText])];
  };

  // ── Envoi du message ───────────────────────────────────────────────────────
  const send = async () => {
    const text = input.trim();
    if (!text || !projectId || !canPost) return;

    const mentionIds = extractMentionIds(text);
    const token = localStorage.getItem('auth_token');
    const s = getAuthSocket();
    setInput('');
    setPendingMentions([]);
    setMentionOpen(false);
    setError('');

    if (s?.connected && token) {
      s.emit('send_message', {
        token,
        project_id:       projectId,
        channel_id:       channelId || undefined,
        content:          text,
        mention_user_ids: mentionIds,
      });
      return;
    }

    // Fallback HTTP
    const res = await fetch(`${API}/api/messages/project/${projectId}`, {
      method:  'POST',
      headers: authJsonHeaders(),
      body:    JSON.stringify({
        content:          text,
        channel_id:       channelId || undefined,
        mention_user_ids: mentionIds,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error || "Impossible d'envoyer le message"); return; }
    setMessages((prev) => [...prev, data]);
  };

  // ── Création de canal ──────────────────────────────────────────────────────
  const createChannel = async () => {
    const name = channelName.trim();
    if (!name) return;
    setError('');
    const res  = await fetch(`${API}/api/messages/channels/${projectId}`, {
      method: 'POST', headers: authJsonHeaders(), body: JSON.stringify({ name }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error || `Erreur ${res.status}`); return; }
    setChannelName('');
    setShowCreate(false);
    await loadChannels();
    setChannelId(data.id);

    if (selectedMembers.length > 0) {
      await fetch(`${API}/api/messages/project/${projectId}`, {
        method: 'POST', headers: authJsonHeaders(),
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

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '520px', background: 'rgba(15,23,42,0.75)', borderRadius: '16px', border: '1px solid rgba(148,163,184,0.15)', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(148,163,184,0.12)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <MessageCircle size={18} style={{ color: '#22d3ee' }} />
        <span style={{ fontWeight: '700', fontSize: '13px', color: 'var(--c-text)' }}>Canaux & chat temps réel</span>
        {canCreateChannel && (
          <button type="button" onClick={() => setShowCreate((v) => !v)} style={{ marginLeft: 'auto', border: 'none', borderRadius: '8px', background: 'rgba(34,211,238,0.15)', color: '#22d3ee', padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
            <Plus size={13} /> Canal
          </button>
        )}
      </div>

      {/* Création canal */}
      {showCreate && canCreateChannel && (
        <div style={{ padding: '10px', borderBottom: '1px solid var(--c-border)', display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(79,70,229,0.05)' }}>
          <input value={channelName} onChange={(e) => setChannelName(e.target.value)} placeholder="Nom du canal (ex: design, backend…)" style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--c-border2)', background: 'rgba(15,23,42,0.6)', color: 'var(--c-text)', fontSize: '13px' }} />
          <div>
            <p style={{ fontSize: '11px', color: 'var(--c-text4)', marginBottom: '4px' }}>Membres ajoutés au canal (Ctrl+clic pour plusieurs)</p>
            <select multiple value={selectedMembers.map(String)} onChange={(e) => setSelectedMembers(Array.from(e.target.selectedOptions).map((o) => Number(o.value)))} style={{ minHeight: '70px', width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid var(--c-border2)', background: 'rgba(15,23,42,0.6)', color: 'var(--c-text)', fontSize: '12px' }}>
              {members.map((m) => (<option key={m.id} value={m.id}>{m.name || m.email}</option>))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={createChannel} style={{ border: 'none', borderRadius: '8px', background: '#4f46e5', color: '#fff', padding: '7px 14px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>Créer le canal</button>
            <button type="button" onClick={() => setShowCreate(false)} style={{ border: '1px solid var(--c-border2)', borderRadius: '8px', background: 'transparent', color: 'var(--c-text3)', padding: '7px 12px', cursor: 'pointer', fontSize: '12px' }}>Annuler</button>
          </div>
        </div>
      )}

      {/* Onglets canaux */}
      {channels.length > 0 && (
        <div style={{ padding: '8px 10px', borderBottom: '1px solid rgba(148,163,184,0.1)', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {channels.map((c) => (
            <button key={c.id} type="button" onClick={() => setChannelId(c.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 10px', borderRadius: '8px', border: channelId === c.id ? '1px solid #22d3ee' : '1px solid transparent', background: channelId === c.id ? 'rgba(34,211,238,0.12)' : 'rgba(255,255,255,0.04)', color: 'var(--c-text2)', fontSize: '12px', cursor: 'pointer' }}>
              <Hash size={12} /> {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {loading ? (
          <p style={{ color: 'var(--c-text4)', fontSize: '12px' }}>Chargement…</p>
        ) : messages.length === 0 ? (
          <p style={{ color: 'var(--c-text5)', fontSize: '12px', textAlign: 'center', margin: 'auto' }}>Aucun message. Soyez le premier à écrire !</p>
        ) : messages.map((m) => {
          const mine = Number(m.sender?.id || m.sender_id) === Number(user?.id);
          return (
            <div key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '92%', background: mine ? 'rgba(79,70,229,0.35)' : 'rgba(30,41,59,0.9)', border: '1px solid var(--c-border)', borderRadius: '12px', padding: '8px 10px' }}>
              <div style={{ fontSize: '11px', color: 'var(--c-text3)', marginBottom: '4px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span>{m.sender?.name || 'Membre'}</span>
                {m.created_at && (
                  <span style={{ color: 'var(--c-text5)', fontVariantNumeric: 'tabular-nums' }}>
                    {new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--c-text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: '1.5' }}>
                <MessageContent content={m.content} mentions={m.mentions} />
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {error && <div style={{ padding: '0 12px 8px', fontSize: '12px', color: '#f87171' }}>{error}</div>}

      {/* Zone de saisie */}
      <div style={{ padding: '10px', borderTop: '1px solid var(--c-border)', display: 'flex', gap: '8px', position: 'relative' }}>

        {/* Dropdown emoji */}
        {showEmoji && (
          <div style={{ position: 'absolute', bottom: '56px', left: '10px', background: 'rgba(15,23,42,0.97)', border: '1px solid var(--c-border2)', borderRadius: '12px', padding: '10px', zIndex: 200, display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '4px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
            {EMOJI_LIST.map((e) => (
              <button key={e} type="button" onClick={() => { setInput((prev) => prev + e); setShowEmoji(false); inputRef.current?.focus(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', padding: '4px', borderRadius: '6px' }} onMouseEnter={(ev) => { ev.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }} onMouseLeave={(ev) => { ev.currentTarget.style.background = 'none'; }}>{e}</button>
            ))}
          </div>
        )}

        {/* Dropdown mentions @ */}
        {mentionOpen && filteredMembers.length > 0 && (
          <div style={{ position: 'absolute', bottom: '56px', left: '48px', right: '56px', background: 'rgba(15,23,42,0.98)', border: '1px solid rgba(34,211,238,0.3)', borderRadius: '10px', zIndex: 300, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
            <div style={{ padding: '6px 10px', borderBottom: '1px solid rgba(34,211,238,0.1)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AtSign size={11} style={{ color: '#22d3ee' }} />
              <span style={{ fontSize: '11px', color: 'var(--c-text4)' }}>Mentionner un membre</span>
            </div>
            {filteredMembers.map((m, i) => (
              <button
                key={m.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); insertMention(m); }}
                style={{ width: '100%', padding: '8px 12px', border: 'none', background: i === mentionIndex ? 'rgba(34,211,238,0.12)' : 'transparent', color: i === mentionIndex ? '#22d3ee' : 'var(--c-text2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', textAlign: 'left' }}
                onMouseEnter={() => setMentionIndex(i)}
              >
                <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'rgba(34,211,238,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '11px', fontWeight: '700', color: '#22d3ee' }}>
                  {(m.name || m.email || '?').charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '12px' }}>{m.name || m.email}</div>
                  {m.role && <div style={{ fontSize: '10px', color: 'var(--c-text4)' }}>{m.role}</div>}
                </div>
              </button>
            ))}
          </div>
        )}

        {canPost && (
          <button type="button" onClick={() => setShowEmoji((v) => !v)} style={{ padding: '0 10px', borderRadius: '10px', border: '1px solid var(--c-border2)', background: showEmoji ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.04)', color: showEmoji ? '#22d3ee' : 'var(--c-text3)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <Smile size={16} />
          </button>
        )}

        <input
          ref={inputRef}
          type="text"
          value={input}
          disabled={!canPost}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={canPost ? 'Votre message… (@ pour mentionner)' : 'Lecture seule (observateur)'}
          style={{ flex: 1, padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--c-border2)', background: 'rgba(15,23,42,0.6)', color: 'var(--c-text)', fontSize: '13px', outline: 'none' }}
        />

        <button type="button" onClick={send} disabled={!canPost || !input.trim()} style={{ padding: '0 14px', borderRadius: '10px', border: 'none', background: canPost && input.trim() ? '#4f46e5' : 'var(--c-text5)', color: '#fff', cursor: canPost && input.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center' }}>
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
