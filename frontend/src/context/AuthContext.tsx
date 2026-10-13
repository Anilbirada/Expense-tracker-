import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, AuthResponse } from '../types';
import { apiRequest, getStoredToken, setStoredToken } from '../api';

export interface ToastMessage {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, userType: string) => Promise<void>;
  loginDemo: () => Promise<void>;
  resetDemoData: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const refreshUser = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const profile = await apiRequest<User>('/api/auth/me');
      setUser(profile);
    } catch {
      setStoredToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const res = await apiRequest<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setStoredToken(res.access_token);
    setUser(res.user);
    showToast(`Welcome back, ${res.user.name}!`, 'success');
  };

  const register = async (name: string, email: string, password: string, userType: string) => {
    const res = await apiRequest<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, user_type: userType, currency: 'INR' }),
    });
    setStoredToken(res.access_token);
    setUser(res.user);
    showToast('Account created successfully! Default categories have been configured.', 'success');
  };

  const loginDemo = async () => {
    const res = await apiRequest<AuthResponse>('/api/auth/demo-login', {
      method: 'POST',
    });
    setStoredToken(res.access_token);
    setUser(res.user);
    showToast('Logged into Fictional Demonstration Account.', 'info');
  };

  const resetDemoData = async () => {
    const res = await apiRequest<AuthResponse>('/api/auth/demo-reset', {
      method: 'POST',
    });
    setStoredToken(res.access_token);
    setUser(res.user);
    showToast('Fictional demonstration data has been freshly reset!', 'success');
  };

  const logout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore error if token already expired
    } finally {
      setStoredToken(null);
      setUser(null);
      showToast('You have been logged out safely.', 'info');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        loginDemo,
        resetDemoData,
        logout,
        refreshUser,
        showToast,
      }}
    >
      {children}

      {/* Global Toast Notification Container */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all ${
              t.type === 'error'
                ? 'bg-red-950 text-white border-red-800'
                : t.type === 'info'
                ? 'bg-navy-900 text-white border-navy-700'
                : 'bg-emerald-900 text-white border-emerald-700'
            }`}
          >
            <span>{t.message}</span>
            <button
              onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
              className="text-xs opacity-75 hover:opacity-100 ml-2"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
