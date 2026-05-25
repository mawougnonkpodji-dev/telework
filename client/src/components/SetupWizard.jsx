import { useState, useEffect, useRef } from 'react';
import { getApiUrl } from '../utils/apiHelpers.js';

const API_URL = getApiUrl();

export default function SetupWizard({ onComplete }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    teamName: '',
    sector: '',
    currency: 'XOF',
    projectName: '',
    projectDescription: ''
  });
  const [teamData, setTeamData] = useState(null);
  const [glitch, setGlitch] = useState(false);
  const firstInputRef = useRef(null);
  
  const sectors = ['Tech/Startup', 'Consulting', 'E-commerce', 'Agency', 'Finance', 'Santé', 'Éducation'];
  
  useEffect(() => {
    const timer = setTimeout(() => {
      if (firstInputRef.current) {
        firstInputRef.current.focus();
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [step]);
  
  const progressPixels = Array(12).fill(0).map((_, i) => {
    if (step === 1) return i < 4;
    if (step === 2) return i < 8;
    return i < 12;
  });
  
  const canProceedStep1 = form.teamName && form.sector;
  const canProceedStep2 = form.projectName;
  
  const triggerGlitch = () => {
    setGlitch(true);
    setTimeout(() => setGlitch(false), 300);
  };
  
  const handleStep1 = () => {
    if (canProceedStep1) {
      triggerGlitch();
      setStep(2);
    }
  };
  
  const handleStep2 = async () => {
    if (!canProceedStep2) return;
    setLoading(true);
    const token = localStorage.getItem('auth_token');

    try {
      const teamRes = await fetch(`${API_URL}/api/teams/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          teamName: form.teamName,
          sector: form.sector,
          currency: form.currency,
          payCycle: 'monthly',
          baseSalary: 50000,
        }),
      });

      const teamResult = await teamRes.json().catch(() => ({}));
      if (!teamRes.ok) {
        window.alert(teamResult.error || 'Impossible d’enregistrer l’équipe.');
        setLoading(false);
        return;
      }
      setTeamData(teamResult);
      triggerGlitch();
      setStep(3);
    } catch {
      window.alert('Erreur réseau lors de l’enregistrement de l’équipe.');
    }
    setLoading(false);
  };
  
  const handleLaunch = async () => {
    setLoading(true);
    const token = localStorage.getItem('auth_token');

    try {
      const projectRes = await fetch(`${API_URL}/api/projects/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          projects: [
            {
              name: form.projectName,
              description: form.projectDescription || '',
            },
          ],
        }),
      });

      const body = await projectRes.json().catch(() => ({}));
      if (!projectRes.ok) {
        window.alert(body.error || 'Création du projet impossible.');
        setLoading(false);
        return;
      }

      const created = body.projects || [];
      if (!created.length) {
        window.alert('Aucun projet n’a été créé.');
        setLoading(false);
        return;
      }

      const first = created[0];
      if (first?.id) {
        localStorage.setItem('last_project_id', String(first.id));
      }

      if (onComplete) {
        await onComplete({ team: teamData, projects: created });
      }
    } catch {
      window.alert('Erreur réseau lors de la création du projet.');
    }

    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0f1a 0%, #0d1525 50%, #050810 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: '"Space Grotesk", "DM Sans", sans-serif',
      position: 'relative',
      overflow: 'hidden'
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');
        
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 8px rgba(34, 211, 238, 0.4); }
          50% { box-shadow: 0 0 20px rgba(34, 211, 238, 0.8); }
        }
        
        @keyframes scanLine {
          0% { top: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        
        @keyframes glitch {
          0% { transform: translate(0); }
          20% { transform: translate(-2px, 2px); }
          40% { transform: translate(2px, -2px); }
          60% { transform: translate(-1px, -1px); }
          80% { transform: translate(1px, 1px); }
          100% { transform: translate(0); }
        }
        
        @keyframes pixelOn {
          0% { opacity: 0.3; }
          100% { opacity: 1; }
        }
        
        @keyframes fadeSlide {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        
        @keyframes borderGlow {
          0%, 100% { border-color: rgba(34, 211, 238, 0.3); }
          50% { border-color: rgba(34, 211, 238, 0.8); }
        }
        
        .wizard-bg-pattern {
          position: absolute;
          inset: 0;
          background-image: 
            linear-gradient(rgba(34, 211, 238, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(34, 211, 238, 0.03) 1px, transparent 1px);
          background-size: 40px 40px;
          pointer-events: none;
        }
        
        .wizard-african-pattern {
          position: absolute;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 5 L35 25 L55 30 L35 35 L30 55 L25 35 L5 30 L25 25 Z' fill='none' stroke='rgba(34, 211, 238, 0.04)' stroke-width='1'/%3E%3C/svg%3E");
          background-size: 120px 120px;
          pointer-events: none;
        }
        
        .wizard-card {
          animation: fadeSlide 0.4s ease-out forwards;
        }
        
        .glitch-effect {
          animation: glitch 0.2s ease-in-out;
        }
        
        .pixel-dot {
          transition: all 0.15s ease;
        }
        
        .pixel-dot.active {
          background: #22d3ee;
          box-shadow: 0 0 10px #22d3ee, 0 0 20px rgba(34, 211, 238, 0.5);
        }
        
        .input-glow:focus {
          border-color: #22d3ee !important;
          box-shadow: 0 0 12px rgba(34, 211, 238, 0.3), inset 0 0 8px rgba(34, 211, 238, 0.05);
          outline: none;
        }
        
        .btn-glow {
          animation: pulseGlow 2s ease-in-out infinite;
        }
        
        .btn-glow:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 0 30px rgba(34, 211, 238, 0.6);
        }
        
        .btn-glow:disabled {
          opacity: 0.5;
          animation: none;
        }
        
        .scan-line {
          position: absolute;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, transparent, #22d3ee, #10b981, #22d3ee, transparent);
          animation: scanLine 1.5s ease-in-out forwards;
        }
      `}</style>
      
      <div className="wizard-bg-pattern" />
      <div className="wizard-african-pattern" />
      
      <div className={`wizard-card ${glitch ? 'glitch-effect' : ''}`} style={{
        width: '100%',
        maxWidth: '520px',
        background: 'rgba(15, 23, 42, 0.7)',
        backdropFilter: 'blur(12px)',
        borderRadius: '16px',
        border: '1px solid rgba(34, 211, 238, 0.2)',
        boxShadow: '0 0 40px rgba(34, 211, 238, 0.1), inset 0 0 60px rgba(34, 211, 238, 0.02)',
        overflow: 'hidden',
        position: 'relative'
      }}>
        <div style={{ padding: '36px 36px 28px' }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '36px'
          }}>
            <div style={{ display: 'flex', gap: '3px' }}>
              {progressPixels.map((active, i) => (
                <div 
                  key={i}
                  className={`pixel-dot ${active ? 'active' : ''}`}
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '2px',
                    background: active ? '#22d3ee' : 'rgba(34, 211, 238, 0.2)',
                    transition: 'all 0.2s ease'
                  }}
                />
              ))}
            </div>
            <div style={{
              fontSize: '11px',
              color: '#22d3ee',
              fontWeight: '600',
              letterSpacing: '0.1em',
              textTransform: 'uppercase'
            }}>
              {step}/3
            </div>
          </div>
          
          <div key={step} className="wizard-card">
            {step === 1 && (
              <div>
                <h2 style={{
                  fontSize: '24px',
                  fontWeight: '700',
                  color: '#f8fafc',
                  marginBottom: '4px',
                  letterSpacing: '-0.02em'
                }}>
                  <span style={{ color: '#22d3ee' }}>01</span> Architecture
                </h2>
                <p style={{
                  fontSize: '13px',
                  color: 'rgba(148, 163, 184, 0.8)',
                  marginBottom: '28px'
                }}>
                  Définissez le socle de votre startup
                </p>
                
                <div style={{ marginBottom: '18px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: 'var(--c-text3)',
                    marginBottom: '8px',
                    letterSpacing: '0.05em'
                  }}>
                    NOM DE L'ÉQUIPE
                  </label>
                  <input
                    ref={firstInputRef}
                    type="text"
                    value={form.teamName}
                    onChange={e => setForm({ ...form, teamName: e.target.value })}
                    placeholder="GlowUp Tech"
                    className="input-glow"
                    style={{
                      width: '100%',
                      padding: '14px 16px',
                      borderRadius: '8px',
                      border: '1px solid rgba(34, 211, 238, 0.2)',
                      fontSize: '15px',
                      color: '#f8fafc',
                      background: 'rgba(15, 23, 42, 0.5)',
                      transition: 'all 0.2s ease',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit'
                    }}
                  />
                </div>
                
                <div style={{ marginBottom: '18px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: 'var(--c-text3)',
                    marginBottom: '8px',
                    letterSpacing: '0.05em'
                  }}>
                    SECTEUR D'ACTIVITÉ
                  </label>
                  <select
                    value={form.sector}
                    onChange={e => setForm({ ...form, sector: e.target.value })}
                    className="input-glow"
                    style={{
                      width: '100%',
                      padding: '14px 16px',
                      borderRadius: '8px',
                      border: '1px solid rgba(34, 211, 238, 0.2)',
                      fontSize: '15px',
                      color: '#f8fafc',
                      background: 'rgba(15, 23, 42, 0.5)',
                      transition: 'all 0.2s ease',
                      boxSizing: 'border-box',
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%2322d3ee' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 14px center',
                      backgroundSize: '16px',
                      appearance: 'none',
                      paddingRight: '44px',
                      fontFamily: 'inherit'
                    }}
                  >
                    <option value="" style={{ background: 'var(--c-bg)' }}>Sélectionner</option>
                    {sectors.map(s => (
                      <option key={s} value={s} style={{ background: 'var(--c-bg)' }}>{s}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: 'var(--c-text3)',
                    marginBottom: '8px',
                    letterSpacing: '0.05em'
                  }}>
                    DEVISE
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {['XOF', 'XAF', 'USD'].map(c => (
                      <button
                        key={c}
                        onClick={() => setForm({ ...form, currency: c })}
                        style={{
                          flex: 1,
                          padding: '12px',
                          borderRadius: '8px',
                          border: form.currency === c ? '1px solid #22d3ee' : '1px solid rgba(34, 211, 238, 0.2)',
                          background: form.currency === c ? 'rgba(34, 211, 238, 0.15)' : 'rgba(15, 23, 42, 0.5)',
                          color: form.currency === c ? '#22d3ee' : 'var(--c-text3)',
                          fontWeight: '600',
                          fontSize: '13px',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          fontFamily: 'inherit',
                          boxShadow: form.currency === c ? '0 0 12px rgba(34, 211, 238, 0.3)' : 'none'
                        }}
                      >
                        {c === 'XOF' ? 'FCFA' : c === 'XAF' ? 'FCFA' : '$USD'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            
            {step === 2 && (
              <div>
                <h2 style={{
                  fontSize: '24px',
                  fontWeight: '700',
                  color: '#f8fafc',
                  marginBottom: '4px',
                  letterSpacing: '-0.02em'
                }}>
                  <span style={{ color: '#22d3ee' }}>02</span> Initialisation
                </h2>
                <p style={{
                  fontSize: '13px',
                  color: 'rgba(148, 163, 184, 0.8)',
                  marginBottom: '28px'
                }}>
                  Configurez votre premier node opérationnel
                </p>
                
                <div style={{ marginBottom: '18px' }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: 'var(--c-text3)',
                    marginBottom: '8px',
                    letterSpacing: '0.05em'
                  }}>
                    NOM DU PROJET
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                    </svg>
                  </label>
                  <input
                    ref={firstInputRef}
                    type="text"
                    value={form.projectName}
                    onChange={e => setForm({ ...form, projectName: e.target.value })}
                    placeholder="Développement MVP"
                    className="input-glow"
                    style={{
                      width: '100%',
                      padding: '14px 16px',
                      borderRadius: '8px',
                      border: '1px solid rgba(34, 211, 238, 0.2)',
                      fontSize: '15px',
                      color: '#f8fafc',
                      background: 'rgba(15, 23, 42, 0.5)',
                      transition: 'all 0.2s ease',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit'
                    }}
                  />
                </div>
                
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: 'var(--c-text3)',
                    marginBottom: '8px',
                    letterSpacing: '0.05em'
                  }}>
                    OBJECTIF CENTRAL
                  </label>
                  <textarea
                    value={form.projectDescription}
                    onChange={e => setForm({ ...form, projectDescription: e.target.value })}
                    placeholder="L'objectif principal de ce projet..."
                    rows={3}
                    className="input-glow"
                    style={{
                      width: '100%',
                      padding: '14px 16px',
                      borderRadius: '8px',
                      border: '1px solid rgba(34, 211, 238, 0.2)',
                      fontSize: '15px',
                      color: '#f8fafc',
                      background: 'rgba(15, 23, 42, 0.5)',
                      transition: 'all 0.2s ease',
                      boxSizing: 'border-box',
                      resize: 'vertical',
                      fontFamily: 'inherit'
                    }}
                  />
                </div>
                
                <div style={{
                  marginTop: '14px',
                  padding: '10px 12px',
                  background: 'rgba(245, 158, 11, 0.1)',
                  borderRadius: '6px',
                  borderLeft: '2px solid #f59e0b',
                  fontSize: '12px',
                  color: '#fbbf24',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                  </svg>
                  L'algorithme de scoring sera calibré sur ce projet.
                </div>
              </div>
            )}
            
            {step === 3 && (
              <div style={{ 
                textAlign: 'center', 
                paddingTop: '12px',
                paddingBottom: '8px',
                position: 'relative'
              }}>
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  pointerEvents: 'none'
                }}>
                  <div className="scan-line" />
                </div>
                
                <div style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '2px solid #10b981',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 24px',
                  boxShadow: '0 0 30px rgba(16, 185, 129, 0.3)',
                  animation: 'pulseGlow 2s ease-in-out infinite'
                }}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
                
                <h2 style={{
                  fontSize: '26px',
                  fontWeight: '700',
                  color: '#f8fafc',
                  marginBottom: '8px',
                  letterSpacing: '-0.02em'
                }}>
                  Système <span style={{ color: '#10b981' }}>TELEWORK</span>_initialisé
                </h2>
                
                <p style={{
                  fontSize: '14px',
                  color: 'rgba(148, 163, 184, 0.8)',
                  marginBottom: '0',
                  lineHeight: '1.6'
                }}>
                  Prêt pour le pilotage de vos opérations.
                </p>
              </div>
            )}
          </div>
        </div>
        
        <div style={{
          padding: '24px 36px',
          borderTop: '1px solid rgba(34, 211, 238, 0.1)',
          background: 'rgba(10, 15, 25, 0.5)'
        }}>
          {step === 1 && (
            <button
              onClick={handleStep1}
              disabled={!canProceedStep1}
              className="btn-glow"
              style={{
                width: '100%',
                padding: '14px 24px',
                borderRadius: '8px',
                border: 'none',
                background: 'linear-gradient(135deg, #22d3ee 0%, #0891b2 100%)',
                color: 'var(--c-bg)',
                fontSize: '14px',
                fontWeight: '700',
                cursor: canProceedStep1 ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s ease',
                letterSpacing: '0.05em',
                fontFamily: 'inherit'
              }}
            >
              CONTROLLER →
            </button>
          )}
          
          {step === 2 && (
            <button
              onClick={handleStep2}
              disabled={!canProceedStep2 || loading}
              className="btn-glow"
              style={{
                width: '100%',
                padding: '14px 24px',
                borderRadius: '8px',
                border: 'none',
                background: 'linear-gradient(135deg, #22d3ee 0%, #0891b2 100%)',
                color: 'var(--c-bg)',
                fontSize: '14px',
                fontWeight: '700',
                cursor: canProceedStep2 && !loading ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s ease',
                letterSpacing: '0.05em',
                fontFamily: 'inherit'
              }}
            >
              {loading ? 'INITIALISATION...' : 'INITIALISER →'}
            </button>
          )}
          
          {step === 3 && (
            <button
              onClick={handleLaunch}
              disabled={loading}
              className="btn-glow"
              style={{
                width: '100%',
                padding: '16px 24px',
                borderRadius: '8px',
                border: 'none',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#ffffff',
                fontSize: '15px',
                fontWeight: '700',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                letterSpacing: '0.05em',
                boxShadow: '0 0 20px rgba(16, 185, 129, 0.4)',
                fontFamily: 'inherit'
              }}
            >
              ENTRER DANS LE DASHBOARD
            </button>
          )}
        </div>
      </div>
    </div>
  );
}