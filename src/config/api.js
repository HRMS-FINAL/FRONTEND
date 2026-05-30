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

// ─── Cold-start wake-up + retry helper ───────────────────────────────
// Render's free tier sleeps the backend after ~15 min idle. The first
// fetch after sleep returns "Failed to fetch" while the container spins
// back up (~30s). Two fixes:
//   1. Wake the backend on app load so by the time the user clicks into
//      a page, the container is already warm.
//   2. Export a retry-aware fetch so transient cold-start failures are
//      retried with backoff instead of surfacing as a red error banner.
async function wakeBackend() {
  if (typeof fetch !== 'function' || typeof window === 'undefined') return;
  const base = API.replace(/\/api$/i, '');
  // Try / and /api/health — whichever responds first. Eight retries
  // covers the worst-case ~30s cold start.
  for (let i = 0; i < 8; i++) {
    try {
      const r = await fetch(base + '/', { cache: 'no-store' });
      if (r.ok) { console.log('[HRMS] backend warm in', (i + 1) * 4, 's'); return; }
    } catch { /* container still cold */ }
    await new Promise(res => setTimeout(res, 4000));
  }
  console.warn('[HRMS] backend did not respond after wake-up window');
}
// Fire the wake-up immediately, no need to await — by the time the user
// clicks a sidebar item the container is already responding.
if (typeof window !== 'undefined') wakeBackend();

// Retry-aware fetch — same signature as the global fetch but transparently
// retries on network failure with exponential backoff. Pages should use
// this for "list this data" calls so a single cold-start hiccup doesn't
// trigger the red error banner.
export async function apiFetch(url, init = {}, opts = {}) {
  const retries = typeof opts.retries === 'number' ? opts.retries : 4;
  const baseDelayMs = typeof opts.baseDelayMs === 'number' ? opts.baseDelayMs : 1500;
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);
      // 502/503/504 = upstream cold-start or restart — retry.
      if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt < retries) {
        await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, attempt)));
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, attempt)));
        continue;
      }
      throw err;
    }
  }
  throw lastErr || new Error('apiFetch: exhausted retries');
}
