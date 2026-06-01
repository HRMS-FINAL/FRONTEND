import React, { useState, useEffect, useMemo } from 'react';
import {
  Users, UserCheck, CalendarOff,
  ChevronRight, ClipboardList,
  Check, Clock, MapPin, UserPlus
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { CompactTrackingMap } from '../LiveTrackingMap';

import { API } from '../config/api';

export default function Dashboard({
  calGrid, days, calStats,
  reminders, doneReminders, toggleReminder,
  setActiveView, sidebarOpen,
  employees = [],
}) {
  const [attendanceMonth, setAttendanceMonth] = useState('current');
  const [stats, setStats]   = useState(null);
  const [attToday, setAttToday] = useState(null);
  // Selected calendar day — null means "today / live". When the user
  // clicks any other day in the mini-calendar, this becomes a yyyy-mm-dd
  // string and we refetch the day's attendance counts.
  const [selectedDay, setSelectedDay] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fetch real dashboard stats + today's attendance. Re-fetch every 60s and
  // whenever the tab regains focus so headcount/attendance reflect changes
  // made elsewhere (a new employee added, someone just checked in, etc.).
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch(`${API}/dashboard/stats`)
        .then(r => r.json())
        .then(d => { if (!cancelled && d.success) setStats(d.stats); })
        .catch(err => console.error('[Dashboard] stats error:', err))
        .finally(() => { if (!cancelled) setLoading(false); });
      // Fetch attendance for the selected day, or today when nothing is selected.
      const qs = selectedDay ? `?date=${encodeURIComponent(selectedDay)}` : '';
      fetch(`${API}/dashboard/attendance-today${qs}`)
        .then(r => r.json())
        .then(d => { if (!cancelled && d.success) setAttToday(d.data); })
        .catch(() => {});
    };
    load();
    const tick = setInterval(load, 60_000);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => { cancelled = true; clearInterval(tick); window.removeEventListener('focus', onFocus); };
    // employees.length in the dep list re-runs this effect after the parent
    // refetches employees (e.g. right after a delete in Employee List), so
    // the dashboard counts update immediately instead of waiting for the
    // 60-second tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees.length, selectedDay]);

  // Live calendar
  const today       = new Date();
  const todayDay    = today.getDate();
  const todayMonth  = today.getMonth();
  const todayYear   = today.getFullYear();

  const liveCalGrid = useMemo(() => {
    const firstDay    = new Date(todayYear, todayMonth, 1).getDay();
    const daysInMonth = new Date(todayYear, todayMonth + 1, 0).getDate();
    const grid = [];
    for (let i = 0; i < firstDay; i++) grid.push(null);
    for (let d = 1; d <= daysInMonth; d++) grid.push(d);
    return grid;
  }, [todayMonth, todayYear]);

  const currentMonthLabel = today.toLocaleString('default', { month: 'long', year: 'numeric' });
  const lastMonthLabel    = new Date(todayYear, todayMonth - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });

  // Stat card values — real from API, fallback to 0 while loading
  const totalEmp    = stats?.counts?.totalEmployees  ?? 0;
  const activeStaff = stats?.counts?.activeEmployees ?? 0;
  const onLeave     = stats?.counts?.onLeaveToday    ?? 0;
  // Renamed: card now shows pending PERMISSION requests, not all
  // pending approvals (HR asked for the dashboard tile to spotlight
  // permission requests specifically).
  const permission  = stats?.counts?.pendingPermissions ?? 0;

  // Department data from API (for pie chart)
  const deptData = stats?.byDepartment ?? [];
  const totalForChart = deptData.reduce((s, d) => s + d.value, 0) || 1;

  const statCards = [
    { label: 'Total Employees', value: loading ? '...' : totalEmp.toLocaleString(),  trend: stats?.cards?.totalEmployees?.trend || '—', up: stats?.cards?.totalEmployees?.up ?? true,  sub: 'all registered',       Icon: Users,      target: 'employee-list',    color: 'var(--primary)', bg: 'var(--primary-light)' },
    { label: 'Active Staff',    value: loading ? '...' : activeStaff.toLocaleString(),trend: stats?.cards?.activeStaff?.trend    || '—', up: stats?.cards?.activeStaff?.up    ?? true,  sub: 'currently working',    Icon: UserCheck,  target: 'live-tracking',    color: 'var(--primary)', bg: 'var(--primary-light)' },
    { label: 'On Leave',        value: loading ? '...' : onLeave.toLocaleString(),    trend: stats?.cards?.onLeave?.trend         || '—', up: false,                                     sub: 'today',                Icon: CalendarOff,target: 'leave-permission', color: 'var(--primary)', bg: 'var(--primary-light)' },
    { label: 'Permission',      value: loading ? '...' : permission.toLocaleString(), trend: stats?.cards?.permission?.trend      || '—', up: stats?.cards?.permission?.up      ?? false, sub: 'today',     Icon: Clock,      target: 'leave-permission', color: 'var(--primary)', bg: 'var(--primary-light)' },
  ];

  return (
    <div className="dashboard-body">

      {/* ── Stat Cards ── */}
      <div className="stats-row">
        {statCards.map((s, i) => (
          <div className="stat-card" key={i} onClick={() => setActiveView(s.target)} style={{ cursor: 'pointer' }}>
            <div className="stat-card-top">
              <div className="stat-icon-wrap" style={{ background: s.bg }}>
                <s.Icon size={20} color={s.color} />
              </div>
              {/* Hide the trend badge whenever it carries no meaningful
                  signal — empty string, dash variants, and any text that
                  evaluates to zero (e.g. "+0", "-0", "0%", "0").
                  Previously these slipped through and rendered "+0" on
                  the Total Employees / Active Staff cards. */}
              {(() => {
                const t = String(s.trend || '').trim();
                if (!t) return null;
                // Reject dashes / placeholders
                if (['—', '-', 'N/A', 'n/a'].includes(t)) return null;
                // Reject anything whose numeric part is zero — strip the
                // leading +/- and trailing % and parseFloat.
                const num = parseFloat(t.replace(/^[+-]/, '').replace(/%$/, ''));
                if (!isFinite(num) || num === 0) return null;
                return (
                  <div className={`stat-trend-badge ${s.up ? 'up' : 'down'}`}>
                    {t}
                  </div>
                );
              })()}
            </div>
            <div>
              <div className="stat-value">{s.value}</div>
              <div className="stat-label">{s.label}</div>
              <div className="stat-sub">{s.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Middle Row ── */}
      <div className="middle-row">

        {/* Calendar card */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Attendance & Leave</div>
              <div className="card-subtitle">{attendanceMonth === 'current' ? currentMonthLabel : lastMonthLabel}</div>
            </div>
            <select
              value={attendanceMonth}
              onChange={e => setAttendanceMonth(e.target.value)}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: 12, fontWeight: 600, outline: 'none', background: 'white' }}
            >
              <option value="current">{currentMonthLabel}</option>
              <option value="last">{lastMonthLabel}</option>
            </select>
          </div>

          {/* Calendar legend removed for HRMS — the per-day status dots
              apply to a single employee's calendar, which belongs in the
              ERM Mobile / ERM Web apps, not the HR-wide dashboard. */}

          <div className="mini-calendar">
            <div className="cal-grid">
              {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
                <div key={d} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-light)', textAlign: 'center', marginBottom: 8 }}>{d}</div>
              ))}
              {(attendanceMonth === 'current' ? liveCalGrid : calGrid).map((day, idx) => {
                const isCurrent = attendanceMonth === 'current';
                const mockStatus = '';
                const isToday = isCurrent && day === todayDay;
                // ISO date for this cell — used both to highlight the
                // user's selection and to drive the backend refetch.
                const cellMonth = isCurrent ? todayMonth : todayMonth - 1;
                const cellYear  = isCurrent ? todayYear  : (todayMonth === 0 ? todayYear - 1 : todayYear);
                const cellMonthAdj = isCurrent ? todayMonth : (todayMonth === 0 ? 11 : todayMonth - 1);
                const iso = day
                  ? `${cellYear}-${String(cellMonthAdj + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                  : null;
                const isSelected = !!(day && selectedDay && selectedDay === iso);
                return (
                  <div
                    key={idx}
                    className={`cal-day ${!day ? 'empty' : mockStatus}`}
                    onClick={() => {
                      if (!day) return;
                      // Click today again → clear (back to live).
                      if (isToday && (!selectedDay || selectedDay === iso)) {
                        setSelectedDay(null);
                      } else {
                        setSelectedDay(iso);
                      }
                    }}
                    style={{
                      cursor: day ? 'pointer' : 'default',
                      ...(isToday
                        ? { background: 'var(--primary)', borderRadius: '50%', color: 'white', fontWeight: 800, boxShadow: '0 0 0 3px rgba(76,170,23,0.25)' }
                        : isSelected
                        ? { background: '#E0F2FE', borderRadius: '50%', color: '#0369A1', fontWeight: 800, boxShadow: '0 0 0 2px #38BDF8' }
                        : {}),
                    }}
                  >
                    <span className="day-num" style={isToday ? { color: 'white', fontWeight: 800 } : isSelected ? { color: '#0369A1', fontWeight: 800 } : {}}>{day}</span>
                    {day && mockStatus && !isToday && <span className="day-dot" />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected-day label — switches between "Today" and the picked date. */}
          <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
            {(() => {
              if (!attToday) return 'Today';
              if (!selectedDay) return 'Live · Today';
              const [y, m, d] = String(attToday.date || selectedDay).split('-');
              return `Stats for ${d}-${m}-${y}`;
            })()}
            {selectedDay && (
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                style={{
                  marginLeft: 8, padding: '2px 8px', borderRadius: 10, fontSize: 10,
                  background: '#F1F5F9', color: '#0F172A', border: '1px solid #CBD5E1',
                  cursor: 'pointer',
                }}
              >
                Back to today
              </button>
            )}
          </div>
          <div className="cal-stats">
            {(() => {
              // Always read from attToday (which now reflects the selected
              // day when one is picked — see the fetch effect above). If
              // the API hasn't responded yet, fall back to the parent's
              // pre-computed calStats so the tiles never flash empty.
              const live = attToday
                ? [
                    { lbl: 'Present',  num: attToday.present    ?? 0, color: '#16a34a', bg: '#F0FDF4' },
                    { lbl: 'Late',     num: attToday.late       ?? 0, color: '#d97706', bg: '#FFFBEB' },
                    { lbl: 'Leave',    num: attToday.leave      ?? 0, color: '#dc2626', bg: '#FEF2F2' },
                    { lbl: 'Perm',     num: attToday.permission ?? 0, color: '#6b7280', bg: '#F8FAFC' },
                  ]
                : calStats;
              return live.map(s => (
                <div className="cal-stat" key={s.lbl} style={{ background: s.bg }}>
                  <span className="cal-stat-num" style={{ color: s.color }}>{s.num}</span>
                  <span className="cal-stat-lbl">{s.lbl}</span>
                </div>
              ));
            })()}
          </div>
        </div>

        {/* Employee Overview — real dept data */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Employee Overview</div>
              <div className="card-subtitle">By Department</div>
            </div>
            <span className="card-action" onClick={() => setActiveView('employee-list')}>View all <ChevronRight size={13} /></span>
          </div>

          <div className="donut-wrap">
            {deptData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart>
                    <Pie data={deptData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={3} dataKey="value" stroke="none">
                      {deptData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ textAlign: 'center', marginTop: -12 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-main)' }}>{totalEmp.toLocaleString()}</div>
                  <div className="donut-center-label">Total Employees</div>
                </div>
                <div className="donut-legend-list">
                  {deptData.map(d => (
                    <div key={d.name}>
                      <div className="donut-legend-item">
                        <div className="donut-legend-left">
                          <div className="donut-legend-dot" style={{ background: d.color }} />
                          {d.name}
                        </div>
                        <span className="donut-legend-count">{d.value}</span>
                      </div>
                      <div className="donut-bar-bg">
                        <div className="donut-bar-fill" style={{ width: `${(d.value / totalForChart * 100).toFixed(1)}%`, background: d.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                {loading ? 'Loading...' : 'No employee data yet. Add employees to see department breakdown.'}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ── Quick Actions ── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div>
            <div className="card-title">Quick Actions</div>
            <div className="card-subtitle">Jump to the most-used HR tasks</div>
          </div>
        </div>
        <div className="quick-actions-row" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
          padding: 16,
        }}>
          {[
            { label: 'Add Employee',     Icon: UserPlus,      view: 'new-employee',    color: '#4CAA17', bg: '#F0FDF4' },
            { label: 'Run Payroll',      Icon: ClipboardList, view: 'payroll',         color: '#2563EB', bg: '#EFF6FF' },
            { label: 'Complaints',       Icon: MapPin,        view: 'complain-register', color: '#9F7AEA', bg: '#F5F3FF' },
            { label: 'Approve Leaves',   Icon: Check,         view: 'leave-permission',color: '#D97706', bg: '#FFFBEB' },
            { label: 'Mark Attendance',  Icon: Clock,         view: 'attendance',      color: '#DC2626', bg: '#FEF2F2' },
            { label: 'Announcements',    Icon: UserCheck,     view: 'announcements',   color: '#0EA5E9', bg: '#F0F9FF' },
          ].map((a) => (
            <button
              key={a.label}
              className="quick-action-card"
              onClick={() => setActiveView(a.view)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 14px', borderRadius: 10,
                background: a.bg, border: '1px solid var(--border-color)',
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 36, height: 36, borderRadius: 10, background: '#fff',
                border: '1px solid var(--border-color)',
              }}>
                <a.Icon size={18} color={a.color} />
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)' }}>{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Full Width Tracking Map ── */}
      <div className="full-width-map-row" style={{ marginBottom: 20 }}>
        <CompactTrackingMap sidebarOpen={sidebarOpen} onOpenFullMap={() => setActiveView('live-tracking')} />
      </div>

      {/* ── Bottom Row ── */}
      <div className="bottom-row">

        {/* Department Headcount */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Department Headcount</div>
              <div className="card-subtitle">Employee distribution by team</div>
            </div>
            <span className="card-action" onClick={() => setActiveView('department')} style={{ cursor: 'pointer' }}>
              View all <ChevronRight size={13} />
            </span>
          </div>

          <div style={{ padding: 12 }}>
            {deptData.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-light)', fontSize: 12 }}>
                No department data yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {deptData.map((d, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: d.color || '#94A3B8', flexShrink: 0 }} />
                    <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text-main)' }}>{d._id || d.name || '--'}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-light)' }}>{d.value || d.count || 0}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
