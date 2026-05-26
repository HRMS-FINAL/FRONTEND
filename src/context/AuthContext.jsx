import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);
const API = 'http://localhost:8001/api';

/* ──────────────────────────────────────────────────────────────────────
 * Local-storage keys.
 *
 *   hrms_user   ← the active user record (object)
 *   hrms_token  ← the JWT, kept SEPARATELY so the Settings page and any
 *                 other fetch can do `Authorization: Bearer <token>`
 *                 without first having to JSON.parse the user blob.
 *
 *   hrm_user    ← legacy key (one 'm'). Older parts of the codebase still
 *                 read this. We mirror to it so nothing breaks.
 * ────────────────────────────────────────────────────────────────────── */
const KEY_USER       = 'hrms_user';
const KEY_TOKEN      = 'hrms_token';
const LEGACY_KEY_USER = 'hrm_user';

function persistAuth(userData, token) {
  try {
    localStorage.setItem(KEY_USER, JSON.stringify(userData));
    localStorage.setItem(LEGACY_KEY_USER, JSON.stringify(userData));
    if (token) localStorage.setItem(KEY_TOKEN, token);
  } catch {/* storage full / disabled — non-fatal */}
}
function clearAuth() {
  try {
    localStorage.removeItem(KEY_USER);
    localStorage.removeItem(KEY_TOKEN);
    localStorage.removeItem(LEGACY_KEY_USER);
  } catch {/* */}
}
function readStoredUser() {
  try {
    const raw = localStorage.getItem(KEY_USER) || localStorage.getItem(LEGACY_KEY_USER);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = readStoredUser();
    if (storedUser) setUser(storedUser);
    setLoading(false);
  }, []);

  const checkEmail = async (email) => {
    try {
      const res  = await fetch(`${API}/auth/check-email`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: String(email || '').trim().toLowerCase() }),
      });
      const data = await res.json();
      return data;
    } catch {
      return { success: false, exists: null, next: 'signup' };
    }
  };

  const sendOtp = async (email) => {
    try {
      const res  = await fetch(`${API}/auth/send-otp`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: String(email || '').trim().toLowerCase() }),
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err?.message || 'Network error' };
    }
  };

  const verifyOtp = async (email, otp) => {
    try {
      const res  = await fetch(`${API}/auth/verify-otp`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          email: String(email || '').trim().toLowerCase(),
          otp:   String(otp || '').trim(),
        }),
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err?.message || 'Network error' };
    }
  };

  const resetPassword = async (resetToken, password) => {
    try {
      const res  = await fetch(`${API}/auth/reset-password`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ resetToken, password }),
      });
      const data = await res.json();
      if (data?.success && data?.user && data?.token) {
        const userData = {
          name:   data.user.name  || data.user.email,
          email:  data.user.email,
          role:   data.user.role  || 'employee',
          phone:  data.user.phone || '',
          avatar: (data.user.name || data.user.email).split(' ').map(n => n[0]).join('').toUpperCase(),
          token:  data.token,
        };
        setUser(userData);
        persistAuth(userData, data.token);
      }
      return data;
    } catch (err) {
      return { success: false, message: err?.message || 'Network error' };
    }
  };

  const login = async (email, password) => {
    try {
      const res  = await fetch(`${API}/auth/authenticate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        const userData = {
          name:   data.user.name  || email,
          email:  data.user.email || email,
          role:   data.user.role  || 'employee',
          phone:  data.user.phone || '',
          avatar: (data.user.name || email).split(' ').map(n => n[0]).join('').toUpperCase(),
          token:  data.token,
        };
        setUser(userData);
        persistAuth(userData, data.token);
        return { ok: true };
      }
      return { ok: false, message: data.message || 'Invalid credentials' };
    } catch {
      // Fallback if backend is down
      if (email && password) {
        const displayName = email.split('@')[0];
        const userData = {
          name:   displayName,
          email,
          role:   'employee',
          phone:  '',
          avatar: displayName.slice(0, 2).toUpperCase(),
        };
        setUser(userData);
        persistAuth(userData, null);
        return { ok: true };
      }
      return { ok: false, message: 'Connection error' };
    }
  };

  const signup = async (name, email, password) => {
    try {
      const res  = await fetch(`${API}/auth/authenticate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        const userData = {
          name:   data.user.name  || name,
          email:  data.user.email || email,
          role:   data.user.role  || 'employee',
          phone:  data.user.phone || '',
          avatar: (data.user.name || name).split(' ').map(n => n[0]).join('').toUpperCase(),
          token:  data.token,
        };
        setUser(userData);
        persistAuth(userData, data.token);
        return { ok: true };
      }
      return { ok: false, message: data.message || 'Signup failed' };
    } catch {
      // Backend offline — allow offline signup
      if (name && email && password) {
        const userData = {
          name:   name.trim(),
          email:  email.trim().toLowerCase(),
          role:   'employee',
          phone:  '',
          avatar: name.trim().split(' ').map(n => n[0]).join('').toUpperCase(),
        };
        setUser(userData);
        persistAuth(userData, null);
        return { ok: true };
      }
      return { ok: false, message: 'Connection error. Please check your network.' };
    }
  };

  const logout = () => {
    setUser(null);
    clearAuth();
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      checkEmail,
      sendOtp,
      verifyOtp,
      resetPassword,
      login,
      signup,
      logout,
    }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
