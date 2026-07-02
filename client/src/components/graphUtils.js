import { getDeadlineUrgency } from '../utils/deadlineColors.js';

/**
 * Determines edge color based on the parent task's status
 * @param {Object} parentTask - The task that is the dependency source
 * @returns {string} - CSS color value
 */
export function getEdgeColorFromParent(parentTask) {
  if (!parentTask) return 'var(--c-text4)';

  if (parentTask.validation_status === 'rejected' || parentTask.status === 'rejected') {
    return 'var(--c-danger)';
  }
  if (parentTask.column_name === 'done') {
    return 'var(--c-success)';
  }
  if (parentTask.column_name === 'inProgress') {
    const urgency = getDeadlineUrgency(parentTask);
    if (urgency.state === 'overdue' || urgency.state === 'critical') {
      return 'var(--c-danger)';
    }
    if (urgency.state === 'warning') {
      return 'var(--c-warning)';
    }
    if (urgency.state === 'on_track') {
      return 'var(--c-success)';
    }
    return 'var(--c-info)';
  }
  return 'var(--c-text4)';
}
