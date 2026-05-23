import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Search, X as CloseIcon, Activity, Clock, ChevronRight, Phone, MessageSquare, Users, MapPin } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

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
function MapFlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], 14, { duration: 0.8 });
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

export function CompactTrackingMap({ onOpenFullMap, sidebarOpen }) {
  const [selected, setSelected] = useState(null);
  const [tick, setTick]         = useState(0);
  const [search, setSearch]     = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const employeesRef = useRef(EMPLOYEES.map(e => ({ ...e })));

  // Simulate live drift every 8 s
  useEffect(() => {
    const id = setInterval(() => {
      employeesRef.current = employeesRef.current.map(e =>
        e.status === 'active'
          ? { ...e, lat: e.lat + (Math.random() - 0.5) * 0.0012, lng: e.lng + (Math.random() - 0.5) * 0.0012 }
          : e
      );
      setTick(t => t + 1);
    }, 8000);
    return () => clearInterval(id);
  }, []);

  const employees = employeesRef.current;
  const filteredEmployees = employees.filter(e => {
    if (!search) return true;
    const term = search.toLowerCase();
    return e.name.toLowerCase().includes(term) || e.employeeId.toLowerCase().includes(term);
  });

  const active    = filteredEmployees.filter(e => e.status === 'active').length;

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
          <div className="card-subtitle">Real-time onsite staff locations · Updates every 8s</div>
        </div>
      </div>

      <div className="compact-map-wrap">
        <MapContainer
          center={[19.076, 72.8777]}
          zoom={11}
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
          <MapFlyTo target={selected} />

          {filteredEmployees.map(emp => (
            <Marker
              key={emp.id + '-' + tick}
              position={[emp.lat, emp.lng]}
              icon={makeIcon(emp.color, selected?.id === emp.id)}
              eventHandlers={{ click: () => setSelected(emp) }}
            >
              <Popup className="compact-info-popup" closeButton={false}>
                <div className="cip-container">
                  <div className="cip-name">{emp.name}</div>
                  <div className="cip-checkin">
                    <Clock size={12} />
                    <span>Checked in: 08:45 AM</span>
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
            placeholder="Search personnel..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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

// ── Full-width standalone map (kept for future use) ───────────────
export default function LiveTrackingMap() {
  const [filter, setFilter]     = useState('all');
  const [selected, setSelected] = useState(null);
  const [tick, setTick]         = useState(0);
  const [search, setSearch]     = useState('');
  const employeesRef = useRef(EMPLOYEES.map(e => ({ ...e })));

  useEffect(() => {
    const id = setInterval(() => {
      employeesRef.current = employeesRef.current.map(e =>
        e.status === 'active'
          ? { ...e, lat: e.lat + (Math.random() - 0.5) * 0.0012, lng: e.lng + (Math.random() - 0.5) * 0.0012 }
          : e
      );
      setTick(t => t + 1);
    }, 8000);
    return () => clearInterval(id);
  }, []);

  const employees = employeesRef.current;
  const visible   = employees.filter(e => {
    const matchesFilter = filter === 'all' || e.status === filter;
    const matchesSearch = !search || 
      e.name.toLowerCase().includes(search.toLowerCase()) || 
      e.employeeId.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });
  const counts    = {
    active:  employees.filter(e => e.status === 'active').length,
    idle:    employees.filter(e => e.status === 'idle').length,
    offline: employees.filter(e => e.status === 'offline').length,
  };

  return (
    <div className="map-card">
      <div className="map-card-header">
        <div>
          <div className="map-card-title"><span className="map-live-dot" /> Live Employee Tracking</div>
          <div className="map-card-sub">Real-time onsite staff locations · updates every 8s</div>
        </div>
        <div className="map-header-actions" style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div className="map-search-bar">
            <Search size={16} />
            <input 
              placeholder="Search by Name or Employee ID..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && <CloseIcon size={16} onClick={() => setSearch('')} style={{ cursor: 'pointer' }} />}
          </div>
          <div className="map-filters">
            {['all','active','idle','offline'].map(s => (
              <button
                key={s}
                className={`map-filter-pill ${filter === s ? 'active' : ''}`}
                style={filter === s && s !== 'all' ? { background: STATUS_COLOR[s] + '22', borderColor: STATUS_COLOR[s], color: STATUS_COLOR[s] } : {}}
                onClick={() => setFilter(s)}
              >
                {s === 'all'
                  ? `All  ${employees.length}`
                  : <><span className="pill-dot" style={{ background: STATUS_COLOR[s] }} />{STATUS_LABEL[s]}  {counts[s]}</>}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="map-body">
        <div className="map-container-wrap">
          <MapContainer 
            center={[19.0760, 72.8777]} 
            zoom={12} 
            scrollWheelZoom={false}
            style={{ height: '100%', width: '100%' }}
          >
            <MapResizer sidebarOpen={sidebarOpen} />
            <TileLayer 
              url="https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
              subdomains={['mt0','mt1','mt2','mt3']}
            />
            <MapFlyTo target={selected} />
            {visible.map(emp => (
              <Marker key={emp.id + '-' + tick} position={[emp.lat, emp.lng]}
                icon={makeIcon(emp.color, selected?.id === emp.id)}
                eventHandlers={{ click: () => setSelected(emp) }}
              >
                <Popup className="map-popup" closeButton={false}>
                  <div className="mp-inner">
                    <div className="mp-avatar" style={{ background: emp.color }}>{emp.initials}</div>
                    <div>
                      <div className="mp-name">{emp.name}</div>
                      <div className="mp-role">{emp.role}</div>
                      <div className="mp-site">📍 {emp.site}</div>
                      <div className="mp-status" style={{ color: STATUS_COLOR[emp.status] }}>
                        ● {STATUS_LABEL[emp.status]} · {emp.lastSeen}
                      </div>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
          <div className="map-count-badge">
            <span style={{ color: STATUS_COLOR.active }}>●</span> {counts.active} active now
          </div>
        </div>

        <div className="map-emp-list">
          <div className="map-list-title">Onsite Staff ({visible.length})</div>
          <div className="map-list-scroll">
            {visible.map(emp => (
              <div key={emp.id} className={`map-emp-item ${selected?.id === emp.id ? 'selected' : ''}`}
                onClick={() => setSelected(emp)}>
                <div className="map-emp-avatar" style={{ background: emp.color + '22', color: emp.color }}>{emp.initials}</div>
                <div className="map-emp-info">
                  <div className="map-emp-name">{emp.name}</div>
                  <div className="map-emp-site">📍 {emp.site}</div>
                </div>
                <div className="map-emp-status-dot" style={{ background: STATUS_COLOR[emp.status] }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
