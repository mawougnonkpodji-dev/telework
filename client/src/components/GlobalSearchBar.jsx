import { useState, useEffect, useRef } from 'react';
import { Search, FolderOpen, CheckSquare, User } from 'lucide-react';
import { apiGlobalSearch, apiSearchTasks } from '../services/backendApi.js';

export default function GlobalSearchBar({ projects, activeProject, onSelectProject, onSelectTask }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [globalRes, setGlobalRes] = useState(null);
  const [taskRes, setTaskRes] = useState(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    const t = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', t);
    return () => document.removeEventListener('mousedown', t);
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setGlobalRes(null);
      setTaskRes(null);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const id = setTimeout(async () => {
      const [g, tsk] = await Promise.all([
        apiGlobalSearch(term),
        activeProject?.id ? apiSearchTasks(activeProject.id, { q: term }) : Promise.resolve(null),
      ]);
      setGlobalRes(g);
      setTaskRes(tsk);
      setLoading(false);
    }, 320);
    return () => clearTimeout(id);
  }, [q, activeProject?.id]);

  const gr = globalRes?.results;
  const localTasks = taskRes?.tasks || [];

  return (
    <div ref={wrapRef} style={{ position: 'relative', minWidth: '200px', flex: '1 1 220px', maxWidth: '420px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '12px', background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.15)' }}>
        <Search size={16} style={{ color: 'var(--c-text4)', flexShrink: 0 }} />
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Recherche globale & tâches du projet…"
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: 'var(--c-text)',
            fontSize: '13px',
          }}
        />
        {loading && <span style={{ fontSize: '11px', color: 'var(--c-text4)' }}>…</span>}
      </div>

      {open && q.trim().length >= 2 && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            maxHeight: '360px',
            overflowY: 'auto',
            background: 'rgba(15, 23, 42, 0.98)',
            border: '1px solid var(--c-border2)',
            borderRadius: '12px',
            boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
            zIndex: 50,
            padding: '10px',
          }}
        >
          {activeProject?.id && localTasks.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--c-text4)', textTransform: 'uppercase', marginBottom: '6px' }}>
                Tâches — {activeProject.name}
              </div>
              {localTasks.slice(0, 8).map((t) => (
                <button
                  key={`lt-${t.id}`}
                  type="button"
                  onClick={() => {
                    onSelectTask?.(t);
                    setOpen(false);
                  }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--c-text2)',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  <CheckSquare size={12} style={{ display: 'inline', marginRight: '6px', color: '#22d3ee' }} />
                  {t.title}
                  <span style={{ color: 'var(--c-text4)', marginLeft: '6px' }}>{t.status}</span>
                </button>
              ))}
            </div>
          )}

          {gr && (
            <>
              {(gr.projects || []).length > 0 && (
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--c-text4)', textTransform: 'uppercase', marginBottom: '6px' }}>Projets</div>
                  {(gr.projects || []).map((p) => (
                    <button
                      key={`gp-${p.id}`}
                      type="button"
                      onClick={() => {
                        const proj = projects?.find((x) => x.id === p.id) || p;
                        onSelectProject?.(proj);
                        setOpen(false);
                      }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px',
                        borderRadius: '8px',
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--c-text2)',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      <FolderOpen size={12} style={{ display: 'inline', marginRight: '6px', color: '#a78bfa' }} />
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
              {(gr.tasks || []).length > 0 && (
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--c-text4)', textTransform: 'uppercase', marginBottom: '6px' }}>Tâches (tous projets)</div>
                  {(gr.tasks || []).slice(0, 8).map((t) => (
                    <button
                      key={`gt-${t.id}`}
                      type="button"
                      onClick={() => {
                        onSelectTask?.(t);
                        setOpen(false);
                      }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px',
                        borderRadius: '8px',
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--c-text2)',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      <CheckSquare size={12} style={{ display: 'inline', marginRight: '6px', color: '#22d3ee' }} />
                      {t.title}
                      <span style={{ color: 'var(--c-text4)', marginLeft: '6px' }}>#{t.project_id}</span>
                    </button>
                  ))}
                </div>
              )}
              {(gr.members || []).length > 0 && (
                <div>
                  <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--c-text4)', textTransform: 'uppercase', marginBottom: '6px' }}>Membres</div>
                  {(gr.members || []).map((m) => (
                    <div key={`gm-${m.id}`} style={{ padding: '6px 8px', fontSize: '12px', color: 'var(--c-text3)' }}>
                      <User size={12} style={{ display: 'inline', marginRight: '6px' }} />
                      {m.name}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {!loading && q.trim().length >= 2 && (!gr || ((gr.projects || []).length === 0 && (gr.tasks || []).length === 0 && (gr.members || []).length === 0) && localTasks.length === 0) && (
            <p style={{ fontSize: '12px', color: 'var(--c-text4)', margin: 0 }}>Aucun résultat</p>
          )}
        </div>
      )}
    </div>
  );
}
