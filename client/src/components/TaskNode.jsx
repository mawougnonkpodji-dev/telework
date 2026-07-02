import React from 'react';
import { Handle, Position } from 'reactflow';
import { AlertCircle, Calendar, User } from 'lucide-react';
import { getDeadlineUrgency } from '../utils/deadlineColors.js';

const priorityColors = {
  high: 'var(--c-danger)',
  medium: 'var(--c-warning)',
  low: 'var(--c-info)',
};

const columnColors = {
  todo: 'var(--c-text4)',
  inProgress: 'var(--c-info)',
  review: 'var(--c-warning)',
  done: 'var(--c-success)',
};

function getNodeBorderColor(task, columnName, selected) {
  if (selected) return 'var(--c-accent)';
  if (columnName === 'inProgress' && (task?.deadline || task?.due_date)) {
    const urgency = getDeadlineUrgency(task);
    if (urgency.state !== 'unknown') return urgency.color;
  }
  return columnColors[columnName] || 'var(--c-text4)';
}

function TaskNode({ data, selected }) {
  const { title, id, priority, column_name, assignee_name, due_date, deadline, created_at, canEdit } = data;

  const priorityColor = priorityColors[priority] || 'var(--c-text4)';
  const borderColor = getNodeBorderColor({ deadline, due_date, created_at }, column_name, selected);
  const dueDate = due_date || deadline;
  const isOverdue = dueDate && new Date(dueDate).getTime() < Date.now() && column_name !== 'done';

  return (
    <div
      style={{
        background: 'var(--c-surface)',
        borderRadius: '16px',
        border: `2px solid ${borderColor}`,
        padding: '16px',
        minWidth: '200px',
        maxWidth: '220px',
        boxShadow: selected ? '0 0 20px color-mix(in srgb, var(--c-accent) 35%, transparent)' : 'var(--shadow-sm)',
        transition: 'all 0.2s ease',
        cursor: 'pointer',
        userSelect: 'none',
      }}
      onClick={() => data.onClick && data.onClick()}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          width: '12px',
          height: '12px',
          background: canEdit ? 'var(--c-accent)' : 'var(--c-text4)',
          border: '2px solid var(--c-surface)',
          cursor: canEdit ? 'crosshair' : 'default',
        }}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: priorityColor,
            }}
            title={`Priorité: ${priority}`}
          />
          <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--c-text4)' }}>#{id}</span>
        </div>
        {priority === 'high' && (
          <AlertCircle size={12} color="var(--c-danger)" />
        )}
      </div>

      <div
        style={{
          fontSize: '14px',
          fontWeight: '600',
          color: 'var(--c-text)',
          marginBottom: '8px',
          lineHeight: '1.3',
          wordWrap: 'break-word',
        }}
      >
        {title}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', color: 'var(--c-text4)' }}>
        {assignee_name && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <User size={10} />
            <span>{assignee_name.split(' ')[0]}</span>
          </div>
        )}
        {dueDate && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: isOverdue ? 'var(--c-danger)' : 'var(--c-text4)' }}>
            <Calendar size={10} />
            <span>{new Date(dueDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        style={{
          width: '12px',
          height: '12px',
          background: canEdit ? 'var(--c-accent)' : 'var(--c-text4)',
          border: '2px solid var(--c-surface)',
          cursor: canEdit ? 'crosshair' : 'default',
        }}
      />
    </div>
  );
}

export default TaskNode;
