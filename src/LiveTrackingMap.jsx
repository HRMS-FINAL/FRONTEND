import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Search, X as CloseIcon, Activity, Clock, ChevronRight, Phone, MessageSquare, Users, MapPin } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { API } from './config/api';

// ── Employee tracking data (simulated – Mumbai coordinates) ──────
const EMPLOYEES = [
  { id: 1, name: 'Liam Foster',   employeeId: 'EMP-1001', role: 'Site Engineer',    dept: 'Engineering', status: 'active',  lat: 19.0760, lng: 72.8777, site: 'HQ – Nariman Point',      lastSeen: 'Just now',   initials: 'LF', color: '#4299E1' },
  { id: 2, name: 'Zoe Martinez',  employeeId: 'EMP-1002', role: 'UX Designer',      dept: 'Design',      status: 'active',  lat: 19.0596, lng: 72.8295, site: 'Studio – Bandra',         lastSeen: '2 min ago',  initials: 'ZM', color: '#9F7AEA' },
  { id: 3, name: 'Ryan Patel',    employeeId: 'EMP-1003', role: 'Project Manager',  dept: 'Operations',  status: 'active',  lat: 19.1136, lng: 72.8697, site: 'Goregaon Tech Park',      lastSeen: '1 min ago',  initials: 'RP', color: '#4CAA17' },
  { id: 4, name: 'Alex Thompson', employeeId: 'EMP-1004', role: 'Data Analyst',     dept: 'Engineering', status: 'idle',    lat: 19.0330, lng: 72.8654, site: 'Client Site – Worli',     lastSeen: '8 min ago',  initials: 'AT', color: '#ECC94B' },
  { id: 5, name: 'Ethan Brown',   employeeId: 'EMP-1005', role: 'DevOps Engineer',  dept: 'Engineering', status: 'active',  lat: 19.0215, lng: 72.8472, site: 'Data Centre – Prabhadevi',lastSeen: 'Just now',   initials: 'EB', color: '#FC8181' },
  { id: 6, name: 'Priya Sharma',  employeeId: 'EMP-1008', role: 'Sales Executive',  dept: 'Sales',       status: 'active',  lat: 19.0728, lng: 72.8826, site: 'Client Meet – CST',       lastSeen: '3 min ago',  initials: 'PS', color: '#38B2AC' },
  { id: 7, name: 'Arjun Mehta',   employeeId: 'EMP-1029', role: 'Field Technician', dept: 'Operations',  status: 'offline', lat: 19.0454, lng: 72.8927, site: 'Warehouse – Kurla',       lastSeen: '45 min ago', initials: 'AM', color: '#ED8936' },
  { id: 8, name: 'Sara Kapoor',   employeeId: 'EMP-1035', role: 'QA Engineer',      dept: 'Engineering', status: 'active',  lat: 19.1197, lng: 72.9086, site: 'Lab – Powai',             lastSeen: 'Just now',   initials: 'SK', color: '#667eea' },
];

const RECENT_ACTIVITIES = [
  { id: 1, name: 'Liam Foster',   action: 'reached',  site: 'HQ – Nariman Point',      time: 'Just now',   initials: 'LF', color: '#4299E1' },
  { id: 2, name: 'Zoe Martinez',  action: 'moved to', site: 'Studio – Bandra',         time: '2 min ago',  initials: 'ZM', color: '#9F7AEA' },
  { id: 3, name: 'Ryan Patel',    action: 'reached',  site: 'Goregaon Tech Park',      time: '5 min ago',  initials: 'RP', color: '#4CAA17' },
  { id: 4, name: 'Alex Thompson', action: 'left',     site: 'Client Site – Worli',     time: '12 min ago', initials: 'AT', color: '#ECC94B' },
  { id: 5, name: 'Priya Sharma',  action: 'reached',  site: 'Client Meet – CST',       time: '15 min ago', initials: 'PS', color: '#38B2AC' },
];

const STATUS_COLOR = { active: '#4CAA17', idle: '#ECC94B', offline: '#A0AEC0' };
const STATUS_LABEL = { active: 'Active', idle: 'Idle', offline: 'Offline' };

// ── Custom SVG marker ────────────────────────────────────────────
function makeIcon(color, isSelected) {
  const size = isSelected ? 40 : 32;
  const iconColor = 'var(--primary)'; // Use primary color for markers
  const ring = isSelected
    ? `<circle cx="22" cy="22" r="20" fill="none" stroke="${iconColor}" stroke-width="3" opacity="0.35"/>`
    : '';
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 44 44">
      ${ring}
      <circle cx="22" cy="22" r="14" fill="${iconColor}" opacity="0.18"/>
      <circle cx="22" cy="22" r="9"  fill="${iconColor}"/>
      <circle cx="22" cy="22" r="4"  fill="white"/>
    </svg>`;
  return L.divIcon({
    className: '',
    html: svg,
    iconSize:   [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor:[0, -(size / 2) - 4],
  });
}

// ── Auto-pan to selected employee ────────────────────────────────
// Watches the target's identity (id) and coords; re-flies only when the
// chosen employee changes OR they move > a few metres. Without this the
// 2-minute poll would re-create the target object every refresh and the
// map would replay the fly animation needlessly.
function MapFlyTo({ target }) {
  const map = useMap();
  const lastKey = useRef('');
  useEffect(() => {
    if (!target) { lastKey.current = ''; return; }
    const key = `${target.id}|${target.lat?.toFixed(4)}|${target.lng?.toFixed(4)}`;
    if (key === lastKey.current) return;
    lastKey.current = key;
    map.flyTo([target.lat, target.lng], 15, { duration: 0.8 });
  }, [target, map]);
  return null;
}

// ── Compact card (fits in middle-row beside Employee Overview) ────
// Helper to resize map when sidebar toggles
function MapResizer({ sidebarOpen }) {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 350);
    return () => clearTimeout(timer);
  }, [sidebarOpen, map]);
  return null;
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
  // Live data fetched from /api/live-tracking — same endpoint the full
  // Live Tracking page uses, so counts/markers match exactly.
  const [employees, setEmployees] = useState([]);
  const [office,    setOffice]    = useState({ lat: 13.0412, lng: 80.2127, name: 'Tesco Structures HQ' });
  // The canonical office is wherever RANGANAYAGI is currently pinging from
  // (she sits in the office). Mirror of LiveTracking.jsx.
  const OFFICE_ANCHOR = { name: /^ranganayagi/i };
  const RADIUS_M      = 200;

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
      // Persist the anchored office so the map centre + marker move.
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

  // Initial load + 2-minute auto-refresh (matches the mobile ping cadence).
  useEffect(() => {
    loadLive();
    const id = setInterval(loadLive, 2 * 60 * 1000);
    return () => clearInterval(id);
  }, [loadLive]);

  // Filter on the search term — matches name OR employeeId.
  const filteredEmployees = employees.filter(e => {
    if (!search) return true;
    const term = search.toLowerCase();
    return e.name.toLowerCase().includes(term) || (e.employeeId || '').toLowerCase().includes(term);
  });

  // Counts use the three HR buckets so the badge numbers agree with the
  // full Live Tracking page's header tiles.
  const active   = employees.filter(e => e.bucket === 'active').length;
  const office_  = employees.filter(e => e.bucket === 'office').length;
  const offline_ = employees.filter(e => e.bucket === 'offline').length;

  // When the user types into the search box, automatically fly the map to
  // the best match. The fly-to target is:
  //   1. whatever the user explicitly clicked (`selected`), else
  //   2. an exact employeeId / name hit, else
  //   3. the first filtered row (if any).
  // Without this, search only narrowed the marker list but the map kept
  // pointing at the office centre — HR had to manually pan to find the
  // person they just searched for.
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
        <MapContainer
          center={[office.lat, office.lng]}
          zoom={12}
          style={{ width: '100%', height: '320px' }}
          zoomControl={false}
          attributionControl={false}
          scrollWheelZoom={false}
        >
          <MapResizer sidebarOpen={sidebarOpen} />
          <TileLayer
            url="https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
            subdomains={['mt0','mt1','mt2','mt3']}
          />
          <MapFlyTo target={flyTarget} />

          {filteredEmployees.map(emp => (
            <Marker
              key={emp.id}
              position={[emp.lat, emp.lng]}
              icon={makeIcon(emp.color, (selected?.id || flyTarget?.id) === emp.id)}
              eventHandlers={{ click: () => setSelected(emp) }}
            >
              <Popup className="compact-info-popup" closeButton={false}>
                <div className="cip-container">
                  <div className="cip-name">{emp.name}</div>
                  <div className="cip-checkin">
                    <MapPin size={12} />
                    <span>{emp.site}</span>
                  </div>
                  <div className="cip-checkin">
                    <Clock size={12} />
                    <span>Last ping: {emp.lastSeen}</span>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

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
          {/* Native autocomplete — lists EVERY checked-in employee
              (the backend filters out anyone who's checked out), so HR
              can pick from a menu instead of typing. */}
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

        /* --- COMPACT INFO POPUP STYLES --- */
        .compact-info-popup .leaflet-popup-content-wrapper {
          padding: 0;
          border-radius: 12px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.12);
          width: 180px;
          border: 1px solid #e2e8f0;
        }
        .compact-info-popup .leaflet-popup-content {
          margin: 0;
          width: 100% !important;
        }
        .cip-container {
          padding: 12px 14px;
          background: white;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .cip-name {
          font-size: 14px;
          font-weight: 700;
          color: #0f172a;
        }
        .cip-checkin {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 500;
          color: #64748b;
        }
        .cip-checkin svg {
          color: var(--primary);
        }
      `}} />
    </div>
  );
}

// The legacy default export (a self-contained full-page tracking view)
// is no longer used — pages/LiveTracking.jsx is the real live tracking
// page now. The placeholder below keeps the existing import contract so
// any leftover `import LiveTrackingMap from './LiveTrackingMap'` still
// resolves to a renderable component.
export default function LiveTrackingMap() {
  return (
    <div style={{ padding: 24, color: 'var(--text-light)', fontSize: 13 }}>
      Live tracking moved to the dedicated page. Open <strong>Live Tracking</strong> from the sidebar.
    </div>
  );
}
