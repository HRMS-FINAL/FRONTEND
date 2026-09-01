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
import React, { useEffect, useRef, useState } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';
import { ChevronRight, Calendar, Search, Navigation, MapPin } from 'lucide-react';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
// #303 — branded report template.
import { buildBrandedPdf } from '../utils/reportTemplate';
import { reverseGeocode, routeString, pdfSafe, GPS_ROUTE_NOT_AVAILABLE } from '../utils/gpsRoute';
import * as XLSX from 'xlsx';
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
  // Ref mirror of gpsByEmp + a promise that resolves when the per-employee GPS
  // fetch finishes — so EXPORTS can await complete data (never bake "Loading…").
  const gpsByEmpRef = useRef({});
  const gpsDoneRef  = useRef({ promise: Promise.resolve(), resolve: null });

  // Google Maps loader (shares the app-wide instance by id) — used to
  // reverse-geocode each check-in coordinate into a readable place.
  const { isLoaded: mapsLoaded } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    id: 'tesco-hrms-google-maps',
  });
  const [placeCache, setPlaceCache] = useState({});
  const placeCacheRef = useRef({});

  // Reverse-geocode each non-office check-in coordinate → a short place
  // label. Fully defensive: only runs when the Geocoder is a real
  // constructor, and wrapped so a Maps hiccup can never break the page.
  useEffect(() => {
    try {
      const G = window.google && window.google.maps && window.google.maps.Geocoder;
      if (typeof G !== 'function') return;
      const geocoder = new G();
      const shorten = (addr) => {
        if (!addr) return '';
        const parts = String(addr).split(',').map((s) => s.trim()).filter(Boolean);
        return parts.slice(0, 2).join(', ');
      };
      (items || []).forEach((it) => {
        if (it.checkInIsOffice) return;
        if (it.checkInLat == null || it.checkInLng == null) return;
        const lat = Number(it.checkInLat), lng = Number(it.checkInLng);
        const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
        if (placeCacheRef.current[key] !== undefined) return;
        placeCacheRef.current[key] = '';
        try {
          geocoder.geocode({ location: { lat, lng } }, (results, status) => {
            let label = '';
            if (status === 'OK' && results && results[0]) label = shorten(results[0].formatted_address);
            placeCacheRef.current[key] = label || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            setPlaceCache({ ...placeCacheRef.current });
          });
        } catch {
          placeCacheRef.current[key] = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        }
      });
    } catch { /* Maps not ready — retries when data/loader changes */ }
  }, [items, mapsLoaded]);

  // "Checked-in Location" for a row: Office / resolved place / coords.
  const checkInLocationOf = (it) => {
    if (!it) return '—';
    if (it.checkInIsOffice) return 'Office';
    if (it.checkInLat == null || it.checkInLng == null) return '—';
    const lat = Number(it.checkInLat), lng = Number(it.checkInLng);
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    return placeCache[key] || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  };

  // #508 — Reverse-geocode ANY coordinate into placeCache (same key format +
  // 2-part shortening as the check-in geocoder above), used to resolve the GPS
  // Route "To" place so it reads as a place name, not lat/lng.
  const geocodeCoord = (lat, lng) => {
    if (lat == null || lng == null) return;
    try {
      const G = window.google && window.google.maps && window.google.maps.Geocoder;
      if (typeof G !== 'function') return;
      const key = `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;
      if (placeCacheRef.current[key] !== undefined) return;
      placeCacheRef.current[key] = '';
      const geocoder = new G();
      geocoder.geocode({ location: { lat: Number(lat), lng: Number(lng) } }, (results, status) => {
        let label = '';
        if (status === 'OK' && results && results[0]) {
          const parts = String(results[0].formatted_address).split(',').map((s) => s.trim()).filter(Boolean);
          label = parts.slice(0, 2).join(', ');
        }
        placeCacheRef.current[key] = label || `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
        setPlaceCache({ ...placeCacheRef.current });
      });
    } catch { /* maps not ready */ }
  };
  const placeOfCoord = (lat, lng) => {
    if (lat == null || lng == null) return '';
    const key = `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;
    return placeCache[key] || `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
  };

  // #508 — GPS Route "From Place → To Place": the check-in place → the road-
  // matched route's end place, both reverse-geocoded to the SAME labels shown
  // on the map. "GPS Route Not Available" when there's no usable GPS trace.
  const gpsRouteOf = (it) => {
    const empId = it?.employeeId || it?.empId || '';
    const g = gpsByEmp[empId];
    if (g?.loading) return 'Loading…';
    if (!(g && g.points > 0)) return GPS_ROUTE_NOT_AVAILABLE;
    const fromPlace = checkInLocationOf(it);                          // check-in place
    const toPlace   = g?.to ? placeOfCoord(g.to.lat, g.to.lng) : ''; // check-out / route-end place
    return routeString(fromPlace, toPlace);
  };

  // #517 — Fully-resolved route string for EXPORTS. Awaits reverse-geocoding so
  // a PDF/Excel never bakes in "Loading…" or raw coordinates. Same
  // Check-In place → Check-Out place logic the Travel report uses.
  const resolveRouteForExport = async (it) => {
    const empId = it?.employeeId || it?.empId || '';
    const g = gpsByEmpRef.current[empId];
    if (!(g && g.points > 0)) return GPS_ROUTE_NOT_AVAILABLE;
    const fromLabel = await reverseGeocode(it?.checkInLat, it?.checkInLng, it?.checkInIsOffice);
    const toLabel   = g?.to ? await reverseGeocode(g.to.lat, g.to.lng) : '';
    return routeString(fromLabel, toLabel);
  };

  // Build empId → resolved route string for the current filtered rows, first
  // awaiting the per-employee GPS fetch so every row has final data.
  const buildRouteMap = async () => {
    try { await gpsDoneRef.current.promise; } catch { /* proceed with what we have */ }
    const out = {};
    const q = filtered.slice();
    const workers = Array.from({ length: 5 }, async () => {
      while (q.length) {
        const it = q.shift();
        const empId = it?.employeeId || it?.empId || '';
        out[empId] = await resolveRouteForExport(it);
      }
    });
    await Promise.all(workers);
    return out;
  };

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
    gpsByEmpRef.current = {};
    // Fresh "all GPS fetched" promise for this date — exports await it.
    let _resolveDone;
    gpsDoneRef.current = { promise: new Promise((res) => { _resolveDone = res; }), resolve: _resolveDone };
    // Write an entry into BOTH the ref (for awaited exports) and state (for live).
    const putGps = (empId, entry) => {
      gpsByEmpRef.current = {
        ...gpsByEmpRef.current,
        [empId]: { ...(gpsByEmpRef.current[empId] || {}), ...entry },
      };
      setGpsByEmp((prev) => ({ ...prev, [empId]: { ...(prev[empId] || {}), ...entry } }));
    };
    if (!items.length || !date) { if (_resolveDone) _resolveDone(); return; }
    (async () => {
      const queue = items.slice();
      const workers = Array.from({ length: 4 }, async () => {
        while (queue.length && !cancelled) {
          const it = queue.shift();
          const empId = it?.employeeId || it?.empId || '';
          if (!empId) continue;
          // Mark this row as loading so the table can show a spinner.
          putGps(empId, { loading: true });
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
            // #508 — capture the route's start/end so the GPS Route column can
            // show From Place → To Place. The single-date endpoint returns
            // road-matched `from`/`to`; fall back to the first/last polyline
            // point if absent.
            const fromPt = j?.from || (norm.length ? norm[0] : null);
            const toPt   = j?.to   || (norm.length ? norm[norm.length - 1] : null);
            putGps(empId, { km, points: norm.length, from: fromPt, to: toPt, loading: false });
            if (toPt) geocodeCoord(toPt.lat, toPt.lng);
          } catch {
            if (cancelled) return;
            putGps(empId, { km: 0, points: 0, loading: false });
          }
        }
      });
      await Promise.all(workers);
      if (!cancelled && gpsDoneRef.current.resolve) gpsDoneRef.current.resolve();
    })();
    return () => { cancelled = true; if (gpsDoneRef.current.resolve) gpsDoneRef.current.resolve(); };
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

  // #426 — Both tiles now reflect the CURRENT filter, not the full list.
  // Previously picking an employee from the dropdown left the top-tile
  // "Total km (all employees)" and "Filed allowance" numbers unchanged
  // — confusing HR because the visible table shrunk to 1 row while the
  // summary still showed the day-wide totals. The tiles now recompute
  // whenever the search / employee filter changes.
  const totalDistance = filtered.reduce((s, it) => s + effectiveKm(it), 0);
  const withAllowance = filtered.filter((it) => it.hasAllowance).length;

  // Professional PDF — branded header, summary tiles, striped table.
  // #303 — uses the shared template so the logo + footer match every
  // other HRMS download.
  const downloadPdf = async () => {
    try {
      const routeMap = await buildRouteMap(); // fully resolved — no "Loading…"
      const head = ['Emp ID', 'Employee', 'Designation', 'Check-In', 'Check-Out', 'Checked-in Location', 'Distance', 'GPS Route', 'Allowance'];
      const body = filtered.map((it) => {
        const empId = it?.employeeId || it?.empId || '';
        return [
          it.employeeId || '—',
          it.name || it.employeeName || '—',
          it.designation || '—',
          fmtTime(it.checkIn),
          fmtTime(it.checkOut),
          pdfSafe(checkInLocationOf(it)),
          effectiveKm(it).toFixed(2) + ' km',
          pdfSafe(routeMap[empId] || GPS_ROUTE_NOT_AVAILABLE),
          it.hasAllowance ? 'Yes' : 'No',
        ];
      });
      const doc = await buildBrandedPdf({
        title:    'Daily Routes Report',
        subtitle: `Routes for ${fmtDateDMY(date)}  ·  ${filtered.length} employees${search ? ` · filtered: "${search}"` : ''}`,
        meta:     { date },
        head, body,
        totals: [[
          { content: `Total employees: ${items.length}  ·  Filed allowance: ${withAllowance}  ·  Auto-tracked: ${items.length - withAllowance}`, colSpan: 6 },
          { content: totalDistance.toFixed(2) + ' km', styles: { halign: 'right' } },
          { content: '', colSpan: 2 },
        ]],
        // Bound the fixed columns so "GPS Route" (col 7) takes the remaining
        // width and WRAPS long routes instead of running off the page.
        columnStyles: {
          0: { cellWidth: 48 },                    // Emp ID
          1: { cellWidth: 90 },                    // Employee
          2: { cellWidth: 88 },                    // Designation
          3: { cellWidth: 52 },                    // Check-In
          4: { cellWidth: 52 },                    // Check-Out
          5: { cellWidth: 96 },                    // Checked-in Location
          6: { halign: 'right', cellWidth: 46 },   // Distance
          7: { cellWidth: 'auto', overflow: 'linebreak' }, // GPS Route → wraps
          8: { halign: 'center', cellWidth: 44 },  // Allowance
        },
        orientation: 'landscape',
      });
      doc.save(`daily-routes_${date}.pdf`);
    } catch (err) {
      console.error('[DailyRoutes PDF]', err);
      alert('Could not generate PDF: ' + (err?.message || 'unknown error'));
    }
  };

  // Excel (XLSX) export — Summary sheet + Routes sheet so HR can pivot.
  const downloadExcel = async () => {
    try {
      const routeMap = await buildRouteMap(); // fully resolved place names
      const rs = filtered;
      const summary = [
        ['Tesco Structures — Daily Routes Report'],
        [],
        ['Date',         fmtDateDMY(date)],
        ['Employees',    rs.length],
        ['Filed Allowance', withAllowance],
        ['Total km (all)',  Number(totalDistance.toFixed(2))],
        ['Generated',    fmtDateDMY(new Date().toISOString().slice(0, 10))],
      ];
      const routes = [
        ['Date', 'Emp ID', 'Employee', 'Department', 'Check In', 'Check Out',
         'Checked-in Location',
         'GPS Distance (km)', 'GPS Route', 'Filed Allowance',
         'Petrol Claimed (km)', 'Travel Claimed (km)'],
        ...rs.map((it) => [
          fmtDateDMY(date),
          it.employeeId || '',
          it.name || it.employeeName || '',
          it.department || it.dept || '',
          fmtTime(it.checkIn),
          fmtTime(it.checkOut),
          checkInLocationOf(it),
          Number(effectiveKm(it).toFixed(2)),
          routeMap[it.employeeId || it.empId || ''] || GPS_ROUTE_NOT_AVAILABLE,
          it.hasAllowance ? 'Yes' : 'No',
          it.petrol?.distance ?? '',
          it.travel?.distance ?? '',
        ]),
      ];
      const wb = XLSX.utils.book_new();
      const wsS = XLSX.utils.aoa_to_sheet(summary);
      const wsR = XLSX.utils.aoa_to_sheet(routes);
      wsS['!cols'] = [{ wch: 22 }, { wch: 22 }];
      wsR['!cols'] = [
        { wch: 12 }, { wch: 10 }, { wch: 24 }, { wch: 18 },
        { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 18 },
        { wch: 16 }, { wch: 16 }, { wch: 16 },
      ];
      XLSX.utils.book_append_sheet(wb, wsS, 'Summary');
      XLSX.utils.book_append_sheet(wb, wsR, 'Routes');
      XLSX.writeFile(wb, `daily-routes_${date}.xlsx`);
    } catch (err) {
      console.error('[downloadExcel]', err);
      alert('Could not generate Excel: ' + (err?.message || 'unknown error'));
    }
  };

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
            {/* Search → dropdown of active employees for this date (Jun 2026
                HR brief). The roster comes from the same `items` we render,
                so HR picks from the same list they see below. Blank value
                means "all employees" — i.e. no filter. */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: '#fff', border: '1px solid #E2E8F0',
              borderRadius: 8, padding: '6px 10px', minWidth: 240,
            }}>
              <Search size={14} color="#64748B" />
              <select
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ border: 'none', outline: 'none', fontSize: 13, width: '100%', background: 'transparent', cursor: 'pointer' }}
              >
                <option value="">All active employees ({items.length})</option>
                {items
                  .slice()
                  .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
                  .map((it) => (
                    <option key={it.employeeId || it.empId || it.email || it.name} value={it.name || it.employeeId || ''}>
                      {it.name || it.employeeId} {it.employeeId ? `· ${it.employeeId}` : ''} {it.department ? `· ${it.department}` : ''}
                    </option>
                  ))}
              </select>
            </div>
            <button
              type="button"
              onClick={downloadPdf}
              disabled={filtered.length === 0}
              style={{
                padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: '#EFF6FF', color: '#1D4ED8',
                border: '1px solid #BFDBFE',
                cursor: filtered.length === 0 ? 'not-allowed' : 'pointer',
                opacity: filtered.length === 0 ? 0.5 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              Download PDF
            </button>
            <button
              type="button"
              onClick={downloadExcel}
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
              Download Excel
            </button>
            {/* Download CSV removed (#288 — HR uses PDF/Excel only). */}
          </div>
        </div>
      </div>

      <div style={{ padding: 24 }}>
        {/* Stat tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
          {/* #426 — All four tiles now use `filtered` so an employee-scoped
              filter shows counts for the one employee, and a search
              narrows everything in lock-step. When no filter is active,
              `filtered` === `items` so the previous behaviour is preserved. */}
          <StatTile label="Employees with data" value={filtered.length} color="#4299E1" />
          <StatTile label="Filed allowance" value={withAllowance} color="#16A34A" />
          <StatTile label="No allowance (auto-tracked)" value={Math.max(0, filtered.length - withAllowance)} color="#D97706" />
          <StatTile label={filtered.length === items.length ? 'Total km (all employees)' : 'Total km (filtered)'} value={`${totalDistance.toFixed(1)} km`} color="#7C3AED" />
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
                  <th>Checked-in Location</th>
                  <th>Distance</th>
                  <th>Allowance</th>
                  <th>Route Map</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan="9" style={{ textAlign: 'center', padding: 40, color: '#64748B', fontSize: 13 }}>Loading routes…</td></tr>
                )}
                {!loading && error && (
                  <tr><td colSpan="9" style={{ textAlign: 'center', padding: 40, color: '#DC2626', fontSize: 13 }}>
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
                  <tr><td colSpan="9" style={{ textAlign: 'center', padding: 40, color: '#64748B', fontSize: 13 }}>No attendance records for {date}.</td></tr>
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
                        <div style={{
                          fontSize: 12,
                          fontWeight: it.checkInIsOffice ? 700 : 500,
                          color: it.checkInIsOffice ? '#16A34A' : 'var(--text-main)',
                        }}>
                          {checkInLocationOf(it)}
                        </div>
                      </td>
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
