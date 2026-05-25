import { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function ProjectWizard({ onComplete, onCancel }) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    icon: '📁',
    color: '#22d3ee',
    members: []
  });
  const [teamMembers, setTeamMembers] = useState([]);
  const [error, setError] = useState('');

  const colors = [
    '#22d3ee', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', 
    '#ec4899', '#f97316', '#14b8a6', '#6366f1', '#84cc16'
  ];

  const icons = [
    '📁', '🚀', '💼', '🎯', '🔧', '📊', '💡', '📈', '⚡', '🏆',
    '🔍', '📝', '💻', '🌐', '📦', '🔐', '🤝', '📅', '📋', '✨'
  ];

  useEffect(() => {
    // Fetch team members
    const fetchMembers = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        const res = await fetch(`${API_URL}/api/auth/me`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const currentUser = await res.json();
          setTeamMembers([currentUser]);
        }
      } catch (e) {
        console.log('Error fetching members');
      }
    };
    fetchMembers();
  }, []);

const handleSubmit = () => {
     if (!formData.name.trim()) {
       setError('Veuillez entrer un nom de projet');
       return;
     }
     onComplete({
       name: formData.name,
       description: `Projet ${formData.name}`,
       color_theme: formData.color,
       icon: formData.icon,
       member_ids: formData.members
     });
   };

  const toggleMember = (memberId) => {
    setFormData(prev => ({
      ...prev,
      members: prev.members.includes(memberId)
        ? prev.members.filter(id => id !== memberId)
        : [...prev.members, memberId]
    }));
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div style={{ animation: 'fadeIn 0.3s ease' }}>
            <h3 style={{ color: 'var(--c-text)', fontSize: '20px', fontWeight: '700', marginBottom: '8px' }}>
              Étape 1 : Identité du projet
            </h3>
            <p style={{ color: 'var(--c-text4)', fontSize: '13px', marginBottom: '24px' }}>
              Donnez une identité unique à votre nouvel espace de travail
            </p>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', color: 'var(--c-text3)', fontSize: '12px', fontWeight: '600', marginBottom: '8px' }}>
                Nom du projet *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="ex: Drip Society"
                style={{
                  width: '100%', padding: '14px 16px', borderRadius: '12px',
                  border: '1px solid var(--c-border2)', background: 'rgba(15,23,42,0.6)',
                  color: 'var(--c-text)', fontSize: '14px', outline: 'none',
                  transition: 'border-color 0.2s'
                }}
                onFocus={e => e.target.style.borderColor = '#22d3ee'}
                onBlur={e => e.target.style.borderColor = 'var(--c-border2)'}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', color: 'var(--c-text3)', fontSize: '12px', fontWeight: '600', marginBottom: '12px' }}>
                Icône représentative
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {icons.map(icon => (
                  <button
                    key={icon}
                    onClick={() => setFormData({ ...formData, icon })}
                    style={{
                      width: '40px', height: '40px', borderRadius: '10px',
                      background: formData.icon === icon ? 'rgba(34,211,238,0.2)' : 'rgba(255,255,255,0.05)',
                      border: `2px solid ${formData.icon === icon ? '#22d3ee' : 'rgba(148,163,184,0.15)'}`,
                      color: 'var(--c-text)', fontSize: '18px', cursor: 'pointer',
                      transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', color: 'var(--c-text3)', fontSize: '12px', fontWeight: '600', marginBottom: '12px' }}>
                Clé générée
              </label>
              <div style={{
                display: 'inline-flex', padding: '8px 16px', borderRadius: '8px',
                background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.2)',
                color: '#22d3ee', fontSize: '14px', fontWeight: '700', fontFamily: 'monospace'
              }}>
                {(formData.name.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 3) || 'PRJ').padEnd(3, 'X')}
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div style={{ animation: 'fadeIn 0.3s ease' }}>
            <h3 style={{ color: 'var(--c-text)', fontSize: '20px', fontWeight: '700', marginBottom: '8px' }}>
              Étape 2 : Branding
            </h3>
            <p style={{ color: 'var(--c-text4)', fontSize: '13px', marginBottom: '24px' }}>
              Choisissez la couleur thématique du projet
            </p>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', color: 'var(--c-text3)', fontSize: '12px', fontWeight: '600', marginBottom: '12px' }}>
                Couleur thématique
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {colors.map(color => (
                  <button
                    key={color}
                    onClick={() => setFormData({ ...formData, color })}
                    style={{
                      width: '36px', height: '36px', borderRadius: '50%',
                      background: color,
                      border: formData.color === color ? '3px solid #fff' : '2px solid rgba(255,255,255,0.3)',
                      cursor: 'pointer', transition: 'transform 0.2s',
                      transform: formData.color === color ? 'scale(1.15)' : 'scale(1)'
                    }}
                  />
                ))}
              </div>
            </div>

            <div style={{
              padding: '20px', borderRadius: '16px',
              background: `linear-gradient(135deg, ${formData.color}20, ${formData.color}08)`,
              border: `1px solid ${formData.color}40`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '48px', height: '48px', borderRadius: '12px',
                  background: `linear-gradient(135deg, ${formData.color}, ${formData.color}dd)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px'
                }}>
                  {formData.icon}
                </div>
                <div>
                  <div style={{ color: 'var(--c-text)', fontSize: '16px', fontWeight: '700' }}>
                    {formData.name || 'Nom du projet'}
                  </div>
                  <div style={{ color: formData.color, fontSize: '12px', fontWeight: '600' }}>
                    {(formData.name.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 3) || 'PRJ').padEnd(3, 'X')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div style={{ animation: 'fadeIn 0.3s ease' }}>
            <h3 style={{ color: 'var(--c-text)', fontSize: '20px', fontWeight: '700', marginBottom: '8px' }}>
              Étape 3 : Membres initiaux
            </h3>
            <p style={{ color: 'var(--c-text4)', fontSize: '13px', marginBottom: '24px' }}>
              Sélectionnez les collaborateurs ayant accès à ce projet
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {teamMembers.map(member => (
                <button
                  key={member.id}
                  onClick={() => toggleMember(member.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
                    borderRadius: '12px', border: '1px solid rgba(148,163,184,0.15)',
                    background: formData.members.includes(member.id)
                      ? 'rgba(34,211,238,0.15)'
                      : 'rgba(255,255,255,0.03)',
                    color: 'var(--c-text)', cursor: 'pointer', transition: 'all 0.2s',
                    textAlign: 'left', width: '100%'
                  }}
                >
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '50%',
                    background: `linear-gradient(135deg, ${formData.color}, ${formData.color}aa)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '14px', fontWeight: '700', color: 'var(--c-bg)'
                  }}>
                    {(member.nom || member.name || 'U')[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ color: 'var(--c-text)', fontSize: '14px', fontWeight: '600' }}>
                      {member.nom || member.name}
                    </div>
                    <div style={{ color: 'var(--c-text4)', fontSize: '12px' }}>
                      {member.email}
                    </div>
                  </div>
                  {formData.members.includes(member.id) && (
                    <div style={{
                      width: '20px', height: '20px', borderRadius: '50%',
                      background: '#22d3ee', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: '12px', color: 'var(--c-bg)', fontWeight: '700'
                    }}>
                      ✓
                    </div>
                  )}
                </button>
              ))}
            </div>

            {teamMembers.length === 0 && (
              <div style={{
                padding: '24px', textAlign: 'center', color: 'var(--c-text4)',
                background: 'rgba(255,255,255,0.03)', borderRadius: '12px'
              }}>
                Aucun membre disponible dans l'équipe
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 10000, backdropFilter: 'blur(12px)'
    }} onClick={onCancel}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'linear-gradient(145deg, rgba(15,23,42,0.98), rgba(30,41,59,0.98))',
          borderRadius: '24px', padding: '32px', width: '90%', maxWidth: '520px',
          border: '1px solid rgba(148,163,184,0.15)',
          boxShadow: '0 25px 50px rgba(0,0,0,0.5)'
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '16px',
            background: `linear-gradient(135deg, ${formData.color}, ${formData.color}88)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '24px', margin: '0 auto 16px'
          }}>
            {formData.icon}
          </div>
          <h2 style={{ color: 'var(--c-text)', fontSize: '24px', fontWeight: '800' }}>
            Créer un nouveau projet
          </h2>
          <p style={{ color: 'var(--c-text4)', fontSize: '14px', marginTop: '4px' }}>
            {step}/3 - Configuration étape par étape
          </p>
        </div>

        {/* Progress bar */}
        <div style={{
          height: '4px', background: 'rgba(255,255,255,0.1)',
          borderRadius: '2px', marginBottom: '28px', overflow: 'hidden'
        }}>
          <div style={{
            height: '100%', background: `linear-gradient(90deg, ${formData.color}, ${formData.color}aa)`,
            width: `${(step / 3) * 100}%`, transition: 'width 0.3s ease'
          }} />
        </div>

        {error && (
          <div style={{
            padding: '12px 16px', background: 'rgba(239,68,68,0.15)',
            borderRadius: '10px', marginBottom: '16px', border: '1px solid rgba(239,68,68,0.3)',
            color: '#fecaca', fontSize: '13px'
          }}>
            {error}
          </div>
        )}

        {renderStep()}

        <div style={{ display: 'flex', gap: '12px', marginTop: '32px' }}>
          {step > 1 && (
            <button
              onClick={() => setStep(s => s - 1)}
              style={{
                flex: 1, padding: '14px 24px', borderRadius: '12px',
                border: '1px solid var(--c-border2)',
                background: 'rgba(255,255,255,0.05)', color: 'var(--c-text3)',
                fontSize: '14px', fontWeight: '600', cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              ← Précédent
            </button>
          )}
          {step < 3 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              style={{
                flex: 1, padding: '14px 24px', borderRadius: '12px',
                border: 'none', background: `linear-gradient(135deg, ${formData.color}, ${formData.color}dd)`,
                color: 'var(--c-bg)', fontSize: '14px', fontWeight: '700', cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              Suivant →
            </button>
          ) : (
             <button
              onClick={handleSubmit}
              style={{
                flex: 1, padding: '14px 24px', borderRadius: '12px',
                border: 'none',
                background: `linear-gradient(135deg, ${formData.color}, ${formData.color}dd)`,
                color: 'var(--c-bg)', fontSize: '14px', fontWeight: '700', cursor: 'pointer',
                transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
              }}
            >
              <>Créer le projet ✨</>
            </button>
          )}
        </div>

        <button
          onClick={onCancel}
          style={{
            position: 'absolute', top: '20px', right: '20px',
            background: 'none', border: 'none', color: 'var(--c-text4)',
            fontSize: '20px', cursor: 'pointer', padding: '8px',
            borderRadius: '8px', transition: 'all 0.2s'
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}