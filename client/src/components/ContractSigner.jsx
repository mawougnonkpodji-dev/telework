import { useState, useEffect } from 'react';
import {
  CheckCircle, FileText, AlertTriangle, ChevronDown, ChevronUp,
  Clock, XCircle, Pen, Download,
} from 'lucide-react';
import { signContract, getApiUrl } from '../services/backendApi.js';

const API = getApiUrl();

// ── Convertit le JSON structuré en blocs lisibles ─────────────────────────────
function parseStructured(content) {
  if (!content) return null;
  try {
    const d = JSON.parse(content);
    if (d && d._v === 2) return d;
  } catch (_) {}
  return null;
}

function fmt(amount, currency = 'EUR') {
  try {
    return `${parseFloat(amount).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} ${currency}`;
  } catch (_) { return `${amount} ${currency}`; }
}

function StructuredContractBody({ data, signeeEmail }) {
  const s = {
    section: {
      fontSize: '10px', fontWeight: '700', color: '#22d3ee',
      textTransform: 'uppercase', letterSpacing: '.06em',
      borderBottom: '1px solid rgba(34,211,238,.15)',
      paddingBottom: '4px', marginBottom: '8px', marginTop: '14px',
    },
    label: { fontSize: '10px', fontWeight: '600', color: 'var(--c-text4)', marginBottom: '2px' },
    value: { fontSize: '13px', color: 'var(--c-text)', marginBottom: '8px', lineHeight: '1.5' },
    row:   { display: 'flex', gap: '24px', flexWrap: 'wrap' },
    col:   { flex: 1, minWidth: '110px' },
    bullet:{ display: 'flex', gap: '8px', marginBottom: '4px' },
  };

  return (
    <div style={{ fontSize: '13px' }}>

      {/* Parties */}
      <div style={s.section}>Parties au contrat</div>
      <div style={s.row}>
        <div style={s.col}>
          <p style={s.label}>Employeur</p>
          <p style={s.value}>{data.employer_name || '—'}</p>
        </div>
        <div style={s.col}>
          <p style={s.label}>Collaborateur</p>
          <p style={s.value}>{signeeEmail || '—'}</p>
        </div>
      </div>

      {/* Poste */}
      <div style={s.section}>Poste & rôle</div>
      <div style={s.row}>
        {data.role_label && (
          <div style={s.col}>
            <p style={s.label}>Rôle</p>
            <p style={s.value}>{data.role_label}</p>
          </div>
        )}
        {data.start_date && (
          <div style={s.col}>
            <p style={s.label}>Date de début</p>
            <p style={s.value}>{data.start_date}</p>
          </div>
        )}
        {data.duration_months > 0 && (
          <div style={s.col}>
            <p style={s.label}>Durée</p>
            <p style={s.value}>{data.duration_months} mois</p>
          </div>
        )}
        {data.project_name && (
          <div style={s.col}>
            <p style={s.label}>Projet</p>
            <p style={s.value}>{data.project_name}</p>
          </div>
        )}
      </div>

      {/* Rémunération */}
      <div style={s.section}>Rémunération</div>
      <div style={s.row}>
        <div style={s.col}>
          <p style={s.label}>Salaire de base</p>
          <p style={{ ...s.value, color: '#34d399', fontWeight: '700', fontSize: '14px' }}>
            {fmt(data.base_salary, data.currency)}
            <span style={{ fontSize: '11px', color: 'var(--c-text4)', fontWeight: '400' }}> / mois</span>
          </p>
        </div>
        {data.bonus_percent > 0 && (
          <div style={s.col}>
            <p style={s.label}>Prime de performance IA</p>
            <p style={{ ...s.value, color: '#f59e0b', fontWeight: '700' }}>
              + {data.bonus_percent} %
              <span style={{ fontSize: '11px', color: 'var(--c-text4)', fontWeight: '400' }}> du salaire</span>
            </p>
          </div>
        )}
      </div>
      {data.bonus_details && data.bonus_details !== 'AUCUNE' && (
        <p style={{ ...s.value, color: 'var(--c-text3)', fontSize: '12px' }}>{data.bonus_details}</p>
      )}

      {/* Pénalités */}
      {data.penalty_rules && data.penalty_rules !== 'AUCUNE' && (
        <>
          <div style={s.section}>Pénalités</div>
          {data.penalty_rules.split('\n').filter(Boolean).map((line, i) => (
            <div key={i} style={s.bullet}>
              <span style={{ color: '#f87171', flexShrink: 0 }}>•</span>
              <span style={{ color: 'var(--c-text3)', lineHeight: '1.5', fontSize: '12px' }}>{line}</span>
            </div>
          ))}
        </>
      )}

      {/* Résiliation */}
      <div style={s.section}>Résiliation</div>
      <p style={s.label}>Préavis de résiliation</p>
      <p style={s.value}>{data.termination_notice_days || 30} jours calendaires</p>

      {/* Clauses */}
      {data.custom_clauses && data.custom_clauses !== 'BLABLABLA' && (
        <>
          <div style={s.section}>Clauses particulières</div>
          <p style={{ ...s.value, color: 'var(--c-text3)', fontSize: '12px',
                      whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
            {data.custom_clauses}
          </p>
        </>
      )}
    </div>
  );
}

const STATUS_CONFIG = {
  signed:    { label: 'Signé',       color: '#34d399', bg: 'rgba(52,211,153,.12)',  Icon: CheckCircle  },
  sent:      { label: 'À signer',    color: '#f59e0b', bg: 'rgba(245,158,11,.12)',  Icon: Pen          },
  draft:     { label: 'Brouillon',   color: 'var(--c-text4)', bg: 'rgba(100,116,139,.12)', Icon: FileText     },
  rejected:  { label: 'Rejeté',      color: '#f87171', bg: 'rgba(248,113,113,.12)', Icon: XCircle      },
  cancelled: { label: 'Annulé',      color: 'var(--c-text4)', bg: 'rgba(100,116,139,.12)', Icon: XCircle      },
};

function ContractCard({ contract, userId, onSigned }) {
  const [open, setOpen] = useState(false);
  const [signing, setSigning] = useState(false);

  const cfg = STATUS_CONFIG[contract.status] || STATUS_CONFIG.draft;
  const { Icon } = cfg;

  const handleSign = async () => {
    setSigning(true);
    const res = await signContract(contract.id);
    setSigning(false);
    if (res.ok) {
      onSigned?.();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error || 'Signature impossible');
    }
  };

  return (
    <div style={{
      borderRadius: '12px',
      border: `1px solid ${cfg.color}33`,
      background: cfg.bg,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', padding: '14px 16px', border: 'none',
          background: 'transparent', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: '10px',
          textAlign: 'left',
        }}
      >
        <Icon size={16} style={{ color: cfg.color, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--c-text)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {contract.title}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--c-text4)', marginTop: '2px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {contract.project_name && <span>📁 {contract.project_name}</span>}
            {contract.signed_at && (
              <span>✅ Signé le {new Date(contract.signed_at).toLocaleDateString('fr-FR', {
                day: 'numeric', month: 'long', year: 'numeric',
              })}</span>
            )}
            {!contract.signed_at && contract.created_at && (
              <span>📅 {new Date(contract.created_at).toLocaleDateString('fr-FR')}</span>
            )}
          </div>
        </div>
        <span style={{
          fontSize: '11px', fontWeight: '600', padding: '2px 9px',
          borderRadius: '9999px', whiteSpace: 'nowrap',
          background: cfg.bg, color: cfg.color,
          border: `1px solid ${cfg.color}55`,
        }}>
          {cfg.label}
        </span>
        {/* PDF download */}
        <button
          type="button"
          title="Télécharger en PDF"
          onClick={(e) => {
            e.stopPropagation();
            const tok = localStorage.getItem('auth_token');
            // Open with JWT in URL (simple approach for file download)
            const url = `${API}/api/contracts/${contract.id}/pdf`;
            // Use fetch + blob for authenticated download
            fetch(url, { headers: { Authorization: `Bearer ${tok}` } })
              .then((r) => r.blob())
              .then((blob) => {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `${contract.title || 'contrat'}.pdf`;
                a.click();
                URL.revokeObjectURL(a.href);
              })
              .catch(() => alert('Erreur lors du téléchargement'));
          }}
          style={{
            flexShrink: 0, padding: '4px 8px', borderRadius: '6px', border: 'none',
            background: 'rgba(34,211,238,.1)', color: '#22d3ee',
            cursor: 'pointer', display: 'flex', alignItems: 'center',
          }}
        >
          <Download size={12} />
        </button>
        {open
          ? <ChevronUp size={14} style={{ color: 'var(--c-text4)', flexShrink: 0 }} />
          : <ChevronDown size={14} style={{ color: 'var(--c-text4)', flexShrink: 0 }} />}
      </button>

      {/* Content */}
      {open && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid rgba(148,163,184,.1)' }}>
          {contract.content === 'PDF_CONTRACT' ? (
            <div style={{
              marginTop: '14px', padding: '14px 16px', borderRadius: '8px',
              background: 'rgba(8,145,178,.06)', border: '1px solid rgba(34,211,238,.15)',
              display: 'flex', alignItems: 'center', gap: '10px',
            }}>
              <FileText size={16} style={{ color: '#22d3ee', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--c-text)' }}>
                  {contract.title}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--c-text4)', marginTop: '2px' }}>
                  Ce contrat est disponible en PDF — téléchargez-le via le bouton ci-dessus.
                </div>
              </div>
            </div>
          ) : contract.content ? (() => {
            const structured = parseStructured(contract.content);
            return structured ? (
              <div style={{ marginTop: '14px' }}>
                <StructuredContractBody data={structured} signeeEmail={contract.signee_email || ''} />
              </div>
            ) : (
              <pre style={{
                margin: '14px 0 0', padding: '14px',
                background: 'rgba(0,0,0,.3)', borderRadius: '8px',
                fontSize: '12px', color: 'var(--c-text3)',
                lineHeight: '1.7', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                maxHeight: '320px', overflowY: 'auto',
              }}>
                {contract.content}
              </pre>
            );
          })() : (
            <p style={{ fontSize: '12px', color: 'var(--c-text4)', marginTop: '12px' }}>
              Contenu non disponible.
            </p>
          )}

          {/* Sign button for pending contracts */}
          {contract.status === 'sent' && contract.signee_user_id === userId && (
            <button
              type="button"
              onClick={handleSign}
              disabled={signing}
              style={{
                marginTop: '14px', padding: '10px 18px', borderRadius: '8px', border: 'none',
                background: signing ? 'rgba(34,197,94,.2)' : '#22c55e',
                color: signing ? 'var(--c-text4)' : 'var(--c-bg)',
                fontWeight: '700', fontSize: '13px',
                cursor: signing ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}
            >
              <Pen size={13} />
              {signing ? 'Signature…' : 'Signer ce contrat'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ContractSigner({ user, projectId, onContractSigned }) {
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  const fetchContracts = async () => {
    if (!user?.id) return;
    setLoading(true);
    setError('');
    try {
      const tok = localStorage.getItem('auth_token');
      // Fetch all personal contracts (across all projects)
      const res  = await fetch(`${API}/api/contracts/mine`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setContracts(data.contracts || []);
      } else {
        setError(data.error || 'Impossible de charger les contrats');
      }
    } catch {
      setError('Erreur réseau');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchContracts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (loading) {
    return <p style={{ color: 'var(--c-text4)', fontSize: '13px' }}>Chargement des contrats…</p>;
  }

  if (error) {
    return <p style={{ color: '#f87171', fontSize: '13px' }}>{error}</p>;
  }

  const pending = contracts.filter((c) => c.status === 'sent');
  const others  = contracts.filter((c) => c.status !== 'sent');

  if (contracts.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--c-text4)' }}>
        <FileText size={18} />
        <span style={{ fontSize: '13px' }}>Aucun contrat associé à votre compte.</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

      {/* Pending first */}
      {pending.length > 0 && (
        <div style={{
          padding: '8px 12px', borderRadius: '8px',
          background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.2)',
          display: 'flex', alignItems: 'center', gap: '8px',
          fontSize: '12px', color: '#f59e0b', marginBottom: '4px',
        }}>
          <AlertTriangle size={13} />
          {pending.length} contrat{pending.length > 1 ? 's' : ''} en attente de signature
        </div>
      )}

      {[...pending, ...others].map((c) => (
        <ContractCard
          key={c.id}
          contract={c}
          userId={user?.id}
          onSigned={() => { onContractSigned?.(); fetchContracts(); }}
        />
      ))}
    </div>
  );
}
