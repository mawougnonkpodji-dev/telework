import { useState, useEffect } from 'react';

const features = [
  {
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    title: 'Kanban Offline',
    description: 'Gestion de projets locale sans connexion internet. Synchronisation automatique dès la reconnexion.',
    color: 'cyan'
  },
  {
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    title: 'IA Assistant',
    description: 'Assistant intelligent qui automatise les tâches répétitives et suggère des optimisations en temps réel.',
    color: 'violet'
  },
  {
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: 'Mobile Money',
    description: 'Intégration transparente avec les principaux services de paiement mobile africains.',
    color: 'amber'
  }
];

function GridLines() {
  return (
    <div 
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{
        backgroundImage: `
          linear-gradient(to right, rgba(6,182,212,0.08) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(6,182,212,0.08) 1px, transparent 1px)
        `,
        backgroundSize: '60px 60px',
        animation: 'gridScroll 20s linear infinite'
      }}
    />
  );
}

function FloatingHeader({ scrollY }) {
  const isScrolled = scrollY > 50;
  
  return (
    <header 
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        isScrolled 
          ? 'bg-slate-950/80 backdrop-blur-xl border-b border-white/10 py-4' 
          : 'bg-transparent py-6'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.4)]">
            <span className="text-white font-bold text-lg">A</span>
          </div>
          <span className="text-2xl font-bold bg-gradient-to-r from-cyan-400 via-violet-400 to-amber-400 bg-[length:200%_auto] animate-gradient-text bg-clip-text text-transparent">
            TELEWORK
          </span>
        </div>
        <nav className="hidden md:flex gap-8 text-sm font-medium text-slate-400">
          <a href="#features" className="hover:text-cyan-400 transition-colors duration-300">Fonctionnalités</a>
          <a href="#pricing" className="hover:text-cyan-400 transition-colors duration-300">Tarifs</a>
          <a href="#about" className="hover:text-cyan-400 transition-colors duration-300">À propos</a>
        </nav>
        <button className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-500 text-white font-medium hover:shadow-[0_0_25px_rgba(6,182,212,0.5)] transition-all duration-300">
          Connexion
        </button>
      </div>
    </header>
  );
}

function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center pt-20 overflow-hidden">
      <GridLines />
      
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-950/50 to-slate-950" />
      
      <div className="absolute top-1/4 left-10 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-10 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      
      <div className="relative z-10 text-center px-6 max-w-4xl mx-auto">
        <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight animate-fade-in-up">
          <span className="bg-gradient-to-r from-cyan-400 via-violet-500 to-amber-400 bg-[length:200%_auto] animate-gradient-text bg-clip-text text-transparent">
            L'avenir de la gestion
          </span>
          <br />
          <span className="text-white">de projet en Afrique</span>
        </h1>
        
        <p className="text-xl text-slate-400 mb-10 max-w-2xl mx-auto animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          TELEWORK combine puissance de l'IA, Mode Offline et Mobile Money pour transformer la productivité des équipes africaines.
        </p>
        
        <div className="animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
          <button className="group relative px-8 py-4 bg-gradient-to-r from-cyan-500 to-violet-500 rounded-xl text-white font-semibold text-lg overflow-hidden transition-all duration-300 hover:scale-105 hover:shadow-[0_0_40px_rgba(6,182,212,0.6)] animate-pulse-glow">
            <span className="relative z-10 flex items-center gap-3">
              Démarrer l'aventure
              <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </span>
            <div className="absolute inset-0 bg-gradient-to-r from-violet-500 to-amber-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </button>
        </div>
        
        <div className="mt-16 grid grid-cols-3 gap-8 max-w-lg mx-auto animate-fade-in-up" style={{ animationDelay: '0.6s' }}>
          {[
            { label: 'Utilisateurs', value: '10K+' },
            { label: 'Projets', value: '500+' },
            { label: 'Équipes', value: '50+' }
          ].map((stat, i) => (
            <div key={i} className="text-center">
              <div className="text-2xl font-bold text-white">{stat.value}</div>
              <div className="text-sm text-slate-500">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
      
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 animate-bounce">
        <div className="w-6 h-10 border-2 border-white/20 rounded-full flex justify-center pt-2">
          <div className="w-1 h-3 bg-white/40 rounded-full animate-pulse" />
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ feature, index }) {
  const [isHovered, setIsHovered] = useState(false);
  
  const colorClasses = {
    cyan: {
      border: 'border-cyan-400/30',
      hoverBorder: 'border-cyan-400',
      text: 'text-cyan-400',
      bg: 'bg-cyan-500/5',
      glow: 'shadow-cyan-500/30',
      gradient: 'from-cyan-400/20'
    },
    violet: {
      border: 'border-violet-500/30',
      hoverBorder: 'border-violet-400',
      text: 'text-violet-400',
      bg: 'bg-violet-500/5',
      glow: 'shadow-violet-500/30',
      gradient: 'from-violet-500/20'
    },
    amber: {
      border: 'border-amber-400/30',
      hoverBorder: 'border-amber-400',
      text: 'text-amber-400',
      bg: 'bg-amber-500/5',
      glow: 'shadow-amber-500/30',
      gradient: 'from-amber-400/20'
    }
  };
  
  const colors = colorClasses[feature.color];

  return (
    <div
      className={`relative p-8 rounded-2xl border-2 ${colors.border} bg-slate-900/50 backdrop-blur-sm transition-all duration-500 ease-out cursor-pointer overflow-hidden animate-fade-in-up ${
        isHovered ? `scale-105 ${colors.hoverBorder} ${colors.glow}` : ''
      }`}
      style={{ animationDelay: `${index * 0.15}s` }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${colors.gradient} opacity-0 transition-opacity duration-500 ${isHovered ? 'opacity-100' : ''}`} />
      
      <div className="relative z-10">
        <div className={`mb-6 w-16 h-16 rounded-xl bg-slate-800 border ${colors.border} flex items-center justify-center transition-all duration-500 ${isHovered ? 'scale-110' : ''}`}>
          <span className={`${colors.text} transition-all duration-500 ${isHovered ? 'opacity-100 scale-100' : 'opacity-60 scale-90'}`}>
            {feature.icon}
          </span>
        </div>
        
        <h3 className={`text-xl font-bold mb-3 ${colors.text} transition-colors duration-300`}>
          {feature.title}
        </h3>
        
        <p className="text-slate-400 text-sm leading-relaxed">
          {feature.description}
        </p>
      </div>
      
      <div className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r transition-transform duration-500 ${isHovered ? 'scale-x-100' : 'scale-x-0'} ${
        feature.color === 'cyan' ? 'from-cyan-400 to-violet-500' :
        feature.color === 'violet' ? 'from-violet-400 to-amber-400' :
        'from-amber-400 to-cyan-400'
      }`} />
    </div>
  );
}

function FeaturesSection() {
  return (
    <section id="features" className="relative py-32 px-6 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-black to-slate-950" />
      
      <div className="relative z-10 max-w-6xl mx-auto">
        <div className="text-center mb-16 animate-fade-in-up">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            <span className="bg-gradient-to-r from-cyan-400 via-violet-500 to-amber-400 bg-[length:200%_auto] animate-gradient-text bg-clip-text text-transparent">
              Fonctionnalités
            </span>
          </h2>
          <p className="text-slate-400 text-lg">Des outils pensés pour le continent africain</p>
        </div>
        
        <div className="grid md:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <FeatureCard key={index} feature={feature} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className="relative py-20 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="relative bg-gradient-to-br from-slate-900 to-slate-800 border border-cyan-400/20 rounded-3xl p-12 text-center overflow-hidden animate-fade-in-up">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 via-violet-500/5 to-amber-500/5" />
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-400 via-violet-500 to-amber-400" />
          
          <div className="relative z-10">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Prêt à transformer votre productivité ?
            </h2>
            <p className="text-slate-400 mb-8 text-lg">
              Rejoignez les milliers d'équipes qui font confiance à TELEWORK
            </p>
            <button className="px-8 py-4 bg-gradient-to-r from-cyan-500 to-violet-500 rounded-xl text-white font-semibold text-lg hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] transition-all duration-300 hover:scale-105">
              Essai gratuit - Pas de carte requise
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function TELEWORKLanding() {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="bg-slate-950 min-h-screen text-white">
      <FloatingHeader scrollY={scrollY} />
      <HeroSection />
      <FeaturesSection />
      <CTASection />
      
      <footer className="py-12 px-6 border-t border-white/5">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-violet-500 flex items-center justify-center">
              <span className="text-white font-bold">A</span>
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-violet-400 bg-clip-text text-transparent">
              TELEWORK
            </span>
          </div>
          <p className="text-slate-500 text-sm">
            © 2024 TELEWORK. Tous droits réservés.
          </p>
        </div>
      </footer>

      <style>{`
        @keyframes gridScroll {
          0% { transform: translate(0, 0); }
          100% { transform: translate(60px, 60px); }
        }
        
        @keyframes gradient-shift {
          0% { background-position: 0% center; }
          100% { background-position: 200% center; }
        }
        
        .animate-gradient-text {
          background-size: 200% auto;
          animation: gradient-shift 3s linear infinite;
        }
        
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 25px rgba(6,182,212,0.3); }
          50% { box-shadow: 0 0 50px rgba(6,182,212,0.6); }
        }
        
        .animate-pulse-glow {
          animation: pulse-glow 2.5s ease-in-out infinite;
        }
        
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-fade-in-up {
          animation: fadeInUp 0.8s ease-out forwards;
          opacity: 0;
        }
      `}</style>
    </div>
  );
}