import { useState, useEffect } from 'react';
import { 
  LayoutGrid, 
  Zap, 
  Smartphone, 
  Sparkles,
  ArrowRight
} from 'lucide-react';

export default function LandingPageBrutalist() {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const features = [
    {
      icon: <LayoutGrid size={20} />,
      title: 'KANBAN',
      code: 'MOD-001',
      color: 'cyan'
    },
    {
      icon: <Zap size={20} />,
      title: 'IA ASSISTANT',
      code: 'MOD-002',
      color: 'violet'
    },
    {
      icon: <Smartphone size={20} />,
      title: 'MOBILE MONEY',
      code: 'MOD-003',
      color: 'amber'
    },
    {
      icon: <Sparkles size={20} />,
      title: 'OFFLINE MODE',
      code: 'MOD-004',
      color: 'cyan'
    }
  ];

  const accentColor = '#ff4500';

  return (
    <div className="brutalist-page">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Oswald:wght@400;700&display=swap');

        .brutalist-page {
          min-height: 100vh;
          background: #111111;
          color: #ffffff;
          font-family: 'Oswald', sans-serif;
          position: relative;
          overflow-x: hidden;
        }

        /* Noise Texture */
        .noise-overlay {
          position: fixed;
          inset: 0;
          pointer-events: none;
          opacity: 0.08;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
          z-index: 1;
        }

        /* Grid Lines */
        .grid-lines {
          position: fixed;
          inset: 0;
          pointer-events: none;
          background-image: 
            linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px);
          background-size: 80px 80px;
          z-index: 2;
        }

        /* Breathing Glow Circle */
        .breathing-glow {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 600px;
          height: 600px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255,69,0,0.15) 0%, transparent 70%);
          animation: breathe 8s ease-in-out infinite;
          z-index: 0;
          pointer-events: none;
        }

        @keyframes breathe {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.6; }
          50% { transform: translate(-50%, -50%) scale(1.3); opacity: 1; }
        }

        /* Header */
        .header {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          padding: 24px 48px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          z-index: 100;
          border-bottom: 1px solid rgba(255,255,255,0.1);
          background: rgba(17,17,17,0.9);
        }

        .logo {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 28px;
          letter-spacing: 8px;
          font-style: italic;
        }

        .logo span {
          color: ${accentColor};
        }

        .header-nav {
          display: flex;
          gap: 32px;
          font-size: 12px;
          letter-spacing: 2px;
          text-transform: uppercase;
        }

        .header-nav a {
          color: #666;
          text-decoration: none;
          transition: color 0.3s;
        }

        .header-nav a:hover {
          color: ${accentColor};
        }

        /* Hero Section */
        .hero {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          padding: 120px 24px;
          position: relative;
          z-index: 10;
        }

        .hero-title-container {
          font-family: 'Bebas Neue', sans-serif;
          font-size: clamp(60px, 15vw, 200px);
          font-style: italic;
          font-weight: 400;
          line-height: 0.85;
          text-align: center;
          letter-spacing: -2px;
        }

        .hero-title-line {
          display: block;
          position: relative;
        }

        .hero-title-outline {
          -webkit-text-stroke: 2px transparent;
          color: transparent;
          position: relative;
        }

        .hero-title-outline::after {
          content: attr(data-text);
          position: absolute;
          left: 0;
          top: 0;
          -webkit-text-stroke: 2px #666;
          color: transparent;
          z-index: -1;
        }

        .hero-subtitle {
          font-size: 14px;
          letter-spacing: 6px;
          text-transform: uppercase;
          color: #666;
          margin-top: 40px;
          max-width: 500px;
          text-align: center;
        }

        .cta-button {
          margin-top: 60px;
          padding: 16px 48px;
          background: transparent;
          border: 2px solid ${accentColor};
          color: ${accentColor};
          font-family: 'Oswald', sans-serif;
          font-size: 14px;
          letter-spacing: 4px;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.3s;
          position: relative;
          overflow: hidden;
        }

        .cta-button:hover {
          background: ${accentColor};
          color: #111;
          box-shadow: 0 0 30px rgba(255,69,0,0.5);
        }

        .cta-button::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
          transition: left 0.5s;
        }

        .cta-button:hover::before {
          left: 100%;
        }

        /* Features Marquee */
        .features-section {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 24px 0;
          background: rgba(17,17,17,0.95);
          border-top: 1px solid rgba(255,255,255,0.1);
          z-index: 100;
        }

        .marquee-container {
          overflow: hidden;
          white-space: nowrap;
        }

        .marquee-content {
          display: inline-flex;
          animation: scroll 20s linear infinite;
        }

        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }

        .feature-module {
          display: inline-flex;
          align-items: center;
          gap: 16px;
          padding: 16px 32px;
          margin: 0 16px;
          border: 1px solid rgba(255,255,255,0.15);
          background: rgba(255,255,255,0.02);
          cursor: pointer;
          transition: all 0.2s;
          position: relative;
        }

        .feature-module:hover {
          border-color: ${accentColor};
          background: rgba(255,69,0,0.05);
        }

        .feature-module:hover .feature-title {
          animation: glitch 0.3s ease-in-out;
        }

        @keyframes glitch {
          0%, 100% { transform: translate(0); }
          20% { transform: translate(-2px, 2px); }
          40% { transform: translate(2px, -2px); }
          60% { transform: translate(-2px, -2px); }
          80% { transform: translate(2px, 2px); }
        }

        .feature-icon {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .feature-icon.cyan { color: #06b6d4; }
        .feature-icon.violet { color: #a855f7; }
        .feature-icon.amber { color: #fbbf24; }

        .feature-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .feature-title {
          font-size: 14px;
          letter-spacing: 2px;
          font-weight: 700;
        }

        .feature-code {
          font-size: 10px;
          letter-spacing: 2px;
          color: #444;
          font-family: monospace;
        }

        .feature-barcode {
          width: 60px;
          height: 16px;
          background: repeating-linear-gradient(
            90deg,
            #333 0px,
            #333 2px,
            transparent 2px,
            transparent 4px,
            #333 4px,
            #333 5px,
            transparent 5px,
            transparent 8px
          );
          margin-left: 16px;
        }

        /* Accent Indicators */
        .accent-dot {
          position: absolute;
          top: 8px;
          left: 8px;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: ${accentColor};
        }

        /* Scroll indicator */
        .scroll-indicator {
          position: absolute;
          bottom: 120px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          color: #333;
          font-size: 10px;
          letter-spacing: 2px;
        }

        .scroll-line {
          width: 1px;
          height: 40px;
          background: linear-gradient(to bottom, ${accentColor}, transparent);
          animation: scrollPulse 2s infinite;
        }

        @keyframes scrollPulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }

        @media (max-width: 768px) {
          .header { padding: 16px 24px; }
          .header-nav { display: none; }
          .marquee-content { animation-duration: 10s; }
        }
      `}</style>

      {/* Noise & Grid */}
      <div className="noise-overlay" />
      <div className="grid-lines" />
      
      {/* Breathing Glow */}
      <div className="breathing-glow" />

      {/* Header */}
      <header className="header">
        <div className="logo">AMATERA<span>TSU</span></div>
        <nav className="header-nav">
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#about">About</a>
        </nav>
      </header>

      {/* Hero */}
      <section className="hero">
        <h1 className="hero-title-container">
          <span className="hero-title-line" data-text="TELEWORK">TELEWORK</span>
          <span className="hero-title-line hero-title-outline" data-text="THE FUTURE">THE FUTURE</span>
          <span className="hero-title-line" data-text="OF WORK">OF WORK</span>
        </h1>
        
        <p className="hero-subtitle">
          Plateforme collaborative nouvelle génération pour les équipes africaines
        </p>

        <button className="cta-button">
          Commencer l'expérience →
        </button>

        <div className="scroll-indicator">
          <span>SCROLL</span>
          <div className="scroll-line" />
        </div>
      </section>

      {/* Features Marquee */}
      <section className="features-section">
        <div className="marquee-container">
          <div className="marquee-content">
            {[...features, ...features, ...features, ...features].map((feature, index) => (
              <div key={index} className="feature-module">
                <div className="accent-dot" />
                <div className={`feature-icon ${feature.color}`}>
                  {feature.icon}
                </div>
                <div className="feature-info">
                  <span className="feature-title">{feature.title}</span>
                  <span className="feature-code">{feature.code}</span>
                </div>
                <div className="feature-barcode" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}