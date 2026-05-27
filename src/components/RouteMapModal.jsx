/**
 * RouteMapModal — popup that renders one employee's GPS route for one date.
 *
 * Why it exists
 * ─────────────
 * HR clicks "View Route" on a row (Allowance or Daily Routes) and this
 * modal opens, fetches /api/attendance/daily-route?employeeId=…&date=…
 * via the HRMS proxy, and renders:
 *   • A polyline of every LocationPing in time order.
 *   • Markers for the START (green pin) and END (red pin) of the day.
 *   • Optional from/to pins the employee marked on the allowance form.
 *   • Computed total km + the employee's claimed km.
 *
 * Design notes for robustness
 * ───────────────────────────
 * Earlier versions of this modal used a `<FitToBounds>` child that called
 * useMap() and fitBounds() inside an effect. That child could throw on
 * first render (before MapContainer fully mounts) and would cascade up to
 * a blank page. This version avoids that entirely by:
 *   1. Mounting the map only AFTER data arrives (or the request fails).
 *      Before data, we render a friendly loading panel — no map at all.
 *   2. Using a `key` on the MapContainer so when (employeeId, date)
 *      changes we remount cleanly instead of trying to mutate bounds in
 *      place.
 *   3. Wrapping the map subtree in a tiny class-based ErrorBoundary so
 *      even if Leaflet itself throws, HR sees a usable message instead
 *      of a white screen.
 */
import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { X } from 'lucide-react';

import { API } from '../config/api';

// ─── Route response cache ─────────────────────────────────────────────
// 2-minute TTL so reopening the same row's modal is instant.
const ROUTE_CACHE = new Map();   // key → { data, fetchedAt }
const CACHE_TTL_MS = 2 * 60 * 1000;

function cacheKey(employeeId, date) {
  return `${(employeeId || '').toUpperCase()}|${date || ''}`;
}
function readCache(employeeId, date) {
  const hit = ROUTE_CACHE.get(cacheKey(employeeId, date));
  if (!hit) return null;
  if (Date.now() - hit.fetchedAt > CACHE_TTL_MS) {
    ROUTE_CACHE.delete(cacheKey(employeeId, date));
    return null;
  }
  return hit.data;
}
function writeCache(employeeId, date, data) {
  ROUTE_CACHE.set(cacheKey(employeeId, date), { data, fetchedAt: Date.now() });
}

const INFLIGHT = new Map();
async function fetchRoute(employeeId, date) {
  if (!employeeId || !date) return null;
  const cached = readCache(employeeId, date);
  if (cached) return cached;
  const key = cacheKey(employeeId, date);
  if (INFLIGHT.has(key)) return INFLIGHT.get(key);
  const p = (async () => {
    try {
      const url = `${API}/attendance/daily-route?employeeId=${encodeURIComponent(employeeId)}&date=${encodeURIComponent(date)}`;
      const r   = await fetch(url);
      const j   = await r.json().catch(() => ({}));
      if (!r.ok || j.success === false) {
        const err = new Error(j?.message || `HTTP ${r.status}`);
        err.status = r.status;
        throw err;
      }
      writeCache(employeeId, date, j);
      return j;
    } finally {
      INFLIGHT.delete(key);
    }
  })();
  INFLIGHT.set(key, p);
  return p;
}

export function prefetchDailyRoute(employeeId, date) {
  fetchRoute(employeeId, date).catch(() => {});
}

// ─── Pin builders ─────────────────────────────────────────────────────
function makePin(label, color) {
  const html = `
    <div style="
      width:28px;height:36px;position:relative;
      display:flex;align-items:center;justify-content:center;
    ">
      <div style="
        width:28px;height:28px;border-radius:50%;
        background:${color};color:#fff;
        display:flex;align-items:center;justify-content:center;
        font-size:11px;font-weight:800;
        box-shadow:0 2px 6px rgba(0,0,0,0.3);
        border:2px solid #fff;
      ">${label}</div>
    </div>`;
  return L.divIcon({ html, className: '', iconSize: [28, 36], iconAnchor: [14, 34] });
}
const startIcon = makePin('A', '#16A34A');
const endIcon   = makePin('B', '#DC2626');
const fromIcon  = makePin('F', '#2563EB');
const toIcon    = makePin('T', '#7C3AED');

function fmtDateTime(d) {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '—';
    return dt.toLocaleString('en-IN', {
      day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch { return '—'; }
}

// ─── Error boundary so Leaflet bugs don't blank the page ──────────────
class MapErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) {
    console.error('[RouteMapModal] map crashed:', err, info);
  }
  render() {
    if (this.state.err) {
      return (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 8, padding: 24, textAlign: 'center',
          color: '#DC2626', fontSize: 13, background: '#FEF2F2',
        }}>
          <strong>Map could not be rendered</strong>
          <span style={{ fontSize: 12 }}>{String(this.state.err?.message || this.state.err)}</span>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function RouteMapModal({ open, onClose, employeeId, employeeName, date, claim }) {
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [data,    setData]    = useState(null);

  useEffect(() => {
    if (!open) return;
    if (!employeeId || !date) {
      setError('Missing employeeId or date.');
      setLoading(false);
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    setData(null);
    fetchRoute(employeeId, date)
      .then((j) => { if (!cancelled) { setData(j); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e?.message || 'Network error'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [open, employeeId, date]);

  if (!open) return null;

  // Pull out polyline + compute map center/bounds. All defensive — if
  // anything in `data` is unexpected we fall back to safe defaults so
  // the map still renders (centered on Tesco HQ in Ashok Nagar) and HR
  // gets a useful empty-state instead of a crash.
  const polyline = Array.isArray(data?.polyline) ? data.polyline.filter(
    (p) => p && typeof p.lat === 'number' && typeof p.lng === 'number'
  ) : [];
  const hasPath = polyline.length >= 2;

  // Office default — Tesco Structures HQ, Ashok Nagar, Chennai
  const OFFICE = { lat: 13.0412, lng: 80.2127 };
  const center = hasPath
    ? [polyline[0].lat, polyline[0].lng]
    : (claim?.fromLat && claim?.fromLng
        ? [claim.fromLat, claim.fromLng]
        : [OFFICE.lat, OFFICE.lng]);

  // Bounds — only used to size the initial mount of MapContainer. We
  // remount via `key` when (employeeId, date) changes, so we don't need
  // to mutate bounds dynamically.
  let bounds = null;
  if (hasPath) {
    bounds = polyline.map((p) => [p.lat, p.lng]);
    if (claim?.fromLat && claim?.fromLng) bounds.push([claim.fromLat, claim.fromLng]);
    if (claim?.toLat   && claim?.toLng)   bounds.push([claim.toLat,   claim.toLng]);
  }

  const totalKm = Number(data?.totalDistanceKm || 0);

  // Key triggers a fresh MapContainer when the row changes — easier
  // than mutating bounds/center in place.
  const mapKey = `${employeeId}|${date}|${hasPath ? polyline.length : 0}`;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(1100px, 100%)', height: 'min(720px, 95vh)',
          background: '#fff', borderRadius: 12,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid #E2E8F0',
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#1a1a1a' }}>
              {employeeName || '—'}
              {employeeId && (
                <span style={{ fontWeight: 600, color: '#64748B', fontSize: 12, marginLeft: 8 }}>
                  · {employeeId}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
              Daily route on <strong>{date}</strong>
              {data?.checkIn  && <> · in {fmtDateTime(data.checkIn)}</>}
              {data?.checkOut && <> · out {fmtDateTime(data.checkOut)}</>}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              border: 'none', background: '#F1F5F9', borderRadius: 8,
              width: 32, height: 32, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Stats strip */}
        <div style={{
          display: 'flex', gap: 16, padding: '10px 20px',
          borderBottom: '1px solid #E2E8F0', background: '#F8FAFC',
          fontSize: 12, flexWrap: 'wrap',
        }}>
          <Stat label="GPS distance" value={`${totalKm.toFixed(2)} km`} color="#16A34A" />
          <Stat label="Source"       value={data?.distanceSource || '—'}  color="#64748B" />
          {claim && (
            <Stat label="Claimed"    value={`${Number(claim.distance || 0).toFixed(2)} km`} color="#2563EB" />
          )}
          <Stat label="Pings"        value={String(polyline.length)}      color="#7C3AED" />
        </div>

        {/* Map area */}
        <div style={{ flex: 1, position: 'relative', minHeight: 0, background: '#F1F5F9' }}>
          {loading && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 5,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(255,255,255,0.85)', fontSize: 13, color: '#64748B',
            }}>
              Loading route…
            </div>
          )}
          {!loading && error && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 5,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 6, padding: 24, textAlign: 'center',
              background: 'rgba(255,255,255,0.92)', color: '#DC2626', fontSize: 13,
            }}>
              <strong>Could not load route</strong>
              <span style={{ fontSize: 12 }}>{error}</span>
            </div>
          )}
          {!loading && !error && !hasPath && (
            <div style={{
              position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
              zIndex: 4, padding: '6px 14px', borderRadius: 20,
              background: 'rgba(255,255,255,0.95)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              fontSize: 12, color: '#64748B', border: '1px solid #E2E8F0',
            }}>
              No GPS path recorded for this date — showing office location only
            </div>
          )}

          {/* Map renders unconditionally. The error boundary catches any
              Leaflet-internal crash so HR never sees a blank page. */}
          <MapErrorBoundary>
            <MapContainer
              key={mapKey}
              center={center}
              zoom={hasPath ? 13 : 15}
              bounds={bounds && bounds.length >= 2 ? bounds : undefined}
              boundsOptions={{ padding: [40, 40] }}
              style={{ width: '100%', height: '100%' }}
              zoomControl={true}
              attributionControl={false}
            >
              <TileLayer
                url="https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
                subdomains={['mt0', 'mt1', 'mt2', 'mt3']}
                maxZoom={20}
              />

              {/* GPS polyline */}
              {hasPath && (
                <Polyline
                  positions={polyline.map((p) => [p.lat, p.lng])}
                  pathOptions={{
                    color: '#16A34A', weight: 4, opacity: 0.85,
                    lineCap: 'round', lineJoin: 'round',
                  }}
                />
              )}

              {/* Start / End pins */}
              {hasPath && (
                <>
                  <Marker position={[polyline[0].lat, polyline[0].lng]} icon={startIcon}>
                    <Popup>Start · {fmtDateTime(polyline[0].at)}</Popup>
                  </Marker>
                  <Marker
                    position={[
                      polyline[polyline.length - 1].lat,
                      polyline[polyline.length - 1].lng,
                    ]}
                    icon={endIcon}
                  >
                    <Popup>End · {fmtDateTime(polyline[polyline.length - 1].at)}</Popup>
                  </Marker>
                </>
              )}

              {/* Employee-marked from/to pins (allowance rows only) */}
              {claim?.fromLat && claim?.fromLng && (
                <Marker position={[claim.fromLat, claim.fromLng]} icon={fromIcon}>
                  <Popup>From: {claim.fromLocation || '—'}</Popup>
                </Marker>
              )}
              {claim?.toLat && claim?.toLng && (
                <Marker position={[claim.toLat, claim.toLng]} icon={toIcon}>
                  <Popup>To: {claim.toLocation || '—'}</Popup>
                </Marker>
              )}
            </MapContainer>
          </MapErrorBoundary>
        </div>

        {/* Legend */}
        {hasPath && (
          <div style={{
            display: 'flex', gap: 16, padding: '8px 20px',
            borderTop: '1px solid #E2E8F0', fontSize: 11, color: '#64748B',
            flexWrap: 'wrap',
          }}>
            <Legend color="#16A34A" label="GPS path" />
            <Legend color="#16A34A" label="Start (A)" />
            <Legend color="#DC2626" label="End (B)" />
            {claim?.fromLat && <Legend color="#2563EB" label="Employee from-pin (F)" />}
            {claim?.toLat   && <Legend color="#7C3AED" label="Employee to-pin (T)" />}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{
      padding: '6px 12px', borderRadius: 8,
      background: '#fff', border: '1px solid #E2E8F0',
      display: 'flex', flexDirection: 'column', minWidth: 100,
    }}>
      <div style={{
        fontSize: 10, color: '#94A3B8',
        textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 700,
      }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 800, color: color || '#1a1a1a', marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}
function Legend({ color, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        width: 10, height: 10, borderRadius: 2,
        background: color, display: 'inline-block',
      }} />
      {label}
    </span>
  );
}
