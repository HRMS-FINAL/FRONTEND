import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);
const API = 'http://localhost:8001/api';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('hrm_user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const checkEmail = async (email) => {
    try {
      const res  = await fetch(`${API}/auth/check-email`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email }),
      });
      const data = await res.json();
      return data;
    } catch {
      return { success: false, exists: null, next: 'signup' };
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
          avatar: (data.user.name || email).split(' ').map(n => n[0]).join('').toUpperCase(),
          token:  data.token,
        };
        setUser(userData);
        localStorage.setItem('hrm_user', JSON.stringify(userData));
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
          avatar: displayName.slice(0, 2).toUpperCase(),
        };
        setUser(userData);
        localStorage.setItem('hrm_user', JSON.stringify(userData));
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
          avatar: (data.user.name || name).split(' ').map(n => n[0]).join('').toUpperCase(),
          token:  data.token,
        };
        setUser(userData);
        localStorage.setItem('hrm_user', JSON.stringify(userData));
        return { ok: true };
      }
      // Return exact backend error so UI can show it
      return { ok: false, message: data.message || 'Signup failed' };
    } catch {
      // Backend offline — allow offline signup
      if (name && email && password) {
        const userData = {
          name:   name.trim(),
          email:  email.trim().toLowerCase(),
          role:   'employee',
          avatar: name.trim().split(' ').map(n => n[0]).join('').toUpperCase(),
        };
        setUser(userData);
        localStorage.setItem('hrm_user', JSON.stringify(userData));
        return { ok: true };
      }
      return { ok: false, message: 'Connection error. Please check your network.' };
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('hrm_user');
  };

  return (
    <AuthContext.Provider value={{ user, loading, checkEmail, login, signup, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
