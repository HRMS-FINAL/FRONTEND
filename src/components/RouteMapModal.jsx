/**
 * RouteMapModal — popup that renders one employee's GPS route for one date.
 *
 * Why it exists
 * ─────────────
 * HR clicks "View Route" on a row (Allowance or Daily Routes) and this
 * modal opens, fetches /api/attendance/daily-route?employeeId=…&date=…
 * via the HRMS proxy, and renders:
 *   • A polyline of every LocationPing in time order.
 *   • Markers for the START (green) and END (red) of the day.
 *   • Optional from/to pins the employee marked on the allowance form.
 *   • Computed total km + the employee's claimed km.
 *
 * Migration to official Google Maps SDK (2026-06)
 * ───────────────────────────────────────────────
 * Previously this used react-leaflet pointing at the unofficial Google
 * tile URL https://{s}.google.com/vt/lyrs=m&… — that endpoint has no SLA
 * and Google can disable it any time. We now use @react-google-maps/api
 * with VITE_GOOGLE_MAPS_API_KEY so tiles, markers and polylines are
 * served by the official Maps JavaScript API.
 *
 * The public component contract is unchanged: open / onClose /
 * employeeId / employeeName / date / claim — every caller (Allowance,
 * DailyRoutes, LiveTracking) continues to work without modification.
 */
import React, { useEffect, useState, useRef } from 'react';
import { GoogleMap, useJsApiLoader, MarkerF, PolylineF, InfoWindowF } from '@react-google-maps/api';
import { X } from 'lucide-react';

import { API } from '../config/api';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

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

// ─── Coloured circle markers via Google's SymbolPath ──────────────────
// We can't use makePin() like leaflet did — Google Maps doesn't support
// arbitrary HTML markers without OverlayView. Instead we use Google's
// SymbolPath.CIRCLE with a coloured fill + white outline + label text.
function makeMarkerIcon(color) {
  // Returns an Icon config that @react-google-maps/api accepts. We
  // evaluate window.google lazily because this runs on first render —
  // before the JS API has had time to load and attach window.google.
  if (typeof window === 'undefined' || !window.google?.maps) return undefined;
  return {
    path: window.google.maps.SymbolPath.CIRCLE,
    fillColor:   color,
    fillOpacity: 1,
    strokeColor: '#fff',
    strokeWeight: 3,
    scale: 11,
  };
}

// ─── Error boundary so map crashes don't blank the modal ──────────────
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
  const [activePin, setActivePin] = useState(null);  // which marker has its InfoWindow open

  // Google Maps SDK loader — single instance per tab.
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    id: 'tesco-hrms-google-maps',
  });

  const mapRef = useRef(null);

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
    setActivePin(null);
    fetchRoute(employeeId, date)
      .then((j) => { if (!cancelled) { setData(j); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e?.message || 'Network error'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [open, employeeId, date]);

  // Pull out polyline + compute map center/bounds. All defensive — if
  // anything in `data` is unexpected we fall back to safe defaults so
  // the map still renders (centered on Tesco HQ in Ashok Nagar) and HR
  // gets a useful empty-state instead of a crash.
  // Accept whatever shape the backend returns — `polyline`, `route`, or
  // `points`. Older versions of the mobile backend's adminDailyRoute
  // emitted only `route`, and the frontend was silently reading
  // `polyline` and finding nothing — every employee's modal said
  // "No GPS path recorded" even when the database had hundreds of pings.
  // Reading all three field names here means the modal renders no
  // matter which backend version is live.
  const rawPath = Array.isArray(data?.polyline) ? data.polyline
                : Array.isArray(data?.route)    ? data.route
                : Array.isArray(data?.points)   ? data.points
                : [];
  const polyline = rawPath
    .map((p) => ({
      lat: Number(p?.lat ?? p?.latitude),
      lng: Number(p?.lng ?? p?.longitude),
      at:  p?.at ?? p?.t ?? p?.recordedAt ?? null,
    }))
    .filter((p) => isFinite(p.lat) && isFinite(p.lng));
  const hasPath = polyline.length >= 2;

  // Office default — Tesco Structures HQ, Ashok Nagar, Chennai
  const OFFICE = { lat: 13.0412, lng: 80.2127 };
  const center = hasPath
    ? { lat: polyline[0].lat, lng: polyline[0].lng }
    : (claim?.fromLat && claim?.fromLng
        ? { lat: claim.fromLat, lng: claim.fromLng }
        : { lat: OFFICE.lat,   lng: OFFICE.lng });

  // Re-fit bounds whenever the row (employeeId+date) or polyline length
  // changes. We can't pass a `bounds` prop to GoogleMap so we do the fit
  // imperatively against the saved map instance.
  useEffect(() => {
    if (!isLoaded || !mapRef.current || !window.google?.maps) return;
    const pts = [];
    for (const p of polyline) pts.push({ lat: p.lat, lng: p.lng });
    if (claim?.fromLat && claim?.fromLng) pts.push({ lat: claim.fromLat, lng: claim.fromLng });
    if (claim?.toLat   && claim?.toLng)   pts.push({ lat: claim.toLat,   lng: claim.toLng });
    if (pts.length === 0) {
      mapRef.current.panTo(center);
      mapRef.current.setZoom(15);
      return;
    }
    if (pts.length === 1) {
      mapRef.current.panTo(pts[0]);
      mapRef.current.setZoom(15);
      return;
    }
    const bounds = new window.google.maps.LatLngBounds();
    pts.forEach((p) => bounds.extend(p));
    mapRef.current.fitBounds(bounds, 64);
  }, [isLoaded, employeeId, date, polyline.length, claim?.fromLat, claim?.toLat]);

  if (!open) return null;

  const totalKm = Number(data?.totalDistanceKm || 0);
  const polylinePath = polyline.map((p) => ({ lat: p.lat, lng: p.lng }));
  const startPt = hasPath ? polyline[0] : null;
  const endPt   = hasPath ? polyline[polyline.length - 1] : null;

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
          {/*
            #380 — "Pings" now shows the REAL DB row count for the
            employee/date (moving + anchor), not polyline.length.
            The polyline is simplified (colinear points on a straight
            highway collapse to ~10 vertices) — displaying that as
            "Pings 10" made HR think tracking was broken when in fact
            the DB had 100+ captures. Falls back to polyline.length
            only if the backend response doesn't include pingCount yet
            (older API version).
          */}
          <Stat
            label="Pings"
            value={String(Number(data?.pingCount ?? polyline.length) || 0)}
            color="#7C3AED"
          />
          {typeof data?.movingPings === 'number' && typeof data?.anchorPings === 'number' && (
            <Stat
              label="Moving / Anchor"
              value={`${data.movingPings} / ${data.anchorPings}`}
              color="#0EA5E9"
            />
          )}
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

          {!GOOGLE_MAPS_API_KEY && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 8, padding: 24, textAlign: 'center',
              color: '#92400E', fontSize: 13, background: '#FFFBEB',
            }}>
              <strong>VITE_GOOGLE_MAPS_API_KEY is not configured</strong>
              <span style={{ fontSize: 12 }}>Set the key in .env (local) or in your deployment env vars and redeploy.</span>
            </div>
          )}
          {GOOGLE_MAPS_API_KEY && loadError && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 8, padding: 24, textAlign: 'center',
              color: '#B91C1C', fontSize: 13, background: '#FEF2F2',
            }}>
              <strong>Google Maps failed to load</strong>
              <span style={{ fontSize: 12 }}>Check that the "Maps JavaScript API" is enabled and your referrer restriction includes this domain.</span>
            </div>
          )}

          <MapErrorBoundary>
            {GOOGLE_MAPS_API_KEY && isLoaded && !loadError && (
              <GoogleMap
                mapContainerStyle={{ width: '100%', height: '100%' }}
                center={center}
                zoom={hasPath ? 13 : 15}
                onLoad={(m) => { mapRef.current = m; }}
                options={{
                  streetViewControl: false,
                  fullscreenControl: false,
                  mapTypeControl: false,
                  styles: [
                    { featureType: 'poi',     elementType: 'labels', stylers: [{ visibility: 'off' }] },
                    { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
                  ],
                }}
              >
                {/* GPS polyline */}
                {hasPath && (
                  <PolylineF
                    path={polylinePath}
                    options={{
                      strokeColor:   '#16A34A',
                      strokeOpacity: 0.85,
                      strokeWeight:  4,
                    }}
                  />
                )}

                {/* Start (A — green) */}
                {startPt && (
                  <MarkerF
                    position={{ lat: startPt.lat, lng: startPt.lng }}
                    icon={makeMarkerIcon('#16A34A')}
                    label={{ text: 'A', color: '#fff', fontSize: '11px', fontWeight: '800' }}
                    title={`Start · ${fmtDateTime(startPt.at)}`}
                    onClick={() => setActivePin({ key: 'start', position: { lat: startPt.lat, lng: startPt.lng }, body: `Start · ${fmtDateTime(startPt.at)}` })}
                  />
                )}

                {/* End (B — red) */}
                {endPt && hasPath && (
                  <MarkerF
                    position={{ lat: endPt.lat, lng: endPt.lng }}
                    icon={makeMarkerIcon('#DC2626')}
                    label={{ text: 'B', color: '#fff', fontSize: '11px', fontWeight: '800' }}
                    title={`End · ${fmtDateTime(endPt.at)}`}
                    onClick={() => setActivePin({ key: 'end', position: { lat: endPt.lat, lng: endPt.lng }, body: `End · ${fmtDateTime(endPt.at)}` })}
                  />
                )}

                {/* Employee-marked from-pin (allowance rows only) */}
                {claim?.fromLat && claim?.fromLng && (
                  <MarkerF
                    position={{ lat: claim.fromLat, lng: claim.fromLng }}
                    icon={makeMarkerIcon('#2563EB')}
                    label={{ text: 'F', color: '#fff', fontSize: '11px', fontWeight: '800' }}
                    title={`From: ${claim.fromLocation || '—'}`}
                    onClick={() => setActivePin({ key: 'from', position: { lat: claim.fromLat, lng: claim.fromLng }, body: `From: ${claim.fromLocation || '—'}` })}
                  />
                )}

                {/* Employee-marked to-pin (allowance rows only) */}
                {claim?.toLat && claim?.toLng && (
                  <MarkerF
                    position={{ lat: claim.toLat, lng: claim.toLng }}
                    icon={makeMarkerIcon('#7C3AED')}
                    label={{ text: 'T', color: '#fff', fontSize: '11px', fontWeight: '800' }}
                    title={`To: ${claim.toLocation || '—'}`}
                    onClick={() => setActivePin({ key: 'to', position: { lat: claim.toLat, lng: claim.toLng }, body: `To: ${claim.toLocation || '—'}` })}
                  />
                )}

                {activePin && (
                  <InfoWindowF
                    position={activePin.position}
                    onCloseClick={() => setActivePin(null)}
                  >
                    <div style={{ fontSize: 12, color: '#1a1a1a' }}>{activePin.body}</div>
                  </InfoWindowF>
                )}
              </GoogleMap>
            )}
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
