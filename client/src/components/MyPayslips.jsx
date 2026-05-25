import { useState, useEffect, useCallback } from 'react';
import {
  Receipt, Download, FileText, ChevronDown, ChevronUp, Loader2,
  Sparkles, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { fetchMyPayslips, downloadPayrollSlipPdf, generateMyPayslip } from '../services/backendApi.js';
import { getApiUrl, authJsonHeaders, normalizeProjectsList } from '../utils/apiHelpers.js';

const STATUS_COLORS = {
  draft:     { bg: 'rgba(100,116,139,0.15)', color: 'var(--c-text3)', label: 'Brouillon' },
  validated: { bg: 'rgba(16,185,129,0.15)',  color: '#34d399', label: 'Validé'    },
  paid:      { bg: 'rgba(14,165,233,0.15)',  color: '#38bdf8', label: 'Payé'      },
};
const getStatusStyle = (s) => STATUS_COLORS[s] || STATUS_COLORS.draft;

export default function MyPayslips() {
  const [slips,      setSlips]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [apiError,   setApiError]   = useState('');
  const [expanded,   setExpanded]   = useState(null);
  const [downloading, setDownloading] = useState(null);

  // ── Generate panel ────────────────────────────────────────────────────────
  const [projects,    setProjects]    = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [genProjectId, setGenProjectId] = useState('');
  const [generating,  setGenerating]  = useState(false);
  const [genResult,   setGenResult]   = useState(null); // { ok, msg }

  // Fetch the user's project list once
  useEffect(() => {
    setProjectsLoading(true);
    fetch(`${getApiUrl()}/api/projects/`, { headers: authJsonHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((raw) => {
        const list = raw ? normalizeProjectsList(raw) : [];
        setProjects(list);
        if (list.length > 0) setGenProjectId(String(list[0].id));
      })
      .catch(() => setProjects([]))
      .finally(() => setProjectsLoading(false));
  }, []);

  // ── Load slips ────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setApiError('');
    try {
      const data = await fetchMyPayslips();
      setSlips(data?.slips || []);
    } catch (err) {
      setApiError(`Erreur : ${err.message}`);
      setSlips([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Generate handler ──────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!genProjectId) return;
    setGenerating(true);
    setGenResult(null);
    try {
      const data = await generateMyPayslip(Number(genProjectId));
      setGenResult({
        ok: true,
        msg: data.message || 'Fiche générée.',
        alreadyExisted: data.already_existed,
      });
      await load(); // refresh list
    } catch (err) {
      setGenResult({ ok: false, msg: err.message });
    } finally {
      setGenerating(false);
    }
  };

  // ── PDF download ──────────────────────────────────────────────────────────
  const handleDownload = async (slip) => {
    const runId = slip.run?.id || slip.payroll_run_id;
    if (!runId) return;
    setDownloading(slip.id);
    const name = `fiche-paie-${slip.run?.month || 'mois'}-${slip.project_name || 'projet'}.pdf`
      .replace(/\s+/g, '_');
    await downloadPayrollSlipPdf(runId, slip.user_id, name);
    setDownloading(null);
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ marginTop: '8px' }}>

      {/* ── Generate panel ── */}
      <div style={{
        marginBottom: '24px',
        padding: '20px',
        borderRadius: '14px',
        background: 'rgba(8,145,178,0.07)',
        border: '1px solid rgba(34,211,238,0.18)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <Sparkles size={16} style={{ color: '#22d3ee' }} />
          <span style={{ fontWeight: '600', fontSize: '14px', color: 'var(--c-text2)' }}>
            Générer ma fiche de paie du mois courant
          </span>
        </div>

        <p style={{ fontSize: '12px', color: 'var(--c-text4)', marginBottom: '14px', lineHeight: '1.5' }}>
          Déclenche le calcul de paie du mois courant pour <strong style={{ color: 'var(--c-text3)' }}>tous les membres</strong> du projet
          sélectionné (une seule génération par mois). Si la paie a déjà été générée ce mois, votre fiche existante vous est retournée.
        </p>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={genProjectId}
            onChange={(e) => { setGenProjectId(e.target.value); setGenResult(null); }}
            disabled={projectsLoading || projects.length === 0}
            style={{
              flex: '1 1 200px',
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid rgba(148,163,184,0.2)',
              background: 'rgba(15,23,42,0.6)',
              color: 'var(--c-text2)',
              fontSize: '13px',
              outline: 'none',
            }}
          >
            {projectsLoading && <option value="">Chargement…</option>}
            {!projectsLoading && projects.length === 0 && <option value="">Aucun projet</option>}
            {projects.map((p) => (
              <option key={p.id} value={String(p.id)} style={{ background: 'var(--c-surface)' }}>
                {p.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || !genProjectId || projectsLoading}
            style={{
              padding: '10px 20px',
              borderRadius: '10px',
              border: 'none',
              background: generating ? 'rgba(8,145,178,0.3)' : 'linear-gradient(135deg, #0891b2, #22d3ee)',
              color: generating ? 'var(--c-text3)' : '#0f172a',
              fontWeight: '700',
              fontSize: '13px',
              cursor: generating ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s',
            }}
          >
            {generating
              ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Génération…</>
              : <><Sparkles size={14} /> Générer</>}
          </button>
        </div>

        {/* Feedback */}
        {genResult && (
          <div style={{
            marginTop: '12px',
            padding: '10px 14px',
            borderRadius: '10px',
            background: genResult.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${genResult.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
            color: genResult.ok ? '#34d399' : '#f87171',
          }}>
            {genResult.ok
              ? <CheckCircle2 size={15} />
              : <AlertCircle size={15} />}
            {genResult.msg}
            {genResult.ok && genResult.alreadyExisted && (
              <span style={{ fontSize: '11px', color: 'var(--c-text4)', marginLeft: '4px' }}>
                — consultez la liste ci-dessous
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Slips list ── */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '160px' }}>
          <Loader2 size={32} style={{ color: '#22d3ee', animation: 'spin 1s linear infinite' }} />
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : apiError ? (
        <div style={{
          textAlign: 'center', padding: '32px 24px', color: '#f87171',
          border: '1px dashed rgba(248,113,113,0.3)', borderRadius: '16px',
        }}>
          <p style={{ fontSize: '13px', marginBottom: '12px' }}>{apiError}</p>
          <button
            type="button" onClick={load}
            style={{
              padding: '8px 18px', borderRadius: '8px', border: 'none',
              background: 'rgba(248,113,113,0.15)', color: '#f87171',
              fontSize: '13px', fontWeight: '600', cursor: 'pointer',
            }}
          >Réessayer</button>
        </div>
      ) : slips.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '48px 24px', color: 'var(--c-text4)',
          border: '1px dashed rgba(148,163,184,0.2)', borderRadius: '16px',
        }}>
          <Receipt size={40} style={{ marginBottom: '12px', opacity: 0.4 }} />
          <p style={{ fontSize: '14px' }}>Aucune fiche de paie disponible pour le moment.</p>
          <p style={{ fontSize: '12px', marginTop: '4px', opacity: 0.6 }}>
            Utilisez le bouton ci-dessus pour générer votre première fiche.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {slips.map((slip) => {
            const isExp = expanded === slip.id;
            const statusStyle = getStatusStyle(slip.status);
            const runId = slip.run?.id || slip.payroll_run_id;

            return (
              <div
                key={slip.id}
                style={{
                  borderRadius: '12px',
                  border: '1px solid rgba(148,163,184,0.12)',
                  background: 'rgba(22,25,39,0.6)',
                  overflow: 'hidden',
                }}
              >
                {/* Row header */}
                <div
                  style={{
                    display: 'flex', alignItems: 'center', gap: '16px',
                    padding: '14px 18px', cursor: 'pointer',
                  }}
                  onClick={() => setExpanded(isExp ? null : slip.id)}
                >
                  {/* Icon */}
                  <div style={{
                    width: '42px', height: '42px', borderRadius: '10px',
                    background: 'linear-gradient(135deg, #0891b2, #22d3ee)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <FileText size={20} color="#0f172a" />
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ color: 'var(--c-text)', fontWeight: '600', fontSize: '14px' }}>
                        {slip.run?.month || '—'}
                      </span>
                      {slip.project_name && (
                        <span style={{ fontSize: '12px', color: 'var(--c-text4)' }}>
                          • {slip.project_name}
                        </span>
                      )}
                      <span style={{
                        fontSize: '11px', fontWeight: '600', padding: '2px 8px', borderRadius: '9999px',
                        background: statusStyle.bg, color: statusStyle.color,
                      }}>
                        {statusStyle.label}
                      </span>
                    </div>
                    <div style={{ fontSize: '13px', color: '#34d399', fontWeight: '700', marginTop: '2px' }}>
                      Net : {Number(slip.net_amount || 0).toLocaleString('fr-FR')} {slip.run?.currency || 'XOF'}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDownload(slip); }}
                      disabled={!runId || downloading === slip.id}
                      style={{
                        padding: '7px 14px', borderRadius: '8px', border: 'none',
                        background: 'rgba(34,211,238,0.12)', color: '#22d3ee',
                        fontSize: '12px', fontWeight: '600',
                        cursor: runId ? 'pointer' : 'not-allowed',
                        display: 'flex', alignItems: 'center', gap: '5px',
                        opacity: downloading === slip.id ? 0.6 : 1,
                        transition: 'background 0.2s',
                      }}
                    >
                      {downloading === slip.id
                        ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                        : <Download size={13} />}
                      PDF
                    </button>
                    <div style={{ color: 'var(--c-text5)' }}>
                      {isExp ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExp && (
                  <div style={{
                    borderTop: '1px solid rgba(148,163,184,0.08)',
                    padding: '16px 18px 18px',
                    background: 'rgba(15,23,42,0.4)',
                  }}>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                      gap: '10px',
                    }}>
                      {[
                        { label: 'Salaire de base', value: `${Number(slip.base_amount || 0).toLocaleString('fr-FR')} ${slip.run?.currency || 'XOF'}`, color: 'var(--c-text2)' },
                        { label: 'Bonus', value: `+ ${Number(slip.bonus_amount || 0).toLocaleString('fr-FR')} ${slip.run?.currency || 'XOF'}`, color: '#34d399' },
                        { label: 'Pénalités', value: `- ${Number(slip.penalty_amount || 0).toLocaleString('fr-FR')} ${slip.run?.currency || 'XOF'}`, color: '#f87171' },
                        { label: 'Net à payer', value: `${Number(slip.net_amount || 0).toLocaleString('fr-FR')} ${slip.run?.currency || 'XOF'}`, color: '#34d399', bold: true },
                      ].map((row) => (
                        <div key={row.label} style={{
                          padding: '12px', borderRadius: '10px',
                          background: 'rgba(30,41,59,0.5)',
                          border: '1px solid rgba(148,163,184,0.08)',
                        }}>
                          <div style={{ fontSize: '11px', color: 'var(--c-text4)', marginBottom: '4px' }}>{row.label}</div>
                          <div style={{ fontSize: '14px', color: row.color, fontWeight: row.bold ? '700' : '500' }}>{row.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
