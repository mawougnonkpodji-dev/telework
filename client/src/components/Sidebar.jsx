import { LayoutDashboard, Briefcase, ChevronLeft, ChevronRight, Settings, LogOut, Users, BarChart3, Lock, UserPlus, Folder, Network, Video, Zap } from 'lucide-react';

export default function Sidebar({
  currentView,
  onViewChange,
  user,
  collapsed,
  onToggleCollapse,
  onSwitcherOpen,
  isProjectAdmin = false,
  activeProject = null,
  onLogout,
}) {
  const isGestionnaire = user?.userRole === 'gestionnaire' || user?.role === 'admin';

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
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </div>
            <span style={{ fontSize: '15px', fontWeight: '700', color: 'var(--c-text)', letterSpacing: '-0.02em' }}>
              TELEWORK
            </span>
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--c-text4)',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {!collapsed && activeProject && (
        <button
          onClick={() => onSwitcherOpen(true)}
          style={{
            margin: '12px',
            padding: '10px 12px',
            background: 'rgba(34, 211, 238, 0.08)',
            border: '1px solid rgba(34, 211, 238, 0.2)',
            borderRadius: '10px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            textAlign: 'left',
          }}
        >
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '8px',
            background: `linear-gradient(135deg, ${activeProject.color_theme || '#22d3ee'}, ${activeProject.color_theme || '#0891b2'})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            flexShrink: 0,
          }}>
            {activeProject.icon || activeProject.name?.charAt(0).toUpperCase()}
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--c-text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {activeProject.name}
            </div>
            {activeProject.slug && (
              <div style={{ fontSize: '10px', color: 'var(--c-text4)' }}>{activeProject.slug}</div>
            )}
          </div>
        </button>
      )}

      <div style={{ flex: 1, padding: '8px', overflowY: 'auto' }}>
        <SidebarItem
          icon={<LayoutDashboard size={18} />}
          label="Management"
          active={currentView === 'management'}
          onClick={() => onViewChange('management')}
          collapsed={collapsed}
          color="#22d3ee"
        />
        <SidebarItem
          icon={<Briefcase size={18} />}
          label="Workspace"
          active={currentView === 'workspace'}
          onClick={() => onViewChange('workspace')}
          collapsed={collapsed}
          color="#8b5cf6"
        />
        <SidebarItem
          icon={<Network size={18} />}
          label="Structure"
          active={currentView === 'structure-map'}
          onClick={() => onViewChange('structure-map')}
          collapsed={collapsed}
          color="#06b6d4"
        />
        <SidebarItem
          icon={<Video size={18} />}
          label="Réunion"
          active={currentView === 'meeting'}
          onClick={() => onViewChange('meeting')}
          collapsed={collapsed}
          color="#a855f7"
        />

        {isProjectAdmin && (
          <SidebarItem
            icon={<Users size={18} />}
            label="Équipe"
            active={currentView === 'team'}
            onClick={() => onViewChange('team')}
            collapsed={collapsed}
            color="#10b981"
          />
        )}

        {(isProjectAdmin || user?.role === 'observateur') && (
          <SidebarItem
            icon={<BarChart3 size={18} />}
            label="Rapports"
            active={currentView === 'reports'}
            onClick={() => onViewChange('reports')}
            collapsed={collapsed}
            color="#f59e0b"
          />
        )}

        {isProjectAdmin && (
          <SidebarItem
            icon={<Zap size={18} />}
            label="Sprints"
            active={currentView === 'sprints'}
            onClick={() => onViewChange('sprints')}
            collapsed={collapsed}
            color="#eab308"
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
          onClick={() => onLogout?.()}
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
