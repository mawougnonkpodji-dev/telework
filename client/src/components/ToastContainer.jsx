import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, Clock, X } from 'lucide-react';

const toastContainer = {
  position: 'fixed',
  bottom: '24px',
  right: '24px',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  zIndex: 9999
};

const getBorderColor = (type) => {
  if (type === 'success') return '#10b981';
  if (type === 'error') return '#ef4444';
  return '#4f46e5';
};

const toastStyle = (type) => ({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '14px 16px',
  borderRadius: '12px',
  background: 'var(--c-surface)',
  boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
  border: `1px solid ${getBorderColor(type)}`,
  borderLeft: `4px solid ${getBorderColor(type)}`,
  minWidth: '280px',
  animation: 'slideIn 0.3s ease-out'
});

const iconMap = {
  success: <CheckCircle size={20} color="#10b981" />,
  error: <XCircle size={20} color="#ef4444" />,
  info: <Clock size={20} color="#4f46e5" />
};

export function Toast({ toast, onClose }) {
  const [isVisible, setIsVisible] = useState(true);
  
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(false), 3500);
    return () => clearTimeout(timer);
  }, []);
  
  useEffect(() => {
    if (!isVisible) {
      setTimeout(onClose, 300);
    }
  }, [isVisible, onClose]);
  
  return (
    <>
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(100%); opacity: 0; }
        }
      `}</style>
      <div style={{
        ...toastStyle(toast.type),
        animation: isVisible ? 'slideIn 0.3s ease-out' : 'slideOut 0.3s ease-out'
      }}>
        {iconMap[toast.type] || iconMap.info}
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--c-text)', margin: 0 }}>
            {toast.title}
          </p>
          {toast.message && (
            <p style={{ fontSize: '12px', color: 'var(--c-text4)', margin: '2px 0 0' }}>
              {toast.message}
            </p>
          )}
        </div>
        <button
          onClick={() => setIsVisible(false)}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--c-text5)',
            padding: '4px'
          }}
        >
          <X size={16} />
        </button>
      </div>
    </>
  );
}

let toastId = 0;
let listeners = [];

export const toast = {
  success: (title, message) => {
    const id = ++toastId;
    listeners.forEach(fn => fn({ id, type: 'success', title, message }));
  },
  error: (title, message) => {
    const id = ++toastId;
    listeners.forEach(fn => fn({ id, type: 'error', title, message }));
  },
  info: (title, message) => {
    const id = ++toastId;
    listeners.forEach(fn => fn({ id, type: 'info', title, message }));
  }
};

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);
  
  useEffect(() => {
    listeners.push((newToast) => {
      setToasts(prev => [...prev, newToast]);
    });
    return () => {
      listeners = listeners.filter(fn => fn !== listeners[0]);
    };
  }, []);
  
  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);
  
  if (toasts.length === 0) return null;
  
  return (
    <div style={toastContainer}>
      {toasts.map(t => (
        <Toast key={t.id} toast={t} onClose={() => removeToast(t.id)} />
      ))}
    </div>
  );
}