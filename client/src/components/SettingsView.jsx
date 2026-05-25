import { useState } from 'react';
import { Moon, Sun, Monitor, Palette, Bell, Globe, User, Shield, FileText, Receipt } from 'lucide-react';
import ContractSigner from './ContractSigner';
import MyPayslips from './MyPayslips.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useTheme } from '../contexts/ThemeContext.jsx';
import { getApiUrl, authJsonHeaders, ROLE_LABELS } from '../utils/apiHelpers.js';

const THEMES = [
  { id: 'dark',   label: 'Sombre',  icon: Moon,    desc: 'Interface sombre, idéale la nuit'       },
  { id: 'light',  label: 'Clair',   icon: Sun,     desc: 'Interface lumineuse, lisible en journée' },
  { id: 'system', label: 'Système', icon: Monitor, desc: 'Suit les préférences de votre OS'        },
];

export default function SettingsView({ user, activeProject, myProjectRole }) {
  const { refreshAccessToken, refreshUser } = useAuth();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const accent = activeProject?.color_theme || 'var(--c-accent)';

  const [settings,    setSettings]    = useState({ notifications: true, language: 'fr' });
  const [twoFaMsg,    setTwoFaMsg]    = useState('');
  const [otpUri,      setOtpUri]      = useState('');
  const [otpSecret,   setOtpSecret]   = useState('');
  const [uriCopied,   setUriCopied]   = useState(false);
  const [refreshMsg,  setRefreshMsg]  = useState('');

  const handleEnable2FA = async () => {
    setTwoFaMsg(''); setOtpUri(''); setOtpSecret(''); setUriCopied(false);
    const res  = await fetch(`${getApiUrl()}/api/auth/enable-2fa`, {
      method: 'POST', headers: authJsonHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setTwoFaMsg(data.error || "Impossible d'activer le 2FA"); return; }

    const secret = (data.secret || '').replace(/\s+/g, '');
    const email  = user?.email || '';
    const uri = data.otp_uri ||
      `otpauth://totp/Telework:${encodeURIComponent(email)}?secret=${secret}&issuer=Telework`;
    setOtpUri(uri);
    setOtpSecret(secret);
    await refreshUser();
  };

  // ── Styles adaptatifs ───────────────────────────────────────────────────────
  const card = {
    background: 'var(--c-surface2)',
    backdropFilter: 'blur(12px)',
    border: '1px solid var(--c-border)',
    borderRadius: '16px',
    padding: '24px',
    marginBottom: '20px',
    transition: 'background .25s, border-color .25s',
  };
  const sectionTitle = {
    display: 'flex', alignItems: 'center', gap: '10px',
    fontSize: '14px', fontWeight: '600', color: 'var(--c-text3)',
    textTransform: 'uppercase', letterSpacing: '0.08em',
    marginBottom: '20px',
  };
  const row = {
    display: 'flex', alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 0',
    borderBottom: '1px solid var(--c-border3)',
  };
  const lbl  = { fontSize: '14px', fontWeight: '500', color: 'var(--c-text2)' };
  const desc = { fontSize: '12px', color: 'var(--c-text4)', marginTop: '2px' };
  const actionBtn = (active) => ({
    padding: '8px 16px', borderRadius: '10px',
    border: `1px solid ${active ? accent : 'var(--c-border2)'}`,
    background: active ? `${accent}22` : 'var(--c-hover)',
    color: active ? accent : 'var(--c-text3)',
    cursor: 'pointer', fontSize: '13px', fontWeight: '600',
    transition: 'all .2s', display: 'flex', alignItems: 'center', gap: '6px',
  });

  return (
    <div style={{ maxWidth: '720px', padding: '28px 24px' }}>
      <h2 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--c-text)', marginBottom: '8px' }}>
        Paramètres
      </h2>
      <p style={{ color: 'var(--c-text4)', fontSize: '13px', marginBottom: '28px' }}>
        Projet actif :&nbsp;
        <span style={{ color: accent, fontWeight: '600' }}>
          {activeProject?.name || '—'}
        </span>
      </p>

      {/* ── Apparence ── */}
      <div style={card}>
        <div style={sectionTitle}>
          <Palette size={16} style={{ color: accent }} />
          Apparence
        </div>

        {/* Couleur d'accent du projet */}
        <p style={{ ...desc, marginBottom: '20px' }}>
          Couleur du projet :&nbsp;
          <span style={{ color: accent, fontWeight: '600' }}>{activeProject?.color_theme || '—'}</span>
          {activeProject?.color_theme && (
            <span style={{
              display: 'inline-block', width: '14px', height: '14px',
              borderRadius: '50%', background: accent,
              marginLeft: '8px', verticalAlign: 'middle',
            }} />
          )}
        </p>

        {/* Sélecteur de thème */}
        <p style={{ ...desc, marginBottom: '12px', fontWeight: '600', color: 'var(--c-text3)' }}>
          Thème de l'interface
        </p>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {THEMES.map((t) => {
            const active = theme === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTheme(t.id)}
                title={t.desc}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '10px 18px', borderRadius: '12px',
                  border: active ? `2px solid var(--c-accent)` : '2px solid var(--c-border2)',
                  background: active ? 'rgba(34,211,238,.1)' : 'var(--c-hover)',
                  color: active ? 'var(--c-accent)' : 'var(--c-text3)',
                  cursor: 'pointer', fontSize: '13px', fontWeight: '600',
                  transition: 'all .2s',
                }}
              >
                <t.icon size={16} />
                {t.label}
                {active && (
                  <span style={{
                    width: '6px', height: '6px', borderRadius: '50%',
                    background: 'var(--c-accent)', marginLeft: '2px',
                  }} />
                )}
              </button>
            );
          })}
        </div>

        {/* Indicateur du thème appliqué */}
        <p style={{ ...desc, marginTop: '14px' }}>
          Thème appliqué :&nbsp;
          <strong style={{ color: 'var(--c-accent)' }}>
            {resolvedTheme === 'light' ? '☀ Clair' : '🌙 Sombre'}
          </strong>
          {theme === 'system' && ' (depuis les préférences système)'}
        </p>
      </div>

      {/* ── Profil ── */}
      <div style={card}>
        <div style={sectionTitle}>
          <User size={16} style={{ color: accent }} />
          Profil
        </div>
        {[
          { label: 'Nom',         value: user?.name  || user?.nom || '—'                    },
          { label: 'Email',       value: user?.email || '—'                                 },
          { label: 'Rôle projet', value: ROLE_LABELS[myProjectRole] || myProjectRole || '—' },
        ].map((item) => (
          <div key={item.label} style={row}>
            <p style={lbl}>{item.label}</p>
            <span style={{ fontSize: '14px', color: 'var(--c-text3)' }}>{item.value}</span>
          </div>
        ))}
      </div>

      {/* ── Sécurité ── */}
      <div style={card}>
        <div style={sectionTitle}>
          <Shield size={16} style={{ color: accent }} />
          Sécurité
        </div>
        <div style={row}>
          <div>
            <p style={lbl}>Rafraîchir le jeton</p>
            <p style={desc}>Renouveler la session sans se déconnecter</p>
          </div>
          <button
            type="button"
            style={actionBtn(false)}
            onClick={async () => {
              const r = await refreshAccessToken();
              setRefreshMsg(r.success ? 'Session rafraîchie ✓' : (r.error || 'Erreur'));
              setTimeout(() => setRefreshMsg(''), 3000);
            }}
          >
            Rafraîchir
          </button>
        </div>
        {refreshMsg && <p style={{ ...desc, color: 'var(--c-accent)', marginTop: '8px' }}>{refreshMsg}</p>}

        <div style={{ ...row, borderBottom: otpUri ? '1px solid var(--c-border3)' : 'none', paddingBottom: 0 }}>
          <div>
            <p style={lbl}>Authentification 2FA</p>
            <p style={desc}>{user?.is_2fa ? 'Activée' : 'Non activée — ajoutez une couche de sécurité'}</p>
          </div>
          {user?.is_2fa && !otpUri ? (
            <span style={{ fontSize: '12px', color: '#34d399', fontWeight: '600' }}>✓ Activée</span>
          ) : !user?.is_2fa ? (
            <button type="button" style={actionBtn(false)} onClick={handleEnable2FA}>Activer 2FA</button>
          ) : null}
        </div>
        {twoFaMsg && <p style={{ ...desc, color: 'var(--c-accent)', marginTop: '10px' }}>{twoFaMsg}</p>}

        {otpUri && (
          <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <div style={{ padding: '14px', background: '#ffffff', borderRadius: '14px', boxShadow: '0 4px 24px rgba(0,0,0,.3)', display: 'inline-flex' }}>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(otpUri)}&size=200x200&margin=8`}
                alt="QR Code 2FA" width={200} height={200}
                style={{ display: 'block', borderRadius: '4px' }}
              />
            </div>
            <p style={{ fontSize: '12px', color: 'var(--c-text4)', textAlign: 'center', maxWidth: '340px', lineHeight: '1.5' }}>
              Scannez avec <strong style={{ color: 'var(--c-text3)' }}>Google Authenticator</strong>,&nbsp;
              <strong style={{ color: 'var(--c-text3)' }}>Authy</strong> ou toute app TOTP.
            </p>
            <div style={{ width: '100%', maxWidth: '380px' }}>
              <p style={{ fontSize: '11px', color: 'var(--c-text4)', marginBottom: '4px' }}>Clé secrète :</p>
              <code style={{
                display: 'block', padding: '10px 14px', borderRadius: '8px',
                background: 'var(--c-ba85)', border: '1px solid var(--c-border)',
                fontSize: '13px', fontWeight: '700', color: 'var(--c-accent)',
                letterSpacing: '0.12em', textAlign: 'center', wordBreak: 'break-all',
              }}>
                {otpSecret}
              </code>
            </div>
            <div style={{ width: '100%', maxWidth: '380px' }}>
              <p style={{ fontSize: '11px', color: 'var(--c-text4)', marginBottom: '4px' }}>
                URI otpauth (<a href="https://qr.io" target="_blank" rel="noopener noreferrer"
                  style={{ color: 'var(--c-accent)' }}>qr.io</a>) :
              </p>
              <div style={{ position: 'relative' }}>
                <code style={{
                  display: 'block', padding: '10px 44px 10px 10px', borderRadius: '8px',
                  background: 'var(--c-ba85)', border: '1px solid var(--c-border)',
                  fontSize: '10px', color: 'var(--c-text3)',
                  wordBreak: 'break-all', lineHeight: '1.5',
                }}>
                  {otpUri}
                </code>
                <button
                  type="button" title="Copier"
                  onClick={() => { navigator.clipboard.writeText(otpUri).then(() => { setUriCopied(true); setTimeout(() => setUriCopied(false), 2000); }); }}
                  style={{
                    position: 'absolute', top: '8px', right: '8px',
                    padding: '4px 8px', borderRadius: '6px', border: 'none',
                    background: uriCopied ? 'rgba(52,211,153,.2)' : 'var(--c-border)',
                    color: uriCopied ? '#34d399' : 'var(--c-text4)',
                    fontSize: '10px', fontWeight: '600', cursor: 'pointer', transition: 'all .2s',
                  }}
                >
                  {uriCopied ? '✓ Copié' : 'Copier'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Contrats ── */}
      <div style={card}>
        <div style={sectionTitle}>
          <FileText size={16} style={{ color: accent }} />
          Mes contrats
        </div>
        <p style={{ ...desc, marginBottom: '14px', marginTop: '-4px' }}>
          Tous vos contrats signés ou en attente, tous projets confondus.
        </p>
        <ContractSigner user={user} projectId={activeProject?.id} />
      </div>

      {/* ── Notifications ── */}
      <div style={card}>
        <div style={sectionTitle}>
          <Bell size={16} style={{ color: accent }} />
          Notifications
        </div>
        <div style={{ ...row, borderBottom: 'none', paddingBottom: 0 }}>
          <div>
            <p style={lbl}>Notifications en temps réel</p>
            <p style={desc}>Alertes socket pour les tâches et messages</p>
          </div>
          <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px' }}>
            <input
              type="checkbox" checked={settings.notifications}
              onChange={(e) => setSettings({ ...settings, notifications: e.target.checked })}
              style={{ opacity: 0, width: 0, height: 0 }}
            />
            <span style={{
              position: 'absolute', inset: 0, borderRadius: '9999px', cursor: 'pointer',
              background: settings.notifications ? 'var(--c-accent)' : 'var(--c-border2)',
              transition: 'background .2s',
            }}>
              <span style={{
                position: 'absolute', top: '3px',
                left: settings.notifications ? 'calc(100% - 21px)' : '3px',
                width: '18px', height: '18px',
                borderRadius: '50%', background: '#fff', transition: 'left .2s',
              }} />
            </span>
          </label>
        </div>
      </div>

      {/* ── Langue ── */}
      <div style={card}>
        <div style={sectionTitle}>
          <Globe size={16} style={{ color: accent }} />
          Langue
        </div>
        <select
          value={settings.language}
          onChange={(e) => setSettings({ ...settings, language: e.target.value })}
          style={{
            padding: '10px 14px', borderRadius: '10px',
            border: '1px solid var(--c-border2)',
            background: 'var(--c-surface)', color: 'var(--c-text2)',
            fontSize: '13px', outline: 'none', cursor: 'pointer',
          }}
        >
          <option value="fr">Français</option>
          <option value="en">English</option>
          <option value="wo">Wolof</option>
        </select>
      </div>

      {/* ── Fiches de paie ── */}
      <div style={card}>
        <div style={sectionTitle}>
          <Receipt size={16} style={{ color: accent }} />
          Mes fiches de paie
        </div>
        <p style={{ ...desc, marginBottom: '16px' }}>
          Retrouvez ici toutes vos fiches de paie générées par vos gestionnaires de projet.
        </p>
        <MyPayslips />
      </div>
    </div>
  );
}
