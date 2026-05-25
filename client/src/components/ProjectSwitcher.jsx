import { useState, useEffect } from 'react';
import { recentProjectsFromList, searchProjectsForSwitcher } from '../services/backendApi.js';

export default function ProjectSwitcher({ activeProject, onProjectChange, projects, user }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [recentProjects, setRecentProjects] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Load last active project from localStorage
    const lastProjectId = localStorage.getItem('last_project_id');
    if (lastProjectId && !activeProject) {
      const project = projects.find(p => p.id === parseInt(lastProjectId));
      if (project) onProjectChange(project);
    }
  }, [projects, activeProject]);

  const handleSearch = async (q) => {
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    setLoading(true);
    try {
      const merged = await searchProjectsForSwitcher(q, projects);
      setSearchResults(merged);
    } catch (e) {
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleProjectSelect = (project) => {
    onProjectChange(project);
    localStorage.setItem('last_project_id', project.id.toString());
    setIsOpen(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  useEffect(() => {
    if (isOpen) {
      setRecentProjects(recentProjectsFromList(projects, 8));
    }
  }, [isOpen, projects]);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
          padding: '12px 14px', borderRadius: '10px', border: 'none',
          background: `linear-gradient(135deg, ${activeProject?.color_theme || '#22d3ee'}20, ${activeProject?.color_theme || '#22d3ee'}10)`,
          border: `1px solid ${activeProject?.color_theme || '#22d3ee'}40`,
          cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left'
        }}
      >
        <div style={{
          width: '8px', height: '8px', borderRadius: '50%',
          background: activeProject?.color_theme || '#22d3ee',
          boxShadow: `0 0 8px ${activeProject?.color_theme || '#22d3ee'}80`
        }} />
<div style={{ flex: 1, minWidth: 0 }}>
           <div style={{
             color: 'var(--c-text)', fontSize: '13px', fontWeight: '600',
             whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
           }}>
             {activeProject?.name || 'Sélectionner...'}
           </div>
           <div style={{
             color: activeProject?.color_theme || '#22d3ee', fontSize: '11px',
             fontWeight: '700', fontFamily: 'monospace'
           }}>
             {activeProject?.slug || '---'}
           </div>
         </div>
         {activeProject?.icon && (
           <div style={{
             fontSize: '18px', marginRight: '8px'
           }}>
             {activeProject.icon}
           </div>
         )}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      {isOpen && (
        <>
          <div 
            style={{
              position: 'fixed', inset: 0, zIndex: 9998,
              background: 'transparent'
            }}
            onClick={() => { setIsOpen(false); setSearchQuery(''); setSearchResults([]); }}
          />
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '8px',
            background: 'linear-gradient(145deg, rgba(15,23,42,0.98), rgba(30,41,59,0.98))',
            borderRadius: '16px', padding: '16px', zIndex: 9999,
            border: '1px solid rgba(148,163,184,0.15)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.4)'
          }}>
            {/* Search */}
            <div style={{ marginBottom: '12px', position: 'relative' }}>
              <svg style={{
                position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                color: 'var(--c-text4)', width: '16px', height: '16px', zIndex: 1
              }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                type="text"
                placeholder="Rechercher un projet..."
                value={searchQuery}
                onChange={e => handleSearch(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px 10px 38px', borderRadius: '10px',
                  border: '1px solid rgba(148,163,184,0.2)',
                  background: 'var(--c-ba85)', color: 'var(--c-text)', fontSize: '13px',
                  outline: 'none', fontFamily: 'inherit'
                }}
                autoFocus
              />
            </div>

            <div style={{ maxHeight: '280px', overflowY: 'auto', marginRight: '-8px', marginLeft: '-8px', padding: '0 8px' }}
                 onWheel={e => e.stopPropagation()}>
              {searchQuery ? (
                loading ? (
                  <div style={{ padding: '16px', textAlign: 'center', color: 'var(--c-text4)' }}>
                    Recherche...
                  </div>
                ) : searchResults.length > 0 ? (
                  searchResults.map(p => (
                    <button
                      key={p.id}
                      onClick={() => handleProjectSelect(p)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '10px 12px', borderRadius: '8px', border: 'none',
                        background: 'transparent', color: 'var(--c-text)', cursor: 'pointer',
                        transition: 'all 0.15s', textAlign: 'left'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{
                        width: '6px', height: '6px', borderRadius: '50%',
                        background: p.color_theme || '#22d3ee'
                      }} />
                      <div style={{ flex: 1, fontSize: '13px' }}>{p.name}</div>
                      <div style={{
                        color: p.color_theme || '#22d3ee', fontSize: '10px',
                        fontWeight: '700', fontFamily: 'monospace'
                      }}>
                        {p.slug}
                      </div>
                    </button>
                  ))
                ) : (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--c-text4)', fontSize: '13px' }}>
                    Aucun résultat
                  </div>
                )
              ) : (
                <>
                  <div style={{
                    color: 'var(--c-text4)', fontSize: '10px', fontWeight: '700',
                    textTransform: 'uppercase', letterSpacing: '0.1em', padding: '8px 12px', marginBottom: '4px'
                  }}>
                    Récents ({recentProjects.length})
                  </div>
                  {recentProjects.length > 0 ? (
                    recentProjects.map(p => (
                      <button
                        key={p.id}
                        onClick={() => handleProjectSelect(p)}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                          padding: '10px 12px', borderRadius: '8px', border: 'none',
                          background: 'transparent', color: 'var(--c-text)', cursor: 'pointer',
                          transition: 'all 0.15s', textAlign: 'left'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{
                          width: '6px', height: '6px', borderRadius: '50%',
                          background: p.color_theme || '#22d3ee'
                        }} />
                        <div style={{ flex: 1, fontSize: '13px' }}>{p.name}</div>
                        <div style={{
                          color: p.color_theme || '#22d3ee', fontSize: '10px',
                          fontWeight: '700', fontFamily: 'monospace'
                        }}>
                          {p.slug}
                        </div>
                        <div style={{
                          color: 'var(--c-text5)', fontSize: '11px',
                          background: 'rgba(79,70,229,0.1)', padding: '2px 6px',
                          borderRadius: '4px', fontWeight: '600'
                        }}>
                          {p.task_count}
                        </div>
                      </button>
                    ))
                  ) : (
                    <div style={{ padding: '16px', textAlign: 'center', color: 'var(--c-text4)', fontSize: '13px' }}>
                      Aucun projet récent
                    </div>
                  )}

                  <div style={{
                    height: '1px', background: 'rgba(148,163,184,0.1)',
                    margin: '12px 0'
                  }} />

                  <div style={{
                    color: 'var(--c-text4)', fontSize: '10px', fontWeight: '700',
                    textTransform: 'uppercase', letterSpacing: '0.1em', padding: '8px 12px', marginBottom: '4px'
                  }}>
                    Tous les projets ({projects.length})
                  </div>
                  {projects.map(p => (
                    <button
                      key={p.id}
                      onClick={() => handleProjectSelect(p)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '10px 12px', borderRadius: '8px', border: 'none',
                        background: activeProject?.id === p.id ? 'rgba(34,211,238,0.1)' : 'transparent',
                        color: 'var(--c-text)', cursor: 'pointer', transition: 'all 0.15s', textAlign: 'left'
                      }}
                      onMouseEnter={e => {
                        if (activeProject?.id !== p.id) {
                          e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                        }
                      }}
                      onMouseLeave={e => {
                        if (activeProject?.id !== p.id) {
                          e.currentTarget.style.background = 'transparent';
                        }
                      }}
                    >
                      <div style={{
                        width: '6px', height: '6px', borderRadius: '50%',
                        background: p.color_theme || '#22d3ee'
                      }} />
                      <div style={{ flex: 1, fontSize: '13px' }}>{p.name}</div>
                      <div style={{
                        color: p.color_theme || '#22d3ee', fontSize: '10px',
                        fontWeight: '700', fontFamily: 'monospace'
                      }}>
                        {p.slug}
                      </div>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}