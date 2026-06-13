import React, { useState, useEffect, useRef, useCallback } from 'react';
// ─────────────────────────────────────────────────────────────────────────────
// Map stack migrated from react-leaflet → @react-google-maps/api on 2026-06.
// The previous TileLayer pointed at the unofficial Google tile endpoint
// (https://{s}.google.com/vt/lyrs=…) which has no SLA — switching to the
// official SDK with VITE_GOOGLE_MAPS_API_KEY makes tiles and overlays
// supported, properly billed, and stable.
// ─────────────────────────────────────────────────────────────────────────────
import { GoogleMap, useJsApiLoader, MarkerF, PolylineF, InfoWindowF, OverlayViewF } from '@react-google-maps/api';
import { Search, X as CloseIcon, Navigation, Filter, Users, MapPin, RefreshCw, Battery, Signal, Phone, MessageSquare, User, Clock, Timer, Route, TrendingUp, Layers, Calendar, Laptop, Smartphone } from 'lucide-react';
import '../tracking.css';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { API } from '../config/api';
// RouteMapModal opens the per-date GPS polyline + start/end pins. The
// Travel Report "View Route" button mounts this so HR can drill into
// any specific day without leaving the Live Tracking page.
import RouteMapModal from '../components/RouteMapModal';

// Live tracking now starts empty — populated from the mobile backend's
// /api/attendance/admin/all (per-employee lat/lng captured at check-in)
// plus the location-ping collection. Hardcoded Mumbai demo data removed.
const EMPLOYEES = [];

// ──────────────────────────────────────────────────────────────────────
// OFFICE LOCATION OVERRIDE (Jun 2026)
// ──────────────────────────────────────────────────────────────────────
// Edit the lat/lng below to MOVE THE GREEN OFFICE MARKER on the map.
//
// Highest priority — wins over backend `d.office` AND the React state
// default. Set lat=null AND lng=null to disable the override and fall
// back to whatever the backend's SystemConfig.officeAnchor says.
//
// HOW TO FIND THE COORDINATES:
//   1. Open Google Maps → right-click on the exact office position.
//   2. The first row of the popup shows "13.0xxx, 80.2xxx" — copy it.
//   3. Paste here, save, then `npm run build` and redeploy the frontend.
//
// Once set, the marker will NOT move on its own — no GPS update,
// check-in/out, ping or tracking event can change it. Only an HR edit
// of this constant + a rebuild will move it.
// ──────────────────────────────────────────────────────────────────────
const OFFICE_OVERRIDE = {
  lat: null,    // ← put office latitude here, e.g. 13.0420
  lng: null,    // ← put office longitude here, e.g. 80.2105
  radiusM: 60,
  name: 'Tesco Structures HQ',
};
const HAS_OFFICE_OVERRIDE =
  typeof OFFICE_OVERRIDE.lat === 'number' &&
  typeof OFFICE_OVERRIDE.lng === 'number' &&
  isFinite(OFFICE_OVERRIDE.lat) &&
  isFinite(OFFICE_OVERRIDE.lng);

// Three-bucket model that HR cares about:
//   active    — checked in, GPS on, but NOT at the office (field / travel)
//   office    — checked in, GPS on, inside the office geofence
//   offline   — GPS off mid-shift (idle) OR not checked in (offline)
// The backend still emits four raw statuses (office / travelling / idle /
// offline); we collapse `travelling` and legacy `active` into one Active
// bucket here, and merge `idle` into Offline because — to a manager — a
// person whose phone GPS is off looks the same as someone who's logged
// out: invisible on the map.
const STATUS_COLOR = {
  active:     '#4CAA17',
  travelling: '#4CAA17',   // alias of active
  office:     '#3b82f6',
  idle:       '#A0AEC0',   // GPS off → render as offline grey
  offline:    '#A0AEC0',
};
const STATUS_LABEL = {
  active:     'Active',
  travelling: 'Active',
  office:     'In Office',
  idle:       'Offline (Location off)',
  offline:    'Offline',
};

// Haversine — straight-line distance (metres) between two lat/lng pairs.
// Cheap enough to run on every employee on every render; the row count
// is small (tens, not thousands) so we don't bother memoising.
function distMeters(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some(v => typeof v !== 'number' || !isFinite(v))) return Infinity;
  const R = 6371000;                       // earth radius in metres
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Sum the leg-by-leg haversine distance along a sequence of {lat, lng}
// points — i.e. the length of the polyline that's drawn on the map. We
// drop legs longer than 50 km because those are almost always GPS
// teleports / phone-sleep artefacts that would otherwise inflate the
// reported distance by hundreds of km.
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

/**
 * Collapse the backend's raw statuses into the three HR buckets. When a
 * GPS distance to the office is supplied, anyone INSIDE the office
 * radius is forced into the 'office' bucket regardless of what their
 * raw status says — so an employee who is physically at the office but
 * is technically 'active' shows up correctly under "In Office".
 */
function bucketOf(status, distToOfficeM, radiusM) {
  if (typeof distToOfficeM === 'number' && distToOfficeM <= (radiusM || 200)) return 'office';
  if (status === 'office')                            return 'office';
  if (status === 'travelling' || status === 'active') return 'active';
  return 'offline';                                   // idle + offline + anything else
}

/**
 * Speed threshold (m/s) above which the employee is presumed to be in a
 * vehicle. ~3 m/s ≈ 10.8 km/h — comfortably above any walking pace, so
 * pings ≥ this almost certainly mean bike / scooter / car.
 */
const VEHICLE_SPEED_MPS = 3;

/** Inline-SVG bicycle for the moving-employee marker. */
const BIKE_SVG = (color, px) => `
  <svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}"
       viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2"
       stroke-linecap="round" stroke-linejoin="round">
    <circle cx="5.5" cy="17.5" r="3.5"/>
    <circle cx="18.5" cy="17.5" r="3.5"/>
    <path d="M15 6h3l-3 11.5"/>
    <path d="M6 17.5l3-6 4 6 2.5-7"/>
    <circle cx="15" cy="5" r="1"/>
  </svg>`;

/**
 * NameMarkerOverlay — renders a coloured pin + name pill as an HTML
 * overlay on the Google Map. Replaces the L.divIcon-based marker we
 * used with react-leaflet. The visual design is preserved: coloured
 * dot, initials (or bike glyph when speed sample > VEHICLE_SPEED_MPS),
 * and a name pill sitting to the right.
 */
function NameMarkerOverlay({ emp, isSelected, onClick }) {
  if (typeof emp?.lat !== 'number' || typeof emp?.lng !== 'number') return null;

  const color   = STATUS_COLOR[emp.status] || '#9F7AEA';
  const size    = isSelected ? 36 : 30;
  const moving  = typeof emp.speed === 'number' && emp.speed >= VEHICLE_SPEED_MPS;
  const speedKmh = moving ? Math.round(emp.speed * 3.6) : null;

  return (
    <OverlayViewF
      position={{ lat: emp.lat, lng: emp.lng }}
      mapPaneName="overlayMouseTarget"
      getPixelPositionOffset={(w, h) => ({ x: -(size / 2), y: -(size / 2) })}
    >
      <div
        onClick={onClick}
        style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
      >
        <div style={{
          width: size, height: size, borderRadius: '50%',
          background: color, border: '3px solid #fff',
          boxShadow: isSelected
            ? `0 0 0 4px ${color}33, 0 4px 14px rgba(0,0,0,0.25)`
            : '0 3px 10px rgba(0,0,0,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          {moving ? (
            <span dangerouslySetInnerHTML={{ __html: BIKE_SVG('#fff', Math.round(size * 0.62)) }} />
          ) : (
            <span style={{ color: '#fff', fontWeight: 800, fontSize: isSelected ? 12 : 11 }}>
              {(emp.initials || '?').slice(0, 2)}
            </span>
          )}
        </div>
        <div style={{
          background: '#fff', padding: '4px 10px', borderRadius: 14,
          border: `1px solid ${color}66`,
          fontSize: 11, fontWeight: 700, color: '#1a1a1a',
          marginLeft: 6, whiteSpace: 'nowrap',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis',
          display: 'inline-flex', alignItems: 'center',
        }}>
          {emp.name || ''}
          {moving && (
            <span style={{
              marginLeft: 4, padding: '2px 6px', borderRadius: 8,
              background: color, color: '#fff',
              fontSize: 10, fontWeight: 700, lineHeight: 1.1, whiteSpace: 'nowrap',
            }}>{speedKmh} km/h</span>
          )}
        </div>
      </div>
    </OverlayViewF>
  );
}

// makeStartIcon returns a Google-style icon descriptor (symbol path)
// for the office/start pin. Uses CIRCLE because OverlayView for a static
// office pin would be overkill.
function makeStartIcon() {
  if (typeof window === 'undefined' || !window.google?.maps) return undefined;
  return {
    path: window.google.maps.SymbolPath.CIRCLE,
    fillColor: '#4CAA17',
    fillOpacity: 1,
    strokeColor: '#fff',
    strokeWeight: 3,
    scale: 11,
  };
}

// Generic coloured-circle icon for waypoint markers (start/end of a
// historical route). Replaces the leaflet div-icon variant.
function makeIcon(color, isSelected) {
  if (typeof window === 'undefined' || !window.google?.maps) return undefined;
  return {
    path: window.google.maps.SymbolPath.CIRCLE,
    fillColor: color || '#0EA5E9',
    fillOpacity: 1,
    strokeColor: '#fff',
    strokeWeight: 3,
    scale: isSelected ? 12 : 9,
  };
}

/**
 * LiveTrackingGoogleMap — wraps the Google Maps SDK, lazily loads the
 * JS API via VITE_GOOGLE_MAPS_API_KEY and renders:
 *   • Office pin
 *   • Travel polylines (one per visible travelling employee)
 *   • Per-employee name+pin OverlayView markers
 *   • Historical polyline + start/end pins when "View Report" is active
 *
 * This component was extracted from LiveTracking.jsx during the
 * 2026-06 react-leaflet → @react-google-maps/api migration so the
 * Google-specific imperative APIs (fitBounds, panTo, the JS-API
 * loader flag) live in one place. The parent passes everything down
 * as props — no shared state lives here.
 */
function LiveTrackingGoogleMap({
  effectiveOffice,
  mapType,
  selected,
  setSelected,
  reportActive,
  historicalRoute,
  visible,
}) {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    id: 'tesco-hrms-google-maps',
  });

  const mapRef = useRef(null);
  const [activePopup, setActivePopup] = useState(null);  // { position, emp }

  // Fly to the explicitly-selected employee when it changes.
  useEffect(() => {
    if (!isLoaded || !mapRef.current) return;
    if (selected && isFinite(selected.lat) && isFinite(selected.lng)) {
      mapRef.current.panTo({ lat: selected.lat, lng: selected.lng });
      mapRef.current.setZoom(15);
    }
  }, [isLoaded, selected?.id, selected?.lat, selected?.lng]);

  // Auto-fit bounds when the historical route arrives, so the whole
  // employee trail is visible without the user having to zoom out.
  useEffect(() => {
    if (!isLoaded || !mapRef.current || !window.google?.maps) return;
    if (!reportActive) return;
    const pts = (historicalRoute?.points || []).filter(
      (p) => isFinite(p?.lat) && isFinite(p?.lng)
    );
    if (pts.length < 2) return;
    const bounds = new window.google.maps.LatLngBounds();
    pts.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
    mapRef.current.fitBounds(bounds, 80);
  }, [isLoaded, reportActive, historicalRoute?.points?.length]);

  const mapTypeId = mapType === 'satellite'
    ? 'hybrid'
    : mapType === 'terrain'
      ? 'terrain'
      : 'roadmap';

  // ── Friendly fallbacks ──────────────────────────────────────────────
  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, padding: 24, textAlign: 'center', color: '#92400E', background: '#FFFBEB', fontSize: 13 }}>
        <strong>VITE_GOOGLE_MAPS_API_KEY is not configured</strong>
        <span style={{ fontSize: 12 }}>Add it to .env (local) or to your deployment env vars and redeploy.</span>
      </div>
    );
  }
  if (loadError) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, padding: 24, textAlign: 'center', color: '#B91C1C', background: '#FEF2F2', fontSize: 13 }}>
        <strong>Google Maps failed to load</strong>
        <span style={{ fontSize: 12 }}>Make sure "Maps JavaScript API" is enabled and the HTTP-referrer restriction includes this domain.</span>
      </div>
    );
  }
  if (!isLoaded) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', background: '#F8FAFC', fontSize: 13 }}>
        Loading Google Maps…
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={{ width: '100%', height: '100%' }}
      center={{ lat: effectiveOffice.lat, lng: effectiveOffice.lng }}
      zoom={13}
      mapTypeId={mapTypeId}
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
      {/* Office pin */}
      <MarkerF
        position={{ lat: effectiveOffice.lat, lng: effectiveOffice.lng }}
        icon={makeStartIcon()}
        title={effectiveOffice.name || 'Office'}
      />

      {/* Historical track for the searched employee across the picked
          date range. Plotted only in historical mode and when we have
          at least 2 GPS samples. */}
      {reportActive && historicalRoute?.points?.length >= 2 && (
        <PolylineF
          path={historicalRoute.points.map((p) => ({ lat: p.lat, lng: p.lng }))}
          options={{
            strokeColor:   '#3B82F6',
            strokeOpacity: 0.85,
            strokeWeight:  4,
          }}
        />
      )}
      {reportActive && historicalRoute?.startEnd && (
        <>
          <MarkerF
            position={{ lat: historicalRoute.startEnd.from.lat, lng: historicalRoute.startEnd.from.lng }}
            icon={makeIcon('#16A34A', false)}
            label={{ text: 'S', color: '#fff', fontSize: '11px', fontWeight: '800' }}
            title={`Start · ${historicalRoute.startEnd.from.date}`}
          />
          <MarkerF
            position={{ lat: historicalRoute.startEnd.to.lat, lng: historicalRoute.startEnd.to.lng }}
            icon={makeIcon('#DC2626', false)}
            label={{ text: 'E', color: '#fff', fontSize: '11px', fontWeight: '800' }}
            title={`End · ${historicalRoute.startEnd.to.date}`}
          />
        </>
      )}

      {/* Travel polylines for travelling employees */}
      {visible
        .filter((emp) => Array.isArray(emp.route) && emp.route.length >= 2)
        .map((emp) => (
          <PolylineF
            key={`trail-${emp.id}`}
            path={emp.route.map((p) => ({ lat: p.lat, lng: p.lng }))}
            options={{
              strokeColor:   STATUS_COLOR[emp.bucket] || '#9F7AEA',
              strokeWeight:  selected?.id === emp.id ? 5 : 3,
              strokeOpacity: selected?.id === emp.id ? 0.95 : 0.65,
            }}
          />
        ))}

      {/* Employee markers — one per visible row, labelled with name. We
          use OverlayView for the rich pin+pill design (matching the
          original leaflet div-icon look). Clicking either the pin or
          the pill selects the employee in the side panel. */}
      {visible
        .filter((emp) => isFinite(emp.lat) && isFinite(emp.lng))
        .map((emp) => (
          <NameMarkerOverlay
            key={emp.id}
            emp={emp}
            isSelected={selected?.id === emp.id}
            onClick={() => {
              setSelected(emp);
              setActivePopup({
                position: { lat: emp.lat, lng: emp.lng },
                emp,
              });
            }}
          />
        ))}

      {/* InfoWindow shown on click — mirrors the leaflet <Popup> content */}
      {activePopup && (
        <InfoWindowF
          position={activePopup.position}
          onCloseClick={() => setActivePopup(null)}
        >
          <div style={{ minWidth: 160 }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: '#1a1a1a' }}>{activePopup.emp.name}</div>
            <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
              {activePopup.emp.role || '—'}{activePopup.emp.employeeId ? ` · ${activePopup.emp.employeeId}` : ''}
            </div>
            <div style={{
              display: 'inline-block', marginTop: 6,
              padding: '2px 8px', borderRadius: 10,
              background: (STATUS_COLOR[activePopup.emp.status] || '#9F7AEA') + '22',
              color: STATUS_COLOR[activePopup.emp.status] || '#9F7AEA',
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: 0.4,
            }}>{STATUS_LABEL[activePopup.emp.status] || activePopup.emp.status}</div>
            <div style={{ fontSize: 11, color: '#777', marginTop: 6 }}>
              <MapPin size={10} style={{ verticalAlign: 'middle' }} /> {activePopup.emp.site}
            </div>
            <div style={{ fontSize: 11, color: '#777', marginTop: 2 }}>
              <Clock size={10} style={{ verticalAlign: 'middle' }} /> Last ping: {activePopup.emp.lastSeen}
            </div>
            {/* "Lock Office Here" button removed (Jun 2026) — office anchor
                is now permanently locked at the constant set near the top
                of this file. HR no longer needs (or wants) a way to
                accidentally re-pin it from the map popup. */}
          </div>
        </InfoWindowF>
      )}
    </GoogleMap>
  );
}

const EmployeeDetailOverlay = ({ emp, onClose }) => {
  if (!emp) return null;

  return (
    <div className="employee-detail-overlay">
      <button className="overlay-close" onClick={onClose}>
        <CloseIcon size={20} />
      </button>

      <div className="overlay-header">
        <div className="overlay-avatar" style={{ backgroundColor: emp.color }}>
          {emp.initials}
        </div>
        <h2 className="overlay-name">{emp.name}</h2>
        <p className="overlay-role">{emp.role}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', marginTop: '12px' }}>
          <div className="overlay-status-badge" style={{ background: STATUS_COLOR[emp.status], margin: 0 }}>
            {STATUS_LABEL[emp.status]}
          </div>
          {emp.battery && (
            <div title={emp.status === 'office' ? "Laptop Battery" : "Mobile Battery"} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', background: 'var(--bg-main)', padding: '4px 10px', borderRadius: '999px', border: '1px solid var(--border-color)' }}>
              {emp.status === 'office' 
                ? <Laptop size={14} color={parseInt(emp.battery) < 20 ? '#ef4444' : parseInt(emp.battery) < 50 ? '#eab308' : '#22c55e'} />
                : <Smartphone size={14} color={parseInt(emp.battery) < 20 ? '#ef4444' : parseInt(emp.battery) < 50 ? '#eab308' : '#22c55e'} />
              }
              {emp.battery}
            </div>
          )}
        </div>
      </div>

      <div className="overlay-scroll-container">
        <div className="overlay-content">
          <div className="detail-row">
            <div className="detail-icon-box">
              <MapPin size={18} />
            </div>
            <div className="detail-info">
              <span className="detail-label">Location</span>
              <span className="detail-value">{emp.site}</span>
            </div>
          </div>

          <div className="detail-row">
            <div className="detail-icon-box">
              <Clock size={18} />
            </div>
            <div className="detail-info">
              <span className="detail-label">Check-in</span>
              <span className="detail-value">{emp.checkIn}</span>
            </div>
          </div>

          <div className="detail-row">
            <div className="detail-icon-box">
              <Timer size={18} />
            </div>
            <div className="detail-info">
              <span className="detail-label">Working Hours</span>
              <span className="detail-value">{emp.workingHours}</span>
            </div>
          </div>

          {emp.dept === 'Sales' && (
            <div className="sales-allowance-card">
               <div className="allowance-header">
                  <div className="allowance-icon-box">
                    <Route size={16} />
                  </div>
                  <span>Travel Allowance</span>
               </div>
               <div className="allowance-grid">
                  <div className="allowance-stat">
                     <span className="lbl">Distance</span>
                     <span className="val">{emp.distance || 0} km</span>
                  </div>
                  <div className="allowance-stat">
                     <span className="lbl">Rate</span>
                     <span className="val">₹{emp.allowanceRate || 0}/km</span>
                  </div>
                  <div className="allowance-total">
                     <span className="lbl">Estimated Allowance</span>
                     <span className="val">₹{(emp.distance * emp.allowanceRate).toLocaleString()}</span>
                  </div>
               </div>
            </div>
          )}

          {emp.visitedSites && emp.visitedSites.length > 0 && (
            <div style={{ marginTop: '20px', background: 'var(--bg-main)', borderRadius: '12px', padding: '16px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Navigation size={16} color="var(--primary)" /> Route & Halts
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative' }}>
                <div style={{ position: 'absolute', left: '11px', top: '10px', bottom: '10px', width: '2px', background: 'var(--border-color)', zIndex: 0 }} />
                {emp.visitedSites.map((site, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '12px', position: 'relative', zIndex: 1 }}>
                    <div style={{ 
                      width: '24px', height: '24px', borderRadius: '50%', background: site.status === 'Halted' ? '#fee2e2' : '#e0e7ff', 
                      display: 'flex', alignItems: 'center', justify: 'center', border: '2px solid white', flexShrink: 0,
                      justifyContent: 'center'
                    }}>
                      {site.status === 'Halted' ? <MapPin size={12} color="#dc2626" /> : <Navigation size={12} color="#4f46e5" />}
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>{site.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-light)', marginTop: '2px' }}>
                        <span style={{ fontWeight: 600, color: site.status === 'Halted' ? '#dc2626' : '#4f46e5' }}>{site.status}</span> • {site.time}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="overlay-actions">
        <button className="action-circle-btn">
          <Phone size={20} />
        </button>
        <button className="action-circle-btn">
          <MessageSquare size={20} />
        </button>
        <button className="action-circle-btn">
          <User size={20} />
        </button>
      </div>
    </div>
  );
};

export default function LiveTracking() {
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const isLive = selectedDate === todayStr && endDate === todayStr;

  const [filter, setFilter]     = useState('all');
  const [selected, setSelected] = useState(null);
  const [search, setSearch]     = useState('');
  const [mapType, setMapType]   = useState('roadmap'); // roadmap, satellite, terrain

  // Live employees come from /api/live-tracking (HRMS proxy → mobile
  // backend's /api/attendance/admin/live-locations). The mobile app pushes
  // a GPS ping every 2 minutes while checked in, so we re-fetch every 30s
  // here — the data is at most ~2 min old by design.
  const [liveEmployees, setLiveEmployees] = useState([]);
  // Office anchor (Jun 2026 — HR confirmed exact pin from Google Maps).
  // Tesco Structures HQ: 37, 15th Street, Gandhi Nagar, Ashok Nagar,
  // Chennai, Tamil Nadu 600083.
  //
  // Previously we anchored the office marker to whichever employee
  // matched /^ranganayagi/i was currently pinging from, so the green
  // HQ circle drifted across the map every time she moved her desk
  // or stepped outside. HR asked for a fixed pin so the geofence is
  // deterministic. We now lock the office to the constant coordinates
  // below — `effectiveOffice` later just returns this object unchanged.
  const [office, setOffice] = useState(
    HAS_OFFICE_OVERRIDE
      ? { lat: OFFICE_OVERRIDE.lat, lng: OFFICE_OVERRIDE.lng, radiusM: OFFICE_OVERRIDE.radiusM, name: OFFICE_OVERRIDE.name }
      : { lat: 13.0412, lng: 80.2127, radiusM: 60, name: 'Tesco Structures HQ' }
  );
  const RADIUS_M = HAS_OFFICE_OVERRIDE ? OFFICE_OVERRIDE.radiusM : 60;
  // Drives the spinner on the Force Refresh button so the click feels
  // responsive and we can prevent rapid-fire double fetches.
  const [refreshing, setRefreshing]   = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null); // Date | null
  // Cancellation flag for in-flight fetches when the component unmounts —
  // declared outside the loader so each refresh shares the same lifecycle.
  const cancelledRef = useRef(false);
  const inFlightRef  = useRef(false);

  // Centralised loader — used by the auto-poll AND by the Force Refresh
  // button. Returns a promise so the button can await the round-trip and
  // flip its spinner off precisely when the data has landed.
  const loadLive = useCallback(async () => {
    if (inFlightRef.current) return;        // collapse double-clicks
    inFlightRef.current = true;
    setRefreshing(true);
    try {
      const r = await fetch(`${API}/live-tracking`);
      const d = await r.json().catch(() => ({}));
      if (cancelledRef.current) return;
      if (!d?.success || !Array.isArray(d.data)) return;
      // Office anchor (Jun 2026 — production fix). Backend now serves
      // the locked SystemConfig.officeAnchor in d.office. Reflect it
      // on the map so the green geofence circle sits exactly where HR
      // pinned it via the Lock Office endpoint, not where the
      // hardcoded default used to be.
      // Override wins; otherwise sync from backend SystemConfig.officeAnchor.
      if (HAS_OFFICE_OVERRIDE) {
        // No-op — initial state already holds the override and we never
        // want the backend to move it.
      } else if (d.office && typeof d.office.lat === 'number' && typeof d.office.lng === 'number') {
        setOffice({
          lat: d.office.lat,
          lng: d.office.lng,
          radiusM: typeof d.office.radiusM === 'number' ? d.office.radiusM : 60,
          name: d.office.name || 'Tesco Structures HQ',
        });
      }
      const rows = d.data
        .filter(e => e.lat != null && e.lng != null)
        .map(e => ({
          id:         e._id,
          name:       e.name,
          employeeId: e.employeeId || '',
          role:       e.role || '',
          dept:       e.dept || '',
          email:      e.email || '',
          lat:        e.lat,
          lng:        e.lng,
          // m/s — drives the "show bike icon if moving fast enough" path
          // in makeNameMarker. Backend returns null when no speed sample
          // is available; the marker treats that as "stationary".
          speed:      (typeof e.speed === 'number' && isFinite(e.speed)) ? e.speed : null,
          // Today's GPS trail for travelling employees. Backend only
          // attaches `route` when status === 'travelling' and there are
          // at least 2 pings, otherwise null. Each point is { lat, lng, t }.
          route:      Array.isArray(e.route) && e.route.length >= 2 ? e.route : null,
          site:       e.site || (e.status === 'office' ? 'Tesco Structures HQ' : '—'),
          status:     e.status || 'offline',
          lastSeen:   e.lastSeen
                        ? new Date(e.lastSeen).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                        : '—',
          initials:   (e.name || '?').split(' ').map(s => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '??',
          // Colour from the collapsed bucket so the dot in the
          // sidebar/map matches the header tile and filter tab the
          // employee falls under.
          color:      STATUS_COLOR[bucketOf(e.status)] || STATUS_COLOR.offline,  // (live mode tile colour — left alone; sidebar uses e.bucket)
        }));
      setLiveEmployees(rows);
      setLastUpdated(new Date());
    } catch {
      // Network error — keep whatever we had on screen, just flip the
      // spinner back off so the button is usable again.
    } finally {
      inFlightRef.current = false;
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!isLive) return;
    cancelledRef.current = false;
    loadLive();
    // Live-poll cadence (Jun 2026): tightened from 2 min → 45 s.
    //
    // The mobile app emits a GPS sample roughly every 60-90 seconds
    // (foreground watcher fires every 30 s + check, background OS task
    // delivers every 90 s on most OEMs). Polling every 2 min lagged
    // HR's view by up to 3 min behind real position — feels broken
    // when the employee phones HR saying "I'm at the site now".
    //
    // 45 s polling gives HR a near-real-time view (~1 ping worth of
    // lag) while keeping backend load trivial (24 calls/min/HR seat).
    // The endpoint is a single Mongo read on a small collection, so
    // even at 50 HR seats this is well within Render's free tier.
    const id = setInterval(loadLive, 45 * 1000);
    return () => { cancelledRef.current = true; clearInterval(id); };
  }, [isLive, loadLive]);

  // Office anchor is now a hard-coded constant (see above) — no
  // employee-pinning lookup. The previous Ranganayagi-anchor logic
  // was removed in Jun 2026 at HR's request.
  const effectiveOffice = office;

  // Attach distance-to-office + the resolved bucket on every employee so
  // we don't recompute it inline three times in the renderer.
  const employees = liveEmployees.map(e => {
    const dMeters = distMeters(e.lat, e.lng, effectiveOffice.lat, effectiveOffice.lng);
    return { ...e, distMeters: dMeters, bucket: bucketOf(e.status, dMeters, effectiveOffice.radiusM) };
  });

  const visible   = employees.filter(e => {
    // All filtering happens at the bucket level so the three header tiles
    // and three filter tabs always agree on what each label means.
    const matchesFilter = filter === 'all' || e.bucket === filter;
    const matchesSearch = !search ||
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.employeeId.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  // ─── Historical roster (drives the search dropdown) ───────────────
  // When HR picks a non-live date range, the search/datalist should list
  // ONLY employees who actually checked in inside that range — not the
  // full live roster. We fetch /api/attendance/logs once per day in the
  // range and de-dupe by employeeId+name.
  const [historicalEmployees, setHistoricalEmployees] = useState([]);
  useEffect(() => {
    if (isLive) { setHistoricalEmployees([]); return; }
    let cancelled = false;
    (async () => {
      // Build the list of dates from selectedDate → endDate, inclusive.
      const start = new Date(selectedDate);
      const end   = new Date(endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
        setHistoricalEmployees([]);
        return;
      }
      const dates = [];
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(d.toISOString().slice(0, 10));
      }
      // Cap at 31 days to keep the burst manageable.
      const capped = dates.slice(0, 31);
      try {
        const seen = new Map();   // key = employeeId || name lowercased
        await Promise.all(capped.map(async (date) => {
          const r = await fetch(`${API}/attendance/logs?date=${date}`);
          const d = await r.json().catch(() => ({}));
          if (cancelled || !d?.success || !Array.isArray(d.data)) return;
          for (const row of d.data) {
            // Only count actual check-ins — skip placeholder rows where
            // the employee never clocked in.
            if (!row.checkIn || row.checkIn === '—' || row.checkIn === '--:--') continue;
            const empId = String(row.employeeId || '').trim();
            const name  = String(row.employeeName || row.name || '').trim();
            const key   = empId.toLowerCase() || name.toLowerCase();
            if (!key || seen.has(key)) continue;
            seen.set(key, { id: key, name, employeeId: empId });
          }
        }));
        if (cancelled) return;
        setHistoricalEmployees([...seen.values()].sort((a, b) => a.name.localeCompare(b.name)));
      } catch {
        if (!cancelled) setHistoricalEmployees([]);
      }
    })();
    return () => { cancelled = true; };
  }, [isLive, selectedDate, endDate]);

  // ─── Travel Report (historical mode) ────────────────────────────
  // When HR picks a date range that isn't today AND types an emp ID or
  // name into the search, we replace the map with a Travel Report panel
  // that lists every petrol + travel allowance for that employee inside
  // the range, plus totals.
  const [travelReport, setTravelReport] = useState({ loading: false, rows: [], emp: null });
  // Per-date row drill-down modal. When HR clicks "View Route" on a row
  // in the Travel Report, we set { open:true, date, employeeId } and
  // mount RouteMapModal below the page tree. Modal closes by resetting
  // open=false; the date stays so reopens are instant.
  const [routeDrillModal, setRouteDrillModal] = useState({ open: false, date: '', employeeId: '', employeeName: '' });
  // Historical GPS track for the searched employee across [selectedDate,
  // endDate]. Fetched once per range change; rendered as a single
  // polyline on the map under the report panel.
  const [historicalRoute, setHistoricalRoute] = useState({ loading: false, points: [], startEnd: null });

  // ddmmyyyy fragments used in the title / CSV.
  const fmtDDMMYYYY = (iso) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  } catch { return String(iso); }
};

  const reportActive = !isLive && search.trim().length > 0;

  // ── Per-date report rows ─────────────────────────────────────────────
  // HR feedback: when a date range + employee search is active, the
  // Travel Report should expand into ONE row per day in the range,
  // showing date / employee / GPS distance / View Route — even on days
  // the employee filed no allowance claim. We derive the rows directly
  // from `historicalRoute.points` (already grouped by date by the
  // daily-route fetch effect above) so we don't need a second network
  // round-trip.
  const dailyReport = React.useMemo(() => {
    if (!reportActive) return [];
    const start = new Date(selectedDate);
    const end   = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return [];

    // Bucket polyline points by date so we can compute per-day km.
    const byDate = {};
    for (const p of (historicalRoute.points || [])) {
      if (!p?.date) continue;
      (byDate[p.date] ||= []).push(p);
    }
    // Haversine between two lat/lng points (km).
    const km = (a, b) => {
      const R = 6371;
      const toRad = (x) => (x * Math.PI) / 180;
      const dLat = toRad(b.lat - a.lat);
      const dLng = toRad(b.lng - a.lng);
      const aa = Math.sin(dLat / 2) ** 2 +
                 Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) *
                 Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.min(1, Math.sqrt(aa)));
    };

    const out = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);
      const pts = byDate[dateStr] || [];
      let distanceKm = 0;
      for (let i = 1; i < pts.length; i++) distanceKm += km(pts[i - 1], pts[i]);
      out.push({
        date: dateStr,
        distanceKm,
        hasRoute: pts.length >= 2,
      });
    }
    return out;
  }, [reportActive, selectedDate, endDate, historicalRoute.points]);

  useEffect(() => {
    let cancelled = false;
    if (!reportActive) {
      setTravelReport({ loading: false, rows: [], emp: null });
      return;
    }
    (async () => {
      setTravelReport((p) => ({ ...p, loading: true }));
      try {
        const r = await fetch(`${API}/allowances?limit=500`);
        const d = await r.json().catch(() => ({}));
        if (cancelled) return;

        // /api/allowances returns { petrol: [], travel: [] }. Stitch both
        // lists together with a kind tag so we can group later.
        const all = [
          ...(Array.isArray(d?.petrol) ? d.petrol : []).map(x => ({ ...x, kind: 'petrol' })),
          ...(Array.isArray(d?.travel) ? d.travel : []).map(x => ({ ...x, kind: 'travel' })),
        ];

        // Match against the typed search — accept emp ID OR a name substring.
        const needle = search.trim().toLowerCase();
        const inRange = (dateStr) => {
          if (!dateStr) return false;
          // dateStr from the allowance proxy is already yyyy-mm-dd.
          return dateStr >= selectedDate && dateStr <= endDate;
        };
        const matches = all.filter(row => {
          const a = String(row.empId || row.employeeId || '').toLowerCase();
          const b = String(row.empName || '').toLowerCase();
          if (a !== needle && !b.includes(needle)) return false;
          return inRange(row.date);
        });

        // Sort by date desc — newest trip first.
        matches.sort((a, b) => String(b.date).localeCompare(String(a.date)));

        const first = matches[0];
        setTravelReport({
          loading: false,
          rows: matches,
          emp: first ? { name: first.empName, employeeId: first.empId || first.employeeId || '' } : null,
        });
      } catch {
        if (!cancelled) setTravelReport({ loading: false, rows: [], emp: null });
      }
    })();
    return () => { cancelled = true; };
  }, [reportActive, search, selectedDate, endDate]);

  // Pull the daily GPS polyline for every date in the picked range and
  // concat into one array so the map can render a single multi-day
  // trail. Capped at 31 days so a wide range doesn't fan out into
  // hundreds of HTTP calls.
  useEffect(() => {
    let cancelled = false;
    if (!reportActive || !search.trim()) {
      setHistoricalRoute({ loading: false, points: [], startEnd: null });
      return;
    }
    (async () => {
      setHistoricalRoute(p => ({ ...p, loading: true }));
      try {
        const empId = search.trim().toUpperCase();
        const start = new Date(selectedDate);
        const end   = new Date(endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
          setHistoricalRoute({ loading: false, points: [], startEnd: null });
          return;
        }
        const dates = [];
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          dates.push(d.toISOString().slice(0, 10));
        }
        const capped = dates.slice(0, 31);

        const allPoints = [];
        let firstFix = null, lastFix = null;
        await Promise.all(capped.map(async (date) => {
          try {
            const r = await fetch(`${API}/attendance/daily-route?employeeId=${encodeURIComponent(empId)}&date=${date}`);
            const d = await r.json().catch(() => ({}));
            if (cancelled || !d?.success) return;
            // Mobile backend returns the polyline under `polyline` (same
            // key RouteMapModal reads). Older paths used `route`/`points`,
            // so accept all three shapes.
            const pts = Array.isArray(d.polyline)        ? d.polyline :
                        Array.isArray(d.route)           ? d.route :
                        Array.isArray(d.points)          ? d.points :
                        Array.isArray(d.data?.polyline)  ? d.data.polyline :
                        Array.isArray(d.data?.route)     ? d.data.route :
                        Array.isArray(d.data?.points)    ? d.data.points : [];
            for (const p of pts) {
              const lat = Number(p.lat ?? p.latitude);
              const lng = Number(p.lng ?? p.longitude);
              if (isFinite(lat) && isFinite(lng)) {
                allPoints.push({ lat, lng, date });
                if (!firstFix) firstFix = { lat, lng, date };
                lastFix = { lat, lng, date };
              }
            }
          } catch { /* per-day fetch errors are non-fatal */ }
        }));

        // Sort by date so the polyline draws in time order rather than
        // jumping around if the per-day fetches resolve out of order.
        allPoints.sort((a, b) => String(a.date).localeCompare(String(b.date)));

        if (!cancelled) {
          setHistoricalRoute({
            loading: false,
            points: allPoints,
            startEnd: firstFix && lastFix ? { from: firstFix, to: lastFix } : null,
          });
        }
      } catch {
        if (!cancelled) setHistoricalRoute({ loading: false, points: [], startEnd: null });
      }
    })();
    return () => { cancelled = true; };
  }, [reportActive, search, selectedDate, endDate]);

  // ── Per-date downloads (CSV / PDF / Excel) ────────────────────────
  // All three exports operate on `dailyReport` — the same per-date rows
  // HR sees on screen — so the printed/downloaded version matches the
  // panel exactly. We compute one summary line at the bottom (total
  // distance + days with GPS path) for at-a-glance auditing.

  const _empNameForFile = () => {
    const e = travelReport.emp || {};
    const id = e.employeeId || search.trim().toUpperCase();
    return (id || 'employee').replace(/[^a-zA-Z0-9]+/g, '_');
  };

  const downloadTravelReportCsv = () => {
    const empName = travelReport.emp?.name || search.trim() || '—';
    const empId   = travelReport.emp?.employeeId || '';
    const totalKm = dailyReport.reduce((s, d) => s + (d.distanceKm || 0), 0);
    const daysWithRoute = dailyReport.filter((d) => d.hasRoute).length;

    const header = ['Date', 'Employee', 'Employee ID', 'Distance travelled (km)', 'GPS route'];
    const rows = dailyReport.map((d) => [
      fmtDDMMYYYY(d.date),
      empName,
      empId,
      Number(d.distanceKm.toFixed(2)),
      d.hasRoute ? 'Yes' : 'No',
    ]);
    const summary = [
      [],
      ['', '', 'Total days',             dailyReport.length],
      ['', '', 'Days with GPS route',    daysWithRoute],
      ['', '', 'Total distance (km)',    Number(totalKm.toFixed(2))],
      ['', '', 'Period from',            fmtDDMMYYYY(selectedDate)],
      ['', '', 'Period to',              fmtDDMMYYYY(endDate)],
    ];
    const csv = [header, ...rows, ...summary]
      .map((row) => row.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `travel-report_${_empNameForFile()}_${selectedDate}_${endDate}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Pro-format PDF — brand band, employee + date range header, one
  // table row per day in the picked range, footer with totals + page
  // numbers. autoTable handles pagination automatically when the
  // range is long.
  const downloadTravelReportPdf = () => {
    try {
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const M = 40;

      // Header band
      doc.setFillColor(76, 170, 23);
      doc.rect(0, 0, pageW, 64, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(255, 255, 255);
      doc.text('TESCO STRUCTURES — Travel Report', M, 38);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('HR · Live Tracking · Daily GPS Distance', M, 54);

      // Subject (employee + range)
      const emp     = travelReport.emp || {};
      const empName = emp.name || search.trim() || 'All Employees';
      const empId   = emp.employeeId ? ` · ${emp.employeeId}` : '';
      let y = 100;
      doc.setFontSize(13);
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text(`${empName}${empId}`, M, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Period: ${fmtDDMMYYYY(selectedDate)}  →  ${fmtDDMMYYYY(endDate)}` +
        `   |   Generated: ${fmtDDMMYYYY(new Date().toISOString().slice(0,10))}`,
        M, y + 16
      );

      // Per-date table
      const head = [['Date', 'Employee', 'Distance (km)', 'GPS route']];
      const body = dailyReport.map((d) => [
        fmtDDMMYYYY(d.date),
        empName,
        d.distanceKm.toFixed(2),
        d.hasRoute ? 'Yes' : 'No',
      ]);
      autoTable(doc, {
        startY: y + 36,
        head, body,
        theme:  'striped',
        styles: { fontSize: 10, cellPadding: 7 },
        headStyles: { fillColor: '#4CAA17', textColor: '#fff', fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 90 },
          2: { halign: 'right', cellWidth: 110 },
          3: { halign: 'center', cellWidth: 80 },
        },
        didDrawPage: (data) => {
          const str = `Page ${doc.internal.getCurrentPageInfo().pageNumber} of ${doc.internal.getNumberOfPages()}`;
          doc.setFontSize(8);
          doc.setTextColor(148, 163, 184);
          doc.text(
            `Tesco Structures HRMS  ·  Daily GPS distance from Live Tracking pings`,
            M, doc.internal.pageSize.getHeight() - 28
          );
          doc.text(str, pageW - M - doc.getTextWidth(str), doc.internal.pageSize.getHeight() - 28);
        },
      });

      // Totals strip
      const finalY      = doc.lastAutoTable?.finalY || y + 60;
      const totalKm     = dailyReport.reduce((s, d) => s + (d.distanceKm || 0), 0);
      const daysWith    = dailyReport.filter((d) => d.hasRoute).length;
      const totalDays   = dailyReport.length;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(
        `Total days: ${totalDays}    |    Days with GPS route: ${daysWith}    |    Total distance: ${totalKm.toFixed(2)} km`,
        M, finalY + 24
      );

      doc.save(`travel-report_${_empNameForFile()}_${selectedDate}_${endDate}.pdf`);
    } catch (err) {
      console.error('[downloadTravelReportPdf]', err);
      alert('Could not generate PDF: ' + (err?.message || 'unknown error'));
    }
  };

  // Excel (XLSX) export — Summary sheet (employee + range + totals)
  // and a Daily sheet with one row per date. HR can pivot the Daily
  // sheet for ad-hoc analysis.
  const downloadTravelReportExcel = () => {
    try {
      const emp = travelReport.emp || {};
      const empName = emp.name || search.trim() || 'All Employees';
      const totalKm = dailyReport.reduce((s, d) => s + (d.distanceKm || 0), 0);
      const daysWith = dailyReport.filter((d) => d.hasRoute).length;

      const summary = [
        ['Tesco Structures — Travel Report'],
        [],
        ['Employee',        empName],
        ['Employee ID',     emp.employeeId || ''],
        ['Period From',     fmtDDMMYYYY(selectedDate)],
        ['Period To',       fmtDDMMYYYY(endDate)],
        ['Generated',       fmtDDMMYYYY(new Date().toISOString().slice(0,10))],
        [],
        ['Total days',              dailyReport.length],
        ['Days with GPS route',     daysWith],
        ['Total distance (km)',     Number(totalKm.toFixed(2))],
      ];

      const daily_data = [
        ['Date', 'Employee', 'Employee ID', 'Distance travelled (km)', 'GPS route'],
        ...dailyReport.map((d) => [
          fmtDDMMYYYY(d.date),
          empName,
          emp.employeeId || '',
          Number(d.distanceKm.toFixed(2)),
          d.hasRoute ? 'Yes' : 'No',
        ]),
      ];

      const wb = XLSX.utils.book_new();
      const wsSummary = XLSX.utils.aoa_to_sheet(summary);
      const wsDaily   = XLSX.utils.aoa_to_sheet(daily_data);
      wsSummary['!cols'] = [{ wch: 26 }, { wch: 30 }];
      wsDaily['!cols']   = [{ wch: 14 }, { wch: 28 }, { wch: 14 }, { wch: 24 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');
      XLSX.utils.book_append_sheet(wb, wsDaily,   'Daily');

      XLSX.writeFile(wb, `travel-report_${_empNameForFile()}_${selectedDate}_${endDate}.xlsx`);
    } catch (err) {
      console.error('[downloadTravelReportExcel]', err);
      alert('Could not generate Excel: ' + (err?.message || 'unknown error'));
    }
  };

  // Buckets the header + filter tabs are built from.
  const counts = {
    total:   employees.length,
    active:  employees.filter(e => e.bucket === 'active').length,
    office:  employees.filter(e => e.bucket === 'office').length,
    offline: employees.filter(e => e.bucket === 'offline').length,
  };

  return (
    <div className="live-tracking-page">
      <div className="page-header" style={{ marginBottom: '20px' }}>
        <div className="header-left">
          <div className="header-title-row">
            <h1 className="page-title">{isLive ? 'Live Employee Tracking' : 'Historical Tracking'}</h1>
            <div className="live-status-indicator" style={!isLive ? { background: '#EDF2F7', color: '#4A5568', borderColor: '#E2E8F0' } : {}}>
              {isLive && <span className="live-dot" />}
              {isLive ? 'Live Feed' : new Date(selectedDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')}
            </div>
          </div>
          <p className="page-subtitle">
            {isLive ? 'Monitoring real-time onsite staff movements and deployment status' : `Reviewing staff movements and routes from ${new Date(selectedDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')} to ${new Date(endDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')}`}
          </p>
        </div>
        <div className="header-right">
          <div className="tracking-summary">
            <div className="summary-item">
              <span className="summary-val" style={{ color: STATUS_COLOR.active }}>{counts.active}</span>
              <span className="summary-lbl">Active</span>
            </div>
            <div className="summary-divider" />
            <div className="summary-item">
              <span className="summary-val" style={{ color: STATUS_COLOR.office }}>{counts.office}</span>
              <span className="summary-lbl">In Office</span>
            </div>
            <div className="summary-divider" />
            <div className="summary-item">
              <span className="summary-val" style={{ color: STATUS_COLOR.offline }}>{counts.offline}</span>
              <span className="summary-lbl">Offline</span>
            </div>
          </div>
        </div>
      </div>

      <div className="tracking-layout">
        {/* Sidebar Panel */}
        <div className="tracking-side-panel">
          <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-light)', width: '35px' }}>FROM</span>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '6px 10px', gap: '8px' }}>
                <Calendar size={14} color="var(--text-light)" style={{ flexShrink: 0 }} />
                <input 
                  type="date" 
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  style={{ color: 'var(--text-main)', border: 'none', background: 'transparent', outline: 'none', fontSize: '12px', width: '100%' }}
                  max={todayStr}
                />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-light)', width: '35px' }}>TO</span>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '6px 10px', gap: '8px' }}>
                <Calendar size={14} color="var(--text-light)" style={{ flexShrink: 0 }} />
                <input 
                  type="date" 
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={{ color: 'var(--text-main)', border: 'none', background: 'transparent', outline: 'none', fontSize: '12px', width: '100%' }}
                  max={todayStr}
                />
              </div>
            </div>
          </div>
          
          {/* Polished search dropdown (Jun 2026). The previous datalist
              autocomplete looked too plain — we now render an explicit
              styled <select> with a green focus ring, employee name +
              ID per option, and a "Clear" affordance via the empty
              option. Switching to <select> from datalist also makes
              the dropdown work on mobile browsers where datalist is
              quietly broken. */}
          <div style={{ marginTop: '12px', position: 'relative' }}>
            <Search
              size={16}
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#4CAA17', pointerEvents: 'none' }}
            />
            <select
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 36px 10px 36px',
                border: '1.5px solid #BBF7D0',
                borderRadius: '10px',
                fontSize: 13,
                fontWeight: 600,
                color: '#0F172A',
                background: '#FFFFFF',
                appearance: 'none',
                WebkitAppearance: 'none',
                MozAppearance: 'none',
                cursor: 'pointer',
                outline: 'none',
                boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#4CAA17';
                e.target.style.boxShadow = '0 0 0 3px rgba(76,170,23,0.18)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#BBF7D0';
                e.target.style.boxShadow = '0 1px 2px rgba(15,23,42,0.04)';
              }}
            >
              <option value="">Search by Name or Emp ID…</option>
              {(isLive ? employees : historicalEmployees)
                .slice()
                .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
                .map((e) => (
                  <option key={e.id} value={e.employeeId || e.name}>
                    {e.name}{e.employeeId ? ' · ' + e.employeeId : ''}
                  </option>
                ))}
            </select>
            {/* Chevron — pure CSS so it stays put when the select is focused */}
            <div style={{
              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              pointerEvents: 'none', color: '#64748B',
            }}>▾</div>
          </div>

          <div className="panel-filters">
            <button className={`filter-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
              All <span className="tab-count">{counts.total}</span>
            </button>
            <button className={`filter-tab ${filter === 'active' ? 'active' : ''}`} onClick={() => setFilter('active')}>
              Active <span className="tab-count" style={{ background: STATUS_COLOR.active, color: 'white' }}>{counts.active}</span>
            </button>
            <button className={`filter-tab ${filter === 'office' ? 'active' : ''}`} onClick={() => setFilter('office')}>
              In Office <span className="tab-count" style={{ background: STATUS_COLOR.office, color: 'white' }}>{counts.office}</span>
            </button>
            <button className={`filter-tab ${filter === 'offline' ? 'active' : ''}`} onClick={() => setFilter('offline')}>
              Offline <span className="tab-count" style={{ background: STATUS_COLOR.offline, color: 'white' }}>{counts.offline}</span>
            </button>
          </div>

          <div className="employee-track-list">
            <div className="list-label">Onsite Personnel</div>
            <div className="track-items-container">
              {visible.map(emp => (
                <div 
                  key={emp.id} 
                  className={`track-item ${selected?.id === emp.id ? 'selected' : ''}`}
                  onClick={() => setSelected(emp)}
                >
                  <div className="item-avatar" style={{ background: emp.color + '20', color: emp.color }}>
                    {emp.initials}
                  </div>
                  <div className="item-info">
                    <div className="item-name">{emp.name}</div>
                    <div className="item-meta">
                      {/* Designation (job title) under the name — replaces
                          the raw department ObjectId that used to leak
                          through. emp.role is the resolved designation
                          title from the backend. */}
                      <span className="item-dept">{emp.role || emp.dept || '—'}</span>
                      <span className="dot-sep" />
                      <span className="item-site"><MapPin size={10} style={{ marginRight: '2px', verticalAlign: 'middle' }} /> {emp.site}</span>
                      {emp.movement && (
                        <>
                          <span className="dot-sep" />
                          <span
                            className="item-movement"
                            style={{
                              fontSize: '10px',
                              fontWeight: 600,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: emp.movement === 'moving' ? '#dbeafe' : '#f1f5f9',
                              color:      emp.movement === 'moving' ? '#1d4ed8' : '#475569',
                            }}
                          >
                            {emp.movement === 'moving' ? 'Moving' : 'Stationary'}
                          </span>
                        </>
                      )}
                      {emp.dept === 'Sales' && (
                        <>
                          <span className="dot-sep" />
                          <span className="item-dist"><Route size={10} style={{ marginRight: '2px', verticalAlign: 'middle' }} /> {emp.distance}km</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="item-status">
                    <div className="status-dot" style={{ background: STATUS_COLOR[emp.status] }} />
                    <span className="last-seen">{emp.lastSeen}</span>
                  </div>
                </div>
              ))}
              {visible.length === 0 && (
                <div className="empty-results">
                  <Users size={32} />
                  <p>No employees found matching filters</p>
                </div>
              )}
            </div>
          </div>
          
          <div className="panel-footer">
            {/* Force Refresh re-fetches /api/live-tracking immediately
                instead of waiting for the 30s auto-poll. The button is
                disabled while a request is already in flight so a rapid
                double-tap can't queue two parallel fetches; the icon spins
                during the round-trip for visual feedback. */}
            <button
              className="refresh-btn"
              onClick={() => loadLive()}
              disabled={!isLive || refreshing}
              style={(!isLive || refreshing) ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
              title={refreshing ? 'Refreshing…' : 'Fetch the latest pings now'}
            >
              <RefreshCw
                size={14}
                style={refreshing ? { animation: 'lt-spin 0.8s linear infinite' } : undefined}
              />
              {refreshing ? 'Refreshing…' : 'Force Refresh'}
            </button>
            <div className="update-time">
              {isLive
                ? `Updated: ${(lastUpdated || new Date()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                : 'Historical Data'}
            </div>
          </div>
        </div>

        {/* Right column: in Live mode this is the Google Map; in filter
            mode it's the Travel Report card. Both live in the same grid
            slot so the column TOP aligns with the side-panel's FROM date
            picker (Jun 2026 brief — previously the report rendered below
            the grid and started ~150 px lower than the date pickers). */}
        <div
          className="tracking-map-container"
          style={reportActive ? { background: 'transparent', border: 'none', boxShadow: 'none', padding: 0, height: 'auto', minHeight: 0 } : undefined}
        >
          {/* Travel report panel was here previously — moved BELOW the
              map so HR can see the GPS polyline and the trip table at
              the same time. The render block has been relocated after
              the </div> that closes .tracking-map-container. */}
          {reportActive && false && (
            <div style={{ display: 'none' }}>
              <div style={{
                padding: '14px 18px', borderBottom: '1px solid var(--border-color)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: '#F8FAFC',
              }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>
                    Travel Report
                    {travelReport.emp ? ` — ${travelReport.emp.name}` : ''}
                    {travelReport.emp?.employeeId ? ` (${travelReport.emp.employeeId})` : ''}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                    {fmtDDMMYYYY(selectedDate)} → {fmtDDMMYYYY(endDate)} · filter: <b>{search}</b>
                  </div>
                </div>
                <button
                  onClick={downloadTravelReportCsv}
                  disabled={travelReport.rows.length === 0}
                  style={{
                    padding: '7px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                    border: '1px solid #BBF7D0', background: '#F0FDF4', color: '#15803D',
                    cursor: travelReport.rows.length === 0 ? 'not-allowed' : 'pointer',
                    opacity: travelReport.rows.length === 0 ? 0.5 : 1,
                  }}
                >
                  Download CSV
                </button>
              </div>

              {/* Summary tiles */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, padding: 14, borderBottom: '1px solid var(--border-color)' }}>
                {(() => {
                  const rs = travelReport.rows;
                  const totalKm     = rs.reduce((s, r) => s + (Number(r.distance) || 0), 0);
                  const totalAmount = rs.reduce((s, r) => s + (Number(r.amount)   || 0), 0);
                  const trips       = rs.length;
                  const days        = new Set(rs.map(r => r.date)).size;
                  const tile = (lbl, val, color) => (
                    <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color }}>{val}</div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.4 }}>{lbl}</div>
                    </div>
                  );
                  return (
                    <>
                      {tile('Trips',           trips,                                '#0F172A')}
                      {tile('Days Travelled',  days,                                 '#0F172A')}
                      {tile('Total Distance',  `${totalKm.toFixed(1)} km`,           '#4299E1')}
                      {tile('Total Amount',    `₹${totalAmount.toLocaleString('en-IN')}`, '#4CAA17')}
                    </>
                  );
                })()}
              </div>

              {/* Detailed rows */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
                {travelReport.loading && (
                  <div style={{ padding: 30, textAlign: 'center', color: '#64748B', fontSize: 13 }}>Loading…</div>
                )}
                {!travelReport.loading && travelReport.rows.length === 0 && (
                  <div style={{ padding: 30, textAlign: 'center', color: '#64748B', fontSize: 13 }}>
                    No travel records found for "{search}" between {fmtDDMMYYYY(selectedDate)} and {fmtDDMMYYYY(endDate)}.
                  </div>
                )}
                {!travelReport.loading && travelReport.rows.length > 0 && (
                  <table className="emp-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>From → To</th>
                        <th>Distance</th>
                        <th>Amount</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {travelReport.rows.map((r, i) => (
                        <tr key={i}>
                          <td><div style={{ fontSize: 12, fontWeight: 700 }}>{fmtDDMMYYYY(r.date)}</div></td>
                          <td>
                            <span style={{
                              fontSize: 10, fontWeight: 800,
                              padding: '3px 8px', borderRadius: 6,
                              background: r.kind === 'petrol' ? '#F1F9EE' : '#EFF6FF',
                              color:      r.kind === 'petrol' ? '#15803D' : '#1D4ED8',
                              border: '1px solid ' + (r.kind === 'petrol' ? '#BBF7D0' : '#BFDBFE'),
                              textTransform: 'uppercase', letterSpacing: 0.4,
                            }}>{r.kind === 'petrol' ? 'Petrol' : 'Travel'}</span>
                          </td>
                          <td><div style={{ fontSize: 12 }}>{r.from || '—'} → {r.to || '—'}</div></td>
                          <td><div style={{ fontSize: 12 }}>{(Number(r.distance) || 0).toFixed(1)} km</div></td>
                          <td><div style={{ fontSize: 12, fontWeight: 700, color: '#4CAA17' }}>₹{Number(r.amount || 0).toLocaleString('en-IN')}</div></td>
                          <td>
                            <span style={{
                              fontSize: 10, fontWeight: 700,
                              padding: '3px 8px', borderRadius: 6,
                              background: r.status === 'Approved' ? '#F0FDF4'
                                       : r.status === 'Rejected' ? '#FEF2F2' : '#FFFBEB',
                              color:      r.status === 'Approved' ? '#16A34A'
                                       : r.status === 'Rejected' ? '#DC2626' : '#D97706',
                            }}>{r.status || 'Pending'}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
          {/* Hide the map entirely when HR has filtered to a specific
              employee + date range (Jun 2026 brief). HR doesn't need
              the live map at that point — only the from-date / to-date
              "View Route" table below. The map still renders for the
              default Live view (no filter) where the office anchor +
              all currently-checked-in employees are useful. */}
          {!reportActive && (
            <LiveTrackingGoogleMap
              effectiveOffice={effectiveOffice}
              mapType={mapType}
              selected={selected}
              setSelected={setSelected}
              reportActive={reportActive}
              historicalRoute={historicalRoute}
              visible={visible}
            />
          )}
          {/* Travel Report sits IN the right column when filtering, so
              its top aligns with the side-panel's FROM date picker. */}
          {reportActive && (
          <div style={{
            background: '#fff',
            border: '1px solid var(--border-color)',
            borderRadius: 12,
            boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '14px 18px', borderBottom: '1px solid var(--border-color)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: '#F8FAFC',
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>
                  Travel Report
                  {travelReport.emp ? ' — ' + travelReport.emp.name : ''}
                  {travelReport.emp?.employeeId ? ' (' + travelReport.emp.employeeId + ')' : ''}
                </div>
                <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                  {fmtDDMMYYYY(selectedDate)} → {fmtDDMMYYYY(endDate)} · filter: <b>{search}</b>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {/* Buttons now key off `dailyReport.length` (one entry
                    per day in the picked range), so they enable as soon
                    as a valid From/To range + employee filter are set.
                    Previously they were gated by `travelReport.rows`
                    which only fills when there are allowance claims —
                    which is why HR saw the buttons greyed out even on
                    a perfectly valid date range.
                    CSV removed per HR request — keep PDF + Excel only. */}
                <button
                  onClick={downloadTravelReportPdf}
                  disabled={dailyReport.length === 0}
                  style={{
                    padding: '7px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                    border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#1D4ED8',
                    cursor: dailyReport.length === 0 ? 'not-allowed' : 'pointer',
                    opacity: dailyReport.length === 0 ? 0.5 : 1,
                  }}
                >
                  Download PDF
                </button>
                <button
                  onClick={downloadTravelReportExcel}
                  disabled={dailyReport.length === 0}
                  style={{
                    padding: '7px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                    border: '1px solid #BBF7D0', background: '#F0FDF4', color: '#15803D',
                    cursor: dailyReport.length === 0 ? 'not-allowed' : 'pointer',
                    opacity: dailyReport.length === 0 ? 0.5 : 1,
                  }}
                >
                  Download Excel
                </button>
              </div>
            </div>

            {/* Summary tile row removed — the per-date table below is
                the canonical view now. HR didn't need trips/amount
                aggregates here; the downloads still carry the totals. */}

            {/* Per-date report — one row per day in the picked range,
                regardless of whether the employee filed an allowance
                claim that day. HR wanted to see the trail dates first
                and drill into each via the View Route button. */}
            <div style={{ padding: 14 }}>
              {dailyReport.length === 0 ? (
                <div style={{ fontSize: 12, color: '#64748B', padding: '20px 8px', textAlign: 'center' }}>
                  No date range selected.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC', textAlign: 'left' }}>
                        <th style={{ padding: '8px 10px', borderBottom: '1px solid #E2E8F0' }}>Date</th>
                        <th style={{ padding: '8px 10px', borderBottom: '1px solid #E2E8F0' }}>Employee</th>
                        <th style={{ padding: '8px 10px', borderBottom: '1px solid #E2E8F0', textAlign: 'right' }}>Distance travelled (km)</th>
                        <th style={{ padding: '8px 10px', borderBottom: '1px solid #E2E8F0', textAlign: 'center' }}>Route</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailyReport.map((d) => (
                        <tr key={d.date}>
                          <td style={{ padding: '8px 10px', borderBottom: '1px solid #F1F5F9' }}>{fmtDDMMYYYY(d.date)}</td>
                          <td style={{ padding: '8px 10px', borderBottom: '1px solid #F1F5F9' }}>
                            {travelReport.emp?.name || search}
                            {travelReport.emp?.employeeId && (
                              <span style={{ marginLeft: 6, color: '#64748B', fontSize: 11 }}>
                                ({travelReport.emp.employeeId})
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '8px 10px', borderBottom: '1px solid #F1F5F9', textAlign: 'right', fontWeight: d.hasRoute ? 700 : 400, color: d.hasRoute ? '#0F172A' : '#94A3B8' }}>
                            {d.distanceKm.toFixed(2)}
                          </td>
                          <td style={{ padding: '8px 10px', borderBottom: '1px solid #F1F5F9', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => setRouteDrillModal({
                                open: true,
                                date: d.date,
                                employeeId: travelReport.emp?.employeeId || search.trim().toUpperCase(),
                                employeeName: travelReport.emp?.name || search.trim(),
                              })}
                              disabled={!d.hasRoute}
                              style={{
                                padding: '4px 12px', borderRadius: 6,
                                fontSize: 11, fontWeight: 700,
                                border: '1px solid ' + (d.hasRoute ? '#BFDBFE' : '#E2E8F0'),
                                background: d.hasRoute ? '#EFF6FF' : '#F8FAFC',
                                color:      d.hasRoute ? '#1D4ED8' : '#94A3B8',
                                cursor:     d.hasRoute ? 'pointer' : 'not-allowed',
                              }}
                              title={d.hasRoute ? `View GPS route for ${fmtDDMMYYYY(d.date)}` : 'No GPS path recorded for this date'}
                            >
                              View Route
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
          )}
        </div>{/* /tracking-map-container */}
      </div>{/* /tracking-layout */}

      {/* Per-date GPS route drill-down — opens when HR clicks any
          "View Route" button in the Travel Report table. */}
      <RouteMapModal
        open={routeDrillModal.open}
        onClose={() => setRouteDrillModal((m) => ({ ...m, open: false }))}
        employeeId={routeDrillModal.employeeId}
        employeeName={routeDrillModal.employeeName}
        date={routeDrillModal.date}
      />
    </div>
  );
}
