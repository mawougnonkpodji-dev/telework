import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Hexagon, Mail, Lock, User, Users, ArrowRight, AlertCircle, Sparkles, Gift } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getApiUrl } from '../utils/apiHelpers.js';

const API = getApiUrl();

export default function AuthPage() {
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite');
  const modeParam   = searchParams.get('mode'); // 'register' | 'login'

  const [isRegister, setIsRegister] = useState(modeParam === 'register');
  const [requires2FA, setRequires2FA] = useState(false);
  const [pendingUserId, setPendingUserId] = useState(null);
  const [otp, setOtp] = useState('');
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [teamName, setTeamName] = useState('');
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // invitation info (project name, email) fetched if invite token present
  const [inviteInfo, setInviteInfo] = useState(null);

  const { login, register, verify2FA } = useAuth();

  // ── Fetch invitation info ──────────────────────────────────────────────────
  useEffect(() => {
    if (!inviteToken) return;
    fetch(`${API}/api/invitations/info/${inviteToken}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) {
          setInviteInfo(data);
          if (data.invited_email) setEmail(data.invited_email);
        }
      })
      .catch(() => {});
  }, [inviteToken]);

  // ── After successful auth, accept invitation then redirect ─────────────────
  const acceptInviteAndRedirect = async (accessToken) => {
    try {
      const res = await fetch(`${API}/api/invitations/accept/${inviteToken}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.project_id) {
        window.location.href = `/app?project=${data.project_id}`;
        return;
      }
    } catch (_) {}
    // fallback if accept fails for any reason
    window.location.href = '/app';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let result;
      if (requires2FA) {
        result = await verify2FA(pendingUserId, otp);
      } else if (isRegister) {
        result = await register(nom, email, password, teamName, isCreatingTeam);
      } else {
        result = await login(email, password);
      }

      if (result.success) {
        if (inviteToken) {
          const accessToken = localStorage.getItem('auth_token');
          await acceptInviteAndRedirect(accessToken);
        } else {
          window.location.href = '/app';
        }
      } else if (result.requires2FA) {
        setRequires2FA(true);
        setPendingUserId(result.userId);
        setOtp('');
        setError('');
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-bg">
        <div className="stars" />
        <div className="nebula" />
        <div className="grid-overlay" />
      </div>

      <header className="auth-header">
        <div className="logo-wrapper">
          <Hexagon className="logo-icon" />
          <span className="logo-text">TELEWORK</span>
        </div>
      </header>

      <main className="auth-main">
        <div className="auth-container">
          <div className="auth-card">
            <div className="card-glow" />
            
            <div className="auth-header-content">
              <div className="badge-wrapper">
                <Sparkles size={14} />
                <span>{requires2FA ? 'Vérification 2FA' : (isRegister ? 'Créer un compte' : 'Connexion')}</span>
              </div>
              <h1 className="auth-title">
                {requires2FA ? 'Code de sécurité' : (isRegister ? 'Rejoindre TELEWORK' : 'Bienvenue')}
              </h1>
              <p className="auth-subtitle">
                {requires2FA
                  ? 'Entrez le code OTP de votre application d\'authentification'
                  : isRegister 
                  ? 'Créez votre équipe et commencez à collaborer'
                  : 'Accédez à votre espace de travail'
                }
              </p>
            </div>

            <form onSubmit={handleSubmit} className="auth-form">

              {/* Invitation banner */}
              {inviteInfo && !requires2FA && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '12px 14px', borderRadius: '10px',
                  background: 'rgba(34,211,238,.08)', border: '1px solid rgba(34,211,238,.2)',
                  fontSize: '13px', color: 'var(--c-text3)',
                }}>
                  <Gift size={15} style={{ color: '#22d3ee', flexShrink: 0 }} />
                  <span>
                    Invité(e) à rejoindre{' '}
                    <strong style={{ color: 'var(--c-text)' }}>{inviteInfo.project_name}</strong>
                    {' '}en tant que{' '}
                    <span style={{ color: '#22d3ee', fontWeight: 600 }}>{inviteInfo.role_label}</span>
                  </span>
                </div>
              )}

              {error && (
                <div className="error-alert">
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}

              {isRegister && !requires2FA && (
                <div className="form-group">
                  <label>
                    <User size={16} />
                    <span>Nom complet</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Cris Towa"
                    value={nom}
                    onChange={(e) => setNom(e.target.value)}
                    required={isRegister}
                  />
                </div>
              )}

              {!requires2FA && (
              <div className="form-group">
                <label>
                  <Mail size={16} />
                  <span>Email</span>
                </label>
                <input
                  type="email"
                  placeholder="exemple@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              )}

              {!requires2FA && (
              <div className="form-group">
                <label>
                  <Lock size={16} />
                  <span>Mot de passe</span>
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              )}

              {requires2FA && (
                <div className="form-group">
                  <label>
                    <Lock size={16} />
                    <span>Code OTP (6 chiffres)</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="123456"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    required
                  />
                </div>
              )}

              {/* Team creation — hidden when coming from an invitation */}
              {isRegister && !requires2FA && !inviteToken && (
                <div className="form-group team-group">
                  <label>
                    <Users size={16} />
                    <span>Nom de l'équipe</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Alpha Team"
                    value={teamName}
                    onChange={(e) => {
                      setTeamName(e.target.value);
                      if (e.target.value && !isCreatingTeam) {
                        setIsCreatingTeam(true);
                      }
                    }}
                  />
                  <div className="team-toggle">
                    <label className="toggle-label">
                      <input
                        type="checkbox"
                        checked={isCreatingTeam}
                        onChange={(e) => {
                          e.stopPropagation();
                          setIsCreatingTeam(e.target.checked);
                        }}
                      />
                      <span>Créer une nouvelle équipe</span>
                    </label>
                  </div>
                </div>
              )}

              <button 
                type="submit" 
                className="submit-btn"
                disabled={loading || (requires2FA && otp.length !== 6)}
              >
                {loading ? (
                  <span>Chargement...</span>
                ) : (
                  <>
                    <span>{requires2FA ? 'Vérifier le code' : (isRegister ? 'Créer un compte' : 'Se connecter')}</span>
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>

            <div className="auth-footer">
              <p>
                {isRegister ? 'Déjà un compte?' : 'Pas de compte?'}
                <button 
                  type="button"
                  className="toggle-auth"
                  onClick={() => {
                    setIsRegister(!isRegister);
                    setError('');
                    setRequires2FA(false);
                    setPendingUserId(null);
                    setOtp('');
                  }}
                >
                  {isRegister ? ' Se connecter' : ' Créer un compte'}
                </button>
              </p>
              {requires2FA && (
                <p style={{ marginTop: '10px' }}>
                  <button
                    type="button"
                    className="toggle-auth"
                    onClick={() => {
                      setRequires2FA(false);
                      setPendingUserId(null);
                      setOtp('');
                      setError('');
                    }}
                  >
                    ← Revenir à la connexion
                  </button>
                </p>
              )}
            </div>
          </div>
        </div>
      </main>

      <style>{`
        .auth-page {
          min-height: 100vh;
          background: #020617;
          position: relative;
          overflow: hidden;
        }

        .auth-bg {
          position: fixed;
          inset: 0;
          pointer-events: none;
        }

        .stars {
          position: absolute;
          inset: 0;
          background-image: 
            radial-gradient(2px 2px at 20px 30px, #fff, rgba(0,0,0,0)),
            radial-gradient(2px 2px at 40px 70px, #fff, rgba(0,0,0,0)),
            radial-gradient(2px 2px at 50px 160px, #fff, rgba(0,0,0,0)),
            radial-gradient(2px 2px at 90px 40px, #fff, rgba(0,0,0,0)),
            radial-gradient(2px 2px at 130px 80px, #fff, rgba(0,0,0,0)),
            radial-gradient(2px 2px at 160px 120px, #fff, rgba(0,0,0,0));
          background-size: 200px 200px;
          animation: twinkle 4s ease-in-out infinite;
        }

        @keyframes twinkle {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }

        .nebula {
          position: absolute;
          top: 20%;
          left: 10%;
          width: 600px;
          height: 600px;
          background: radial-gradient(circle, rgba(34, 211, 238, 0.08) 0%, transparent 60%);
          filter: blur(60px);
          animation: drift 20s ease-in-out infinite;
        }

        .nebula::after {
          content: '';
          position: absolute;
          top: 50%;
          right: -200px;
          width: 400px;
          height: 400px;
          background: radial-gradient(circle, rgba(168, 85, 247, 0.06) 0%, transparent 60%);
          border-radius: 50%;
        }

        @keyframes drift {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(30px, -20px); }
        }

        .grid-overlay {
          position: absolute;
          inset: 0;
          background-image: 
            linear-gradient(to right, rgba(34, 211, 238, 0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(34, 211, 238, 0.03) 1px, transparent 1px);
          background-size: 50px 50px;
        }

        .auth-header {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          padding: 24px 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
        }

        .logo-wrapper {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .logo-wrapper .logo-icon {
          width: 36px;
          height: 36px;
          color: #22d3ee;
          filter: drop-shadow(0 0 10px rgba(34, 211, 238, 0.5));
        }

        .logo-text {
          font-size: 20px;
          font-weight: 800;
          letter-spacing: 4px;
          background: linear-gradient(90deg, #22d3ee, #a855f7, #fbbf24);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-size: 200% auto;
          animation: gradientMove 3s linear infinite;
        }

        @keyframes gradientMove {
          0% { background-position: 0% center; }
          100% { background-position: 200% center; }
        }

        .auth-main {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }

        .auth-container {
          width: 100%;
          max-width: 440px;
        }

        .auth-card {
          position: relative;
          background: linear-gradient(180deg, rgba(15, 23, 42, 0.9), rgba(2, 6, 23, 0.95));
          border: 1px solid rgba(34, 211, 238, 0.15);
          border-radius: 24px;
          padding: 40px;
          overflow: hidden;
        }

        .card-glow {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, #22d3ee, #a855f7, transparent);
          animation: glowPulse 3s ease-in-out infinite;
        }

        @keyframes glowPulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }

        .auth-header-content {
          text-align: center;
          margin-bottom: 32px;
        }

        .badge-wrapper {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 14px;
          background: rgba(34, 211, 238, 0.08);
          border: 1px solid rgba(34, 211, 238, 0.2);
          border-radius: 100px;
          color: #22d3ee;
          font-size: 12px;
          margin-bottom: 20px;
        }

        .auth-title {
          font-size: 28px;
          font-weight: 700;
          color: white;
          margin-bottom: 8px;
        }

        .auth-subtitle {
          font-size: 14px;
          color: #64748b;
        }

        .auth-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .error-alert {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 10px;
          color: #f87171;
          font-size: 13px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .form-group label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: #64748b;
          font-weight: 500;
        }

        .form-group label svg {
          color: #22d3ee;
        }

        .form-group input {
          padding: 14px 18px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          color: white;
          font-size: 14px;
          outline: none;
          transition: all 0.3s;
        }

        .form-group input:focus {
          border-color: rgba(34, 211, 238, 0.5);
          box-shadow: 0 0 20px rgba(34, 211, 238, 0.1);
        }

        .form-group input::placeholder {
          color: #475569;
        }

        .team-toggle {
          margin-top: 8px;
        }

        .toggle-label {
          display: flex !important;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          font-size: 13px !important;
          color: #94a3b8 !important;
        }

        .toggle-label input {
          width: 18px;
          height: 18px;
          accent-color: #22d3ee;
          cursor: pointer;
        }

        .submit-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 16px 24px;
          background: linear-gradient(135deg, #06b6d4, #8b5cf6);
          border: none;
          border-radius: 12px;
          color: white;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
          margin-top: 8px;
        }

        .submit-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 30px rgba(6, 182, 212, 0.3);
        }

        .submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .auth-footer {
          text-align: center;
          margin-top: 24px;
          padding-top: 24px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }

        .auth-footer p {
          font-size: 14px;
          color: #64748b;
        }

        .toggle-auth {
          background: none;
          border: none;
          color: #22d3ee;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          margin-left: 4px;
          transition: all 0.2s;
        }

        .toggle-auth:hover {
          text-decoration: underline;
        }

        @media (max-width: 480px) {
          .auth-card {
            padding: 32px 24px;
          }
          
          .auth-header {
            padding: 20px 24px;
          }
        }
      `}</style>
    </div>
  );
}