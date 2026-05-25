import { useState, useEffect } from 'react';
import ProjectWizard from './ProjectWizard.jsx';
import { getApiUrl, recentProjectsFromList, searchProjectsForSwitcher } from '../services/backendApi.js';
import { authJsonHeaders } from '../utils/apiHelpers.js';

export default function ProjectSwitcherModal({ isOpen, onClose, activeProject, onProjectChange, projects, onCreateProject, user }) {
  const [view, setView] = useState('switcher');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [recentProjects, setRecentProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const isGestionnaire = user?.role === 'admin' || user?.userRole === 'gestionnaire';

  useEffect(() => {
    if (isOpen && view === 'switcher') {
      setRecentProjects(recentProjectsFromList(projects, 8));
    }
  }, [isOpen, view, projects]);

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
    onClose();
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleDeleteProject = async (projectId, e) => {
    e.stopPropagation();
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce projet ? Toutes les données associées seront perdues.')) {
      return;
    }
    try {
      const res = await fetch(`${getApiUrl()}/api/projects/${projectId}`, {
        method: 'DELETE',
        headers: authJsonHeaders(),
      });
      if (res.ok) {
        window.location.reload();
      }
    } catch (e) {
      console.log('Error deleting project');
    }
  };

  const handleBack = () => {
    setView('switcher');
    setSearchQuery('');
    setSearchResults([]);
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start',
      padding: '80px 24px 24px',
      background: 'rgba(0,0,0,0.6)',
      backdropFilter: 'blur(4px)',
      overflowY: 'auto'
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '480px',
          background: 'linear-gradient(145deg, rgba(15,23,42,0.98), rgba(30,41,59,0.98))',
          borderRadius: '20px', padding: '24px',
          border: '1px solid rgba(148,163,184,0.15)',
          boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
          margin: '0 auto'
        }}
      >
        {view === 'create' ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
              <button
                onClick={handleBack}
                style={{
                  width: '32px', height: '32px', borderRadius: '8px',
                  border: 'none', background: 'rgba(255,255,255,0.05)',
                  color: 'var(--c-text3)', cursor: 'pointer', display: 'flex',
                  alignItems: 'center', justifyContent: 'center'
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="19" y1="12" x2="5" y2="12"></line>
                  <polyline points="12 19 5 12 12 5"></polyline>
                </svg>
              </button>
              <h2 style={{ color: 'var(--c-text)', fontSize: '18px', fontWeight: '700' }}>
                Créer un projet
              </h2>
            </div>
             <ProjectWizard onComplete={(projectData) => { onCreateProject(projectData); onClose(); }} onCancel={onClose} />
          </>
        ) : (
          <>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h2 style={{ color: 'var(--c-text)', fontSize: '18px', fontWeight: '700' }}>
                    Changer d'espace
                  </h2>
                  <p style={{ color: 'var(--c-text4)', fontSize: '13px', marginTop: '2px' }}>
                    {activeProject?.name}
                  </p>
                </div>
                <button
                  onClick={() => setView('create')}
                  style={{
                    padding: '8px 16px', borderRadius: '8px',
                    border: '1px solid rgba(34,211,238,0.3)',
                    background: 'rgba(34,211,238,0.1)',
                    color: '#22d3ee', fontSize: '13px', fontWeight: '600',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  Nouveau
                </button>
              </div>

              <div style={{ position: 'relative' }}>
                <svg style={{
                  position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--c-text4)', width: '16px', height: '16px', zIndex: 1
                }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input
                  type="text"
                  placeholder="Rechercher..."
                  value={searchQuery}
                  onChange={e => handleSearch(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px 10px 38px', borderRadius: '10px',
                    border: '1px solid rgba(148,163,184,0.2)',
                    background: 'var(--c-ba85)', color: 'var(--c-text)', fontSize: '13px',
                    outline: 'none', fontFamily: 'inherit'
                  }}
                />
              </div>
            </div>

            <div style={{ maxHeight: '300px', overflowY: 'auto', marginRight: '-8px', marginLeft: '-8px', padding: '0 8px' }}
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
                        width: '24px', height: '24px', borderRadius: '6px',
                        background: `linear-gradient(135deg, ${p.color_theme || '#22d3ee'}, ${(p.color_theme || '#22d3ee')}dd)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '12px'
                      }}>
                        {p.icon || p.name?.charAt(0).toUpperCase() || '?'}
                      </div>
                      <div style={{ flex: 1, fontSize: '13px' }}>{p.name}</div>
                      <div style={{
                        color: p.color_theme || '#22d3ee', fontSize: '10px',
                        fontWeight: '700', fontFamily: 'monospace'
                      }}>
                        {p.slug}
                      </div>
                      {isGestionnaire && (
                        <button
                          onClick={(e) => handleDeleteProject(p.id, e)}
                          style={{
                            padding: '4px', borderRadius: '4px', border: 'none',
                            background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                            cursor: 'pointer', marginLeft: '4px'
                          }}
                          title="Supprimer le projet"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                          </svg>
                        </button>
                      )}
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
                          width: '24px', height: '24px', borderRadius: '6px',
                          background: `linear-gradient(135deg, ${p.color_theme || '#22d3ee'}, ${(p.color_theme || '#22d3ee')}dd)`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '12px'
                        }}>
                          {p.icon || p.name?.charAt(0).toUpperCase() || '?'}
                        </div>
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
                        {isGestionnaire && (
                          <button
                            onClick={(e) => handleDeleteProject(p.id, e)}
                            style={{
                              padding: '4px', borderRadius: '4px', border: 'none',
                              background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                              cursor: 'pointer', marginLeft: '4px'
                            }}
                            title="Supprimer le projet"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="18" y1="6" x2="6" y2="18"></line>
                              <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                          </button>
                        )}
                      </button>
                    ))
                  ) : (
                    <div style={{ padding: '16px', textAlign: 'center', color: 'var(--c-text4)', fontSize: '13px' }}>
                      Aucun projet récent - Créez-en un !
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
                        width: '24px', height: '24px', borderRadius: '6px',
                        background: `linear-gradient(135deg, ${p.color_theme || '#22d3ee'}, ${(p.color_theme || '#22d3ee')}dd)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '12px'
                      }}>
                        {p.icon || p.name?.charAt(0).toUpperCase() || '?'}
                      </div>
                      <div style={{ flex: 1, fontSize: '13px' }}>{p.name}</div>
                      <div style={{
                        color: p.color_theme || '#22d3ee', fontSize: '10px',
                        fontWeight: '700', fontFamily: 'monospace'
                      }}>
                        {p.slug}
                      </div>
                      {isGestionnaire && (
                        <button
                          onClick={(e) => handleDeleteProject(p.id, e)}
                          style={{
                            padding: '4px', borderRadius: '4px', border: 'none',
                            background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                            cursor: 'pointer', marginLeft: '4px'
                          }}
                          title="Supprimer le projet"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                          </svg>
                        </button>
                      )}
                    </button>
                  ))}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}