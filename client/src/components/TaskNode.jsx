import React from 'react';
import { Handle, Position } from 'reactflow';
import { AlertCircle, Calendar, User } from 'lucide-react';

const priorityColors = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#3b82f6'
};

const columnColors = {
  todo: '#64748b',
  inProgress: '#3b82f6',
  review: '#f59e0b',
  done: '#10b981'
};

function TaskNode({ data, selected }) {
  const { title, id, priority, column_name, assignee_name, due_date, canEdit } = data;

  const priorityColor = priorityColors[priority] || '#64748b';
  const columnColor = columnColors[column_name] || '#64748b';

  return (
    <div
      style={{
        background: 'rgba(30, 41, 59, 0.95)',
        borderRadius: '16px',
        border: `2px solid ${selected ? '#22d3ee' : columnColor}`,
        padding: '16px',
        minWidth: '200px',
        maxWidth: '220px',
        boxShadow: selected ? '0 0 20px rgba(34, 211, 238, 0.4)' : '0 4px 12px rgba(0, 0, 0, 0.3)',
        transition: 'all 0.2s ease',
        cursor: 'pointer',
        userSelect: 'none'
      }}
      onClick={() => data.onClick && data.onClick()}
    >
      {/* Input port (left) - always rendered for edge attachment */}
      <Handle
        type="target"
        position={Position.Left}
        style={{
          width: '12px',
          height: '12px',
          background: canEdit ? '#22d3ee' : '#64748b',
          border: '2px solid #1e293b',
          cursor: canEdit ? 'crosshair' : 'default'
        }}
      />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: priorityColor
            }}
            title={`Priorité: ${priority}`}
          />
          <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--c-text3)' }}>#{id}</span>
        </div>
        {priority === 'high' && (
          <AlertCircle size={12} color="#ef4444" />
        )}
      </div>

      {/* Body - Title */}
      <div
        style={{
          fontSize: '14px',
          fontWeight: '600',
          color: 'var(--c-text)',
          marginBottom: '8px',
          lineHeight: '1.3',
          wordWrap: 'break-word'
        }}
      >
        {title}
      </div>

      {/* Footer - Assignee & Due Date */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', color: 'var(--c-text4)' }}>
        {assignee_name && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <User size={10} />
            <span>{assignee_name.split(' ')[0]}</span>
          </div>
        )}
        {due_date && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Calendar size={10} />
            <span>{new Date(due_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
          </div>
        )}
      </div>

      {/* Output port (right) - always rendered for edge attachment */}
      <Handle
        type="source"
        position={Position.Right}
        style={{
          width: '12px',
          height: '12px',
          background: canEdit ? '#22d3ee' : '#64748b',
          border: '2px solid #1e293b',
          cursor: canEdit ? 'crosshair' : 'default'
        }}
      />
    </div>
  );
}

export default TaskNode;
