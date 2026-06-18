import { useState } from 'react';

export default function ProjectWizard({ onComplete, onCancel }) {
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    icon: '📁',
    color: '#22d3ee',
  });

  const colors = [
    '#22d3ee', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#ec4899', '#f97316', '#14b8a6', '#6366f1', '#84cc16'
  ];

  const icons = [
    '📁', '🚀', '💼', '🎯', '🔧', '📊', '💡', '📈', '⚡', '🏆',
    '🔍', '📝', '💻', '🌐', '📦', '🔐', '🤝', '📅', '📋', '✨'
  ];

  const slug = (formData.name.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 3) || 'PRJ').padEnd(3, 'X');

  const handleNext = () => {
    if (!formData.name.trim()) {
      setError('Veuillez entrer un nom de projet');
      return;
    }
    setError('');
    setStep(2);
  };

  const handleSubmit = () => {
    onComplete({
      name: formData.name,
      description: `Projet ${formData.name}`,
      color_theme: formData.color,
      icon: formData.icon,
      member_ids: [],
    });
  };

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 10000, backdropFilter: 'blur(12px)',
        padding: '24px',
      }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative',
          background: 'linear-gradient(145deg, rgba(15,23,42,0.98), rgba(30,41,59,0.98))',
          borderRadius: '24px', padding: '32px',
          width: '100%', maxWidth: '480px',
          maxHeight: '90vh', overflowY: 'auto',
          border: '1px solid rgba(148,163,184,0.15)',
          boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
        }}
      >
        {/* En-tête */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '16px',
            background: `linear-gradient(135deg, ${formData.color}, ${formData.color}88)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '24px', margin: '0 auto 16px'
          }}>
            {formData.icon}
          </div>
          <h2 style={{ color: 'var(--c-text)', fontSize: '22px', fontWeight: '800', margin: 0 }}>
            Créer un projet
          </h2>
          <p style={{ color: 'var(--c-text4)', fontSize: '13px', marginTop: '4px' }}>
            Étape {step}/2
          </p>
        </div>

        {/* Barre de progression */}
        <div style={{
          height: '4px', background: 'rgba(255,255,255,0.1)',
          borderRadius: '2px', marginBottom: '28px', overflow: 'hidden'
        }}>
          <div style={{
            height: '100%',
            background: `linear-gradient(90deg, ${formData.color}, ${formData.color}aa)`,
            width: step === 1 ? '50%' : '100%',
            transition: 'width 0.3s ease'
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

        {/* Étape 1 : Identité */}
        {step === 1 && (
          <div style={{ animation: 'fadeIn 0.3s ease' }}>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', color: 'var(--c-text3)', fontSize: '12px', fontWeight: '600', marginBottom: '8px' }}>
                Nom du projet *
              </label>
              <input
                autoFocus
                type="text"
                value={formData.name}
                onChange={e => { setFormData({ ...formData, name: e.target.value }); setError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleNext()}
                placeholder="ex: Drip Society"
                style={{
                  width: '100%', padding: '13px 16px', borderRadius: '12px',
                  border: '1px solid var(--c-border2)', background: 'rgba(15,23,42,0.6)',
                  color: 'var(--c-text)', fontSize: '14px', outline: 'none',
                  transition: 'border-color 0.2s', boxSizing: 'border-box'
                }}
                onFocus={e => e.target.style.borderColor = '#22d3ee'}
                onBlur={e => e.target.style.borderColor = 'var(--c-border2)'}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', color: 'var(--c-text3)', fontSize: '12px', fontWeight: '600', marginBottom: '12px' }}>
                Icône
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
                      fontSize: '18px', cursor: 'pointer', transition: 'all 0.2s',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', color: 'var(--c-text3)', fontSize: '12px', fontWeight: '600', marginBottom: '8px' }}>
                Clé générée
              </label>
              <div style={{
                display: 'inline-flex', padding: '7px 14px', borderRadius: '8px',
                background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.2)',
                color: '#22d3ee', fontSize: '13px', fontWeight: '700', fontFamily: 'monospace'
              }}>
                {slug}
              </div>
            </div>
          </div>
        )}

        {/* Étape 2 : Branding */}
        {step === 2 && (
          <div style={{ animation: 'fadeIn 0.3s ease' }}>
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

            {/* Aperçu */}
            <div style={{
              padding: '18px', borderRadius: '14px',
              background: `linear-gradient(135deg, ${formData.color}20, ${formData.color}08)`,
              border: `1px solid ${formData.color}40`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '46px', height: '46px', borderRadius: '12px',
                  background: `linear-gradient(135deg, ${formData.color}, ${formData.color}dd)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px'
                }}>
                  {formData.icon}
                </div>
                <div>
                  <div style={{ color: 'var(--c-text)', fontSize: '15px', fontWeight: '700' }}>
                    {formData.name}
                  </div>
                  <div style={{ color: formData.color, fontSize: '11px', fontWeight: '600', fontFamily: 'monospace' }}>
                    {slug}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '28px' }}>
          {step === 2 && (
            <button
              onClick={() => setStep(1)}
              style={{
                flex: 1, padding: '13px 24px', borderRadius: '12px',
                border: '1px solid var(--c-border2)',
                background: 'rgba(255,255,255,0.05)', color: 'var(--c-text3)',
                fontSize: '14px', fontWeight: '600', cursor: 'pointer'
              }}
            >
              ← Précédent
            </button>
          )}
          {step === 1 ? (
            <button
              onClick={handleNext}
              style={{
                flex: 1, padding: '13px 24px', borderRadius: '12px',
                border: 'none',
                background: `linear-gradient(135deg, ${formData.color}, ${formData.color}dd)`,
                color: 'var(--c-bg)', fontSize: '14px', fontWeight: '700', cursor: 'pointer'
              }}
            >
              Suivant →
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              style={{
                flex: 1, padding: '13px 24px', borderRadius: '12px',
                border: 'none',
                background: `linear-gradient(135deg, ${formData.color}, ${formData.color}dd)`,
                color: 'var(--c-bg)', fontSize: '14px', fontWeight: '700', cursor: 'pointer'
              }}
            >
              Créer le projet ✨
            </button>
          )}
        </div>

        {/* Fermer */}
        <button
          onClick={onCancel}
          style={{
            position: 'absolute', top: '18px', right: '18px',
            background: 'none', border: 'none', color: 'var(--c-text4)',
            fontSize: '20px', cursor: 'pointer', padding: '6px',
            borderRadius: '8px', lineHeight: 1
          }}
        >
          ✕
        </button>
      </div>

      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }`}</style>
    </div>
  );
}
