/**
 * DailyRoutes — every employee's GPS travel distance for a chosen date.
 *
 * Why this exists
 * ───────────────
 * Petrol & travel allowance views only cover employees who *raised a
 * claim*. HR also wants to see every other employee's daily distance —
 * how far they walked / drove from check-in to check-out — to spot:
 *   • field staff who didn't file a petrol claim but clearly travelled
 *   • someone who barely moved (possible attendance-fraud)
 *
 * Data source: /api/attendance/daily-routes?date=YYYY-MM-DD (proxied to
 * mobile backend's adminDailyRoutesList). Each row carries the day's
 * totalDistanceKm + any allowance the employee filed.
 *
 * (View Route map removed per request — table-only view.)
 */
import React, { useEffect, useState } from 'react';
import { ChevronRight, Calendar, Search, Navigation, MapPin } from 'lucide-react';
import RouteMapModal from '../components/RouteMapModal';

import { API, apiFetch } from '../config/api';

function todayISO() {
  return new Date().toISOString().split('T')[0];
}
function fmtTime(d) {
  if (!d) return '—';
  try {
    // If the backend sent a UTC ISO without the trailing Z, JS would
    // parse it as local time and the displayed hours would be 5h30m off
    // for IST users. Force a Z suffix on ambiguous strings, then format
    // in Asia/Kolkata so the times match what the employee actually saw
    // on their phone.
    let raw = String(d);
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?$/.test(raw)) raw += 'Z';
    const dt = new Date(raw);
    if (isNaN(dt.getTime())) return '—';
    return dt.toLocaleTimeString('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit', minute: '2-digit', hour12: true,
    }).replace(/\s+/g, ' ');
  } catch { return '—'; }
}
// Small reusable stat tile so the four headline numbers all share the
// same visual treatment without pulling in a separate component file.
function StatTile({ label, value, color }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function fmtDateDMY(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-');
  return d && m && y ? `${d}-${m}-${y}` : String(iso);
}

// Haversine between two lat/lng pairs in metres. Same shape as the helper
// in LiveTracking — kept local so this page has no cross-page imports.
function distMeters(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some(v => typeof v !== 'number' || !isFinite(v))) return Infinity;
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
// Sum leg-by-leg haversine along a sequence of points. Legs > 50 km are
// almost always GPS teleports from phone-sleep / re-acquire, so we drop
// them to avoid hugely inflating the distance.
function polylineKm(points) {
  if (!Array.isArray(points) || points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const m = distMeters(Number(a.lat), Number(a.lng), Number(b.lat), Number(b.lng));
    if (isFinite(m) && m < 50_000) total += m;
  }
  return total / 1000;
}

export default function DailyRoutes({ onBack }) {
  const [date,    setDate]    = useState(todayISO());
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [search,  setSearch]  = useState('');
  // routeRow is the row currently being viewed in the map modal —
  // null when the modal is closed. Clicking "View Route" sets it,
  // closing the modal clears it back to null.
  const [routeRow, setRouteRow] = useState(null);
  // Bumped by the Retry button so the load effect re-runs even though
  // `date` is the same value.
  const [retryNonce, setRetryNonce] = useState(0);
  // Per-employee GPS distance computed from the actual polyline that the
  // map renders. We fan out one /daily-route fetch per employee after the
  // list loads — the backend's totalDistanceKm is unreliable (returns 0
  // when the mobile aggregator missed pings) so we always recompute from
  // the raw points HR is about to see on the map.
  //
  //   { [employeeId]: { km: number, points: number, loading: boolean } }
  const [gpsByEmp, setGpsByEmp] = useState({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    (async () => {
      const url = `${API}/attendance/daily-routes?date=${encodeURIComponent(date)}`;
      console.log('[DailyRoutes] GET', url);
      try {
        // Use retry-aware fetch so a single Render cold-start (or 502
        // from the proxy upstream) doesn't surface as a red error banner.
        // First attempt times the backend wake-up window comfortably.
        const r = await apiFetch(url);
        const j = await r.json().catch(() => ({}));
        console.log('[DailyRoutes] response', r.status, j);
        if (cancelled) return;
        if (!r.ok || j.success === false) {
          // Server responded but with a non-OK status. Surface the most
          // useful message we can build from the response.
          let msg = j?.message || `HTTP ${r.status}`;
          if (r.status === 503) {
            msg = 'Backend is missing MOBILE_ADMIN_SECRET in its environment. ' +
                  'Set it on Render and redeploy.';
          } else if (r.status === 502) {
            msg = 'HRMS backend reached the proxy but the mobile backend on Render is unreachable. ' +
                  'Open https://backend-emqy.onrender.com/api/health in a new tab — if it spins for 30s, it is cold-starting.';
          } else if (r.status === 404) {
            msg = `Endpoint not found (${r.status}). The HRMS backend may need a redeploy to pick up new routes.`;
          }
          setError(msg);
          setItems([]);
        } else {
          setItems(Array.isArray(j.items) ? j.items : []);
        }
      } catch (e) {
        // We already retried up to 4 times with backoff inside apiFetch.
        // If we still land here the backend is genuinely unreachable —
        // most often a Render free-tier wake-up that took longer than
        // the retry window. Show a short, friendly message and let HR
        // click to retry instead of the wall-of-text diagnostic.
        console.error('[DailyRoutes] fetch failed after retries:', e);
        if (!cancelled) {
          const isHttps   = typeof window !== 'undefined' && window.location.protocol === 'https:';
          const apiHttp   = String(API || '').startsWith('http://');
          const mixedContent = isHttps && apiHttp;
          const msg = mixedContent
            ? 'The page is loaded over HTTPS but the API URL is HTTP — the browser blocks that as "mixed content". Update VITE_API_URL to use https:// and rebuild.'
            : 'The backend is still waking up after a short idle. Please wait a few seconds and click Retry.';
          setError(msg);
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [date, retryNonce]);

  // After the day's roster loads, fetch the polyline for every employee
  // and compute distance from it. We bound concurrency at 4 so a roster
  // of 50+ doesn't hammer the proxy. Results are merged into gpsByEmp;
  // the table reads from there (preferring map-computed km over the
  // backend's totalDistanceKm).
  useEffect(() => {
    let cancelled = false;
    setGpsByEmp({});
    if (!items.length || !date) return;
    (async () => {
      const queue = items.slice();
      const workers = Array.from({ length: 4 }, async () => {
        while (queue.length && !cancelled) {
          const it = queue.shift();
          const empId = it?.employeeId || it?.empId || '';
          if (!empId) continue;
          // Mark this row as loading so the table can show a spinner.
          setGpsByEmp(prev => ({ ...prev, [empId]: { ...(prev[empId] || {}), loading: true } }));
          try {
            const r = await apiFetch(`${API}/attendance/daily-route?employeeId=${encodeURIComponent(empId)}&date=${encodeURIComponent(date)}`, {}, { retries: 2, baseDelayMs: 800 });
            const j = await r.json().catch(() => ({}));
            // The mobile backend returns points under `polyline` (same key
            // RouteMapModal reads). Older paths used `route` / `points` so
            // we accept all three shapes to be safe.
            const pts = Array.isArray(j?.polyline)     ? j.polyline :
                        Array.isArray(j?.route)        ? j.route :
                        Array.isArray(j?.points)       ? j.points :
                        Array.isArray(j?.data?.polyline) ? j.data.polyline :
                        Array.isArray(j?.data?.route)    ? j.data.route :
                        Array.isArray(j?.data?.points)   ? j.data.points : [];
            const norm = pts
              .map(p => ({ lat: Number(p.lat ?? p.latitude), lng: Number(p.lng ?? p.longitude) }))
              .filter(p => isFinite(p.lat) && isFinite(p.lng));
            // Prefer the backend's own totalDistanceKm if it's non-zero —
            // it's computed from the same polyline upstream and usually
            // matches our local sum to within rounding. If it's 0, we use
            // our own client-side polyline sum so HR sees the real number.
            const serverKm = Number(j?.totalDistanceKm ?? j?.data?.totalDistanceKm ?? 0);
            const localKm  = polylineKm(norm);
            const km       = serverKm > 0 ? serverKm : localKm;
            if (cancelled) return;
            setGpsByEmp(prev => ({ ...prev, [empId]: { km, points: norm.length, loading: false } }));
          } catch {
            if (cancelled) return;
            setGpsByEmp(prev => ({ ...prev, [empId]: { km: 0, points: 0, loading: false } }));
          }
        }
      });
      await Promise.all(workers);
    })();
    return () => { cancelled = true; };
  }, [items, date]);

  // Pick the best distance for a row — prefer the polyline-computed value
  // when it produced points, otherwise fall back to the backend's
  // totalDistanceKm so we still show *something* on rows with no GPS.
  const effectiveKm = (it) => {
    const empId = it?.employeeId || it?.empId || '';
    const g = gpsByEmp[empId];
    if (g && g.points > 0) return g.km;
    return Number(it?.totalDistanceKm) || 0;
  };
  const effectiveSource = (it) => {
    const empId = it?.employeeId || it?.empId || '';
    const g = gpsByEmp[empId];
    if (g?.loading) return 'loading';
    if (g?.points > 0) return 'map polyline';
    if (Number(it?.totalDistanceKm) > 0) return it.distanceSource || 'backend';
    return 'no GPS';
  };

  const filtered = items.filter((it) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (it.name || '').toLowerCase().includes(s) ||
      (it.employeeId || '').toLowerCase().includes(s) ||
      (it.email || '').toLowerCase().includes(s) ||
      (it.designation || '').toLowerCase().includes(s) ||
      (it.department || '').toLowerCase().includes(s)
    );
  });

  // Sum the polyline-computed distance — falls back to the backend value
  // for rows where no GPS points were returned, so the headline tile
  // still adds up to "something" rather than 0 when GPS is missing.
  const totalDistance = items.reduce((s, it) => s + effectiveKm(it), 0);
  const withAllowance = items.filter((it) => it.hasAllowance).length;

  return (
    <div className="emp-list-page">
      <div className="emp-list-header">
        <div className="ne-breadcrumb">
          <span className="ne-breadcrumb-link" onClick={onBack}>Dashboard</span>
          <ChevronRight size={13} />
          <span>Daily Routes</span>
        </div>
        <div className="emp-list-title-row">
          <div>
            <h1 className="ne-page-title">Daily Routes</h1>
            <p className="ne-page-sub">
              GPS-derived travel distance for every employee. Includes those who didn't file an allowance request.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: '#fff', border: '1px solid #E2E8F0',
              borderRadius: 8, padding: '6px 10px',
            }}>
              <Calendar size={14} color="#64748B" />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={{ border: 'none', outline: 'none', fontSize: 13, fontWeight: 600, color: '#1a1a1a' }}
              />
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: '#fff', border: '1px solid #E2E8F0',
              borderRadius: 8, padding: '6px 10px', minWidth: 240,
            }}>
              <Search size={14} color="#64748B" />
              <input
                type="text"
                placeholder="Search name / ID / dept"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ border: 'none', outline: 'none', fontSize: 13, width: '100%' }}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                // Build a CSV from the currently-filtered rows. Each row
                // already carries date + employee + distance + allowance
                // flag — exactly the columns HR needs for a daily summary.
                const rows = filtered;
                const header = ['Date', 'Emp ID', 'Employee', 'Department', 'Check In', 'Check Out', 'GPS Distance (km)', 'Distance Source', 'Filed Allowance', 'Petrol Claimed (km)', 'Travel Claimed (km)'];
                const lines = [header.join(',')];
                for (const it of rows) {
                  const cells = [
                    fmtDateDMY(date),
                    it.employeeId || '',
                    it.name || it.employeeName || '',
                    it.department || it.dept || '',
                    fmtTime(it.checkIn),
                    fmtTime(it.checkOut),
                    effectiveKm(it).toFixed(2),
                    effectiveSource(it),
                    it.hasAllowance ? 'Yes' : 'No',
                    it.petrol?.distance ?? '',
                    it.travel?.distance ?? '',
                  ];
                  lines.push(cells.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(','));
                }
                const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
                const url  = URL.createObjectURL(blob);
                const a    = document.createElement('a');
                a.href = url;
                a.download = 'daily-routes_' + date + '.csv';
                document.body.appendChild(a); a.click(); a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
              disabled={filtered.length === 0}
              style={{
                padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: '#F0FDF4', color: '#15803D',
                border: '1px solid #BBF7D0',
                cursor: filtered.length === 0 ? 'not-allowed' : 'pointer',
                opacity: filtered.length === 0 ? 0.5 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              Download Report (CSV)
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: 24 }}>
        {/* Stat tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
          <StatTile label="Employees with data" value={items.length} color="#4299E1" />
          <StatTile label="Filed allowance" value={withAllowance} color="#16A34A" />
          <StatTile label="No allowance (auto-tracked)" value={items.length - withAllowance} color="#D97706" />
          <StatTile label="Total km (all employees)" value={`${totalDistance.toFixed(1)} km`} color="#7C3AED" />
        </div>

        <div className="card">
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Navigation size={20} color="#4299E1" />
            <div className="card-title">Routes for {date}</div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="emp-table">
              <thead>
                <tr>
                  <th>Emp ID</th>
                  <th>Employee</th>
                  <th>Designation</th>
                  <th>Check-In</th>
                  <th>Check-Out</th>
                  <th>Distance</th>
                  <th>Allowance</th>
                  <th>Route Map</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan="8" style={{ textAlign: 'center', padding: 40, color: '#64748B', fontSize: 13 }}>Loading routes…</td></tr>
                )}
                {!loading && error && (
                  <tr><td colSpan="8" style={{ textAlign: 'center', padding: 40, color: '#DC2626', fontSize: 13 }}>
                    <div style={{ marginBottom: 12 }}>{error}</div>
                    <button
                      type="button"
                      onClick={() => setRetryNonce(n => n + 1)}
                      style={{
                        padding: '6px 18px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                        background: '#16A34A', color: '#fff', border: 'none', cursor: 'pointer',
                      }}
                    >Retry</button>
                  </td></tr>
                )}
                {!loading && !error && filtered.length === 0 && (
                  <tr><td colSpan="8" style={{ textAlign: 'center', padding: 40, color: '#64748B', fontSize: 13 }}>No attendance records for {date}.</td></tr>
                )}
                {!loading && !error && filtered.map((it) => {
                  // Prefer the map-polyline distance over the backend value -
                  // the backend value is regularly 0 even when the map has
                  // 30+ GPS pings for the day.
                  const distance = effectiveKm(it);
                  const src      = effectiveSource(it);
                  const sourceTag = src === 'map polyline'
                    ? { text: 'map polyline', color: '#16A34A' }
                    : src === 'loading'
                    ? { text: '...', color: '#64748B' }
                    : src === 'gps'
                    ? { text: 'GPS', color: '#16A34A' }
                    : src === 'pins'
                    ? { text: 'pins only', color: '#D97706' }
                    : { text: 'no GPS', color: '#94A3B8' };
                  return (
                    <tr key={it.userId + it.date}>
                      <td><div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-light)' }}>{it.employeeId || '—'}</div></td>
                      <td>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)' }}>{it.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-light)' }}>{it.email || ''}</div>
                      </td>
                      <td>
                        <div style={{ fontSize: 12, color: 'var(--text-main)' }}>{it.designation || '—'}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-light)' }}>{it.department || ''}</div>
                      </td>
                      <td><div style={{ fontSize: 12, color: 'var(--text-main)' }}>{fmtTime(it.checkIn)}</div></td>
                      <td><div style={{ fontSize: 12, color: 'var(--text-main)' }}>{fmtTime(it.checkOut)}</div></td>
                      <td>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)' }}>
                          {distance.toFixed(2)} km
                        </div>
                        <div style={{ fontSize: 10, color: sourceTag.color, fontWeight: 700 }}>
                          · {sourceTag.text}
                        </div>
                      </td>
                      <td>
                        {it.hasAllowance ? (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {it.petrol && (
                              <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, background: '#F0FDF4', color: '#16A34A' }}>
                                Petrol {it.petrol.distance} km
                              </span>
                            )}
                            {it.travel && (
                              <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, background: '#EFF6FF', color: '#2563EB' }}>
                                Travel {it.travel.distance} km
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, color: '#94A3B8' }}>— none —</span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => setRouteRow(it)}
                          disabled={!(gpsByEmp[it.employeeId]?.points > 0) && !(Number(it.totalDistanceKm) > 0)}
                          style={{
                            padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                            background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE',
                            cursor: 'pointer',
                          }}
                        >
                          <MapPin size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                          View Route
                        </button>
                      </td>
                    </tr>
                );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {routeRow && (
        <RouteMapModal
          open={true}
          employeeId={routeRow.employeeId}
          employeeName={routeRow.name}
          date={date}
          onClose={() => setRouteRow(null)}
        />
      )}
    </div>
  );
}
