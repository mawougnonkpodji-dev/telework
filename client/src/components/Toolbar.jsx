import { Plus, Shield, User, Crown, UserPlus, LogOut, ChevronDown } from 'lucide-react';

export default function Toolbar({ onNewTask, teamName, currentUser, userRole }) {
  const isAdmin = userRole === 'Admin' || userRole === 'admin';
  
  const handleLogout = () => {
    if (confirm('Voulez-vous vraiment vous déconnecter?')) {
      localStorage.removeItem('glowup-user');
      localStorage.removeItem('glowup-team');
      localStorage.removeItem('auth_token');
      window.location.href = '/';
    }
  };
  
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px',
      height: '64px',
      background: '#fff',
      borderBottom: '1px solid #e5e7eb',
      flexShrink: 0
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <h1 style={{
          fontSize: '18px',
          fontWeight: '600',
          color: '#111827',
          letterSpacing: '0.5px'
        }}>
          {teamName || 'GLOWUP'}
        </h1>
        {isAdmin && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 10px',
            borderRadius: '20px',
            background: 'rgba(245,158,11,0.1)',
            border: '1px solid rgba(245,158,11,0.2)',
            fontSize: '11px',
            fontWeight: '600',
            color: '#f59e0b'
          }}>
            <Crown size={12} />
            Admin
          </span>
        )}
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {isAdmin && (
          <button 
            onClick={() => window.dispatchEvent(new CustomEvent('openInvite'))}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 16px',
              borderRadius: '10px',
              background: '#f3f4f6',
              border: 'none',
              color: '#4b5563',
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            <UserPlus size={16} />
            Inviter
          </button>
        )}
        
        <button onClick={onNewTask} style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 18px',
          borderRadius: '10px',
          background: '#4f46e5',
          border: 'none',
          color: '#fff',
          fontSize: '13px',
          fontWeight: '600',
          cursor: 'pointer'
        }}>
          <Plus size={18} />
          Nouvelle tâche
        </button>
        
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '6px 12px 6px 6px',
          background: '#f3f4f6',
          borderRadius: '24px'
        }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #4f46e5, #818cf8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: '14px',
            fontWeight: '600'
          }}>
            {currentUser?.charAt(0) || 'U'}
          </div>
          <span style={{ fontSize: '13px', fontWeight: '500', color: '#374151' }}>
            {currentUser}
          </span>
        </div>
        
        <button 
          onClick={handleLogout}
          title="Se déconnecter"
          style={{
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#fef2f2',
            border: 'none',
            borderRadius: '10px',
            color: '#ef4444',
            cursor: 'pointer'
          }}
        >
          <LogOut size={16} />
        </button>
      </div>
    </div>
  );
}