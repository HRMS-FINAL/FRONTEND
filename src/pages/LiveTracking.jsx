import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { Search, X as CloseIcon, Navigation, Filter, Users, MapPin, RefreshCw, Battery, Signal, Phone, MessageSquare, User, Clock, Timer, Route, TrendingUp, Layers, Calendar, Laptop, Smartphone } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import '../tracking.css';

// ── Employee tracking data (simulated – Mumbai coordinates) ──────
const EMPLOYEES = [
  { id: 1, name: 'Liam Foster',   employeeId: 'EMP-1001', role: 'Sales Lead',       dept: 'Sales',       status: 'active',  lat: 19.0760, lng: 72.8777, site: 'HQ – Nariman Point',      lastSeen: 'Just now',   initials: 'LF', color: '#4299E1', battery: '85%', signal: 4, checkIn: '09:00 AM', workingHours: '7h 15m', distance: 42.5, allowanceRate: 15, route: [[19.0330, 72.8654], [19.0454, 72.8927], [19.0760, 72.8777]], visitedSites: [{name: 'Client Site A', status: 'Halted', time: '10:00 AM'}, {name: 'Mid-way Stop', status: 'Travelled', time: '11:30 AM'}, {name: 'HQ – Nariman Point', status: 'Halted', time: '01:15 PM'}] },
  { id: 2, name: 'Zoe Martinez',  employeeId: 'EMP-1002', role: 'Sales Executive',  dept: 'Sales',       status: 'active',  lat: 19.0596, lng: 72.8295, site: 'Studio – Bandra',         lastSeen: '2 min ago',  initials: 'ZM', color: '#9F7AEA', battery: '92%', signal: 5, checkIn: '08:45 AM', workingHours: '8h 30m', distance: 28.2, allowanceRate: 15, route: [[19.0728, 72.8826], [19.0600, 72.8500], [19.0596, 72.8295]], visitedSites: [{name: 'Branch Office', status: 'Halted', time: '09:30 AM'}, {name: 'Client Meeting', status: 'Travelled', time: '12:00 PM'}, {name: 'Studio – Bandra', status: 'Halted', time: '03:45 PM'}] },
  { id: 3, name: 'Ryan Patel',    employeeId: 'EMP-1003', role: 'Project Manager',  dept: 'Operations',  status: 'office',  lat: 19.0760, lng: 72.8777, site: 'HQ – Nariman Point',      lastSeen: 'Just now',   initials: 'RP', color: '#4CAA17', battery: '78%', signal: 5, checkIn: '09:15 AM', workingHours: '6h 45m', visitedSites: [{name: 'HQ – Nariman Point', status: 'Halted', time: '09:15 AM'}] },
  { id: 4, name: 'Alex Thompson', employeeId: 'EMP-1004', role: 'Sales Associate',  dept: 'Sales',       status: 'idle',    lat: 19.0330, lng: 72.8654, site: 'Client Site – Worli',     lastSeen: '8 min ago',  initials: 'AT', color: '#ECC94B', battery: '45%', signal: 2, checkIn: '10:00 AM', workingHours: '5h 30m', distance: 15.8, allowanceRate: 15, route: [[19.0215, 72.8472], [19.0330, 72.8654]], visitedSites: [{name: 'Store 1', status: 'Travelled', time: '11:00 AM'}, {name: 'Client Site – Worli', status: 'Halted', time: '01:00 PM'}] },
  { id: 5, name: 'Ethan Brown',   employeeId: 'EMP-1005', role: 'DevOps Engineer',  dept: 'Engineering', status: 'office',  lat: 19.0760, lng: 72.8777, site: 'HQ – Nariman Point',      lastSeen: 'Just now',   initials: 'EB', color: '#FC8181', battery: '95%', signal: 5, checkIn: '08:30 AM', workingHours: '9h 00m' },
  { id: 6, name: 'Priya Sharma',  employeeId: 'EMP-1008', role: 'Sales Executive',  dept: 'Sales',       status: 'active',  lat: 19.0728, lng: 72.8826, site: 'Client Meet – CST',       lastSeen: '3 min ago',  initials: 'PS', color: '#38B2AC', battery: '60%', signal: 4, checkIn: '09:45 AM', workingHours: '6h 15m', distance: 34.0, allowanceRate: 15, route: [[19.1197, 72.9086], [19.0800, 72.9000], [19.0728, 72.8826]], visitedSites: [{name: 'Zone A', status: 'Halted', time: '10:15 AM'}, {name: 'Zone B', status: 'Travelled', time: '01:20 PM'}, {name: 'Client Meet – CST', status: 'Halted', time: '03:10 PM'}] },
  { id: 7, name: 'Arjun Mehta',   employeeId: 'EMP-1029', role: 'Field Technician', dept: 'Operations',  status: 'offline', lat: 19.0454, lng: 72.8927, site: 'Warehouse – Kurla',       lastSeen: '45 min ago', initials: 'AM', color: '#ED8936', battery: '12%', signal: 1, checkIn: '08:15 AM', workingHours: '10h 30m' },
  { id: 8, name: 'Sara Kapoor',   employeeId: 'EMP-1035', role: 'QA Engineer',      dept: 'Engineering', status: 'office',  lat: 19.0760, lng: 72.8777, site: 'HQ – Nariman Point',      lastSeen: 'Just now',   initials: 'SK', color: '#667eea', battery: '88%', signal: 5, checkIn: '08:50 AM', workingHours: '7h 40m' },
];

const STATUS_COLOR = { active: '#4CAA17', idle: '#ECC94B', office: '#3b82f6', offline: '#A0AEC0' };
const STATUS_LABEL = { active: 'Traveling', idle: 'Stationary', office: 'In Office', offline: 'Offline' };

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
  const [tick, setTick]         = useState(0);
  const [search, setSearch]     = useState('');
  const [mapType, setMapType]   = useState('roadmap'); // roadmap, satellite, terrain
  const employeesRef = useRef(EMPLOYEES.map(e => ({ ...e })));

  useEffect(() => {
    if (!isLive) return;
    const id = setInterval(() => {
      employeesRef.current = employeesRef.current.map(e =>
        e.dept === 'Sales' && e.status === 'active'
          ? { ...e, lat: e.lat + (Math.random() - 0.5) * 0.0015, lng: e.lng + (Math.random() - 0.5) * 0.0015 }
          : e
      );
      setTick(t => t + 1);
    }, 5000); // Faster updates for the full page
    return () => clearInterval(id);
  }, [isLive]);

  const employees = employeesRef.current;
  const visible   = employees.filter(e => {
    const matchesFilter = filter === 'all' || e.status === filter;
    const matchesSearch = !search || 
      e.name.toLowerCase().includes(search.toLowerCase()) || 
      e.employeeId.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const counts = {
    total: employees.length,
    active: employees.filter(e => e.status === 'active').length,
    office: employees.filter(e => e.status === 'office').length,
    offline: employees.filter(e => e.status === 'offline').length,
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
              <span className="summary-val">{counts.active}</span>
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
              placeholder="Search by Name or ID..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="panel-filters">
            <button className={`filter-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
              All <span className="tab-count">{counts.total}</span>
            </button>
            <button className={`filter-tab ${filter === 'active' ? 'active' : ''}`} onClick={() => setFilter('active')}>
              Traveling <span className="tab-count" style={{ background: STATUS_COLOR.active, color: 'white' }}>{counts.active}</span>
            </button>
            <button className={`filter-tab ${filter === 'office' ? 'active' : ''}`} onClick={() => setFilter('office')}>
              Office <span className="tab-count" style={{ background: STATUS_COLOR.office, color: 'white' }}>{counts.office}</span>
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
                      <span className="item-dept">{emp.dept}</span>
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
            <button className="refresh-btn" onClick={() => setTick(t => t + 1)} disabled={!isLive} style={!isLive ? { opacity: 0.5, cursor: 'not-allowed' } : {}}>
              <RefreshCw size={14} /> Force Refresh
            </button>
            <div className="update-time">{isLive ? `Updated: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Historical Data'}</div>
          </div>
        </div>

        {/* Map Container */}
        <div className="tracking-map-container">
          <MapContainer
            center={[19.076, 72.8777]} zoom={13}
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
            
            {/* Draw route for selected salesperson */}
            {selected && selected.route && (
              <Polyline 
                positions={[...selected.route, [selected.lat, selected.lng]]} 
                pathOptions={{ color: !isLive ? 'red' : '#3b82f6', weight: 6, dashArray: '10, 15', lineCap: 'round', opacity: 0.8 }} 
              />
            )}

            {/* Render selected route markers */}
            {selected && selected.route && selected.route.length > 0 && (
              <>
                {selected.route.map((pos, idx) => {
                  const siteInfo = selected.visitedSites ? selected.visitedSites[idx] : null;
                  const popupText = siteInfo 
                    ? `${siteInfo.name} - ${siteInfo.status} at ${siteInfo.time}` 
                    : `Standby / Visited Point ${idx + 1}`;
                  const isStart = idx === 0;

                  let icon;
                  if (!isLive) {
                    icon = makeIcon('red', false);
                  } else if (isStart) {
                    icon = makeStartIcon();
                  } else {
                    icon = makeIcon(selected.color, false);
                  }

                  return (
                    <Marker key={`route-pt-${idx}`} position={pos} icon={icon}>
                      <Popup>{isStart ? 'Start Point: ' : ''}{popupText}</Popup>
                    </Marker>
                  );
                })}
                
                <Marker 
                  position={[selected.lat, selected.lng]} 
                  icon={!isLive ? makeIcon('red', true) : makePersonIcon(selected.color)}
                  zIndexOffset={1000}
                >
                  <Popup>{selected.name} {!isLive ? '(End Point)' : '(Live)'}</Popup>
                </Marker>
              </>
            )}

            {visible.map(emp => {
              // Only show the general marker if this employee is NOT the selected one with a route
              // (to avoid overlapping with the person icon)
              if (selected?.id === emp.id && emp.route) return null;
              
              return (
                <Marker key={emp.id + '-' + tick} position={[emp.lat, emp.lng]}
                  icon={makeIcon(!isLive ? 'red' : emp.color, selected?.id === emp.id)}
                  eventHandlers={{ click: () => setSelected(emp) }}
                />
              );
            })}
          </MapContainer>
          
          <EmployeeDetailOverlay emp={selected} onClose={() => setSelected(null)} />
          
          <div className="map-overlay-controls">
             <div className="map-type-switcher">
                <button className={`type-btn ${mapType === 'roadmap' ? 'active' : ''}`} onClick={() => setMapType('roadmap')}>Default</button>
                <button className={`type-btn ${mapType === 'satellite' ? 'active' : ''}`} onClick={() => setMapType('satellite')}>Satellite</button>
                <button className={`type-btn ${mapType === 'terrain' ? 'active' : ''}`} onClick={() => setMapType('terrain')}>Terrain</button>
             </div>

             <div className="map-badge-large" style={!isLive ? { background: '#EDF2F7', color: '#4A5568', border: '1px solid #CBD5E0' } : {}}>
                {isLive && <span className="pulse-dot" />}
                {counts.active} {isLive ? 'ACTIVE PERSONNEL ONSITE' : 'PERSONNEL LOGGED ONSITE'}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
