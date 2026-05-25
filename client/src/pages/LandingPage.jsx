import { useState, useEffect, useRef } from 'react';
import { 
  LayoutGrid, 
  Zap, 
  Smartphone, 
  Sparkles,
  Users,
  Hexagon,
  ArrowRight,
  ChevronDown
} from 'lucide-react';

export default function LandingPage({ onLogin }) {
  const [teamName, setTeamName] = useState('');
  const [userName, setUserName] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleStart = async () => {
    window.location.href = '/auth';
  };

  const features = [
    {
      icon: <LayoutGrid size={28} />,
      title: 'Kanban Offline',
      description: 'Gestion de projets locale sans connexion internet. Synchronisation automatique dès la reconnexion.',
      color: 'cyan'
    },
    {
      icon: <Zap size={28} />,
      title: 'IA Assistant',
      description: 'Assistant intelligent qui automatise les tâches répétitives et suggère des optimisations en temps réel.',
      color: 'violet'
    },
    {
      icon: <Smartphone size={28} />,
      title: 'Mobile Money',
      description: 'Intégration transparente avec les principaux services de paiement mobile africains.',
      color: 'amber'
    }
  ];

  const isScrolled = scrollY > 50;

  return (
    <div className="landing-page">
      {/* Grid Lines Background - Parallax */}
      <div 
        className="grid-lines"
        style={{ transform: `translateY(${scrollY * 0.3}px)` }}
      />

      {/* Ambient Glows */}
      <div className="glow-cyan" style={{ transform: `translateY(${scrollY * -0.1}px)` }} />
      <div className="glow-violet" style={{ transform: `translateY(${scrollY * -0.2}px)` }} />
      <div className="glow-amber" />

      {/* Header Flottant avec backdrop-blur */}
      <header className={`header transition-all duration-500 ${isScrolled ? 'scrolled' : ''}`}>
        <nav className="nav-left">
          <a href="#features" className="hover:text-cyan-400 transition-all duration-300">Fonctionnalités</a>
          <a href="#pricing" className="hover:text-cyan-400 transition-all duration-300">Tarifs</a>
        </nav>
        
        <div className="logo">
          <div className="logo-icon-wrapper">
            <Hexagon className="logo-icon" />
          </div>
          <span className="logo-text">TELEWORK</span>
        </div>
        
        <nav className="nav-right">
          <a href="#contact" className="hover:text-cyan-400 transition-all duration-300">Contact</a>
          <button className="cta-btn" onClick={() => window.location.href = '/auth'}>
            Commencer
          </button>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-badge">
          <Sparkles size={14} />
          <span>Plateforme collaborative nouvelle génération</span>
        </div>
        
        <h1 className="hero-title">
          <span className="gradient-text animate-gradient">L'avenir de la gestion</span>
          <br />
          <span className="text-white">de projet en Afrique</span>
        </h1>
        
        <p className="hero-subtitle">
          TELEWORK combine puissance de l'IA, Mode Offline et Mobile Money pour transformer la productivité des équipes africaines.
        </p>

        <button className="hero-cta group" onClick={() => window.location.href = '/auth'}>
          <span className="flex items-center gap-3">
            Démarrer l'aventure
            <ArrowRight size={20} className="transition-transform duration-300 group-hover:translate-x-1" />
          </span>
        </button>

        <div className="stats-grid">
          {[
            { label: 'Utilisateurs', value: '10K+' },
            { label: 'Projets', value: '500+' },
            { label: 'Équipes', value: '50+' }
          ].map((stat, i) => (
            <div key={i} className="stat-item">
              <div className="stat-value">{stat.value}</div>
              <div className="stat-label">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="scroll-indicator animate-bounce">
          <span>Découvrir</span>
          <ChevronDown size={20} />
        </div>
      </section>

      {/* Features Section */}
      <section className="features-section" id="features">
        <div className="features-title">
          <h2 className="gradient-text animate-gradient">Fonctionnalités</h2>
          <p>Des outils pensés pour le continent africain</p>
        </div>
        
        <div className="features-grid">
          {features.map((feature, index) => (
            <div
              key={index}
              className={`feature-card feature-${feature.color} transition-all duration-500 ease-out`}
            >
              <div className={`card-icon card-icon-${feature.color} transition-all duration-500`}>
                {feature.icon}
              </div>
              
              <div className="card-content">
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </div>
              
              <div className={`card-glow card-glow-${feature.color}`} />
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="cta-section">
        <div className="cta-card">
          <div className={`cta-line cta-line-gradient`} />
          <h2>Prêt à transformer votre productivité?</h2>
          <p>Rejoignez les milliers d'équipes qui font confiance à TELEWORK</p>
          <button className="main-cta" onClick={() => window.location.href = '/auth'}>
            <Zap size={20} />
            <span>Essai gratuit - Pas de carte requise</span>
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-content">
          <div className="footer-logo">
            <Hexagon size={24} />
            <span>TELEWORK</span>
          </div>
          <p>© 2024 TELEWORK. Tous droits réservés.</p>
        </div>
      </footer>

      {/* Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <Hexagon size={32} />
              <h2>Rejoindre TELEWORK</h2>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label>Votre nom</label>
                <input
                  type="text"
                  placeholder="Ex: Cris"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                />
              </div>
              
              <div className="form-group">
                <label>Nom de l'équipe</label>
                <input
                  type="text"
                  placeholder="Ex: Alpha Team"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                />
              </div>

              <button 
                className="submit-btn"
                onClick={handleStart}
                disabled={!teamName.trim() || !userName.trim()}
              >
                <Users size={18} />
                <span>Créer et démarrer</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .landing-page {
          min-height: 100vh;
          background: #020617;
          position: relative;
          overflow-x: hidden;
        }

        /* Grid Lines - Parallax */
        .grid-lines {
          position: fixed;
          inset: 0;
          pointer-events: none;
          background-image: 
            linear-gradient(to right, rgba(6,182,212,0.06) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(6,182,212,0.06) 1px, transparent 1px);
          background-size: 60px 60px;
          animation: gridMove 20s linear infinite;
          z-index: 0;
        }

        @keyframes gridMove {
          0% { transform: translateY(0); }
          100% { transform: translateY(60px); }
        }

        /* Ambient Glows */
        .glow-cyan {
          position: fixed;
          top: 15%;
          left: 5%;
          width: 500px;
          height: 500px;
          background: radial-gradient(circle, rgba(6,182,212,0.12) 0%, transparent 70%);
          border-radius: 50%;
          pointer-events: none;
          z-index: 0;
          animation: floatGlow 6s ease-in-out infinite;
        }

        .glow-violet {
          position: fixed;
          top: 40%;
          right: 10%;
          width: 400px;
          height: 400px;
          background: radial-gradient(circle, rgba(168,85,247,0.1) 0%, transparent 70%);
          border-radius: 50%;
          pointer-events: none;
          z-index: 0;
          animation: floatGlow 6s ease-in-out infinite 2s;
        }

        .glow-amber {
          position: fixed;
          bottom: 20%;
          left: 30%;
          width: 300px;
          height: 300px;
          background: radial-gradient(circle, rgba(251,191,36,0.08) 0%, transparent 70%);
          border-radius: 50%;
          pointer-events: none;
          z-index: 0;
          animation: floatGlow 6s ease-in-out infinite 4s;
        }

        @keyframes floatGlow {
          0%, 100% { opacity: 0.5; transform: translateY(0); }
          50% { opacity: 1; transform: translateY(-20px); }
        }

        /* Header */
        .header {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 24px 64px;
          z-index: 100;
          background: transparent;
        }

        .header.scrolled {
          background: rgba(2, 6, 23, 0.8);
          backdrop-blur-xl;
          border-bottom: 1px solid rgba(255,255,255,0.1);
          padding: 16px 64px;
        }

        .nav-left, .nav-right {
          display: flex;
          align-items: center;
          gap: 40px;
          flex: 1;
        }

        .nav-right { justify-content: flex-end; }

        .nav-left a, .nav-right a {
          color: #94a3b8;
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
        }

        .logo {
          display: flex;
          align-items: center;
          gap: 12px;
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
        }

        .logo-icon-wrapper {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: linear-gradient(135deg, #22d3ee, #a855f7);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 20px rgba(6,182,212,0.4);
        }

        .logo-icon { color: white; }

        .logo-text {
          font-size: 24px;
          font-weight: 800;
          letter-spacing: 4px;
          background: linear-gradient(90deg, #22d3ee, #a855f7, #fbbf24);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: gradientShift 3s linear infinite;
        }

        .cta-btn {
          padding: 10px 20px;
          background: linear-gradient(135deg, #06b6d4, #8b5cf6);
          border: none;
          border-radius: 8px;
          color: white;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
        }

        .cta-btn:hover {
          box-shadow: 0 0 25px rgba(6,182,212,0.5);
          transform: scale(1.05);
        }

        /* Gradient Animation */
        @keyframes gradientShift {
          0% { background-position: 0% center; }
          100% { background-position: 200% center; }
        }

        .animate-gradient {
          animation: gradientShift 3s linear infinite;
          background-size: 200% auto;
        }

        .gradient-text {
          background: linear-gradient(90deg, #22d3ee, #a855f7, #fbbf24);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        /* Hero */
        .hero {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 120px 24px;
          text-align: center;
          position: relative;
          z-index: 10;
        }

        .hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          background: rgba(6, 182, 212, 0.08);
          border: 1px solid rgba(6, 182, 212, 0.2);
          border-radius: 100px;
          color: #22d3ee;
          font-size: 12px;
          letter-spacing: 1px;
          margin-bottom: 32px;
        }

        .hero-title {
          font-size: clamp(48px, 8vw, 96px);
          font-weight: 900;
          letter-spacing: 2px;
          margin-bottom: 24px;
          line-height: 1.1;
        }

        .hero-subtitle {
          font-size: 18px;
          color: #64748b;
          max-width: 600px;
          margin-bottom: 40px;
          line-height: 1.6;
        }

        /* CTA Button with Glow Pulse */
        .hero-cta {
          padding: 20px 40px;
          background: linear-gradient(135deg, #06b6d4, #8b5cf6);
          border: none;
          border-radius: 14px;
          color: white;
          font-size: 20px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s;
          animation: pulseGlow 2.5s ease-in-out infinite;
        }

        .hero-cta:hover {
          transform: scale(1.05);
          box-shadow: 0 0 40px rgba(6,182,212,0.6);
        }

        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 25px rgba(6,182,212,0.3); }
          50% { box-shadow: 0 0 50px rgba(6,182,212,0.6); }
        }

        .stats-grid {
          display: flex;
          gap: 48px;
          margin-top: 64px;
        }

        .stat-item { text-align: center; }

        .stat-value {
          font-size: 32px;
          font-weight: 700;
          color: white;
        }

        .stat-label {
          font-size: 14px;
          color: #64748b;
          margin-top: 4px;
        }

        .scroll-indicator {
          position: absolute;
          bottom: 60px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          color: #475569;
          font-size: 12px;
          letter-spacing: 1px;
        }

        /* Features Section */
        .features-section {
          min-height: 100vh;
          padding: 100px 24px;
          position: relative;
          z-index: 10;
        }

        .features-title {
          text-align: center;
          margin-bottom: 64px;
        }

        .features-title h2 {
          font-size: clamp(40px, 6vw, 64px);
          font-weight: 800;
          margin-bottom: 16px;
        }

        .features-title p {
          font-size: 20px;
          color: #64748b;
        }

        .features-grid {
          max-width: 1100px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 24px;
        }

        /* Feature Cards with Hover Effects */
        .feature-card {
          position: relative;
          padding: 32px;
          background: rgba(15, 23, 42, 0.5);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px;
          transition: all 0.5s ease-out;
          overflow: hidden;
        }

        .feature-card:hover {
          transform: scale(1.05);
        }

        /* Cyan Card */
        .feature-cyan { border-color: rgba(34, 211, 238, 0.2); }
        .feature-cyan:hover {
          border-color: rgba(34, 211, 238, 0.8);
          box-shadow: 0 0 40px rgba(34, 211, 238, 0.3);
        }
        .card-icon-cyan {
          background: rgba(6, 182, 212, 0.1);
          color: #22d3ee;
        }
        .feature-cyan:hover .card-icon-cyan {
          box-shadow: 0 0 25px rgba(34, 211, 238, 0.4);
        }
        .card-glow-cyan { background: linear-gradient(90deg, #22d3ee, #06b6d4); }

        /* Violet Card */
        .feature-violet { border-color: rgba(168, 85, 247, 0.2); }
        .feature-violet:hover {
          border-color: rgba(168, 85, 247, 0.8);
          box-shadow: 0 0 40px rgba(168, 85, 247, 0.3);
        }
        .card-icon-violet {
          background: rgba(168, 85, 247, 0.1);
          color: #a855f7;
        }
        .feature-violet:hover .card-icon-violet {
          box-shadow: 0 0 25px rgba(168, 85, 247, 0.4);
        }
        .card-glow-violet { background: linear-gradient(90deg, #a855f7, #8b5cf6); }

        /* Amber Card */
        .feature-amber { border-color: rgba(251, 191, 36, 0.2); }
        .feature-amber:hover {
          border-color: rgba(251, 191, 36, 0.8);
          box-shadow: 0 0 40px rgba(251, 191, 36, 0.3);
        }
        .card-icon-amber {
          background: rgba(251, 191, 36, 0.1);
          color: #fbbf24;
        }
        .feature-amber:hover .card-icon-amber {
          box-shadow: 0 0 25px rgba(251, 191, 36, 0.4);
        }
        .card-glow-amber { background: linear-gradient(90deg, #fbbf24, #f59e0b); }

        .feature-card .card-icon {
          width: 56px;
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 14px;
          margin-bottom: 20px;
          transition: all 0.5s ease-out;
        }

        .feature-card:hover .card-icon {
          transform: scale(1.15) rotate(5deg);
        }

        .card-content h3 {
          font-size: 28px;
          font-weight: 700;
          color: white;
          margin-bottom: 12px;
        }

        .card-content p {
          font-size: 16px;
          color: #64748b;
          line-height: 1.6;
        }

        .card-glow {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 3px;
          transform: scaleX(0);
          transition: transform 0.5s ease-out;
        }

        .feature-card:hover .card-glow {
          transform: scaleX(1);
        }

        /* CTA Section */
        .cta-section {
          padding: 80px 24px;
          position: relative;
          z-index: 10;
        }

        .cta-card {
          max-width: 700px;
          margin: 0 auto;
          background: linear-gradient(180deg, rgba(15, 23, 42, 0.8), rgba(15, 23, 42, 0.6));
          border: 1px solid rgba(34, 211, 238, 0.2);
          border-radius: 24px;
          padding: 64px;
          text-align: center;
          position: relative;
          overflow: hidden;
        }

        .cta-line {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
        }

        .cta-line-gradient {
          background: linear-gradient(90deg, #22d3ee, #a855f7, #fbbf24);
        }

        .cta-card h2 {
          font-size: clamp(24px, 4vw, 36px);
          font-weight: 700;
          color: white;
          margin-bottom: 16px;
        }

        .cta-card p {
          font-size: 16px;
          color: #64748b;
          margin-bottom: 32px;
        }

        .main-cta {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          padding: 16px 32px;
          background: linear-gradient(135deg, #06b6d4, #8b5cf6);
          border: none;
          border-radius: 12px;
          color: white;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
        }

        .main-cta:hover {
          transform: scale(1.05);
          box-shadow: 0 0 30px rgba(6,182,212,0.5);
        }

        /* Footer */
        .footer {
          padding: 40px 24px;
          border-top: 1px solid rgba(255,255,255,0.05);
          position: relative;
          z-index: 10;
        }

        .footer-content {
          max-width: 1100px;
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .footer-logo {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #64748b;
        }

        .footer-logo span {
          font-size: 16px;
          font-weight: 600;
          letter-spacing: 2px;
        }

        .footer p {
          color: #475569;
          font-size: 14px;
        }

        /* Modal */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.9);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 200;
          padding: 24px;
        }

        .modal {
          background: linear-gradient(180deg, #0f172a, #020617);
          border: 1px solid rgba(34, 211, 238, 0.2);
          border-radius: 20px;
          padding: 48px;
          width: 100%;
          max-width: 420px;
        }

        .modal-header {
          text-align: center;
          margin-bottom: 32px;
          color: #22d3ee;
        }

        .modal-header h2 {
          font-size: 24px;
          font-weight: 700;
          margin-top: 16px;
          color: white;
          letter-spacing: 2px;
        }

        .form-group { margin-bottom: 20px; }

        .form-group label {
          display: block;
          font-size: 12px;
          color: #64748b;
          margin-bottom: 8px;
          letter-spacing: 0.5px;
        }

        .form-group input {
          width: 100%;
          padding: 14px 18px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          color: white;
          font-size: 14px;
          outline: none;
          transition: all 0.3s;
        }

        .form-group input:focus {
          border-color: rgba(6, 182, 212, 0.5);
          box-shadow: 0 0 15px rgba(6, 182, 212, 0.15);
        }

        .submit-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 16px;
          background: linear-gradient(135deg, #06b6d4, #8b5cf6);
          border: none;
          border-radius: 10px;
          color: white;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
          margin-top: 16px;
        }

        .submit-btn:hover:not(:disabled) {
          box-shadow: 0 0 20px rgba(6, 182, 212, 0.4);
        }

        .submit-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        @media (max-width: 768px) {
          .header { padding: 16px 24px; }
          .nav-left, .nav-right { display: none; }
          .logo { position: static; transform: none; }
          .stats-grid { gap: 24px; }
          .features-grid { grid-template-columns: 1fr; }
          .footer-content { flex-direction: column; gap: 16px; text-align: center; }
        }
      `}</style>
    </div>
  );
}