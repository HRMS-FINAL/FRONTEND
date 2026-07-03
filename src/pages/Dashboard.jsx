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
  // #355 — "Total Employees" card should reflect the ACTIVE roster only
  // (Inactive/Terminated employees no longer count toward the total).
  const activeStaff = stats?.counts?.activeEmployees ?? 0;
  const totalEmp    = activeStaff;
  const onLeave     = stats?.counts?.onLeaveToday    ?? 0;
  // Renamed: card now shows pending PERMISSION requests, not all
  // pending approvals (HR asked for the dashboard tile to spotlight
  // permission requests specifically).
  const permission  = stats?.counts?.pendingPermissions ?? 0;

  // Department data from API (for pie chart)
  const deptDataRaw = stats?.byDepartment ?? [];
  // ── Present-staff per department (added per HR feedback) ─────────────
  // Today's attendance logs power the second number we show next to each
  // department in the Employee Overview legend ("Development 12 · 9
  // present"). Refreshes every 60s so HR can see the count tick up as
  // people check in. The lookup is case-insensitive on dept name to
  // tolerate "Development" vs "development" data drift.
  const [presentByDept, setPresentByDept] = useState({});   // { 'development': 9, ... }
  // Total tallies for the top stat cards (Jun 2026 HR brief).
  const [liveTallies, setLiveTallies] = useState({ present: 0, late: 0, halfLop: 0 });
  useEffect(() => {
    let cancelled = false;
    const fetchPresent = async () => {
      try {
        const d = new Date();
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const r = await fetch(`${API}/attendance/logs?date=${dateStr}`);
        const j = await r.json().catch(() => ({}));
        if (cancelled || !j?.success || !Array.isArray(j.data)) return;
        const out = {};
        let presentTotal = 0;
        let lateTotal    = 0;
        let halfLopTotal = 0;
        for (const row of j.data) {
          const dept = String(row.department || row.dept || 'Unassigned').toLowerCase().trim();
          const s    = String(row.status || '').toLowerCase();
          // "Showed up today" = Present or Late or On Time. Half Day
          // / Permission still count as in-office for this dashboard
          // tile (HR wants to see how many people are around, not
          // strictly how many are full-day).
          if (s === 'present' || s === 'late' || s === 'on time' || s === 'half day' || s === 'permission') {
            out[dept] = (out[dept] || 0) + 1;
            presentTotal += 1;
          }
          if (s === 'late') lateTotal += 1;
          // Half-LOP today: anyone whose status flags a half-day-LOP (the
          // mobile/HRMS pipeline tags these explicitly when policy fires).
          if (s === 'half day' || s === 'half-lop' || s === '1/2 lop' || row.halfLop === true) {
            halfLopTotal += 1;
          }
        }
        setPresentByDept(out);
        setLiveTallies({ present: presentTotal, late: lateTotal, halfLop: halfLopTotal });
      } catch { /* leave previous value */ }
    };
    fetchPresent();
    const t = setInterval(fetchPresent, 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const deptData = deptDataRaw.map((d) => ({
    ...d,
    present: presentByDept[String(d.name || '').toLowerCase().trim()] || 0,
  }));
  // Total for the headcount bar widget — still the full roster, not the
  // present-today count (that view lives in the Employee Overview now).
  const totalForChart = deptData.reduce((s, d) => s + d.value, 0) || 1;
  // Per Jun 2026 HR brief, the Employee Overview pie/legend should show
  // *present-today* per department, not the total headcount. We mirror
  // the same array shape (name/color/value) but swap `value` for the
  // live present count. Departments with zero present today drop out
  // automatically — keeping the donut readable.
  const presentDeptData = deptData
    .map((d) => ({ name: d.name, color: d.color, value: d.present }))
    .filter((d) => d.value > 0);
  const totalPresentForChart = presentDeptData.reduce((s, d) => s + d.value, 0) || 1;

  // Top cards now show *live* attendance for the current date (Jun 2026
  // HR brief). "Active Staff" was misleading — it counted every Active
  // employee on the roster regardless of whether they showed up. We
  // replaced it with Present Today, and added Late + Half-LOP so HR can
  // spot policy hits at a glance without leaving the dashboard.
  //
  // #352e — Each attendance card now carries a `preFilter` key. On
  // click we stash it in sessionStorage so Attendance.jsx can open with
  // that status pre-selected. Also added the Half Day card that HR
  // asked for so the check-out < 5 h tally is visible on the dashboard.
  const openAttendance = (filter) => {
    try { sessionStorage.setItem('hrms_attendance_prefilter', filter || ''); } catch {}
    setActiveView('attendance');
  };
  const statCards = [
    { label: 'Total Employees', value: loading ? '...' : totalEmp.toLocaleString(),                   trend: stats?.cards?.totalEmployees?.trend || '—', up: stats?.cards?.totalEmployees?.up ?? true,  sub: 'active roster',      Icon: Users,      target: 'employee-list', preFilter: 'Active',  color: 'var(--primary)', bg: 'var(--primary-light)' },
    { label: 'Present Today',   value: loading ? '...' : (liveTallies.present || 0).toLocaleString(), trend: '—', up: true,                                                                                  sub: 'checked in today',   Icon: UserCheck,  target: 'attendance',    preFilter: 'Present', color: '#16A34A',        bg: '#F0FDF4' },
    // Absent today = headcount − present. HR asked Jun 2026 to surface a
    // single absentee number rather than the Half-LOP detail tile (which
    // they read in the Attendance page already). Clamp at 0 so a
    // mid-load race where present > totalEmp can't render "-2".
    { label: 'Absent Today',    value: loading ? '...' : Math.max(0, (totalEmp || 0) - (liveTallies.present || 0)).toLocaleString(), trend: '—', up: false, sub: 'not checked in',     Icon: CalendarOff,target: 'attendance',    preFilter: 'Absent',  color: '#DC2626',        bg: '#FEF2F2' },
    { label: 'Late Today',      value: loading ? '...' : (liveTallies.late || 0).toLocaleString(),    trend: '—', up: false,                                                                                 sub: 'after cut-off',      Icon: Clock,      target: 'attendance',    preFilter: 'Late',    color: '#D97706',        bg: '#FFFBEB' },
    // #352e Half Day — worked hours < 5. Same "clickable → filtered
    // Attendance Logs" behaviour as the others.
    { label: 'Half Day Today',  value: loading ? '...' : (liveTallies.halfLop || 0).toLocaleString(), trend: '—', up: false,                                                                                 sub: 'worked < 5 h',       Icon: Clock,      target: 'attendance',    preFilter: 'Half Day',color: '#7C3AED',        bg: '#F5F3FF' },
  ];
  // `activeStaff`, `onLeave`, `permission` are still computed above so
  // any downstream chart or widget that reads them keeps working — only
  // the top-card lineup changed.
  void activeStaff; void onLeave; void permission;

  return (
    <div className="dashboard-body">

      {/* ── Stat Cards ── */}
      <div className="stats-row">
        {statCards.map((s, i) => (
          <div className="stat-card" key={i} onClick={() => {
            // #352e — Attendance cards route through openAttendance so
            // the target page can pre-apply the status filter. Other
            // cards (e.g. Total Employees) keep the old plain
            // setActiveView behaviour.
            if (s.target === 'attendance') openAttendance(s.preFilter);
            else setActiveView(s.target);
          }} style={{ cursor: 'pointer' }}>
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

        {/* Employee Overview — live PRESENT per department (Jun 2026 HR
            brief). Replaces the old "total headcount per department"
            view; the headcount totals already live in the Department
            Headcounts card below, so showing both was redundant. */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Employee Overview</div>
              <div className="card-subtitle">Present today · all departments</div>
            </div>
            <span className="card-action" onClick={() => setActiveView('attendance')}>View attendance <ChevronRight size={13} /></span>
          </div>

          <div className="donut-wrap">
            {presentDeptData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart>
                    <Pie data={presentDeptData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={3} dataKey="value" stroke="none">
                      {presentDeptData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ textAlign: 'center', marginTop: -12 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#16A34A' }}>{liveTallies.present.toLocaleString()}</div>
                  <div className="donut-center-label">Present Today</div>
                </div>
                <div className="donut-legend-list">
                  {presentDeptData.map(d => (
                    <div key={d.name}>
                      <div className="donut-legend-item">
                        <div className="donut-legend-left">
                          <div className="donut-legend-dot" style={{ background: d.color }} />
                          {d.name}
                        </div>
                        <span className="donut-legend-count">{d.value}</span>
                      </div>
                      <div className="donut-bar-bg">
                        <div
                          className="donut-bar-fill"
                          style={{
                            width: `${((d.value / totalPresentForChart) * 100).toFixed(1)}%`,
                            background: d.color,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                {loading ? 'Loading...' : 'No one has checked in yet today.'}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ── Live Tracking widget + Department headcounts ─────────────── */}
      {/* Restored row — the Live Tracking compact map and the per-dept
          headcount card used to live here before an earlier refactor
          accidentally trimmed them. Both come back as a 2-column grid
          that collapses to a stack under 900 px. */}
      <div
        className="dashboard-secondary-row"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)',
          gap: 16,
          marginBottom: 20,
        }}
      >
        {/* Live Tracking — uses the existing CompactTrackingMap that
            already powers a working map elsewhere on the dashboard. */}
        <CompactTrackingMap
          onOpenFullMap={() => setActiveView('live-tracking')}
          sidebarOpen={sidebarOpen}
        />

        {/* Department headcounts — bar list, biggest first. Click any
            row to drill into the Department admin page. */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div
            className="card-header"
            style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}
          >
            <div>
              <div className="card-title">Department Headcounts</div>
              <div className="card-subtitle">Active employees per department</div>
            </div>
            <span
              className="card-action"
              onClick={() => setActiveView('department')}
              style={{ cursor: 'pointer' }}
            >
              Manage <ChevronRight size={13} />
            </span>
          </div>

          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {deptData.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>
                {loading ? 'Loading…' : 'No departments yet.'}
              </div>
            ) : (
              deptData.map((d) => (
                <div key={d.name}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, color: 'var(--text-main)' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, display: 'inline-block' }} />
                      {d.name}
                    </span>
                    {/* Headcount card now shows just the total — the
                        live present-today number was moved out to the
                        Employee Overview donut per Jun 2026 HR brief
                        (no duplicate "N present" badge here). */}
                    <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-main)' }}>
                      {d.value}
                    </span>
                  </div>
                  <div style={{
                    background: '#F1F5F9', borderRadius: 999, height: 8, overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${((d.value / totalForChart) * 100).toFixed(1)}%`,
                      background: d.color, height: '100%',
                    }} />
                  </div>
                </div>
              ))
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
            { label: 'Approvals',       Icon: CheckCircle,   view: 'leave-permission-request', color: '#F97316', bg: '#FFF7ED' },
          ].map((qa, i) => (
            <button key={i} className="quick-action-btn" onClick={() => setActiveView(qa.view)} style={{ cursor: 'pointer' }}>
              <div className="quick-action-icon" style={{ background: qa.bg, color: qa.color }}>
                <qa.Icon size={20} />
                </div>
              {qa.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
