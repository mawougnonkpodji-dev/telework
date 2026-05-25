/**
 * ThemeContext — gestion globale du thème (sombre / clair / système).
 *
 * Utilisation :
 *   const { theme, setTheme, resolvedTheme } = useTheme();
 *   theme         → 'dark' | 'light' | 'system'   (choix de l'utilisateur)
 *   resolvedTheme → 'dark' | 'light'               (thème réellement appliqué)
 */

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const ThemeContext = createContext(null);

// ── Tokens CSS ────────────────────────────────────────────────────────────────
const DARK_TOKENS = {
  '--c-bg':       '#0f172a',
  '--c-surface':  '#1e293b',
  '--c-surface2': 'rgba(30,41,59,.7)',
  '--c-sidebar':  'rgba(15,23,42,.97)',
  '--c-ba85':     'rgba(15,23,42,.85)',
  '--c-ba7':      'rgba(15,23,42,.7)',
  '--c-ba5':      'rgba(15,23,42,.5)',
  '--c-text':     '#f1f5f9',
  '--c-text2':    '#e2e8f0',
  '--c-text3':    '#94a3b8',
  '--c-text4':    '#64748b',
  '--c-text5':    '#475569',
  '--c-border':   'rgba(148,163,184,.12)',
  '--c-border2':  'rgba(148,163,184,.2)',
  '--c-border3':  'rgba(148,163,184,.08)',
  '--c-hover':    'rgba(255,255,255,.06)',
  '--c-hover2':   'rgba(255,255,255,.04)',
  '--c-accent':   '#22d3ee',
  '--c-accent2':  '#0891b2',
};

const LIGHT_TOKENS = {
  '--c-bg':       '#f1f5f9',
  '--c-surface':  '#ffffff',
  '--c-surface2': 'rgba(255,255,255,.92)',
  '--c-sidebar':  'rgba(248,250,252,.98)',
  '--c-ba85':     'rgba(255,255,255,.97)',
  '--c-ba7':      'rgba(255,255,255,.92)',
  '--c-ba5':      'rgba(241,245,249,.8)',
  '--c-text':     '#0f172a',
  '--c-text2':    '#1e293b',
  '--c-text3':    '#334155',
  '--c-text4':    '#64748b',
  '--c-text5':    '#94a3b8',
  '--c-border':   'rgba(15,23,42,.1)',
  '--c-border2':  'rgba(15,23,42,.18)',
  '--c-border3':  'rgba(15,23,42,.06)',
  '--c-hover':    'rgba(0,0,0,.05)',
  '--c-hover2':   'rgba(0,0,0,.03)',
  '--c-accent':   '#0891b2',
  '--c-accent2':  '#0e7490',
};

function applyTokens(resolved) {
  const tokens = resolved === 'light' ? LIGHT_TOKENS : DARK_TOKENS;
  const root = document.documentElement;
  Object.entries(tokens).forEach(([k, v]) => root.style.setProperty(k, v));
  root.setAttribute('data-theme', resolved);
}

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

// ── Provider ──────────────────────────────────────────────────────────────────
export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(
    () => localStorage.getItem('app_theme') || 'dark',
  );

  const resolvedTheme = theme === 'system' ? getSystemTheme() : theme;

  const setTheme = useCallback((t) => {
    setThemeState(t);
    localStorage.setItem('app_theme', t);
  }, []);

  // Apply tokens whenever resolved theme changes
  useEffect(() => {
    applyTokens(resolvedTheme);
  }, [resolvedTheme]);

  // Listen for system preference changes when theme === 'system'
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const handler = () => applyTokens(getSystemTheme());
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
