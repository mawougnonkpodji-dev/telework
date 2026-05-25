import { useState, useEffect, useRef } from 'react';
import { 
  LayoutGrid, 
  MessageSquare, 
  Wifi, 
  Smartphone, 
  Sparkles,
  Zap,
  Users,
  Hexagon,
  ChevronDown
} from 'lucide-react';

export default function LandingPageReptile({ onLogin }) {
  const [teamName, setTeamName] = useState('');
  const [userName, setUserName] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [visibleCards, setVisibleCards] = useState([]);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);

  const particles = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    baseX: Math.random() * 100,
    baseY: Math.random() * 100,
    size: Math.random() * 1.5 + 0.5,
    speed: Math.random() * 0.3 + 0.1,
    angle: Math.random() * Math.PI * 2
  }));

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setMousePos({
          x: (e.clientX - rect.left) / rect.width,
          y: (e.clientY - rect.top) / rect.height
        });
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('mousemove', handleMouseMove);
      return () => container.removeEventListener('mousemove', handleMouseMove);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisibleCards([0]);
    }, 300);
    setTimeout(() => setVisibleCards([1]), 500);
    setTimeout(() => setVisibleCards([2]), 700);
    setTimeout(() => setVisibleCards([3]), 900);
    return () => clearTimeout(timer);
  }, []);

  const handleStart = () => {
    if (teamName.trim() && userName.trim()) {
      localStorage.setItem('glowup-team', teamName);
      localStorage.setItem('glowup-user', userName);
      onLogin(userName, teamName);
    }
  };

  const features = [
    {
      icon: LayoutGrid,
      title: 'Kanban',
      description: 'Tableaux visuels intelligents pour organiser vos projets',
      accent: 'ocre'
    },
    {
      icon: MessageSquare,
      title: 'Chat',
      description: 'Communication temps réel avec votre équipe',
      accent: 'ocre'
    },
    {
      icon: Wifi,
      title: 'Offline',
      description: 'Travaillez sans connexion. Sync automatique',
      accent: 'ocre'
    },
    {
      icon: Smartphone,
      title: 'MoMo',
      description: 'Paiements intégrés MTN et Orange Money',
      accent: 'ocre'
    }
  ];

  return (
    <div className="landing-page" ref={containerRef}>
      {/* Sun Gradient */}
      <div 
        className="sun-gradient"
        style={{
          transform: `translate(${(mousePos.x - 0.5) * -30}px, ${(mousePos.y - 0.5) * -30}px)`
        }}
      />
      
      {/* Film Grain */}
      <div className="grain" />

      {/* Particles */}
      <div className="particles">
        {particles.map((p) => (
          <div
            key={p.id}
            className="particle"
            style={{
              left: `${p.baseX}%`,
              top: `${p.baseY}%`,
              width: p.size,
              height: p.size,
              animationDuration: `${15 / p.speed}s`,
              animationDelay: `${p.delay}s`
            }}
          />
        ))}
      </div>

      {/* Header */}
      <header className="header">
        <div className="logo">
          <span>TELEWORK</span>
        </div>
        
        <nav className="nav">
          <a href="#features">Fonctionnalités</a>
          <a href="#pricing">Tarifs</a>
          <a href="#contact">Contact</a>
        </nav>
      </header>

      {/* Hero */}
      <section className="hero">
        <div className="hero-content">
          <div className="hero-badge">
            <Sparkles size={14} />
            <span>PLATEFORME COLLABORATIVE</span>
          </div>
          
          <h1 className="hero-title">
            Créer.<br />
            Collaborer.<br />
            Innover.
          </h1>
          
          <p className="hero-subtitle">
            La plateforme qui révolutionne la façon dont votre équipe travaille.
            Kanban intelligent, IA incontournée et paiements intégrés.
          </p>

          <button className="cta-main" onClick={() => setShowForm(true)}>
            <span>Commencer l'aventure</span>
            <Zap size={20} />
          </button>
        </div>

        <div className="scroll-indicator">
          <span>Découvrir</span>
          <ChevronDown size={20} />
        </div>
      </section>

      {/* Features */}
      <section className="features-section" id="features">
        <div className="features-grid">
          {features.map((feature, index) => (
            <div
              key={index}
              className={`feature-card ${visibleCards.includes(index) ? 'visible' : ''}`}
              style={{ '--index': index }}
            >
              <div className="card-icon" data-accent={feature.accent}>
                <feature.icon size={24} strokeWidth={1.5} />
              </div>
              <div className="card-content">
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <p>© 2024 TELEWORK. Construisons ensemble.</p>
      </footer>

      {/* Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
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
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap');

        @keyframes float {
          0%, 100% { transform: translateY(0); opacity: 0; }
          10% { opacity: 0.4; }
          90% { opacity: 0.4; }
          100% { transform: translateY(-100px); opacity: 0; }
        }

        @keyframes fade-in-up {
          from { 
            opacity: 0; 
            transform: translateY(30px); 
          }
          to { 
            opacity: 1; 
            transform: translateY(0); 
          }
        }

        .landing-page {
          min-height: 100vh;
          background: #fafaf9;
          position: relative;
          overflow-x: hidden;
          font-family: 'Inter', sans-serif;
        }

        .sun-gradient {
          position: fixed;
          top: -30%;
          right: -20%;
          width: 80%;
          height: 80%;
          background: radial-gradient(
            ellipse at 70% 30%,
            #ffedd5 0%,
            #fed7aa 30%,
            #fef3c7 60%,
            transparent 80%
          );
          pointer-events: none;
          z-index: 0;
          transition: transform 0.3s ease-out;
          opacity: 0.8;
        }

        .grain {
          position: fixed;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
          opacity: 0.025;
          pointer-events: none;
          z-index: 1;
        }

        .particles {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 2;
        }

        .particle {
          position: absolute;
          background: #78716c;
          border-radius: 50%;
          opacity: 0.3;
          animation: float linear infinite;
        }

        .header {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 24px 48px;
          z-index: 100;
          background: linear-gradient(180deg, rgba(250, 250, 249, 0.9) 0%, transparent 100%);
        }

        .logo {
          font-family: 'Cormorant Garamond', serif;
          font-size: 20px;
          font-weight: 500;
          letter-spacing: 3px;
          color: #1c1917;
        }

        .nav {
          display: flex;
          align-items: center;
          gap: 32px;
        }

        .nav a {
          color: #78716c;
          text-decoration: none;
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 0.5px;
          transition: color 0.3s;
        }

        .nav a:hover {
          color: #c2410c;
        }

        .hero {
          min-height: 100vh;
          display: flex;
          align-items: center;
          padding: 120px 48px;
          position: relative;
          z-index: 10;
        }

        .hero-content {
          max-width: 700px;
        }

        .hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          background: rgba(194, 65, 12, 0.08);
          border-radius: 100px;
          color: #c2410c;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 1.5px;
          margin-bottom: 32px;
        }

        .hero-title {
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(56px, 10vw, 120px);
          font-weight: 500;
          line-height: 1.05;
          margin-bottom: 32px;
          color: #1c1917;
          letter-spacing: -2px;
        }

        .hero-subtitle {
          font-size: 18px;
          color: #78716c;
          line-height: 1.7;
          margin-bottom: 48px;
          max-width: 480px;
        }

        .cta-main {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 16px 32px;
          background: #c2410c;
          border: none;
          border-radius: 9999px;
          color: #ffffff;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
          font-family: 'Inter', sans-serif;
          box-shadow: 0 4px 20px rgba(194, 65, 12, 0.25);
        }

        .cta-main:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 30px rgba(194, 65, 12, 0.35);
        }

        .scroll-indicator {
          position: absolute;
          bottom: 60px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          color: #a8a29e;
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 1px;
        }

        .features-section {
          padding: 80px 48px 120px;
          position: relative;
          z-index: 10;
        }

        .features-grid {
          max-width: 1200px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 24px;
        }

        .feature-card {
          opacity: 0;
          transform: translateY(30px);
          transition: all 0.6s ease-out;
          transition-delay: calc(var(--index) * 0.15s);
        }

        .feature-card.visible {
          opacity: 1;
          transform: translateY(0);
        }

        .feature-card {
          padding: 40px 28px;
          background: #ffffff;
          border-radius: 24px;
          box-shadow: 
            0 4px 6px rgba(0, 0, 0, 0.02),
            0 10px 20px rgba(0, 0, 0, 0.04),
            0 30px 60px rgba(0, 0, 0, 0.08);
          transition: all 0.4s ease;
        }

        .feature-card:hover {
          transform: translateY(-6px);
          box-shadow: 
            0 8px 12px rgba(0, 0, 0, 0.03),
            0 20px 40px rgba(0, 0, 0, 0.06),
            0 50px 80px rgba(0, 0, 0, 0.1);
        }

        .card-icon {
          width: 52px;
          height: 52px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(194, 65, 12, 0.06);
          border-radius: 14px;
          color: #c2410c;
          margin-bottom: 20px;
          transition: all 0.3s;
        }

        .feature-card:hover .card-icon {
          transform: scale(1.08);
          background: rgba(194, 65, 12, 0.1);
        }

        .card-content h3 {
          font-family: 'Cormorant Garamond', serif;
          font-size: 22px;
          font-weight: 600;
          color: #1c1917;
          margin-bottom: 8px;
        }

        .card-content p {
          font-size: 13px;
          color: #78716c;
          line-height: 1.6;
        }

        .footer {
          text-align: center;
          padding: 40px;
          color: #a8a29e;
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 0.5px;
          position: relative;
          z-index: 10;
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(250, 250, 249, 0.9);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 200;
          padding: 24px;
        }

        .modal {
          background: #ffffff;
          border-radius: 24px;
          padding: 48px;
          width: 100%;
          max-width: 440px;
          box-shadow: 
            0 4px 6px rgba(0, 0, 0, 0.02),
            0 20px 40px rgba(0, 0, 0, 0.08);
        }

        .modal-header {
          text-align: center;
          margin-bottom: 32px;
        }

        .modal-header h2 {
          font-family: 'Cormorant Garamond', serif;
          font-size: 28px;
          font-weight: 600;
          color: #1c1917;
        }

        .form-group { margin-bottom: 20px; }

        .form-group label {
          display: block;
          font-size: 13px;
          color: #78716c;
          margin-bottom: 8px;
          font-weight: 600;
        }

        .form-group input {
          width: 100%;
          padding: 14px 18px;
          background: #fafaf9;
          border: 1px solid #e7e5e4;
          border-radius: 12px;
          color: #1c1917;
          font-size: 15px;
          outline: none;
          transition: all 0.3s;
          font-family: 'Inter', sans-serif;
        }

        .form-group input::placeholder { color: #a8a29e; }

        .form-group input:focus {
          border-color: #c2410c;
          box-shadow: 0 0 0 3px rgba(194, 65, 12, 0.1);
        }

        .submit-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 16px;
          background: #c2410c;
          border: none;
          border-radius: 12px;
          color: #ffffff;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
          margin-top: 16px;
          font-family: 'Inter', sans-serif;
        }

        .submit-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(194, 65, 12, 0.3);
        }

        .submit-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        @media (max-width: 1024px) {
          .features-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 768px) {
          .header { padding: 20px 24px; }
          .nav { display: none; }
          .hero { padding: 120px 24px; }
          .features-grid { grid-template-columns: 1fr; }
          .features-section { padding: 60px 24px 80px; }
        }
      `}</style>
    </div>
  );
}