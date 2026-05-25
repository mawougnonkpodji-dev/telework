import { useState, useEffect } from 'react';
import { LayoutDashboard, Briefcase, ChevronLeft, ChevronRight, Settings, LogOut, Users, BarChart3, Lock, UserPlus, Folder, Network, Video } from 'lucide-react';
import { getApiUrl, normalizeProjectsList, normalizeCreatedProject } from '../utils/apiHelpers.js';

const API_URL = getApiUrl();

export default function Sidebar({ currentView, onViewChange, user, collapsed, onToggleCollapse, onSwitcherOpen, isProjectAdmin = false }) {
  const isGestionnaire = user?.userRole === 'gestionnaire' || user?.role === 'admin';
  const [activeProject, setActiveProject] = useState(null);
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`${API_URL}/api/projects/`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const list = normalizeProjectsList(data);
        setProjects(list);
        if (list.length > 0) {
          const lastId = localStorage.getItem('last_project_id');
          const project = lastId ? list.find(p => p.id === parseInt(lastId, 10)) : list[0];
          setActiveProject(project || list[0]);
        }
      }
    };
    fetchData();
    
    const handleProjectChanged = (e) => {
      setActiveProject(e.detail);
    };
    window.addEventListener('projectChanged', handleProjectChanged);
    return () => window.removeEventListener('projectChanged', handleProjectChanged);
  }, []);

  const handleProjectChange = (project) => {
    setActiveProject(project);
    localStorage.setItem('last_project_id', project.id.toString());
    window.dispatchEvent(new CustomEvent('projectChanged', { detail: project }));
    onSwitcherOpen(false);
  };

  const handleCreateProject = async (projectData) => {
    const token = localStorage.getItem('auth_token');
    const res = await fetch(`${API_URL}/api/projects/`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}` 
      },
      body: JSON.stringify(projectData)
    });
    if (res.ok) {
      const body = await res.json();
      const newProject = normalizeCreatedProject(body) || body;
      if (!newProject?.id) return;
      setProjects(prev => [...prev, newProject]);
      setActiveProject(newProject);
      onSwitcherOpen(false);
      localStorage.setItem('last_project_id', newProject.id.toString());
      window.dispatchEvent(new CustomEvent('projectChanged', { detail: newProject }));
    }
  };

  return (
    <div style={{
      width: collapsed ? '60px' : '220px',
      height: '100vh',
      position: 'fixed',
      left: 0,
      top: 0,
      background: 'var(--c-sidebar)',
      backdropFilter: 'blur(20px)',
      borderRight: '1px solid var(--c-border)',
      display: 'flex',
      flexDirection: 'column',
      transition: 'width .3s ease, background .25s, border-color .25s',
      zIndex: 100,
    }}>
      <div style={{
        padding: '16px',
        borderBottom: '1px solid var(--c-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
      }}>
        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #22d3ee, #0891b2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0f172a" strokeWidth="2.5">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            </div>
            <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--c-text)' }}>TELEWORK</span>
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            border: 'none',
            background: 'var(--c-hover)',
            color: 'var(--c-text4)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      <div style={{ flex: 1, padding: '12px', display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto', overflowX: 'hidden' }}>
        {!collapsed && (
          <>
            <div style={{
              fontSize: '10px',
              fontWeight: '600',
              color: '#475569',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              padding: '12px 12px 4px'
            }}>
              Projet Actif
            </div>
            <button
              onClick={() => onSwitcherOpen(true)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
                padding: '14px 16px', borderRadius: '12px', border: 'none',
                background: `linear-gradient(135deg, ${activeProject?.color_theme || '#22d3ee'}15, ${activeProject?.color_theme || '#22d3ee'}08)`,
                border: `1px solid ${activeProject?.color_theme || '#22d3ee'}30`,
                cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left'
              }}
            >
              <div style={{
                width: '36px', height: '36px', borderRadius: '10px',
                background: `linear-gradient(135deg, ${activeProject?.color_theme || '#22d3ee'}, ${activeProject?.color_theme || '#22d3ee'}dd)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '16px', fontWeight: '700', color: '#0f172a'
              }}>
                {activeProject?.icon || activeProject?.name?.charAt(0).toUpperCase() || '?'}  
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  color: 'var(--c-text)', fontSize: '14px', fontWeight: '600',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {activeProject?.name || 'Chargement...'}
                </div>
                <div style={{
                  color: activeProject?.color_theme || '#22d3ee', fontSize: '11px',
                  fontWeight: '700', fontFamily: 'monospace'
                }}>
                  {activeProject?.slug || '---'} • {activeProject?.task_count || 0} tâches
                </div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--c-text4)" strokeWidth="2" style={{ flexShrink: 0 }}>
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
          </>
        )}

        {!collapsed && (
          <div style={{
            fontSize: '10px',
            fontWeight: '600',
            color: 'var(--c-text5)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            padding: '12px 12px 4px'
          }}>
            Exécution
          </div>
        )}

        <SidebarItem
          icon={<LayoutDashboard size={18} />}
          label="Workspace"
          active={currentView === 'workspace'}
          onClick={() => onViewChange('workspace')}
          collapsed={collapsed}
          color="#22d3ee"
        />

        {!collapsed && (
          <div style={{
            fontSize: '10px',
            fontWeight: '600',
            color: 'var(--c-text5)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            padding: '12px 12px 4px',
            marginTop: '12px'
          }}>
            Stratégie
          </div>
        )}

         <SidebarItem
          icon={<Briefcase size={18} />}
          label="Management"
          active={currentView === 'management'}
          onClick={() => onViewChange('management')}
          collapsed={collapsed}
          locked={!isGestionnaire}
          color="#10b981"
        />

        <SidebarItem
          icon={<Network size={18} />}
          label="Structure Map"
          active={currentView === 'structure-map'}
          onClick={() => onViewChange('structure-map')}
          collapsed={collapsed}
          color="#6366f1"
        />

        <SidebarItem
          icon={<Video size={18} />}
          label="Réunion"
          active={currentView === 'meeting'}
          onClick={() => onViewChange('meeting')}
          collapsed={collapsed}
          color="#06b6d4"
        />

        {isProjectAdmin && (
          <SidebarItem
            icon={<Users size={18} />}
            label="Équipe"
            active={currentView === 'team'}
            onClick={() => onViewChange('team')}
            collapsed={collapsed}
            color="#f59e0b"
          />
        )}

        {isProjectAdmin && (
          <SidebarItem
            icon={<BarChart3 size={18} />}
            label="Rapports"
            active={currentView === 'reports'}
            onClick={() => onViewChange('reports')}
            collapsed={collapsed}
            color="#8b5cf6"
          />
        )}

        {isProjectAdmin && (
          <SidebarItem
            icon={<UserPlus size={18} />}
            label="Invitations"
            active={currentView === 'invitations'}
            onClick={() => onViewChange('invitations')}
            collapsed={collapsed}
            color="#f97316"
          />
        )}

        <SidebarItem
          icon={<Folder size={18} />}
          label="Ressources"
          active={currentView === 'resources'}
          onClick={() => onViewChange('resources')}
          collapsed={collapsed}
          color="#ec4899"
        />
       </div>

      <div style={{ padding: '12px', borderTop: '1px solid var(--c-border)' }}>
        <SidebarItem
          icon={<Settings size={18} />}
          label="Paramètres"
          active={currentView === 'settings'}
          onClick={() => onViewChange('settings')}
          collapsed={collapsed}
        />
        <SidebarItem
          icon={<LogOut size={18} />}
          label="Déconnexion"
          onClick={() => {
            localStorage.removeItem('auth_token');
            window.location.reload();
          }}
          collapsed={collapsed}
          color="#ef4444"
        />
      </div>
    </div>
  );
}

function SidebarItem({ icon, label, active, onClick, collapsed, locked, color }) {
  return (
    <button
      onClick={locked ? null : onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: collapsed ? '10px' : '10px 12px',
        borderRadius: '8px',
        border: 'none',
        background: active ? 'rgba(34, 211, 238, 0.15)' : 'transparent',
        color: active ? 'var(--c-accent)' : locked ? 'var(--c-text5)' : 'var(--c-text3)',
        cursor: locked ? 'not-allowed' : 'pointer',
        transition: 'all 0.2s ease',
        justifyContent: collapsed ? 'center' : 'flex-start',
        opacity: locked ? 0.5 : 1
      }}
      title={collapsed ? label : undefined}
    >
      <div style={{ 
        color: active ? (color || '#22d3ee') : undefined,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        {icon}
      </div>
      {!collapsed && (
        <span style={{ fontSize: '13px', fontWeight: '500' }}>
          {label}
        </span>
      )}
      {locked && !collapsed && (
        <Lock size={12} style={{ marginLeft: 'auto' }} />
      )}
    </button>
  );
}