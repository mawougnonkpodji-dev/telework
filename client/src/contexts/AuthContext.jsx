import { createContext, useContext, useState, useEffect } from 'react';
import { disconnectAuthSocket } from '../utils/socket.js';
import { getApiUrl } from '../utils/apiHelpers.js';

const AuthContext = createContext(null);

const API_URL = getApiUrl();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('auth_token'));

  useEffect(() => {
    if (token) {
      fetchUserData();
    } else {
      setLoading(false);
    }
  }, [token]);

  const fetchUserData = async () => {
    try {
      const tok = localStorage.getItem('auth_token');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`${API_URL}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${tok}`
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
        setTeam(null);
      } else {
        logout();
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (!res.ok) {
        return { success: false, error: data.error };
      }

      if (data?.requires_2fa) {
        return {
          success: false,
          requires2FA: true,
          userId: data.user_id,
          message: data.message || 'Code 2FA requis'
        };
      }

      const accessToken = data?.tokens?.access;
      if (!accessToken) {
        return { success: false, error: 'Token d\'accès manquant dans la réponse backend' };
      }

      localStorage.setItem('auth_token', accessToken);
      if (data?.tokens?.refresh) {
        localStorage.setItem('auth_refresh_token', data.tokens.refresh);
      }
      setToken(accessToken);
      setUser(data.user);
      
      return { success: true, user: data.user };
    } catch (error) {
      return { success: false, error: 'Erreur de connexion' };
    }
  };

  const verify2FA = async (userId, otp) => {
    try {
      const res = await fetch(`${API_URL}/api/auth/verify-2fa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, otp })
      });

      const data = await res.json();

      if (!res.ok) {
        return { success: false, error: data.error || 'Code OTP invalide' };
      }

      const accessToken = data?.tokens?.access;
      if (!accessToken) {
        return { success: false, error: 'Token d\'accès manquant dans la réponse backend' };
      }

      localStorage.setItem('auth_token', accessToken);
      if (data?.tokens?.refresh) {
        localStorage.setItem('auth_refresh_token', data.tokens.refresh);
      }
      setToken(accessToken);
      setUser(data.user);

      return { success: true, user: data.user };
    } catch (error) {
      return { success: false, error: 'Erreur lors de la vérification 2FA' };
    }
  };

  const register = async (nom, email, password) => {
    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nom, email, password })
      });

      const data = await res.json();

      if (!res.ok) {
        return { success: false, error: data.error };
      }

      const accessToken = data?.tokens?.access;
      if (!accessToken) {
        return { success: false, error: 'Token d\'accès manquant dans la réponse backend' };
      }

      localStorage.setItem('auth_token', accessToken);
      if (data?.tokens?.refresh) {
        localStorage.setItem('auth_refresh_token', data.tokens.refresh);
      }
      setToken(accessToken);
      setUser(data.user);
      
      return { success: true, user: data.user };
    } catch (error) {
      return { success: false, error: 'Erreur de connexion' };
    }
  };

  const refreshAccessToken = async () => {
    const rt = localStorage.getItem('auth_refresh_token');
    if (!rt) {
      return { success: false, error: 'Aucun refresh token (reconnectez-vous)' };
    }
    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${rt}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.access) {
        return { success: false, error: data.error || 'Refresh échoué' };
      }
      localStorage.setItem('auth_token', data.access);
      setToken(data.access);
      await fetchUserData();
      return { success: true };
    } catch (e) {
      return { success: false, error: 'Erreur réseau' };
    }
  };

  const logout = () => {
    disconnectAuthSocket();
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_refresh_token');
    setToken(null);
    setUser(null);
    setTeam(null);
  };

  const value = {
    user,
    team,
    token,
    loading,
    isAdmin: user?.role === 'admin',
    isMember: user?.role === 'member',
    isManager: user?.userRole === 'gestionnaire',
    login,
    verify2FA,
    register,
    logout,
    refreshAccessToken,
    refreshUser: fetchUserData
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;