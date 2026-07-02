import { getApiUrl, authJsonHeaders } from './apiHelpers.js';

const API = getApiUrl();
const messageCache = new Map();
const inflight = new Map();

export function channelCacheKey(projectId, channelId) {
  return `p:${projectId}:c:${channelId ?? 'none'}`;
}

export function dmCacheKey(userId, targetId) {
  return `dm:${userId}:${targetId}`;
}

export function getCachedMessages(key) {
  return messageCache.get(key) ?? null;
}

export function setCachedMessages(key, messages) {
  messageCache.set(key, messages);
}

export function resolveSenderName(msg, currentUser, members = [], dmTarget = null) {
  if (msg.sender?.name) return msg.sender.name;
  const sid = Number(msg.sender?.id ?? msg.sender_id);
  if (sid === Number(currentUser?.id)) return currentUser?.name || currentUser?.nom || 'Moi';
  if (dmTarget && sid === Number(dmTarget.id)) return dmTarget.name || dmTarget.email || 'Membre';
  const member = members.find((m) => Number(m.id) === sid);
  return member?.name || member?.email || 'Membre';
}

async function fetchJson(url, signal) {
  const res = await fetch(url, { headers: authJsonHeaders(), signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchChannelMessages(projectId, channelId, signal) {
  const qs = new URLSearchParams({ per_page: '50', page: '1', light: 'true' });
  if (channelId) qs.set('channel_id', String(channelId));
  const data = await fetchJson(`${API}/api/messages/project/${projectId}?${qs}`, signal);
  return data.messages || [];
}

export async function fetchDmMessages(targetUserId, signal) {
  const qs = new URLSearchParams({ per_page: '50', page: '1', light: 'true' });
  const data = await fetchJson(`${API}/api/messages/dm/${targetUserId}?${qs}`, signal);
  return data.messages || [];
}

export function prefetchChannelMessages(projectId, channelId) {
  const key = channelCacheKey(projectId, channelId);
  if (messageCache.has(key) || inflight.has(key)) return inflight.get(key);

  const promise = fetchChannelMessages(projectId, channelId)
    .then((messages) => {
      setCachedMessages(key, messages);
      inflight.delete(key);
      return messages;
    })
    .catch(() => {
      inflight.delete(key);
      return null;
    });

  inflight.set(key, promise);
  return promise;
}
