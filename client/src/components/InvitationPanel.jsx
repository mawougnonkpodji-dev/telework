import { useRef, useState } from 'react';
import {
  Mail, UserPlus, Send, FileText, Paperclip,
  CheckCircle2, AlertCircle, Clock, X, Link2, ChevronDown, ChevronUp,
} from 'lucide-react';
import { getApiUrl, authBearerHeaders } from '../utils/apiHelpers.js';

const ROLES = [
  { value: 'member',      label: 'Membre',       desc: 'Peut exécuter les tâches' },
  { value: 'admin',       label: 'Gestionnaire', desc: 'Peut gérer le projet'     },
  { value: 'observateur', label: 'Observateur',  desc: 'Lecture seule'            },
];

const STATUS_STYLE = {
  pending:   { color: '#f59e0b', bg: 'rgba(245,158,11,.12)',  label: 'En attente' },
  accepted:  { color: '#34d399', bg: 'rgba(52,211,153,.12)',  label: 'Acceptée'   },
  expired:   { color: 'var(--c-text4)', bg: 'rgba(100,116,139,.12)', label: 'Expirée'    },
  cancelled: { color: '#f87171', bg: 'rgba(248,113,113,.12)', label: 'Annulée'    },
};

export default function InvitationPanel({ teamName, projectId, onMembersChanged }) {
  const [email,          setEmail]          = useState('');
  const [role,           setRole]           = useState('member');
  const [contractTitle,  setContractTitle]  = useState('');
  const [pdfFile,        setPdfFile]        = useState(null);
  const [showContract,   setShowContract]   = useState(false);
  const [loading,        setLoading]        = useState(false);
  const [result,         setResult]         = useState(null);
  const [invitations,    setInvitations]    = useState(null);
  const [loadingList,    setLoadingList]    = useState(false);
  const [copiedToken,    setCopiedToken]    = useState(null);
  const fileInputRef = useRef(null);

  const inp = {
    width: '100%', boxSizing: 'border-box',
    padding: '9px 12px', borderRadius: '8px',
    border: '1px solid var(--c-border2)',
    background: 'var(--c-ba5)', color: 'var(--c-text)',
    fontSize: '13px', outline: 'none',
  };
  const inpSm = { ...inp, padding: '8px 10px', fontSize: '12px' };
  const fieldLabel = {
    fontSize: '11px', fontWeight: '600', color: 'var(--c-text3)',
    marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '.05em',
  };

  const handleSend = async () => {
    setResult(null);
    if (!projectId)    { setResult({ ok: false, msg: 'Sélectionnez un projet.' }); return; }
    if (!email.trim()) { setResult({ ok: false, msg: 'Email requis.' });           return; }

    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('email', email.trim().toLowerCase());
      fd.append('role',  role);
      if (contractTitle.trim()) fd.append('contract_title', contractTitle.trim());
      if (pdfFile)              fd.append('contract_pdf',   pdfFile);

      // authBearerHeaders() returns only { Authorization } — no Content-Type,
      // which lets the browser set the correct multipart boundary automatically.
      const res  = await fetch(`${getApiUrl()}/api/invitations/projects/${projectId}`, {
        method:  'POST',
        headers: authBearerHeaders(),
        body:    fd,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setResult({
          ok:        true,
          msg:       data.message || 'Invitation envoyée.',
          acceptUrl: data.accept_url,
          emailSent: data.email_sent,
        });
        setEmail('');
        setContractTitle('');
        setPdfFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        setShowContract(false);
        onMembersChanged?.();
        loadInvitations();
      } else {
        setResult({ ok: false, msg: data.error || `Erreur ${res.status}` });
      }
    } catch {
      setResult({ ok: false, msg: 'Erreur réseau.' });
    }
    setLoading(false);
  };

  const loadInvitations = async () => {
    if (!projectId) return;
    setLoadingList(true);
    try {
      const res  = await fetch(`${getApiUrl()}/api/invitations/projects/${projectId}`, {
        headers: authBearerHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      setInvitations(data.invitations || []);
    } catch { setInvitations([]); }
    setLoadingList(false);
  };

  const cancelInvitation = async (id) => {
    await fetch(`${getApiUrl()}/api/invitations/${id}`, {
      method:  'DELETE',
      headers: authBearerHeaders(),
    });
    loadInvitations();
  };

  const copyLink = (url, id) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedToken(id);
      setTimeout(() => setCopiedToken(null), 2000);
    });
  };

  return (
    <div style={{ maxWidth: '560px' }}>

      {/* ── Formulaire principal ── */}
      <div style={{
        padding: '20px', background: 'var(--c-surface2)',
        borderRadius: '14px', border: '1px solid rgba(34,211,238,.18)',
        marginBottom: '20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <UserPlus size={16} style={{ color: '#22d3ee' }} />
          <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--c-text)' }}>
            Inviter un membre — {teamName || 'Projet'}
          </span>
        </div>

        {/* Email */}
        <input
          type="email" placeholder="collaborateur@exemple.com"
          value={email} onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          style={{ ...inp, marginBottom: '10px' }}
        />

        {/* Role */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
          {ROLES.map((r) => (
            <button key={r.value} type="button" onClick={() => setRole(r.value)} title={r.desc}
              style={{
                padding: '7px 14px', borderRadius: '8px', fontSize: '12px',
                fontWeight: '600', cursor: 'pointer', transition: 'all .15s',
                border: role === r.value ? '1px solid #22d3ee' : '1px solid var(--c-border2)',
                background: role === r.value ? 'rgba(34,211,238,.12)' : 'var(--c-hover2)',
                color:      role === r.value ? '#22d3ee' : 'var(--c-text3)',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Contract toggle */}
        <button type="button" onClick={() => setShowContract((v) => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 12px', borderRadius: '8px', marginBottom: '14px',
            border: '1px dashed rgba(148,163,184,.25)',
            background: showContract ? 'rgba(34,211,238,.06)' : 'transparent',
            color: 'var(--c-text4)', fontSize: '12px', fontWeight: '600', cursor: 'pointer', width: '100%',
          }}
        >
          <Paperclip size={13} />
          {showContract ? 'Masquer le contrat' : 'Joindre un contrat PDF (optionnel)'}
          {showContract ? <ChevronUp size={13} style={{ marginLeft: 'auto' }} />
                        : <ChevronDown size={13} style={{ marginLeft: 'auto' }} />}
        </button>

        {/* ── Upload PDF ── */}
        {showContract && (
          <div style={{
            marginBottom: '14px', padding: '16px',
            borderRadius: '10px', border: '1px solid rgba(34,211,238,.15)',
            background: 'rgba(8,145,178,.04)',
            display: 'flex', flexDirection: 'column', gap: '12px',
          }}>
            <div style={{ fontSize: '11px', color: '#22d3ee', fontWeight: '700',
                          letterSpacing: '.06em', textTransform: 'uppercase' }}>
              📄 Contrat PDF à joindre à l'invitation
            </div>

            {/* Titre du contrat */}
            <div>
              <p style={fieldLabel}>Titre du contrat (optionnel)</p>
              <input type="text"
                placeholder={`Contrat de travail — ${teamName || 'Projet'}`}
                value={contractTitle} onChange={(e) => setContractTitle(e.target.value)}
                style={inpSm} />
            </div>

            {/* File input */}
            <div>
              <p style={fieldLabel}>Fichier PDF du contrat</p>
              <label style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 14px', borderRadius: '8px', cursor: 'pointer',
                border: `1px dashed ${pdfFile ? '#22d3ee' : 'rgba(148,163,184,.3)'}`,
                background: pdfFile ? 'rgba(34,211,238,.06)' : 'rgba(255,255,255,.02)',
              }}>
                <FileText size={16} style={{ color: pdfFile ? '#22d3ee' : 'var(--c-text4)', flexShrink: 0 }} />
                <span style={{ fontSize: '12px', color: pdfFile ? '#22d3ee' : 'var(--c-text4)', flex: 1 }}>
                  {pdfFile ? pdfFile.name : 'Cliquer pour choisir un fichier PDF…'}
                </span>
                {pdfFile && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setPdfFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--c-text4)', padding: '0', display: 'flex',
                    }}
                  >
                    <X size={13} />
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file" accept=".pdf,application/pdf"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setPdfFile(f);
                  }}
                />
              </label>
            </div>

            <p style={{ fontSize: '11px', color: 'var(--c-text5)', margin: 0 }}>
              📎 Le PDF sera joint à l'email d'invitation. L'invité le consulte, puis accepte l'invitation
              et signe électroniquement.
            </p>
          </div>
        )}

        {/* Bouton envoi */}
        <button type="button" onClick={handleSend} disabled={loading}
          style={{
            width: '100%', padding: '11px', borderRadius: '10px', border: 'none',
            background: loading ? 'rgba(34,211,238,.2)' : 'linear-gradient(135deg,#22d3ee,#0891b2)',
            color: loading ? 'var(--c-text4)' : 'var(--c-bg)',
            fontSize: '13px', fontWeight: '700', cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            transition: 'all .2s',
          }}
        >
          <Send size={14} />
          {loading ? 'Envoi…' : "Envoyer l'invitation par email"}
        </button>

        {/* Feedback */}
        {result && (
          <div style={{
            marginTop: '12px', padding: '12px 14px', borderRadius: '10px',
            background: result.ok ? 'rgba(52,211,153,.1)' : 'rgba(248,113,113,.1)',
            border: `1px solid ${result.ok ? 'rgba(52,211,153,.3)' : 'rgba(248,113,113,.3)'}`,
            fontSize: '13px', color: result.ok ? '#34d399' : '#f87171',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              {result.ok ? <CheckCircle2 size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
                         : <AlertCircle  size={15} style={{ flexShrink: 0, marginTop: '1px' }} />}
              <div>
                <div>{result.msg}</div>
                {result.ok && !result.emailSent && (
                  <div style={{ fontSize: '11px', color: '#f59e0b', marginTop: '4px' }}>
                    ⚠ SMTP non configuré — partagez le lien manuellement :
                  </div>
                )}
                {result.acceptUrl && (
                  <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <code style={{
                      flex: 1, fontSize: '10px', color: 'var(--c-text3)', wordBreak: 'break-all',
                      background: 'rgba(0,0,0,.3)', padding: '6px 10px', borderRadius: '6px',
                    }}>
                      {result.acceptUrl}
                    </code>
                    <button type="button" onClick={() => copyLink(result.acceptUrl, 'last')}
                      style={{
                        flexShrink: 0, padding: '6px 10px', borderRadius: '6px', border: 'none',
                        background: copiedToken === 'last' ? 'rgba(52,211,153,.2)' : 'var(--c-border)',
                        color: copiedToken === 'last' ? '#34d399' : 'var(--c-text4)',
                        fontSize: '11px', fontWeight: '600', cursor: 'pointer',
                      }}
                    >
                      <Link2 size={11} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Liste des invitations ── */}
      <div>
        <button type="button"
          onClick={() => { if (!invitations) loadInvitations(); else setInvitations(null); }}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: 'none', border: 'none', color: 'var(--c-text4)',
            fontSize: '12px', fontWeight: '600', cursor: 'pointer', padding: '4px 0',
          }}
        >
          <Clock size={13} />
          {invitations ? 'Masquer les invitations' : 'Voir les invitations envoyées'}
          {invitations ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>

        {loadingList && <p style={{ fontSize: '12px', color: 'var(--c-text4)', marginTop: '10px' }}>Chargement…</p>}

        {invitations && !loadingList && (
          <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {invitations.length === 0 && (
              <p style={{ fontSize: '12px', color: 'var(--c-text4)' }}>Aucune invitation.</p>
            )}
            {invitations.map((inv) => {
              const s = STATUS_STYLE[inv.status] || STATUS_STYLE.pending;
              const frontendUrl = window.location.origin;
              const link = `${frontendUrl}/invite/${inv.token}`;
              return (
                <div key={inv.id} style={{
                  padding: '12px 14px', borderRadius: '10px',
                  background: 'var(--c-ba5)', border: '1px solid rgba(148,163,184,.1)',
                  display: 'flex', alignItems: 'center', gap: '10px',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--c-text2)', marginBottom: '2px' }}>
                      {inv.invited_email}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--c-text4)', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <span>Rôle: {inv.role}</span>
                      {inv.has_contract && <span>· 📄 Avec contrat PDF</span>}
                      <span>· Expire: {new Date(inv.expires_at).toLocaleDateString('fr-FR')}</span>
                    </div>
                  </div>
                  <span style={{
                    fontSize: '11px', fontWeight: '600', padding: '2px 9px',
                    borderRadius: '9999px', whiteSpace: 'nowrap',
                    background: s.bg, color: s.color,
                  }}>
                    {s.label}
                  </span>
                  {inv.status === 'pending' && (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button type="button" title="Copier le lien" onClick={() => copyLink(link, inv.id)}
                        style={{
                          padding: '5px 8px', borderRadius: '6px', border: 'none',
                          background: copiedToken === inv.id ? 'rgba(52,211,153,.2)' : 'rgba(148,163,184,.1)',
                          color: copiedToken === inv.id ? '#34d399' : 'var(--c-text4)',
                          cursor: 'pointer',
                        }}
                      >
                        <Link2 size={11} />
                      </button>
                      <button type="button" title="Annuler" onClick={() => cancelInvitation(inv.id)}
                        style={{
                          padding: '5px 8px', borderRadius: '6px', border: 'none',
                          background: 'rgba(248,113,113,.1)', color: '#f87171', cursor: 'pointer',
                        }}
                      >
                        <X size={11} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
