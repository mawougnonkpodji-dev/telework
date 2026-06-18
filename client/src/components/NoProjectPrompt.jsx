export default function NoProjectPrompt({ onCreateProject }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '40px 24px',
      textAlign: 'center',
    }}>
      {/* Icône décorative */}
      <div style={{
        width: '72px',
        height: '72px',
        borderRadius: '20px',
        background: 'linear-gradient(135deg, rgba(34,211,238,0.15), rgba(34,211,238,0.05))',
        border: '1px solid rgba(34,211,238,0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '32px',
        marginBottom: '28px',
      }}>
        🗂️
      </div>

      <h2 style={{
        fontSize: '22px',
        fontWeight: '700',
        color: 'var(--c-text)',
        marginBottom: '10px',
        letterSpacing: '-0.02em',
      }}>
        Aucun projet pour le moment
      </h2>

      <p style={{
        fontSize: '14px',
        color: 'var(--c-text2)',
        maxWidth: '380px',
        lineHeight: '1.6',
        marginBottom: '36px',
      }}>
        Créez votre premier espace de travail pour commencer à collaborer,
        ou attendez qu'un collègue vous invite sur son projet.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', maxWidth: '300px' }}>
        <button
          onClick={onCreateProject}
          style={{
            padding: '13px 24px',
            background: 'linear-gradient(135deg, #22d3ee, #0891b2)',
            color: '#0a0a0a',
            border: 'none',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          + Créer un projet
        </button>

        <div style={{
          padding: '13px 24px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid var(--c-border)',
          borderRadius: '10px',
          fontSize: '13px',
          color: 'var(--c-text2)',
          lineHeight: '1.5',
        }}>
          Ou attendez l'invitation d'un collègue —<br />
          elle apparaîtra dans vos notifications.
        </div>
      </div>
    </div>
  );
}
