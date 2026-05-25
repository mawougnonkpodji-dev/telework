/**
 * Determines edge color based on the parent task's status
 * @param {Object} parentTask - The task that is the dependency source
 * @returns {string} - Hex color code
 */
export function getEdgeColorFromParent(parentTask) {
  if (!parentTask) return '#64748b';

  if (parentTask.validation_status === 'rejected') {
    return '#ef4444'; // Red: blocked due to rejection
  }
  if (parentTask.column_name === 'done') {
    return '#10b981'; // Green: flow released
  }
  if (parentTask.column_name === 'inProgress') {
    return '#3b82f6'; // Blue: work in progress
  }
  return '#64748b'; // Gray: theoretical (todo/review waiting)
}
