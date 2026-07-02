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
  '--c-surface2': 'rgba(30,41,59,.85)',
  '--c-sidebar':  'rgba(15,23,42,.97)',
  '--c-ba85':     'rgba(15,23,42,.85)',
  '--c-ba7':      'rgba(15,23,42,.7)',
  '--c-ba5':      'rgba(15,23,42,.5)',
  '--c-text':     '#f8fafc',
  '--c-text2':    '#f1f5f9',
  '--c-text3':    '#cbd5e1',
  '--c-text4':    '#94a3b8',
  '--c-text5':    '#64748b',
  '--c-border':   'rgba(148,163,184,.14)',
  '--c-border2':  'rgba(148,163,184,.22)',
  '--c-border3':  'rgba(148,163,184,.1)',
  '--c-hover':    'rgba(255,255,255,.07)',
  '--c-hover2':   'rgba(255,255,255,.04)',
  '--c-accent':   '#22d3ee',
  '--c-accent2':  '#0891b2',
  '--c-column':        'rgba(15,23,42,.45)',
  '--c-column-drag':   'rgba(30,41,59,.65)',
  '--c-input-bg':      'rgba(255,255,255,.05)',
  '--c-input-border':  'rgba(148,163,184,.2)',
  '--c-muted-bg':      'rgba(255,255,255,.06)',
  '--c-success':  '#22c55e',
  '--c-warning':  '#f59e0b',
  '--c-danger':   '#ef4444',
  '--c-info':     '#3b82f6',
};

const LIGHT_TOKENS = {
  '--c-bg':       '#f8fafc',
  '--c-surface':  '#ffffff',
  '--c-surface2': '#ffffff',
  '--c-sidebar':  '#ffffff',
  '--c-ba85':     'rgba(255,255,255,.97)',
  '--c-ba7':      'rgba(255,255,255,.95)',
  '--c-ba5':      'rgba(248,250,252,.9)',
  '--c-text':     '#020617',
  '--c-text2':    '#0f172a',
  '--c-text3':    '#1e293b',
  '--c-text4':    '#475569',
  '--c-text5':    '#64748b',
  '--c-border':   'rgba(15,23,42,.1)',
  '--c-border2':  'rgba(15,23,42,.16)',
  '--c-border3':  'rgba(15,23,42,.07)',
  '--c-hover':    'rgba(15,23,42,.04)',
  '--c-hover2':   'rgba(15,23,42,.025)',
  '--c-accent':   '#0891b2',
  '--c-accent2':  '#0e7490',
  '--c-column':        'rgba(241,245,249,.95)',
  '--c-column-drag':   'rgba(226,232,240,.98)',
  '--c-input-bg':      '#ffffff',
  '--c-input-border':  'rgba(15,23,42,.14)',
  '--c-muted-bg':      '#f1f5f9',
  '--c-success':  '#16a34a',
  '--c-warning':  '#d97706',
  '--c-danger':   '#dc2626',
  '--c-info':     '#2563eb',
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
