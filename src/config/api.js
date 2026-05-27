/**
 * Centralised API base URL for the HRMS frontend.
 *
 * Read once from the Vite env at build time, then normalised so the rest
 * of the codebase can just write `${API}/employees` without worrying
 * about trailing slashes or whether the operator remembered to append
 * `/api` to VITE_API_URL.
 *
 * Accepts any of these forms in VITE_API_URL and produces the same
 * canonical result (no trailing slash, `/api` suffix):
 *   • https://backend.example.com         → https://backend.example.com/api
 *   • https://backend.example.com/        → https://backend.example.com/api
 *   • https://backend.example.com/api     → https://backend.example.com/api
 *   • https://backend.example.com/api/    → https://backend.example.com/api
 *   • (unset, dev)                        → http://localhost:8001/api
 *
 * This means the deploy operator can write either
 *   VITE_API_URL=https://backend-1-r9ct.onrender.com
 *   VITE_API_URL=https://backend-1-r9ct.onrender.com/api
 * and the frontend Just Works.
 */
function normalizeApiBase(raw) {
  const fallback = 'http://localhost:8001/api';
  const value = (raw && String(raw).trim()) || fallback;
  const trimmed = value.replace(/\/+$/, '');
  return /\/api$/i.test(trimmed) ? trimmed : trimmed + '/api';
}

export const API = normalizeApiBase(import.meta.env.VITE_API_URL);

// Helpful at debug-time — visible in DevTools console once on app load.
// Strip in production if it bothers you, but it makes "did my env var
// actually pick up?" investigations one console-glance away.
if (typeof window !== 'undefined') {
  // eslint-disable-next-line no-console
  console.log('[HRMS] API base URL →', API);
}
