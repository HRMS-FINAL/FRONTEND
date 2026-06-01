import React, { useState, useEffect, useRef } from 'react';
// Dashboard live-tracking widget — migrated from react-leaflet to the
// official Google Maps JS SDK (2026-06). Tiles now come through
// VITE_GOOGLE_MAPS_API_KEY instead of the unofficial Google tile URL.
import { GoogleMap, useJsApiLoader, MarkerF, InfoWindowF } from '@react-google-maps/api';
import { Search, X as CloseIcon, Activity, Clock, ChevronRight, Phone, MessageSquare, Users, MapPin } from 'lucide-react';
import { API } from './config/api';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

const STATUS_COLOR = { active: '#4CAA17', idle: '#ECC94B', offline: '#A0AEC0' };
const STATUS_LABEL = { active: 'Active', idle: 'Idle', offline: 'Offline' };

// Build a Google Maps SymbolPath.CIRCLE icon descriptor.
function makeIcon(color, isSelected) {
  if (typeof window === 'undefined' || !window.google?.maps) return undefined;
  return {
    path: window.google.maps.SymbolPath.CIRCLE,
    fillColor:   color || '#9F7AEA',
    fillOpacity: 1,
    strokeColor: '#fff',
    strokeWeight: 3,
    scale: isSelected ? 12 : 9,
  };
}

// Haversine distance in metres. Mirror of LiveTracking.jsx so the
// dashboard widget and the full Live Tracking page agree.
function distMeters(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some(v => typeof v !== 'number' || !isFinite(v))) return Infinity;
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Collapse the backend's raw status into HR's three buckets. When a
    GPS distance to the office is provided, anyone inside the radius is
    forced into the 'office' bucket — keeps the dashboard widget in sync
    with the full Live Tracking page (which uses the same rule). */
function bucketOf(status, distToOfficeM, radiusM) {
  if (typeof distToOfficeM === 'number' && distToOfficeM <= (radiusM || 200)) return 'office';
  if (status === 'office')                            return 'office';
  if (status === 'travelling' || status === 'active') return 'active';
  return 'offline';
}

export function CompactTrackingMap({ onOpenFullMap, sidebarOpen }) {
  const [selected, setSelected] = useState(null);
  const [search, setSearch]     = useState('');
  const [activePopup, setActivePopup] = useState(null);
  // Live data fetched from /api/live-tracking — same endpoint the full
  // Live Tracking page uses, so counts/markers match exactly.
  const [employees, setEmployees] = useState([]);
  const [office,    setOffice]    = useState({ lat: 13.0412, lng: 80.2127, name: 'Tesco Structures HQ' });
  // The canonical office is wherever RANGANAYAGI is currently pinging from
  // (she sits in the office). Mirror of LiveTracking.jsx.
  const OFFICE_ANCHOR = { name: /^ranganayagi/i };
  const RADIUS_M      = 200;

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    id: 'tesco-hrms-google-maps',
  });

  const mapRef = useRef(null);

  const loadLive = React.useCallback(async () => {
    try {
      const r = await fetch(`${API}/live-tracking`);
      const d = await r.json().catch(() => ({}));
      if (!d?.success || !Array.isArray(d.data)) return;
      if (d.office) setOffice(d.office);
      const rawRows = d.data
        .filter(e => e.lat != null && e.lng != null)
        .map(e => ({
          id:         e._id,
          name:       e.name,
          employeeId: e.employeeId || '',
          role:       e.role || '',
          dept:       e.dept || '',
          lat:        e.lat,
          lng:        e.lng,
          status:     e.status || 'offline',
          site:       e.site || '—',
          lastSeen:   e.lastSeen
                        ? new Date(e.lastSeen).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                        : '—',
          initials:   (e.name || '?').split(' ').map(s => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '??',
        }));

      // Resolve the office anchor and compute bucket + colour for each row.
      const anchor = rawRows.find(r =>
        (OFFICE_ANCHOR.employeeId && String(r.employeeId || '').toUpperCase() === OFFICE_ANCHOR.employeeId) ||
        OFFICE_ANCHOR.name.test(String(r.name || ''))
      );
      const officePt = (anchor && typeof anchor.lat === 'number' && typeof anchor.lng === 'number')
        ? { lat: anchor.lat, lng: anchor.lng, radiusM: RADIUS_M, name: 'Office (' + (anchor.name || 'anchor') + ')' }
        : { ...office, radiusM: RADIUS_M };
      setOffice(officePt);

      const rows = rawRows.map(r => {
        const distMTo = distMeters(r.lat, r.lng, officePt.lat, officePt.lng);
        const bucket  = bucketOf(r.status, distMTo, officePt.radiusM);
        return {
          ...r,
          bucket,
          color: bucket === 'office' ? '#3b82f6'
               : bucket === 'active' ? '#4CAA17'
               :                       '#A0AEC0',
        };
      });
      setEmployees(rows);
    } catch { /* network — keep current */ }
  }, []);

  useEffect(() => {
    loadLive();
    const id = setInterval(loadLive, 2 * 60 * 1000);
    return () => clearInterval(id);
  }, [loadLive]);

  // Resize the Google map when the sidebar toggles. The SDK handles
  // resize automatically once the container dimensions update, but
  // panning to the office centre ensures the view doesn't drift.
  useEffect(() => {
    if (!mapRef.current) return;
    const t = setTimeout(() => {
      mapRef.current?.panTo({ lat: office.lat, lng: office.lng });
    }, 350);
    return () => clearTimeout(t);
  }, [sidebarOpen, office.lat, office.lng]);

  const filteredEmployees = employees.filter(e => {
    if (!search) return true;
    const term = search.toLowerCase();
    return e.name.toLowerCase().includes(term) || (e.employeeId || '').toLowerCase().includes(term);
  });

  const active   = employees.filter(e => e.bucket === 'active').length;
  const office_  = employees.filter(e => e.bucket === 'office').length;
  const offline_ = employees.filter(e => e.bucket === 'offline').length;

  // Auto-fly to the searched employee.
  const flyTarget = (() => {
    if (selected) return selected;
    if (!search.trim()) return null;
    const term = search.trim().toLowerCase();
    const exact = employees.find(
      e => (e.employeeId || '').toLowerCase() === term
        || (e.name        || '').toLowerCase() === term
    );
    return exact || filteredEmployees[0] || null;
  })();

  useEffect(() => {
    if (!mapRef.current || !flyTarget) return;
    if (!isFinite(flyTarget.lat) || !isFinite(flyTarget.lng)) return;
    mapRef.current.panTo({ lat: flyTarget.lat, lng: flyTarget.lng });
    mapRef.current.setZoom(15);
  }, [flyTarget?.id, flyTarget?.lat, flyTarget?.lng]);

  return (
    <div className="card compact-map-card">
      <div className="compact-map-header">
        <div className="header-content">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="card-title">
              <span className="map-live-dot" /> Live Employee Tracking
            </div>
            <button className="ne-btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={onOpenFullMap}>
              <Activity size={14} /> Full Dashboard
            </button>
          </div>
          <div className="card-subtitle">
            Real-time onsite staff locations · Updates every 2 min
            {' · '}
            <span style={{ color: STATUS_COLOR.active, fontWeight: 700 }}>{active} active</span>
            {' · '}
            <span style={{ color: '#3b82f6', fontWeight: 700 }}>{office_} in office</span>
            {' · '}
            <span style={{ color: STATUS_COLOR.offline, fontWeight: 700 }}>{offline_} offline</span>
          </div>
        </div>
      </div>

      <div className="compact-map-wrap">
        {!GOOGLE_MAPS_API_KEY && (
          <div style={{ width: '100%', height: '320px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6, padding: 24, textAlign: 'center', color: '#92400E', background: '#FFFBEB', fontSize: 13 }}>
            <strong>VITE_GOOGLE_MAPS_API_KEY is not configured</strong>
            <span style={{ fontSize: 12 }}>Set it in .env / your deployment env vars to enable Google Maps.</span>
          </div>
        )}
        {GOOGLE_MAPS_API_KEY && loadError && (
          <div style={{ width: '100%', height: '320px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#B91C1C', background: '#FEF2F2', fontSize: 13 }}>
            Failed to load Google Maps — check your API key + referrer restriction.
          </div>
        )}
        {GOOGLE_MAPS_API_KEY && !loadError && !isLoaded && (
          <div style={{ width: '100%', height: '320px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', background: '#F8FAFC', fontSize: 13 }}>
            Loading Google Maps…
          </div>
        )}
        {GOOGLE_MAPS_API_KEY && isLoaded && !loadError && (
          <GoogleMap
            mapContainerStyle={{ width: '100%', height: '320px' }}
            center={{ lat: office.lat, lng: office.lng }}
            zoom={12}
            onLoad={(m) => { mapRef.current = m; }}
            options={{
              zoomControl: false,
              scrollwheel: false,
              streetViewControl: false,
              fullscreenControl: false,
              mapTypeControl: false,
              styles: [
                { featureType: 'poi',     elementType: 'labels', stylers: [{ visibility: 'off' }] },
                { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
              ],
            }}
          >
            {filteredEmployees.map(emp => (
              <MarkerF
                key={emp.id}
                position={{ lat: emp.lat, lng: emp.lng }}
                icon={makeIcon(emp.color, (selected?.id || flyTarget?.id) === emp.id)}
                title={emp.name}
                onClick={() => {
                  setSelected(emp);
                  setActivePopup(emp);
                }}
              />
            ))}
            {activePopup && (
              <InfoWindowF
                position={{ lat: activePopup.lat, lng: activePopup.lng }}
                onCloseClick={() => setActivePopup(null)}
              >
                <div style={{ padding: '6px 8px', minWidth: 150 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{activePopup.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#64748b', marginTop: 4 }}>
                    <MapPin size={11} /> {activePopup.site}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    <Clock size={11} /> Last ping: {activePopup.lastSeen}
                  </div>
                </div>
              </InfoWindowF>
            )}
          </GoogleMap>
        )}

        <div className="map-count-badge">
          <span style={{ color: STATUS_COLOR.active }}>●</span> {active} active now
        </div>

        <div className="map-search-overlay">
          <Search size={14} />
          <input
            list="dash-track-employees"
            placeholder="Search personnel..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
          />
          {/* Native autocomplete — lists EVERY checked-in employee */}
          <datalist id="dash-track-employees">
            {employees.map(e => (
              <option key={e.id} value={e.employeeId || e.name}>
                {e.name}{e.employeeId ? ' — ' + e.employeeId : ''}
              </option>
            ))}
          </datalist>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .compact-map-card {
          padding: 0 !important;
          overflow: hidden;
          position: relative;
        }
        .compact-map-header {
          padding: 16px 20px;
          border-bottom: 1px solid var(--border-color);
          background: white;
        }
        .compact-map-wrap {
          position: relative;
          height: 320px;
        }
        .map-search-overlay {
          position: absolute;
          top: 15px;
          left: 15px;
          z-index: 1000;
          background: white;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          display: flex;
          align-items: center;
          padding: 8px 12px;
          gap: 10px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          width: 200px;
        }
        .map-search-overlay input {
          border: none;
          outline: none;
          font-size: 12px;
          width: 100%;
        }
        .map-live-dot {
          width: 8px;
          height: 8px;
          background: var(--red);
          border-radius: 50%;
          display: inline-block;
          margin-right: 8px;
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.2); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}} />
    </div>
  );
}

// Placeholder default export — the legacy full-page tracking view has
// moved to pages/LiveTracking.jsx.
export default function LiveTrackingMap() {
  return (
    <div style={{ padding: 24, color: 'var(--text-light)', fontSize: 13 }}>
      Live tracking moved to the dedicated page. Open <strong>Live Tracking</strong> from the sidebar.
    </div>
  );
}
