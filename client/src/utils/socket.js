import { io } from 'socket.io-client';
import { getApiUrl } from './apiHelpers.js';

let socket = null;
let lastAuthToken = null;

/**
 * Connexion Socket.IO authentifiée (le backend refuse sans JWT dans auth).
 */
export function getAuthSocket() {
  const token = localStorage.getItem('auth_token');
  if (!token) return null;
  if (socket && lastAuthToken !== token) {
    socket.disconnect();
    socket.removeAllListeners();
    socket = null;
  }
  if (!socket) {
    lastAuthToken = token;
    const base = getApiUrl();
    socket = io(base, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
    });

    socket.on('connect_error', async (err) => {
      const refreshToken = localStorage.getItem('auth_refresh_token');
      if (!refreshToken) {
        disconnectAuthSocket();
        localStorage.removeItem('auth_token');
        window.location.href = '/auth';
        return;
      }
      try {
        const res = await fetch(`${base}/api/auth/refresh`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${refreshToken}` },
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.access) {
          localStorage.setItem('auth_token', data.access);
          lastAuthToken = null;
          if (socket) {
            socket.auth = { token: data.access };
            socket.connect();
          }
        } else {
          disconnectAuthSocket();
          localStorage.removeItem('auth_token');
          localStorage.removeItem('auth_refresh_token');
          window.location.href = '/auth';
        }
      } catch (_) {
        disconnectAuthSocket();
      }
    });
  }
  return socket;
}

export function disconnectAuthSocket() {
  if (socket) {
    socket.disconnect();
    socket.removeAllListeners();
    socket = null;
  }
  lastAuthToken = null;
}

export function joinProjectRoom(projectId) {
  const s = getAuthSocket();
  if (!s || !projectId) return;
  const join = () => s.emit('join_project', {
    project_id: projectId,
    token: localStorage.getItem('auth_token'),
  });
  if (s.connected) join();
  else s.once('connect', join);
}

export function leaveProjectRoom(projectId) {
  if (socket?.connected && projectId) {
    socket.emit('leave_project', {
      project_id: projectId,
      token: localStorage.getItem('auth_token'),
    });
  }
}

/** @deprecated Préférer getAuthSocket + socket.on directement */
export const initSocket = getAuthSocket;

export const getSocket = () => socket;

export const onTaskEvent = (event, callback) => {
  const socketInstance = getAuthSocket();
  if (socketInstance) socketInstance.on(event, callback);
};

export const offTaskEvent = (event, callback) => {
  if (socket) socket.off(event, callback);
};
