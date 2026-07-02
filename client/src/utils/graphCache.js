const graphCache = new Map();
const kanbanPayloadCache = new Map();

export function getCachedGraph(projectId) {
  return graphCache.get(Number(projectId)) ?? null;
}

export function setCachedGraph(projectId, graph) {
  graphCache.set(Number(projectId), graph);
}

export function getCachedKanbanPayload(projectId) {
  return kanbanPayloadCache.get(Number(projectId)) ?? null;
}

export function setCachedKanbanPayload(projectId, payload) {
  if (payload) kanbanPayloadCache.set(Number(projectId), payload);
}

export function clearCachedGraph(projectId) {
  graphCache.delete(Number(projectId));
  kanbanPayloadCache.delete(Number(projectId));
}
