'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

const TOKEN_KEY = 'automaintainer_token';

interface AuthContextType {
  token: string | null;
  isAuthenticated: boolean;
  username: string | null;
  login: (username: string, password: string) => Promise<void>;
  githubLogin: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

function decodeUsername(token: string | null): string | null {
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(atob(payload));
    return decoded.sub || null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);

  // Load token from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) {
      setToken(stored);
    }
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || '/api';
    const res = await fetch(`${apiBase}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: res.statusText }));
      const detail = error.detail;
      if (Array.isArray(detail)) {
        const messages = detail.map((e: { msg?: string; message?: string }) => e.msg || e.message || '').filter(Boolean);
        throw new Error(messages.join('; ') || `Login failed: ${res.status}`);
      }
      throw new Error(detail || `Login failed: ${res.status}`);
    }

    const data = await res.json();
    setToken(data.access_token);
    localStorage.setItem(TOKEN_KEY, data.access_token);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    localStorage.removeItem(TOKEN_KEY);
  }, []);

  const githubLogin = useCallback(() => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || '/api';
    window.location.href = `${apiBase}/auth/github`;
  }, []);

  const username = decodeUsername(token);

  return (
    <AuthContext.Provider value={{ token, isAuthenticated: !!token, username, login, githubLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}