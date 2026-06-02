import React, { createContext, useContext, useState, useEffect } from 'react';
import { API } from '../config/api';

const AuthContext = createContext(null);

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

/**
 * Admin allowlist — kept in sync with the backend's HRMS_ADMIN_EMAILS.
 * The server is the source of truth (it returns `isAdmin` on every login
 * response), but we mirror the list client-side so the UI can also hide
 * write controls instantly without needing a re-fetch.
 */
const ADMIN_EMAILS = [
  'tescodigitals26@gmail.com',
  'tescostructures@gmail.com',
  'hr@tescostructures.in',
];
const isAdminEmail = (e) =>
  !!e && ADMIN_EMAILS.includes(String(e).trim().toLowerCase());

function persistAuth(userData, token) {
  try {
    localStorage.setItem(KEY_USER, JSON.stringify(userData));
    localStorage.setItem(LEGACY_KEY_USER, JSON.stringify(userData));
    if (token) localStorage.setItem(KEY_TOKEN, token);
  } catch {/* storage full / disabled — non-fatal */}
  // Install the global fetch interceptor every time auth changes so the
  // `x-admin-email` header is up-to-date.
  installFetchInterceptor(userData?.email || '');
}
function clearAuth() {
  try {
    localStorage.removeItem(KEY_USER);
    localStorage.removeItem(KEY_TOKEN);
    localStorage.removeItem(LEGACY_KEY_USER);
  } catch {/* */}
  installFetchInterceptor('');
}

/**
 * Wrap window.fetch so every API call from the HRMS frontend carries the
 * signed-in user's email in `x-admin-email`. The backend uses that header
 * to decide whether to accept a POST / PUT / PATCH / DELETE. Idempotent:
 * calling this multiple times re-wires the wrapper with the latest email
 * rather than stacking layers.
 */
let _interceptedFetch = null;
function installFetchInterceptor(email) {
  if (typeof window === 'undefined') return;
  if (!_interceptedFetch) {
    _interceptedFetch = window.fetch.bind(window);
  }
  window.fetch = (input, init = {}) => {
    const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined) || {});
    if (email && !headers.has('x-admin-email')) {
      headers.set('x-admin-email', email);
    }
    return _interceptedFetch(input, { ...init, headers });
  };
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
    if (storedUser) {
      // Recompute isAdmin from the email in case the allowlist changed
      // since the user signed in — that way we never trust a stale flag.
      storedUser.isAdmin = isAdminEmail(storedUser.email);
      setUser(storedUser);
      // Re-install the fetch interceptor with the persisted email so the
      // very first API call after a page refresh carries x-admin-email.
      installFetchInterceptor(storedUser.email || '');
    }
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
        const emailLc = (data.user.email || email).trim().toLowerCase();
        const userData = {
          name:    data.user.name  || email,
          email:   emailLc,
          role:    data.user.role  || 'employee',
          phone:   data.user.phone || '',
          avatar:  (data.user.name || email).split(' ').map(n => n[0]).join('').toUpperCase(),
          token:   data.token,
          // Server-side flag wins; client-side allowlist is the fallback
          // for back-compat with older backends that don't stamp it.
          isAdmin: typeof data.user.isAdmin === 'boolean' ? data.user.isAdmin : isAdminEmail(emailLc),
        };
        setUser(userData);
        persistAuth(userData, data.token);
        return { ok: true };
      }
      return { ok: false, message: data.message || 'Invalid credentials' };
    } catch {
      // Fallback if backend is down
      if (email && password) {
        const emailLc = String(email).trim().toLowerCase();
        const displayName = emailLc.split('@')[0];
        const userData = {
          name:    displayName,
          email:   emailLc,
          role:    'employee',
          phone:   '',
          avatar:  displayName.slice(0, 2).toUpperCase(),
          isAdmin: isAdminEmail(emailLc),
        };
        setUser(userData);
        persistAuth(userData, null);
        return { ok: true };
      }
      return { ok: false, message: 'Connection error' };
    }
  };

  const signup = async (name, email, password) => {
    // Updated Jun 2026 — signup must NOT auto-authenticate. Previously
    // we called setUser + persistAuth right after the account was
    // created, which dropped the user straight onto the dashboard. The
    // brief is now: create the account, then send the user back to the
    // Sign In screen so they have to enter their new credentials at
    // least once (more auditable, matches the rest of the suite, and
    // catches typo'd passwords before they're forgotten).
    try {
      const res  = await fetch(`${API}/auth/authenticate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        // Important: do NOT setUser / persistAuth here. The caller
        // (Login.jsx handleSignUp) flips mode back to 'signin' on
        // { ok: true } so the user signs in fresh.
        return { ok: true };
      }
      return { ok: false, message: data.message || 'Signup failed' };
    } catch {
      // Backend offline — we can't actually create the account, so we
      // surface a clear error rather than the old "offline signup"
      // shortcut that used to fake-authenticate. Faking auth here would
      // defeat the whole point of routing back to sign-in.
      return {
        ok: false,
        message: 'Could not reach the server. Please check your connection and try again.',
      };
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
      // Convenience flags so every page can do `useAuth().canEdit` to
      // toggle Save / Delete / Add buttons. canEdit mirrors isAdmin —
      // kept as a separate name because pages reading "canEdit" are
      // easier to grep when adding more gating later.
      isAdmin: !!user?.isAdmin,
      canEdit: !!user?.isAdmin,
    }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
