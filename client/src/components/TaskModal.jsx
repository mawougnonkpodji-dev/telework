import { useState, useEffect, useRef } from 'react';
import {
  X, Calendar, User, Hash,
  Check, ChevronDown, Search, Zap, Clock, Folder, Lock, FileText
} from 'lucide-react';

const XP_OPTIONS = [
  { value: 10, label: 'Facile', color: '#22d3ee' },
  { value: 30, label: 'Moyen', color: '#22d3ee' },
  { value: 60, label: 'Difficile', color: '#22d3ee' },
  { value: 100, label: 'Critique', color: '#22d3ee' }
];

function formatTimeRemaining(deadline) {
  if (!deadline) return '';
  const now = new Date();
  const deadlineDate = new Date(deadline);
  const diff = deadlineDate - now;
  
  if (diff < 0) return 'En retard';
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}j ${hours % 24}h`;
  if (hours > 0) return `${hours}h`;
  return '< 1h';
}

export default function TaskModal({ 
  isOpen, 
  onClose, 
  onSubmit, 
  task, 
  project, 
  teamMembers = [],
  allTasks = [],
  mode = 'create' 
}) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    xp: 30,
    deadline: '',
    assignee_id: null,
    dependency_id: ''
  });
  
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showMemberDropdown, setShowMemberDropdown] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [shakeField, setShakeField] = useState(null);
  
  const titleRef = useRef(null);
  const dropdownRef = useRef(null);
  
useEffect(() => {
    if (isOpen) {
      if (task && mode === 'edit') {
        const formatDateForInput = (dateStr) => {
            if (!dateStr) return '';
            const d = new Date(dateStr);
            return d.toISOString().slice(0, 16);
          };
          setForm({
            title: task.title || '',
            description: task.description || '',
            xp: task.xp || task.complexity || 30,
            deadline: formatDateForInput(task.due_date || task.deadline || task.dueDate),
            assignee_id: task.assignee_id || task.assignee?.id || task.assignees?.[0] || null,
            deliverable_type: task.deliverable_type || task.deliverableType || 'aucun',
            dependency_id:
              (Array.isArray(task.depends_on) && task.depends_on[0]) || task.dependency_id || ''
          });
      } else {
        setForm({
          title: '',
          description: '',
          xp: 30,
          deadline: '',
          assignee_id: null,
                dependency_id: ''
        });
      }
      setErrors({});
      setLoading(false);
      setMemberSearch('');
      setTimeout(() => titleRef.current?.focus(), 100);
    }
  }, [isOpen, task, mode]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowMemberDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  const filteredMembers = teamMembers.filter(m => 
    m.name?.toLowerCase().includes(memberSearch.toLowerCase()) ||
    m.nom?.toLowerCase().includes(memberSearch.toLowerCase())
  );
  
  const validateForm = () => {
    const newErrors = {};
    if (!form.title.trim()) newErrors.title = true;
    if (!form.deadline) newErrors.deadline = true;
    if (!form.assignee_id) newErrors.assignee = true;
    
    setErrors(newErrors);
    
    if (Object.keys(newErrors).length > 0) {
      Object.keys(newErrors).forEach(field => {
        setShakeField(field);
        setTimeout(() => setShakeField(null), 500);
      });
      return false;
    }
    return true;
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    
    setLoading(true);
    
    try {
      const taskData = {
        title: form.title,
        description: form.description,
        xp: form.xp,
        complexity: form.xp,
        due_date: form.deadline,
        deadline: form.deadline,
        assignee_id: form.assignee_id,
        project_id: project?.id,
        column_name: 'todo',
        dependency_id: form.dependency_id || null
      };
      
      if (task?.id && mode === 'edit') {
        taskData.id = task.id;
      }
      
      await onSubmit(taskData);
      onClose();
    } catch (err) {
      console.error('Error creating task:', err);
    } finally {
      setLoading(false);
    }
  };
  
  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };
  
  const selectedMember = teamMembers.find(m => m.id === form.assignee_id);
  const isValid = form.title.trim() && form.deadline && form.assignee_id;
  
  if (!isOpen) return null;
  
  return (
    <div 
      className="task-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="task-modal">
        <div className="task-modal-header">
          <h2 className="task-modal-title">
            {mode === 'edit' ? 'Modifier la tâche' : 'Nouvelle tâche'}
          </h2>
          <button className="task-modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="task-modal-body">
          {project && (
            <div className="task-project-badge">
              <Folder size={14} />
              <span>{project.name}</span>
            </div>
          )}
          
          <div className="task-form-group">
            <label className="task-label">
              <Hash size={12} />
              Titre de la tâche
            </label>
            <input
              ref={titleRef}
              type="text"
              className={`task-input ${shakeField === 'title' ? 'shake' : ''} ${errors.title ? 'error' : ''}`}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="ex: Corriger le bug de connexion API"
            />
          </div>
          
          <div className="task-form-group">
            <label className="task-label">
              <FileText size={12} />
              Description
            </label>
            <textarea
              className="task-textarea"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Détaillez les étapes, les ressources..."
              rows={4}
            />
          </div>
          
          <div className="task-grid">
            <div className="task-form-group">
              <label className="task-label">
                <Zap size={12} />
                Complexité / XP
              </label>
              <div className="xp-segments">
                {XP_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`xp-segment ${form.xp === opt.value ? 'active' : ''}`}
                    onClick={() => setForm({ ...form, xp: opt.value })}
                  >
                    <span className="xp-value">{opt.value}</span>
                    <span className="xp-label">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
            
            <div className="task-form-group">
              <label className="task-label">
                <Calendar size={12} />
                Date Limite
              </label>
              <div className="deadline-input-wrapper">
                <input
                  type="datetime-local"
                  className={`task-input deadline-input ${shakeField === 'deadline' ? 'shake' : ''} ${errors.deadline ? 'error' : ''}`}
                  value={form.deadline}
                  onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                />
                <Calendar size={16} className="deadline-icon" />
              </div>
              {form.deadline && (
                <div className="deadline-remaining">
                  Temps restant : <span>{formatTimeRemaining(form.deadline)}</span>
                </div>
              )}
            </div>
           </div>
           
           <div className="task-grid">
            <div className="task-form-group" ref={dropdownRef}>
              <label className="task-label">
                <User size={12} />
                Assigner à
              </label>
              <div className="member-select">
                <button
                  type="button"
                  className={`member-select-button ${shakeField === 'assignee' ? 'shake' : ''} ${errors.assignee ? 'error' : ''}`}
                  onClick={() => setShowMemberDropdown(!showMemberDropdown)}
                >
                  {selectedMember ? (
                    <div className="member-selected">
                      <div className="member-avatar">
                        {getInitials(selectedMember.name || selectedMember.nom)}
                      </div>
                      <span>{selectedMember.name || selectedMember.nom}</span>
                    </div>
                  ) : (
                    <span className="member-placeholder">Sélectionner un membre...</span>
                  )}
                  <ChevronDown size={16} />
                </button>
                
                {showMemberDropdown && (
                  <div className="member-dropdown">
                    <div className="member-search">
                      <Search size={14} />
                      <input
                        type="text"
                        placeholder="Rechercher..."
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                      />
                    </div>
                    <div className="member-list">
                      {filteredMembers.length === 0 ? (
                        <div className="member-empty">Aucun membre trouvé</div>
                      ) : (
                        filteredMembers.map((member) => (
                          <button
                            key={member.id}
                            type="button"
                            className={`member-option ${form.assignee_id === member.id ? 'selected' : ''}`}
                            onClick={() => {
                              setForm({ ...form, assignee_id: member.id });
                              setShowMemberDropdown(false);
                              setMemberSearch('');
                            }}
                          >
                            <div className="member-avatar">
                              {getInitials(member.name || member.nom)}
                            </div>
                            <span>{member.name || member.nom}</span>
                            {form.assignee_id === member.id && <Check size={14} />}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            
            {/* Dépendance */}
            <div className="task-form-group">
              <label className="task-label">
                <Lock size={12} />
                Dépend de (Optionnel)
              </label>
              <select
                value={form.dependency_id || ''}
                onChange={(e) => setForm({ ...form, dependency_id: e.target.value ? parseInt(e.target.value) : '' })}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '10px',
                  color: '#fff',
                  fontSize: '14px',
                  outline: 'none'
                }}
              >
                <option value="">Aucune dépendance</option>
                {allTasks
                  .filter(t => t.id !== task?.id)
                  .map(t => (
                    <option key={t.id} value={t.id}>
                      #{t.id} - {t.title}
                    </option>
                  ))
                }
              </select>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>
                Cette tâche ne pourra démarrer que lorsque la tâche parente sera terminée.
              </div>
            </div>
          </div>
        </form>
        
        <div className="task-modal-footer">
          <button 
            type="button" 
            className="btn-cancel"
            onClick={onClose}
          >
            Annuler
          </button>
          <button
            type="submit"
            className={`btn-submit ${!isValid || loading ? 'disabled' : ''}`}
            disabled={!isValid || loading}
            onClick={handleSubmit}
          >
            {loading ? (
              <div className="btn-spinner" />
            ) : (
              <span>
                {mode === 'edit' ? 'Enregistrer' : `Créer la Tâche (+ ${form.xp} XP)`}
              </span>
            )}
          </button>
        </div>
      </div>
      
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-4px); }
          40%, 80% { transform: translateX(4px); }
        }
        
        @keyframes modalEnter {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        .task-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.85);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: fadeIn 0.2s ease;
        }
        
        .task-modal {
          background: rgba(15, 23, 42, 0.8);
          backdrop-filter: blur(20px);
          border-radius: 24px;
          width: 90%;
          max-width: 560px;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-image: linear-gradient(to bottom right, rgba(255,255,255,0.2), rgba(255,255,255,0.05)) 1;
          animation: modalEnter 0.3s ease;
        }
        
        .task-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 24px 28px 0;
        }
        
        .task-modal-title {
          font-size: 24px;
          font-weight: 700;
          color: #fff;
          margin: 0;
        }
        
        .task-modal-close {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          color: #94a3b8;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .task-modal-close:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }
        
        .task-modal-body {
          padding: 24px 28px;
        }
        
        .task-project-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          background: rgba(99, 102, 241, 0.15);
          border-radius: 20px;
          font-size: 14px;
          color: #94a3b8;
          margin-bottom: 20px;
        }
        
        .task-project-badge svg {
          color: #6366f1;
        }
        
        .task-form-group {
          margin-bottom: 20px;
        }
        
        .task-label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          font-weight: 600;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-bottom: 10px;
        }
        
        .task-label svg {
          color: #6366f1;
        }
        
        .task-input {
          width: 100%;
          padding: 16px 18px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          color: #fff;
          font-size: 17px;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          outline: none;
          transition: all 0.2s;
        }
        
        .task-input::placeholder {
          color: #475569;
        }
        
        .task-input:focus {
          border-color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
        }
        
        .task-input.error {
          border-color: #ef4444;
          box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15);
        }
        
        .task-input.shake {
          animation: shake 0.5s ease;
        }
        
        .task-textarea {
          width: 100%;
          padding: 16px 18px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          color: #fff;
          font-size: 16px;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          outline: none;
          resize: vertical;
          min-height: 120px;
          transition: all 0.2s;
        }
        
        .task-textarea::placeholder {
          color: #475569;
        }
        
        .task-textarea:focus {
          border-color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
        }
        
        .task-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }
        
        @media (max-width: 540px) {
          .task-grid {
            grid-template-columns: 1fr;
          }
        }
        
        .xp-segments {
          display: flex;
          gap: 6px;
        }
        
        .xp-segment {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          padding: 10px 6px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          color: #64748b;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .xp-segment:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(255, 255, 255, 0.15);
        }
        
        .xp-segment.active {
          background: rgba(34, 211, 238, 0.15);
          border-color: #22d3ee;
          box-shadow: 0 0 12px rgba(34, 211, 238, 0.3);
        }
        
        .xp-segment.active .xp-value {
          color: #22d3ee;
        }
        
        .xp-segment.active .xp-label {
          color: #22d3ee;
        }
        
        .xp-value {
          font-size: 18px;
          font-weight: 700;
          color: #fff;
        }
        
        .xp-label {
          font-size: 11px;
          font-weight: 500;
          color: #64748b;
        }
        
        .xp-base {
          font-size: 12px;
          color: #64748b;
          margin-top: 8px;
          text-align: center;
        }
        
        .xp-base strong {
          color: #22d3ee;
          font-weight: 700;
        }
        
        .deadline-input-wrapper {
          position: relative;
        }
        
        .deadline-input {
          padding-right: 44px;
        }
        
        .deadline-icon {
          position: absolute;
          right: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: #6366f1;
          pointer-events: none;
        }
        
        .deadline-remaining {
          font-size: 12px;
          color: #64748b;
          margin-top: 8px;
        }
        
        .deadline-remaining span {
          color: #22d3ee;
          font-weight: 600;
        }
        
        .member-select {
          position: relative;
        }
        
        .member-select-button {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          color: #fff;
          font-size: 16px;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .member-select-button:focus {
          border-color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
        }
        
        .member-select-button.error {
          border-color: #ef4444;
        }
        
        .member-selected {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        
        .member-avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: 700;
          color: #fff;
        }
        
        .member-placeholder {
          color: #475569;
          font-size: 15px;
        }
        
        .member-dropdown {
          position: absolute;
          top: calc(100% + 6px);
          left: 0;
          right: 0;
          background: rgba(30, 41, 59, 0.95);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          overflow: hidden;
          z-index: 100;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
        }
        
        .member-search {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 14px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        
        .member-search svg {
          color: #64748b;
        }
        
        .member-search input {
          flex: 1;
          background: transparent;
          border: none;
          color: #fff;
          font-size: 14px;
          outline: none;
        }
        
        .member-search input::placeholder {
          color: #475569;
        }
        
        .member-list {
          max-height: 200px;
          overflow-y: auto;
        }
        
        .member-option {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 16px;
          background: transparent;
          border: none;
          color: #fff;
          font-size: 15px;
          cursor: pointer;
          transition: all 0.15s;
        }
        
        .member-option:hover {
          background: rgba(99, 102, 241, 0.15);
        }
        
        .member-option.selected {
          background: rgba(99, 102, 241, 0.2);
        }
        
        .member-option svg {
          margin-left: auto;
          color: #6366f1;
        }
        
        .member-empty {
          padding: 20px;
          text-align: center;
          color: #64748b;
          font-size: 13px;
        }
        
        
        .task-modal-footer {
          display: flex;
          gap: 12px;
          padding: 0 28px 28px;
        }
        
        .btn-cancel {
          flex: 1;
          padding: 16px 20px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          color: #94a3b8;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .btn-cancel:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
        }
        
        .btn-submit {
          flex: 2;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 16px 28px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          border: none;
          border-radius: 12px;
          color: #fff;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);
        }
        
        .btn-submit:hover:not(.disabled) {
          box-shadow: 0 6px 20px rgba(99, 102, 241, 0.5);
          transform: translateY(-1px);
        }
        
        .btn-submit.disabled {
          background: rgba(100, 116, 139, 0.3);
          color: #64748b;
          cursor: not-allowed;
          box-shadow: none;
        }
        
        .btn-spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}