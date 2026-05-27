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

const API = 'http://localhost:8001/api';

function todayISO() {
  return new Date().toISOString().split('T')[0];
}
function fmtTime(d) {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '—';
    let h = dt.getHours(); const m = dt.getMinutes();
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')} ${ap}`;
  } catch { return '—'; }
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const r = await fetch(`${API}/attendance/daily-routes?date=${encodeURIComponent(date)}`);
        const j = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok || j.success === false) {
          setError(j?.message || `HTTP ${r.status}`);
          setItems([]);
        } else {
          setItems(Array.isArray(j.items) ? j.items : []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.message || 'Network error');
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [date]);

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

  const totalDistance = items.reduce((s, it) => s + (Number(it.totalDistanceKm) || 0), 0);
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
                  <tr><td colSpan="8" style={{ textAlign: 'center', padding: 40, color: '#DC2626', fontSize: 13 }}>Could not load: {error}</td></tr>
                )}
                {!loading && !error && filtered.length === 0 && (
                  <tr><td colSpan="8" style={{ textAlign: 'center', padding: 40, color: '#64748B', fontSize: 13 }}>No attendance records for {date}.</td></tr>
                )}
                {!loading && !error && filtered.map((it) => {
                  const distance = Number(it.totalDistanceKm || 0);
                  const sourceTag = it.distanceSource === 'gps'
                    ? { text: 'GPS', color: '#16A34A' }
                    : it.distanceSource === 'pins'
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
                          onClick={() => setRouteRow({
                            employeeId:   it.employeeId,
                            employeeName: it.name,
                            date:         it.date,
                          })}
                          disabled={!it.employeeId}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '6px 12px', borderRadius: 6,
                            background: it.employeeId ? '#EFF6FF' : '#F1F5F9',
                            color:      it.employeeId ? '#1D4ED8' : '#94A3B8',
                            border: '1px solid ' + (it.employeeId ? '#BFDBFE' : '#E2E8F0'),
                            fontSize: 11, fontWeight: 700,
                            cursor: it.employeeId ? 'pointer' : 'not-allowed',
                          }}
                        >
                          <MapPin size={12} /> View Route
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

      {/* Route-map modal — opens when HR clicks "View Route" on any row.
          Renders the polyline of every LocationPing on the selected date
          on a Google-tile Leaflet map, so HR can see exactly where the
          employee went. Empty `claim` prop because this view isn't tied
          to an allowance request — it's a per-employee daily route. */}
      <RouteMapModal
        open={!!routeRow}
        onClose={() => setRouteRow(null)}
        employeeId={routeRow?.employeeId}
        employeeName={routeRow?.employeeName}
        date={routeRow?.date}
        claim={null}
      />
    </div>
  );
}

function StatTile({ label, value, color }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12,
      padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}
