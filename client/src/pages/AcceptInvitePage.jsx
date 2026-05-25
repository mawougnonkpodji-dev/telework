import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  CheckCircle, XCircle, User, Lock, ArrowRight,
  Loader2, FileText, Shield, Download,
} from 'lucide-react';
import { getApiUrl } from '../utils/apiHelpers.js';
import { useAuth } from '../contexts/AuthContext.jsx';

const API = getApiUrl();

// ── Affichage du contrat PDF ──────────────────────────────────────────────────
function ContractViewer({ invitation, token }) {
  const pdfUrl = `${API}/api/invitations/contract-pdf/${token}`;

  return (
    <div style={{
      marginBottom: '24px', borderRadius: '12px',
      border: '1px solid rgba(34,211,238,.2)',
      background: 'rgba(8,145,178,.04)', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 18px',
        background: 'rgba(8,145,178,.08)',
        borderBottom: '1px solid rgba(34,211,238,.1)',
        display: 'flex', alignItems: 'center', gap: '10px',
      }}>
        <FileText size={15} style={{ color: '#22d3ee', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--c-text)' }}>
            {invitation.contract_title || 'Contrat de travail'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--c-text4)', marginTop: '2px' }}>
            En acceptant, vous signez électroniquement ce contrat
          </div>
        </div>
        <a
          href={pdfUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            padding: '6px 12px', borderRadius: '8px', border: 'none',
            background: 'rgba(34,211,238,.12)', color: '#22d3ee',
            fontSize: '11px', fontWeight: '700', cursor: 'pointer',
            textDecoration: 'none', flexShrink: 0,
          }}
        >
          <Download size={12} /> PDF
        </a>
      </div>

      {/* Iframe preview */}
      <div style={{ padding: '12px' }}>
        <iframe
          src={pdfUrl}
          title="Contrat PDF"
          style={{
            width: '100%', height: '320px', border: 'none',
            borderRadius: '8px', background: 'var(--c-surface)',
          }}
        />
      </div>
    </div>
  );
}


// ── Page principale ───────────────────────────────────────────────────────────
export default function AcceptInvitePage() {
  const { token } = useParams();
  const { user, token: authToken } = useAuth();

  const [invitation,  setInvitation]  = useState(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [infoError,   setInfoError]   = useState('');

  const [accepting,   setAccepting]   = useState(false);
  const [acceptError, setAcceptError] = useState('');
  const [accepted,    setAccepted]    = useState(null);

  // ── Fetch invitation info ─────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API}/api/invitations/info/${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setInfoError(data.error);
        else             setInvitation(data);
      })
      .catch(() => setInfoError("Impossible de charger l'invitation."))
      .finally(() => setLoadingInfo(false));
  }, [token]);

  // ── Accept (utilisateur déjà connecté) ────────────────────────────────────
  const handleAccept = async () => {
    setAcceptError('');
    setAccepting(true);
    try {
      const res  = await fetch(`${API}/api/invitations/accept/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAcceptError(data.error || `Erreur ${res.status}`);
      } else {
        setAccepted({ project_name: data.project_name, project_id: data.project_id });
      }
    } catch {
      setAcceptError('Erreur réseau.');
    }
    setAccepting(false);
  };

  // ─────────────────────────────────────────────────────────────────────────
  if (loadingInfo) return (
    <Shell>
      <div style={{ textAlign: 'center', color: 'var(--c-text4)', padding: '40px' }}>
        <Loader2 size={36} style={{ animation: 'spin 1s linear infinite', color: '#22d3ee', marginBottom: '12px' }} />
        <p style={{ fontSize: '14px' }}>Chargement de l'invitation…</p>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </Shell>
  );

  if (infoError) return (
    <Shell>
      <div style={{ textAlign: 'center', padding: '24px' }}>
        <XCircle size={52} style={{ color: '#f87171', marginBottom: '16px' }} />
        <h2 style={{ color: 'var(--c-text)', fontSize: '22px', marginBottom: '8px' }}>Invitation invalide</h2>
        <p style={{ color: 'var(--c-text3)', marginBottom: '28px' }}>{infoError}</p>
        <a href="/" style={{ color: '#22d3ee', fontSize: '14px', textDecoration: 'underline' }}>
          Retour à l'accueil
        </a>
      </div>
    </Shell>
  );

  if (accepted) return (
    <Shell>
      <div style={{ textAlign: 'center', padding: '24px' }}>
        <CheckCircle size={56} style={{ color: '#34d399', marginBottom: '16px' }} />
        <h2 style={{ color: 'var(--c-text)', fontSize: '24px', fontWeight: '700', marginBottom: '8px' }}>
          Bienvenue !
        </h2>
        <p style={{ color: 'var(--c-text3)', marginBottom: '6px' }}>Vous avez rejoint le projet</p>
        <p style={{ color: '#22d3ee', fontSize: '18px', fontWeight: '700', marginBottom: '16px' }}>
          {accepted.project_name}
        </p>
        {invitation?.has_contract && (
          <>
            <p style={{ fontSize: '12px', color: 'var(--c-text4)', marginBottom: '12px' }}>
              ✅ Contrat signé électroniquement.
            </p>
            <button
              type="button"
              onClick={() => window.open(`${API}/api/invitations/contract-pdf/${token}`, '_blank')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '10px 20px', borderRadius: '10px', border: 'none',
                background: 'rgba(34,211,238,.1)', color: '#22d3ee',
                fontWeight: '600', fontSize: '13px', cursor: 'pointer', marginBottom: '20px',
              }}
            >
              <Download size={14} /> Télécharger le contrat PDF
            </button>
          </>
        )}
        <br />
        <a href="/app" style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px',
          padding: '14px 32px', borderRadius: '12px', textDecoration: 'none',
          background: 'linear-gradient(135deg,#22d3ee,#0891b2)',
          color: 'var(--c-bg)', fontWeight: '700', fontSize: '15px',
        }}>
          Aller au dashboard <ArrowRight size={17} />
        </a>
      </div>
    </Shell>
  );

  const alreadyLoggedIn = !!authToken;

  return (
    <Shell>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg,rgba(8,145,178,.2),rgba(34,211,238,.08))',
        borderBottom: '1px solid rgba(34,211,238,.15)',
        padding: '28px 36px',
      }}>
        <div style={{ fontSize: '11px', fontWeight: '700', color: '#22d3ee',
                      letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: '6px' }}>
          Invitation Telework
        </div>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '800', color: 'var(--c-text)' }}>
          Rejoindre « {invitation.project_name} »
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: '13px', color: 'var(--c-text3)' }}>
          <strong style={{ color: 'var(--c-text2)' }}>{invitation.inviter_name}</strong> vous invite en tant que{' '}
          <span style={{
            display: 'inline-block', padding: '1px 9px', borderRadius: '9999px',
            background: 'rgba(34,211,238,.12)', color: '#22d3ee',
            fontSize: '12px', fontWeight: '600',
          }}>
            {invitation.role_label}
          </span>
        </p>
      </div>

      <div style={{ padding: '28px 36px' }}>

        {/* Contract viewer */}
        {invitation.has_contract && (
          <ContractViewer invitation={invitation} token={token} />
        )}

        {/* Already logged in */}
        {alreadyLoggedIn ? (
          <div style={{
            padding: '16px 18px', borderRadius: '12px', marginBottom: '20px',
            background: 'rgba(52,211,153,.08)', border: '1px solid rgba(52,211,153,.2)',
            display: 'flex', alignItems: 'center', gap: '10px',
          }}>
            <Shield size={16} style={{ color: '#34d399', flexShrink: 0 }} />
            <div style={{ fontSize: '13px', color: 'var(--c-text3)' }}>
              Connecté en tant que{' '}
              <strong style={{ color: 'var(--c-text)' }}>{user?.name || user?.email}</strong>.
              Cliquez pour rejoindre directement.
            </div>
          </div>
        ) : (
          /* Redirect to auth */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
            <p style={{ fontSize: '13px', color: 'var(--c-text3)', margin: '0 0 4px' }}>
              Pour accepter cette invitation, créez un compte ou connectez-vous.
            </p>
            <a href={`/auth?invite=${token}&mode=register`}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                padding: '14px', borderRadius: '12px', textDecoration: 'none',
                background: 'linear-gradient(135deg,#22d3ee,#0891b2)',
                color: 'var(--c-bg)', fontWeight: '700', fontSize: '14px',
              }}
            >
              <User size={16} /> Créer un compte
            </a>
            <a href={`/auth?invite=${token}&mode=login`}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                padding: '14px', borderRadius: '12px', textDecoration: 'none',
                background: 'var(--c-hover)', border: '1px solid rgba(255,255,255,.12)',
                color: 'var(--c-text2)', fontWeight: '600', fontSize: '14px',
              }}
            >
              <Lock size={16} /> J'ai déjà un compte
            </a>
          </div>
        )}

        {/* Error */}
        {acceptError && (
          <div style={{
            padding: '10px 14px', borderRadius: '8px', marginBottom: '16px',
            background: 'rgba(248,113,113,.1)', border: '1px solid rgba(248,113,113,.3)',
            fontSize: '13px', color: '#f87171',
          }}>
            {acceptError}
          </div>
        )}

        {/* CTA — connecté uniquement */}
        {alreadyLoggedIn && (
          <>
            <button
              type="button" onClick={handleAccept} disabled={accepting}
              style={{
                width: '100%', padding: '16px', borderRadius: '12px', border: 'none',
                background: accepting ? 'rgba(34,211,238,.2)' : 'linear-gradient(135deg,#22d3ee,#0891b2)',
                color: accepting ? 'var(--c-text4)' : 'var(--c-bg)',
                fontSize: '15px', fontWeight: '700', cursor: accepting ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                transition: 'all .2s',
              }}
            >
              {accepting
                ? <><Loader2 size={17} style={{ animation: 'spin 1s linear infinite' }} /> Traitement…</>
                : <><ArrowRight size={17} />
                    Accepter l'invitation{invitation.has_contract ? ' & signer le contrat' : ''}</>}
            </button>
            <p style={{ fontSize: '11px', color: 'var(--c-text5)', textAlign: 'center', marginTop: '14px' }}>
              Invitation valable jusqu'au{' '}
              {new Date(invitation.expires_at).toLocaleDateString('fr-FR',
                { day: 'numeric', month: 'long', year: 'numeric' })}.
            </p>
          </>
        )}

        {!alreadyLoggedIn && (
          <p style={{ fontSize: '11px', color: 'var(--c-text5)', textAlign: 'center', marginTop: '4px' }}>
            Invitation valable jusqu'au{' '}
            {new Date(invitation.expires_at).toLocaleDateString('fr-FR',
              { day: 'numeric', month: 'long', year: 'numeric' })}.
          </p>
        )}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg,#020617 0%,#0f172a 60%,#030a1f 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{
        width: '100%', maxWidth: '520px',
        background: 'var(--c-ba85)', backdropFilter: 'blur(20px)',
        border: '1px solid var(--c-border)',
        borderRadius: '20px', overflow: 'hidden',
        boxShadow: '0 32px 80px rgba(0,0,0,.6)',
      }}>
        {children}
      </div>
    </div>
  );
}
