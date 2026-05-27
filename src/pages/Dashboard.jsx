import React, { useState, useEffect, useMemo } from 'react';
import {
  Users, UserCheck, CalendarOff,
  ChevronRight, ClipboardList,
  Check, Clock, MapPin, UserPlus
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { CompactTrackingMap } from '../LiveTrackingMap';

const API = 'http://localhost:8001/api';

export default function Dashboard({
  calGrid, days, calStats,
  reminders, doneReminders, toggleReminder,
  setActiveView, sidebarOpen,
  employees = [],
}) {
  const [attendanceMonth, setAttendanceMonth] = useState('current');
  const [stats, setStats]   = useState(null);
  const [attToday, setAttToday] = useState(null);
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
      fetch(`${API}/dashboard/attendance-today`)
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
  }, [employees.length]);

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
  const pending     = stats?.counts?.pendingApprovals ?? 0;

  // Department data from API (for pie chart)
  const deptData = stats?.byDepartment ?? [];
  const totalForChart = deptData.reduce((s, d) => s + d.value, 0) || 1;

  const statCards = [
    { label: 'Total Employees', value: loading ? '...' : totalEmp.toLocaleString(),  trend: stats?.cards?.totalEmployees?.trend || '—', up: stats?.cards?.totalEmployees?.up ?? true,  sub: 'all registered',       Icon: Users,      target: 'employee-list',    color: 'var(--primary)', bg: 'var(--primary-light)' },
    { label: 'Active Staff',    value: loading ? '...' : activeStaff.toLocaleString(),trend: stats?.cards?.activeStaff?.trend    || '—', up: stats?.cards?.activeStaff?.up    ?? true,  sub: 'currently working',    Icon: UserCheck,  target: 'live-tracking',    color: 'var(--primary)', bg: 'var(--primary-light)' },
    { label: 'On Leave',        value: loading ? '...' : onLeave.toLocaleString(),    trend: stats?.cards?.onLeave?.trend         || '—', up: false,                                     sub: 'today',                Icon: CalendarOff,target: 'leave-permission', color: 'var(--primary)', bg: 'var(--primary-light)' },
    { label: 'Pending',         value: loading ? '...' : pending.toLocaleString(),    trend: stats?.cards?.pending?.trend         || '—', up: stats?.cards?.pending?.up         ?? false, sub: 'approvals needed',     Icon: Clock,      target: 'leave-permission', color: 'var(--primary)', bg: 'var(--primary-light)' },
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
              <div className={`stat-trend-badge ${s.up ? 'up' : 'down'}`}>
                {s.trend}
              </div>
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

          <div className="calendar-legend" style={{ margin: '12px 0 20px 0' }}>
            {[
              { lbl: 'Present', color: '#22c55e' },
              { lbl: 'Late',    color: '#f59e0b' },
              { lbl: 'Leave',   color: '#ef4444' },
              { lbl: 'Perm',    color: '#94a3b8' },
            ].map(l => (
              <div key={l.lbl} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: l.color }} />
                {l.lbl}
              </div>
            ))}
          </div>

          <div className="mini-calendar">
            <div className="cal-grid">
              {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
                <div key={d} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-light)', textAlign: 'center', marginBottom: 8 }}>{d}</div>
              ))}
              {(attendanceMonth === 'current' ? liveCalGrid : calGrid).map((day, idx) => {
                const isCurrent = attendanceMonth === 'current';
                // Empty calendar — no mock dots. Real per-day status will
                // arrive from a future endpoint; for now we just show plain
                // dates with "today" highlighted.
                const mockStatus = '';
                const isToday = isCurrent && day === todayDay;
                return (
                  <div
                    key={idx}
                    className={`cal-day ${!day ? 'empty' : mockStatus}`}
                    style={isToday ? { background: 'var(--primary)', borderRadius: '50%', color: 'white', fontWeight: 800, boxShadow: '0 0 0 3px rgba(76,170,23,0.25)' } : {}}
                  >
                    <span className="day-num" style={isToday ? { color: 'white', fontWeight: 800 } : {}}>{day}</span>
                    {day && mockStatus && !isToday && <span className="day-dot" />}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="cal-stats">
            {(() => {
              // When today's live attendance is available, show those four
              // boxes (Present / Late / Leave / Perm). Otherwise fall back
              // to whatever `calStats` was passed in.
              const live = attToday && attendanceMonth === 'current'
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
            <span className="card-action" onClick={() => setActiveView('department')} style={{ color: 'var(--primary)' }}>
              View all <ChevronRight size={13} color="var(--primary)" />
            </span>
          </div>
          <div className="dash-dept-list">
            {deptData.length > 0 ? deptData.map((d, i) => (
              <div className="dash-dept-item" key={i} onClick={() => setActiveView('department')}>
                <div className="dash-dept-icon" style={{ background: d.color + '15', color: d.color }}>{d.name.charAt(0)}</div>
                <div className="dash-dept-info">
                  <div className="dash-dept-name">{d.name} Team</div>
                  <div className="dash-dept-progress-wrap">
                    <div className="dash-dept-progress-bar">
                      <div className="dash-dept-progress-fill" style={{ width: `${(d.value / totalForChart * 100).toFixed(1)}%`, background: d.color }} />
                    </div>
                    <span className="dash-dept-pct">{(d.value / totalForChart * 100).toFixed(0)}%</span>
                  </div>
                </div>
                <div className="dash-dept-count">
                  <div className="count-val">{d.value}</div>
                  <div className="count-lbl">Staff</div>
                </div>
              </div>
            )) : (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                {loading ? 'Loading...' : 'No departments yet.'}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="card">
          <div className="card-header"><div className="card-title">Quick Actions</div></div>
          <div className="quick-actions-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {[
              { label: 'Add Employee',              icon: <UserPlus size={18} />,   color: '#4CAA17', bg: '#F1F9EE', target: 'new-employee'     },
              { label: 'Leave & Permission',         icon: <CalendarOff size={18} />,color: '#3b82f6', bg: '#eff6ff', target: 'leave-permission' },
              { label: 'Live Tracking',              icon: <MapPin size={18} />,     color: '#f59e0b', bg: '#fffbeb', target: 'live-tracking'    },
            ].map((qa, i) => (
              <div key={i} className="quick-action-btn" onClick={() => setActiveView(qa.target)}>
                <div className="quick-action-icon" style={{ background: qa.bg, color: qa.color }}>{qa.icon}</div>
                <span>{qa.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Reminders widget removed per HR — the dashboard is now
            focused purely on metrics + quick actions. */}
      </div>
    </div>
  );
}
