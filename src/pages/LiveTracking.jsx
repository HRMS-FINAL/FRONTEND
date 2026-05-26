import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { Search, X as CloseIcon, Navigation, Filter, Users, MapPin, RefreshCw, Battery, Signal, Phone, MessageSquare, User, Clock, Timer, Route, TrendingUp, Layers, Calendar, Laptop, Smartphone } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import '../tracking.css';

// Live tracking now starts empty — populated from the mobile backend's
// /api/attendance/admin/all (per-employee lat/lng captured at check-in)
// plus the location-ping collection. Hardcoded Mumbai demo data removed.
const EMPLOYEES = [];

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

/** Collapse the backend's four raw statuses into the three HR buckets. */
function bucketOf(status) {
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
 * Map marker with the employee's name baked in. We draw a coloured pin
 * (status colour) PLUS a name pill that sits to the right of the pin so
 * HR can scan the map and see who is where without clicking each marker.
 * Selected employee gets a slightly larger pin + bolder label.
 *
 * When the employee's last ping carries a vehicle-speed sample (≥ ~3 m/s)
 * the dot turns into a bicycle glyph so HR can spot "Aman is on a bike"
 * at a glance instead of inspecting the popup.
 */
function makeNameMarker(emp, isSelected) {
  const color   = STATUS_COLOR[emp.status] || '#9F7AEA';
  const ring    = isSelected
    ? `box-shadow: 0 0 0 4px ${color}33, 0 4px 14px rgba(0,0,0,0.25);`
    : 'box-shadow: 0 3px 10px rgba(0,0,0,0.18);';
  const size    = isSelected ? 36 : 30;
  // `speed` is in m/s, sent by the mobile ping. When present and fast
  // enough, render the bike glyph instead of the initials.
  const moving  = typeof emp.speed === 'number' && emp.speed >= VEHICLE_SPEED_MPS;

  const inner   = moving
    ? BIKE_SVG('#fff', Math.round(size * 0.62))
    : `<span style="color:#fff; font-weight:800; font-size:${isSelected ? 12 : 11}px;">${(emp.initials || '?').slice(0, 2)}</span>`;

  const dot = `
    <div style="
      width:${size}px; height:${size}px; border-radius:50%;
      background:${color}; border:3px solid #fff; ${ring}
      display:flex; align-items:center; justify-content:center;
      flex-shrink:0;
    ">${inner}</div>`;

  // Append a tiny speed pill when moving so the speed is visible at a
  // glance: "Aman   24 km/h".
  const speedKmh = moving ? Math.round(emp.speed * 3.6) : null;
  const speedPill = moving
    ? `<span style="
         margin-left:4px; padding:2px 6px; border-radius:8px;
         background:${color}; color:#fff; font-size:10px; font-weight:700;
         line-height:1.1; white-space:nowrap;
       ">${speedKmh} km/h</span>`
    : '';

  const label = `
    <div style="
      background:#fff; padding:4px 10px; border-radius:14px;
      border:1px solid ${color}66;
      font-size:11px; font-weight:700; color:#1a1a1a;
      margin-left:6px; white-space:nowrap;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      max-width:180px; overflow:hidden; text-overflow:ellipsis;
      display:inline-flex; align-items:center;
    ">${(emp.name || '').replace(/</g, '&lt;')}${speedPill}</div>`;

  return L.divIcon({
    className: '',
    html: `<div style="display:flex; align-items:center;">${dot}${label}</div>`,
    iconSize:   [220, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor:[0, -(size / 2) - 4],
  });
}

function makeStartIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#4CAA17" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
    </svg>`;
  return L.divIcon({
    className: '',
    html: `<div style="background: white; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 10px rgba(0,0,0,0.2); border: 2px solid #4CAA17;">${svg}</div>`,
    iconSize:   [32, 32],
    iconAnchor: [16, 32],
  });
}

function makePersonIcon(color) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="2">
      <circle cx="12" cy="8" r="5" />
      <path d="M20 21a8 8 0 0 0-16 0" />
    </svg>`;
  return L.divIcon({
    className: '',
    html: `<div style="background: ${color}; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 15px rgba(0,0,0,0.3); border: 3px solid white;">${svg}</div>`,
    iconSize:   [40, 40],
    iconAnchor: [20, 20],
  });
}

function makeIcon(color, isSelected) {
  const size = isSelected ? 44 : 36;
  const iconColor = color || 'var(--primary)';
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

function MapFlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], 15, { duration: 1.2 });
  }, [target, map]);
  return null;
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
  const [office, setOffice] = useState({ lat: 13.0405, lng: 80.2105, radiusM: 200, name: 'Tesco Structures HQ' });
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
      const r = await fetch('http://localhost:8001/api/live-tracking');
      const d = await r.json().catch(() => ({}));
      if (cancelledRef.current) return;
      if (!d?.success || !Array.isArray(d.data)) return;
      if (d.office) setOffice(d.office);
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
          site:       e.site || (e.status === 'office' ? 'Tesco Structures HQ' : '—'),
          status:     e.status || 'offline',
          lastSeen:   e.lastSeen
                        ? new Date(e.lastSeen).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                        : '—',
          initials:   (e.name || '?').split(' ').map(s => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '??',
          // Colour from the collapsed bucket so the dot in the
          // sidebar/map matches the header tile and filter tab the
          // employee falls under.
          color:      STATUS_COLOR[bucketOf(e.status)] || STATUS_COLOR.offline,
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
    // Match the mobile ping cadence: the app sends one GPS sample every
    // 2 minutes, so refreshing more often than that buys nothing but
    // backend load. HR can always hit "Force Refresh" for an instant pull.
    const id = setInterval(loadLive, 2 * 60 * 1000);
    return () => { cancelledRef.current = true; clearInterval(id); };
  }, [isLive, loadLive]);

  const employees = liveEmployees;
  const visible   = employees.filter(e => {
    // All filtering happens at the bucket level so the three header tiles
    // and three filter tabs always agree on what each label means.
    const matchesFilter = filter === 'all' || bucketOf(e.status) === filter;
    const matchesSearch = !search ||
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.employeeId.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  // Buckets the header + filter tabs are built from.
  const counts = {
    total:   employees.length,
    active:  employees.filter(e => bucketOf(e.status) === 'active').length,
    office:  employees.filter(e => bucketOf(e.status) === 'office').length,
    offline: employees.filter(e => bucketOf(e.status) === 'offline').length,
  };

  return (
    <div className="live-tracking-page">
      <div className="page-header" style={{ marginBottom: '20px' }}>
        <div className="header-left">
          <div className="header-title-row">
            <h1 className="page-title">{isLive ? 'Live Employee Tracking' : 'Historical Tracking'}</h1>
            <div className="live-status-indicator" style={!isLive ? { background: '#EDF2F7', color: '#4A5568', borderColor: '#E2E8F0' } : {}}>
              {isLive && <span className="live-dot" />}
              {isLive ? 'Live Feed' : new Date(selectedDate).toLocaleDateString()}
            </div>
          </div>
          <p className="page-subtitle">
            {isLive ? 'Monitoring real-time onsite staff movements and deployment status' : `Reviewing staff movements and routes from ${new Date(selectedDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}`}
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
          
          <div className="panel-search" style={{ marginTop: '12px' }}>
            <Search size={18} className="search-icon" />
            <input
              list="livetrack-employees"
              placeholder="Search by Name or Emp ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoComplete="off"
            />
            {/* Browser-native autocomplete dropdown — lists every employee
                currently being tracked so HR can pick from a menu instead
                of typing. */}
            <datalist id="livetrack-employees">
              {employees.map(e => (
                <option key={e.id} value={e.employeeId || e.name}>{e.name}{e.employeeId ? ' — ' + e.employeeId : ''}</option>
              ))}
            </datalist>
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

        {/* Map Container */}
        <div className="tracking-map-container">
          <MapContainer
            // Default-centre on the Tesco Structures office (Ashok Nagar
            // Chennai) so the map opens looking at HQ instead of Mumbai.
            center={[office.lat, office.lng]} zoom={13}
            style={{ width: '100%', height: '100%' }}
            zoomControl={true} attributionControl={false}
          >
            {/* Google Maps Tile Layers */}
            {mapType === 'roadmap' && (
              <TileLayer
                url="https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
                subdomains={['mt0','mt1','mt2','mt3']}
              />
            )}
            {mapType === 'satellite' && (
              <TileLayer
                url="https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}"
                subdomains={['mt0','mt1','mt2','mt3']}
 />
            )}
            {mapType === 'terrain' && (
              <TileLayer
                url="https://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}"
                subdomains={['mt0','mt1','mt2','mt3']}
              />
            )}

            <MapFlyTo target={selected} />

            {/* Office pin — always shown so HR has a reference point. */}
            <Marker position={[office.lat, office.lng]} icon={makeStartIcon()}>
              <Popup>{office.name || 'Office'}</Popup>
            </Marker>

            {/* One marker per visible employee, labelled with their name.
                Markers persist as long as the employee is checked-in (the
                backend filters out anyone who already checked out), so HR
                can watch them move in real time without picking each row. */}
            {visible.map((emp) => (
              <Marker
                key={emp.id}
                position={[emp.lat, emp.lng]}
                icon={makeNameMarker(emp, selected?.id === emp.id)}
                eventHandlers={{ click: () => setSelected(emp) }}
              >
                <Popup>
                  <div style={{ minWidth: 160 }}>
                    <div style={{ fontWeight: 800, fontSize: 13, color: '#1a1a1a' }}>{emp.name}</div>
                    <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                      {emp.role || '—'}{emp.employeeId ? ` · ${emp.employeeId}` : ''}
                    </div>
                    <div style={{
                      display: 'inline-block', marginTop: 6,
                      padding: '2px 8px', borderRadius: 10,
                      background: STATUS_COLOR[emp.status] + '22',
                      color: STATUS_COLOR[emp.status],
                      fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: 0.4,
                    }}>{STATUS_LABEL[emp.status] || emp.status}</div>
                    <div style={{ fontSize: 11, color: '#777', marginTop: 6 }}>
                      <MapPin size={10} style={{ verticalAlign: 'middle' }} /> {emp.site}
                    </div>
                    <div style={{ fontSize: 11, color: '#777', marginTop: 2 }}>
                      <Clock size={10} style={{ verticalAlign: 'middle' }} /> Last ping: {emp.lastSeen}
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>
    </div>
  );
}
