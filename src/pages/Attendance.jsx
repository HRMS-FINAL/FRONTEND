import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ChevronRight, Calendar, Check, X, Clock,
  Search, Filter, CalendarCheck, FileText,
  UserCheck, CalendarOff, AlertTriangle
} from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
// #369 — Branded confirmation modal replaces window.confirm on Mark Present.
import { useConfirm } from '../components/ConfirmDialog';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
// #303 — Shared branded report template (logo, header, footer, polished
// table styles). Every PDF/Excel in HRMS now flows through this.
import { buildBrandedPdf, buildBrandedExcel, pdfDateLabel } from '../utils/reportTemplate';
import * as XLSX from 'xlsx';
import { allEmployees } from '../data/mockData';

import { API } from '../config/api';

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

export default function Attendance({ onBack, employees = [] }) {
  const { showNotification } = useNotification();
  const confirm = useConfirm();
  const today = new Date();
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-indexed
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedLog, setSelectedLog] = useState(null);
  const [apiLogs, setApiLogs] = useState([]);
  // #358 — Approved leave + permission requests for the selected date. Used
  // to synthesise Absent/Permission rows for employees who didn't produce
  // an Attendance record (leave-approved absentees, permission-only days).
  const [approvedForDate, setApprovedForDate] = useState({ leave: [], permission: [] });
  // #356 — Roster-based counts pulled from /api/dashboard/attendance-today.
  // Fixes the "Absent 0" mismatch on the Attendance Logs page: the /logs
  // endpoint only returns rows for employees who have an Attendance record,
  // so nobody who never checked in was being counted. attendance-today
  // knows the full active headcount and derives absent + permission from
  // the same source of truth as the Dashboard tiles.
  const [rosterCounts, setRosterCounts] = useState(null);
  // #398 — Track Mark-Present operations that are mid-flight AND rows the
  // server hasn't yet confirmed as Present. The refresh at 1200 ms after
  // Mark Present can return the row still as Absent (mobile→Render write
  // hasn't propagated, or the /logs endpoint's cache is stale). Without
  // this Set, that refresh overwrites our optimistic update and the row
  // flips back to Absent with the button reappearing — the exact bug HR
  // reported. Now the merge logic KEEPS the local Present override for
  // any row in this Set until the server row itself returns non-Absent.
  //
  // Keys are `employeeId` (e.g. "TES080") since that's what /logs returns.
  // Values are the timestamp when we started marking; used to expire
  // overrides after 30 s so a genuinely-failed mark eventually stops
  // masking the truth.
  const [pendingMarked, setPendingMarked] = useState(new Map());
  // #406 — StaleClosureFix: setTimeout in the Mark Present click handler
  // captures `pendingMarked` at click-time (BEFORE setPendingMarked has
  // applied), so the merge helper's `pendingMarked.has(empId)` check
  // returned false for the just-marked employee — causing the server's
  // stale "Absent" to overwrite our optimistic "Present" and the button
  // to reappear within 1-2 s (exactly what HR keeps reporting).
  //
  // Solution: mirror pendingMarked into a ref that we update SYNCHRONOUSLY
  // in the click handler, and read from the ref inside the setTimeout.
  // The ref bypasses the React render/closure boundary.
  const pendingMarkedRef = useRef(new Map());

  // #352e/f — Read the pre-filter that Dashboard.jsx stashed in
  // sessionStorage when the user clicked a Present/Absent/Late/
  // Half Day stat card. Apply once on mount, then clear the key so
  // navigating away and back doesn't re-apply an old filter.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('hrms_attendance_prefilter');
      if (raw) {
        const map = {
          Present:   'present',
          Absent:    'absent',
          Late:      'late',
          'Half Day':'halfday',
          Permission:'permission',
        };
        const next = map[raw] || 'all';
        if (next && next !== 'all') setFilterStatus(next);
      }
    } catch { /* sessionStorage disabled — silent no-op */ }
    finally {
      try { sessionStorage.removeItem('hrms_attendance_prefilter'); } catch {}
    }
  }, []);

  const activeEmployees = employees.length > 0 ? employees : allEmployees;

  // Dynamic calendar grid for the active month/year.
  const calendarGrid = React.useMemo(() => {
    const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();   // 0 = Sun
    const daysInMonth     = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDayOfMonth; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++)   cells.push(d);
    return cells;
  }, [viewYear, viewMonth]);

  const monthLabel = `${MONTH_NAMES[viewMonth]} ${viewYear}`;
  // YYYY-MM-DD for the /attendance/logs?date=... API. This is a *query
  // parameter*, not a UI string, so it stays in ISO. The dd-mm-yyyy
  // display format is applied separately wherever a user-visible date
  // is rendered.
  const fmtDate = (d) => {
    const mm = String(viewMonth + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    return `${viewYear}-${mm}-${dd}`;
  };

  // Fetch API logs for selected day (silently — falls back to mock if empty/error)
  useEffect(() => {
    const dateStr = fmtDate(selectedDay);
    fetch(`${API}/attendance/logs?date=${dateStr}`)
      .then(r => r.json())
      .then(data => { if (data.success) setApiLogs(data.data || []); })
      .catch(() => setApiLogs([]));
    // #356 — parallel fetch: roster-aware counts (present/late/leave/permission/absent)
    fetch(`${API}/dashboard/attendance-today?date=${dateStr}`)
      .then(r => r.json())
      .then(data => setRosterCounts(data?.success ? data.data : null))
      .catch(() => setRosterCounts(null));
    // #358 — Approved leave + permission requests overlapping the selected
    // date. Powers the Absent/Permission drill-downs so people who are on
    // approved time-off show up even though there's no Attendance record.
    // #361 — Approved leave + permission requests. The HRMS backend reshape
    // returns:
    //   requestType: 'leave' | 'permission' (raw)
    //   startDate / endDate  (for leave rows)
    //   permissionDate       (for permission rows)
    // Fixed field parsing so the Permission drill-down actually lists people.
    fetch(`${API}/leave-requests?status=approved&limit=500`)
      .then(r => r.json())
      .then(data => {
        const items = Array.isArray(data?.items) ? data.items : [];
        const iso = (v) => {
          try { return v ? new Date(v).toISOString().slice(0,10) : null; }
          catch { return null; }
        };
        const permission = items.filter(it => {
          if (String(it.requestType || '').toLowerCase() !== 'permission') return false;
          const d = iso(it.permissionDate) || iso(it.date) || iso(it.startDate);
          return d === dateStr;
        });
        const leave = items.filter(it => {
          if (String(it.requestType || '').toLowerCase() !== 'leave') return false;
          const s = iso(it.startDate);
          const e = iso(it.endDate) || s;
          return s && e && dateStr >= s && dateStr <= e;
        });
        setApprovedForDate({ leave, permission });
      })
      .catch(() => setApprovedForDate({ leave: [], permission: [] }));
  }, [selectedDay, viewMonth, viewYear]);

  // Generate logs for selected day from the live mobile API.
  // No mock fallback — when there's no real attendance for the day, the
  // table shows "No records" rather than synthesised check-ins.
  const dailyLogs = React.useMemo(() => {
    if (apiLogs.length === 0) return [];
    return apiLogs.map(log => ({
      id: log._id,
      name: log.employeeName || '',
      initials: log.avatar || (log.employeeName || '??').slice(0, 2).toUpperCase(),
      color: log.color || '#4299E1',
      role: log.role || '',
      email: log.email || '',
      dept: log.department || '',
      employeeId: log.employeeId || '',
      // 'On Time' → 'Present' for the badge; 'Absent' → 'Absent';
      // 'Half Day' is now distinct from 'Permission' (Jun 2026 — policy fix). 'Permission' = filed permission request; 'Half Day' = early checkout without permission (counts toward LOP).
      status: log.status === 'On Time' ? 'Present' : log.status === 'Absent' ? 'Absent' : log.status,
      checkIn: log.checkIn || '--:--',
      checkOut: log.checkOut || '--:--',
      workHours: log.workHours || '0h',
    }));
  }, [apiLogs]);

  // (legacy code below kept commented in case the demo mock view is needed)
  /* const _legacyMockUnused = () => activeEmployees.map(emp => {
      const status = getEmployeeStatusForDay(emp, selectedDay);
      let checkIn = '09:05 AM';
      let checkOut = '06:00 PM';
      let workHours = '8h 55m';

      if (status === 'Absent') {
        checkIn = '--:--';
        checkOut = '--:--';
        workHours = '0h';
      } else if (status === 'Permission') {
        checkIn = '11:15 AM';
        checkOut = '06:00 PM';
        workHours = '6h 45m';
      } else if (status === 'Late') {
        checkIn = '09:45 AM';
        checkOut = '06:00 PM';
        workHours = '8h 15m';
      }

      return {
        ...emp,
        status,
        checkIn,
        checkOut,
        workHours
      };
    });
  */

  // ── Monthly overview for the currently-selected employee row ─────
  // Fetched on-demand when a user clicks a row in the daily table.
  // Counts come from real attendance for {viewMonth, viewYear}.
  const [monthlyOverview, setMonthlyOverview] = useState({
    present: 0, late: 0, leave: 0, permission: 0,
  });

  useEffect(() => {
    if (!selectedLog) return;
    let cancelled = false;
    fetch(`${API}/attendance/logs?month=${viewMonth + 1}&year=${viewYear}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled || !data?.success || !Array.isArray(data.data)) return;
        const empId    = selectedLog.employeeId || '';
        const empEmail = (selectedLog.email || '').toLowerCase();
        const mine = data.data.filter(log =>
          (empId    && log.employeeId === empId) ||
          (empEmail && (log.email || '').toLowerCase() === empEmail)
        );
        const norm = (s) => s === 'On Time' ? 'Present' : s === 'Absent' ? 'Absent' : s;
        // Present count folds Late in (employee did come in); the Late
        // figure is preserved separately so the monthly view can still
        // surface it.
        setMonthlyOverview({
          present:    mine.filter(l => norm(l.status) === 'Present' || norm(l.status) === 'Late').length,
          late:       mine.filter(l => norm(l.status) === 'Late').length,
          leave:      mine.filter(l => norm(l.status) === 'Absent').length,
          permission: mine.filter(l => norm(l.status) === 'Permission').length,
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedLog, viewMonth, viewYear]);

  // Build a one-page attendance report PDF for the selected employee.
  const handleExportEmployeeReport = () => {
    if (!selectedLog) return;
    fetch(`${API}/attendance/logs?month=${viewMonth + 1}&year=${viewYear}`)
      .then(r => r.json())
      .then(data => {
        const empId    = selectedLog.employeeId || '';
        const empEmail = (selectedLog.email || '').toLowerCase();
        const mine = (data?.data || []).filter(log =>
          (empId    && log.employeeId === empId) ||
          (empEmail && (log.email || '').toLowerCase() === empEmail)
        );
        const norm = (s) => s === 'On Time' ? 'Present' : s === 'Absent' ? 'Absent' : s;
        // #303 — branded template.
        (async () => {
          const doc = await buildBrandedPdf({
            title:    'Attendance Report',
            subtitle: `Monthly attendance log for ${selectedLog.name}`,
            meta: {
              employeeName: selectedLog.name,
              employeeId:   selectedLog.employeeId,
              department:   selectedLog.department || selectedLog.dept,
              date:         `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`,
            },
            head: ['Date', 'Status', 'Check In', 'Check Out', 'Work Hours'],
            body: mine.map(l => [l.date || '', norm(l.status), l.checkIn || '--', l.checkOut || '--', l.workHours || '0h']),
          });
          const safe = (selectedLog.name || 'employee').replace(/[^\w]+/g, '_');
          doc.save(`Attendance_${safe}_${monthLabel.replace(/\s+/g, '_')}.pdf`);
          showNotification('Attendance report downloaded.', 'success');
        })();
      })
      .catch(err => showNotification('Could not build report: ' + (err?.message || 'unknown'), 'error'));
  };

  // Stats for the selected day.
  // Present INCLUDES late — the employee did show up, they were just late.
  // Late is also surfaced separately so HR can see how many of them crossed
  // the 10:01 AM cut-off.
  const stats = React.useMemo(() => {
    const norm = (s) => String(s || '').trim().toLowerCase();
    const onlyPresent = dailyLogs.filter(l => norm(l.status) === 'present').length;
    const late        = dailyLogs.filter(l => norm(l.status) === 'late').length;
    const permission  = dailyLogs.filter(l => norm(l.status) === 'permission').length;
    const halfday     = dailyLogs.filter(l => norm(l.status) === 'half day' || norm(l.status) === 'halfday').length;
    // #364 — Present == same definition as the Dashboard top card:
    // anyone who showed up. Includes late, permission, half-day. So the
    // "Present 27" number on the top card matches the "Present 27"
    // number here. Absent = active roster − showedUp.
    const activeCount = (activeEmployees || []).filter(e =>
      String(e.status || 'Active') === 'Active'
    ).length;
    const showedUp = onlyPresent + late + permission + halfday;
    const leave    = Math.max(0, activeCount - showedUp);
    return { present: showedUp, late, leave, permission };
  }, [dailyLogs, activeEmployees]);

  // Dynamic Attendance Summary cards based on selected day and filters
  const attStats = React.useMemo(() => [
    { label: 'Present', value: stats.present, trend: `${MONTH_NAMES[viewMonth].slice(0,3)} ${selectedDay < 10 ? `0${selectedDay}` : selectedDay}`, type: 'up', color: '#4CAA17', Icon: UserCheck },
    { label: 'Absent', value: stats.leave, trend: `${MONTH_NAMES[viewMonth].slice(0,3)} ${selectedDay < 10 ? `0${selectedDay}` : selectedDay}`, type: 'down', color: '#FC8181', Icon: CalendarOff },
    { label: 'Permission', value: stats.permission, trend: `${MONTH_NAMES[viewMonth].slice(0,3)} ${selectedDay < 10 ? `0${selectedDay}` : selectedDay}`, type: 'up', color: '#9F7AEA', Icon: Clock },
    { label: 'Late', value: stats.late, trend: `${MONTH_NAMES[viewMonth].slice(0,3)} ${selectedDay < 10 ? `0${selectedDay}` : selectedDay}`, type: 'up', color: '#ECC94B', Icon: AlertTriangle },
  ], [stats, selectedDay]);

  const getFilterKey = (label) => {
    if (label === 'Present') return 'present';
    if (label === 'Absent') return 'leave';
    if (label === 'Permission') return 'permission';
    if (label === 'Late') return 'late';
    return 'all';
  };

  const handleCardClick = (label) => {
    const key = getFilterKey(label);
    setFilterStatus(prev => prev === key ? 'all' : key);
  };

  // #358 — Build an augmented log list that includes synthetic rows for:
  //   • Active employees who never checked in that day (status='Absent')
  //   • Approved leave requests for that day (status='Absent')
  //   • Approved permission requests for that day (status='Permission')
  // Real Attendance rows always win over synthetic ones so we don't double-
  // count. Only rows for people already in Attendance are shown as-is;
  // everyone else gets a synthetic row so Absent/Permission drill-downs
  // actually list people.
  const augmentedLogs = React.useMemo(() => {
    const byKey = new Map();
    const norm = (v) => String(v || '').trim().toLowerCase();
    // Seed the map with real Attendance rows keyed by employeeId (fallback name).
    dailyLogs.forEach(l => {
      const k = norm(l.employeeId) || norm(l.name);
      if (k) byKey.set(k, l);
    });
    const makeStub = (person, status) => ({
      id: `stub-${status}-${person.employeeId || person.name}`,
      name: person.name || person.employeeName || '—',
      initials: (person.name || person.employeeName || '??').slice(0,2).toUpperCase(),
      color: '#94A3B8',
      role: person.designation || person.role || person.title || '',
      email: person.email || '',
      dept: person.department || person.dept || '',
      employeeId: person.employeeId || '',
      status,
      checkIn: '--:--',
      checkOut: '--:--',
      workHours: '0h',
      _synthetic: true,
    });
    // Apply approved permission requests first — they override "not checked in".
    (approvedForDate.permission || []).forEach(r => {
      const k = norm(r.employeeId) || norm(r.employeeName || r.name);
      if (!k) return;
      if (!byKey.has(k)) byKey.set(k, makeStub(r, 'Permission'));
    });
    // Then approved leave rows for the day.
    (approvedForDate.leave || []).forEach(r => {
      const k = norm(r.employeeId) || norm(r.employeeName || r.name);
      if (!k) return;
      if (!byKey.has(k)) byKey.set(k, makeStub(r, 'Absent'));
    });
    // Finally add every remaining active employee as an Absent stub.
    (activeEmployees || []).forEach(e => {
      const status = e.status || 'Active';
      if (status !== 'Active') return;
      const k = norm(e.employeeId) || norm(e.name);
      if (!k) return;
      if (!byKey.has(k)) byKey.set(k, makeStub(e, 'Absent'));
    });
    return Array.from(byKey.values());
  }, [dailyLogs, approvedForDate, activeEmployees]);

  // Filtering based on search and sub-tab selection.
  // Defensive: any missing field would previously crash the .toLowerCase()
  // call and silently leave the table unfiltered. Default all strings first.
  //
  // #358 — When the filter is one of {all, present, late}, we source from
  // the real dailyLogs so we don't pollute the table with fake "Absent"
  // rows in the default view. For {absent, leave, permission, halfday} we
  // source from augmentedLogs so drill-downs actually list people.
  const filterFromAugmented = ['absent','leave','permission','halfday'].includes(filterStatus);
  const sourceLogs = filterFromAugmented ? augmentedLogs : dailyLogs;
  const displayLogs = sourceLogs.filter(log => {
    const q = String(searchQuery || '').trim().toLowerCase();
    const name = String(log?.name        || '').toLowerCase();
    const eid  = String(log?.employeeId  || '').toLowerCase();
    const role = String(log?.role        || '').toLowerCase();
    const dept = String(log?.department  || '').toLowerCase();
    const matchesSearch = !q || name.includes(q) || eid.includes(q) || role.includes(q) || dept.includes(q);

    if (!matchesSearch) return false;

    // #363 — case-insensitive status match so lowercase 'permission' etc.
    // from the mobile backend still line up with the filter buttons.
    const st = String(log.status || '').trim().toLowerCase();
    if (filterStatus === 'all') return true;
    if (filterStatus === 'present') return st === 'present' || st === 'late';
    if (filterStatus === 'late') return st === 'late';
    if (filterStatus === 'leave') return st === 'absent';
    if (filterStatus === 'permission') return st === 'permission';
    if (filterStatus === 'absent')  return st === 'absent';
    if (filterStatus === 'halfday') return st === 'half day' || st === 'halfday';
    return true;
  });

  return (
    <div className="emp-list-page">
      <div className="emp-list-header">
        <div className="ne-breadcrumb">
          <span className="ne-breadcrumb-link" onClick={onBack}>Dashboard</span>
          <ChevronRight size={13} />
          <span>Attendance & Leaves</span>
        </div>
        <div className="emp-list-title-row">
          <div>
            <h1 className="ne-page-title">Attendance Management</h1>
            <p className="ne-page-sub">Monitor daily logs, select calendar dates, and manage leave/permission requests.</p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            {/* PDF + Excel split (#288). Replaces the single "Reports"
                button that only fired a toast. Both buttons export the
                currently-visible day's attendance log. */}
            <button
              className="ne-btn-secondary"
              onClick={() => {
                try {
                  // Build marker — when you see this line in DevTools, the
                  // #294 fix is live. If you only see "months is not
                  // defined" without this preceding log, you're still on
                  // the old Vercel bundle and need to redeploy.
                  console.log('[Attendance PDF BUILD#294] click — building report');
                  // Fall back to dailyLogs if displayLogs (filtered)
                  // is empty so the button never silently no-ops.
                  const rows = (Array.isArray(displayLogs) && displayLogs.length)
                    ? displayLogs
                    : (Array.isArray(dailyLogs) ? dailyLogs : []);
                  console.log('[Attendance PDF] rows:', rows.length);
                  if (!rows.length) {
                    showNotification('No attendance records to export.', 'info');
                    return;
                  }
                  // Build a friendly filename + report date like "17-Jun-2026".
                  // NOTE: this file uses `viewMonth` / `viewYear` for the
                  // month-year picker and `MONTH_NAMES` for the labels —
                  // a previous edit referenced `months[selectedMonth]` which
                  // doesn't exist in this file and threw "months is not
                  // defined" on every download click.
                  const monthShort = (MONTH_NAMES[viewMonth] || '').slice(0, 3);
                  const dateLabel = `${selectedDay}-${monthShort}-${viewYear}`;
                  const dateIso = `${viewYear}-${String(viewMonth + 1).padStart(2,'0')}-${String(selectedDay).padStart(2,'0')}`;
                  // #303 — branded report template.
                  (async () => {
                    const doc = await buildBrandedPdf({
                      title: 'Daily Attendance Log',
                      subtitle: 'Per-employee check-in / check-out for the selected date',
                      meta: { date: dateIso },
                      head: ['Emp ID', 'Name', 'Role', 'Department', 'Check In', 'Check Out', 'Work Hours', 'Status'],
                      body: rows.map(r => [
                        r.employeeId || '', r.name || '',
                        r.role || r.designation || '',
                        r.department || r.dept || '',
                        r.checkIn || '--', r.checkOut || '--',
                        r.workHours || '0h', r.status || '',
                      ]),
                      orientation: 'landscape',
                    });
                    doc.save(`attendance_${dateLabel}.pdf`);
                    showNotification('Attendance PDF downloaded.', 'success');
                  })();
                } catch (e) {
                  console.error('[Attendance PDF] error:', e);
                  showNotification('Could not build PDF: ' + (e?.message || 'unknown'), 'error');
                }
              }}
            >
              <FileText size={16} /> Download PDF
            </button>
            <button
              className="ne-btn-secondary"
              onClick={() => {
                try {
                  // Build marker — proves #294 bundle is live.
                  console.log('[Attendance Excel BUILD#294] click — building report');
                  const rows = (Array.isArray(displayLogs) && displayLogs.length)
                    ? displayLogs
                    : (Array.isArray(dailyLogs) ? dailyLogs : []);
                  console.log('[Attendance Excel] rows:', rows.length);
                  if (!rows.length) {
                    showNotification('No attendance records to export.', 'info');
                    return;
                  }
                  // See PDF button — `months`/`selectedMonth`/`selectedYear`
                  // are not declared in this file. Real names: MONTH_NAMES,
                  // viewMonth, viewYear.
                  const monthShort = (MONTH_NAMES[viewMonth] || '').slice(0, 3);
                  const dateLabel = `${selectedDay}-${monthShort}-${viewYear}`;
                  const dateIso = `${viewYear}-${String(viewMonth + 1).padStart(2,'0')}-${String(selectedDay).padStart(2,'0')}`;
                  // #303 — branded Excel template.
                  const head = ['Emp ID', 'Name', 'Role', 'Department', 'Check In', 'Check Out', 'Work Hours', 'Status'];
                  const body = rows.map(r => [
                    r.employeeId || '', r.name || '',
                    r.role || r.designation || '',
                    r.department || r.dept || '',
                    r.checkIn || '', r.checkOut || '',
                    r.workHours || '0h', r.status || '',
                  ]);
                  const wb = buildBrandedExcel({
                    title:    'Daily Attendance Log',
                    subtitle: 'Per-employee check-in / check-out for the selected date',
                    meta:     { date: dateIso },
                    head, body,
                  });
                  XLSX.writeFile(wb, `attendance_${dateLabel}.xlsx`);
                  showNotification('Attendance Excel downloaded.', 'success');
                } catch (e) {
                  console.error('[Attendance Excel] error:', e);
                  showNotification('Could not build Excel: ' + (e?.message || 'unknown'), 'error');
                }
              }}
            >
              <FileText size={16} /> Download Excel
            </button>
          </div>
        </div>
      </div>

      <div className="stats-row" style={{ marginTop: '20px' }}>
        {attStats.map(s => {
          const isActiveFilter = filterStatus === getFilterKey(s.label);
          return (
            <div
              className={`stat-card attendance-stat-card ${isActiveFilter ? 'active-filter' : ''}`}
              key={s.label}
              onClick={() => handleCardClick(s.label)}
              style={{ cursor: 'pointer' }}
            >
              <div className="stat-card-top">
                <div className="stat-icon-wrap" style={{ background: s.color + '15' }}>
                  <s.Icon size={18} color={s.color} />
                </div>
                <div className={`stat-trend-badge ${s.type}`} style={{ fontSize: '10px', padding: '2px 8px' }}>{s.trend}</div>
              </div>
              <div>
                <div className="stat-value">{s.value}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* When a row is selected we render THREE columns (calendar +
          employee detail + logs table). When nothing is selected we
          render TWO columns (calendar + logs table). HR wanted the
          calendar to stay visible at all times so date navigation
          isn't lost when drilling into an employee. */}
      <div className="attendance-logs-container" style={{ display: 'grid', gridTemplateColumns: selectedLog ? '280px 280px 1fr' : '320px 1fr', gap: '20px', marginTop: '20px', alignItems: 'start' }}>

        {/* Left Column — Interactive Calendar. Always rendered now
            (previously hidden behind `{selectedLog ? null : (…)}`); the
            employee-detail panel slots in as a second column instead
            of replacing the calendar. */}
        {true && (
        <div className="card" style={{ padding: '20px', background: 'white', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
          {/* Month nav — previously there were no arrows here, so HR
              couldn't reach any month earlier than "today". The two
              buttons below let HR step back/forward; the "Calendar
              View" label that used to live in the corner is moved to
              the right side of the header so the row stays balanced. */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => {
                  if (viewMonth === 0) {
                    setViewMonth(11);
                    setViewYear((y) => y - 1);
                  } else {
                    setViewMonth((m) => m - 1);
                  }
                  setSelectedDay(1);
                }}
                style={{
                  width: 28, height: 28, borderRadius: 8,
                  border: '1px solid var(--border-color)',
                  background: '#fff', color: '#0F172A',
                  cursor: 'pointer', display: 'inline-flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, lineHeight: 1,
                }}
              >‹</button>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text-main)' }}>{monthLabel}</h3>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => {
                  // Block navigation beyond the current month — there are
                  // no future logs to view.
                  const cur = new Date();
                  if (viewYear > cur.getFullYear() || (viewYear === cur.getFullYear() && viewMonth >= cur.getMonth())) return;
                  if (viewMonth === 11) {
                    setViewMonth(0);
                    setViewYear((y) => y + 1);
                  } else {
                    setViewMonth((m) => m + 1);
                  }
                  setSelectedDay(1);
                }}
                style={{
                  width: 28, height: 28, borderRadius: 8,
                  border: '1px solid var(--border-color)',
                  background: '#fff', color: '#0F172A',
                  cursor: 'pointer', display: 'inline-flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, lineHeight: 1,
                }}
              >›</button>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-light)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Calendar View</span>
          </div>
          <div className="mini-calendar" style={{ padding: 0 }}>
            <div className="cal-grid" style={{ gap: '6px' }}>
              {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
                <div className="cal-day-label" key={d} style={{ fontSize: '10px', fontWeight: '800', color: 'var(--text-light)', textAlign: 'center', marginBottom: '4px' }}>{d}</div>
              ))}
              {calendarGrid.map((day, idx) => {
                if (!day) return <div key={idx} className="cal-day empty" />;
                const isSelected = selectedDay === day;

                return (
                  <div
                    key={idx}
                    className={`cal-day ${isSelected ? 'present' : ''}`}
                    onClick={() => {
                      setSelectedDay(day);
                      showNotification(`Loading logs for ${MONTH_NAMES[viewMonth]} ${day < 10 ? `0${day}` : day}, ${viewYear}`, "info");
                    }}
                    style={isSelected ? {
                      background: 'var(--primary)',
                      color: 'white',
                      border: '2px solid var(--primary-dark)',
                      transform: 'scale(1.05)',
                      boxShadow: '0 4px 10px rgba(76, 170, 23, 0.25)',
                      cursor: 'pointer'
                    } : {
                      cursor: 'pointer'
                    }}
                  >
                    <span className="day-num" style={isSelected ? { color: 'white' } : {}}>{day}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Status Legend removed per HR request — per-day status dots
              belong to a single employee's calendar (ERM Mobile / ERM
              Web), not the HR-wide attendance view. */}
        </div>
        )}

        {/* Inline employee-detail panel. Re-enabled after HR feedback —
            HR wants to see the clicked-row's profile (name, status,
            check-in/out, monthly overview, contact) right next to the
            Daily Logs table without leaving the page. The panel is
            now hidden until a row is clicked instead of being gated
            by `{false && …}` (the previous gate meant Suriya's data
            stayed pinned forever because nothing could ever swap it). */}
        {selectedLog && (
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: '0 4px 12px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Panel Header */}
          <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-main)' }}>
            <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Employee Detail</div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)', marginTop: '2px' }}>
              {selectedLog ? selectedLog.name : 'Select a row'}
            </div>
          </div>

          {!selectedLog ? (
            /* Empty state */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 20px', gap: '10px', minHeight: '320px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--bg-main)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <UserCheck size={22} color="var(--text-muted)" />
              </div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center' }}>Click any employee row to view details</div>
              <div style={{ fontSize: '11px', color: 'var(--text-light)', textAlign: 'center', lineHeight: '1.5' }}>Check-in time, status, monthly overview and contact info will appear here.</div>
            </div>
          ) : (
            /* Filled state */
            <div style={{ overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

              {/* Avatar + Name */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--bg-main)', borderRadius: '10px', padding: '12px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: selectedLog.color + '20', color: selectedLog.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 800, flexShrink: 0 }}>
                  {selectedLog.initials}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedLog.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>{selectedLog.role}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-light)' }}>{selectedLog.employeeId || `EMP-100${selectedLog.id}`}</div>
                </div>
              </div>

              {/* Status */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 12px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>Status</span>
                <span className={`dash-emp-status ${
                  selectedLog.status === 'Present' ? 'present' :
                  selectedLog.status === 'Late' ? 'late' :
                  selectedLog.status === 'Absent' ? 'on-leave' : 'permission'
                }`} style={{ fontWeight: 800, fontSize: '10px' }}>
                  {selectedLog.status}
                </span>
              </div>

              {/* Time tiles 2x2 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {[
                  { label: 'Check In', value: selectedLog.checkIn, color: '#4CAA17', bg: '#F1F9EE', border: '#C2E7B0' },
                  { label: 'Check Out', value: selectedLog.checkOut, color: '#4299E1', bg: '#EBF8FF', border: '#BEE3F8' },
                  { label: 'Work Hours', value: selectedLog.workHours, color: '#9F7AEA', bg: '#F5F3FF', border: '#DDD6FE' },
                  { label: 'Date', value: `${MONTH_NAMES[viewMonth].slice(0,3)} ${selectedDay < 10 ? `0${selectedDay}` : selectedDay}`, color: '#ECC94B', bg: '#FFFBEB', border: '#FDE68A' },
                ].map(item => (
                  <div key={item.label} style={{ background: item.bg, border: `1px solid ${item.border}`, borderRadius: '8px', padding: '10px' }}>
                    <div style={{ fontSize: '9px', fontWeight: 800, color: item.color, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>{item.label}</div>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)' }}>{item.value}</div>
                  </div>
                ))}
              </div>

              {/* Monthly overview */}
              <div style={{ background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px' }}>
                <div style={{ fontSize: '9px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Monthly Overview</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {[
                    { label: 'Present',    value: monthlyOverview.present,    color: '#4CAA17' },
                    { label: 'Late',       value: monthlyOverview.late,       color: '#ECC94B' },
                    { label: 'Absent',   value: monthlyOverview.leave,      color: '#FC8181' },
                    { label: 'Permission', value: monthlyOverview.permission, color: '#9F7AEA' },
                  ].map(item => (
                    <div key={item.label}>
                      <div style={{ fontSize: '9px', color: 'var(--text-light)', fontWeight: 600 }}>{item.label}</div>
                      <div style={{ fontSize: '16px', fontWeight: 800, color: item.color }}>{item.value} <span style={{ fontSize: '9px', color: 'var(--text-light)', fontWeight: 600 }}>days</span></div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Contact */}
              <div style={{ background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px' }}>
                <div style={{ fontSize: '9px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Contact Info</div>
                {[
                  { label: 'Email', value: selectedLog.email || `${selectedLog.name.split(' ')[0].toLowerCase()}@company.com` },
                  { label: 'Department', value: selectedLog.dept || 'Engineering' },
                  { label: 'ID', value: selectedLog.employeeId || `EMP-100${selectedLog.id}` },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{item.label}</span>
                    <span style={{ color: 'var(--text-main)', fontWeight: 700, textAlign: 'right', maxWidth: '60%', wordBreak: 'break-all' }}>{item.value}</span>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setSelectedLog(null)}
                  style={{ flex: 1, padding: '8px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '7px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', color: 'var(--text-muted)' }}
                >← Back to calendar</button>
                <button
                  onClick={handleExportEmployeeReport}
                  style={{ flex: 1, padding: '8px', background: 'var(--primary)', border: 'none', borderRadius: '7px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', color: 'white' }}
                >Export</button>
              </div>
            </div>
          )}
        </div>
        )}

        {/* Right Column: Attendance Records for Selected Day */}
        <div className="emp-table-card" style={{ margin: 0 }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text-main)' }}>
                Daily Logs: {MONTH_NAMES[viewMonth]} {selectedDay < 10 ? `0${selectedDay}` : selectedDay}, {viewYear}
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: 'var(--text-light)' }}>
                Visualizing attendance detail for the selected calendar date.
              </p>
            </div>


          </div>

          {/* Filters & Search Row */}
          <div className="announcement-filters" style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
            <div className="topbar-search" style={{ flex: '0 0 260px', maxWidth: '260px' }}>
              <Search size={13} />
              <input
                placeholder="Search by name, ID, role or dept…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ fontSize: '12px' }}
              />
            </div>

            {/* Summary Badges acting as Filters */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {[
                { id: 'present', label: 'Present', count: stats.present, bg: '#F1F9EE', color: '#4CAA17', border: '#C2E7B0' },
                { id: 'late', label: 'Late', count: stats.late, bg: '#FEF3C7', color: '#D97706', border: '#FEF3C7' },
                { id: 'leave', label: 'Absent', count: stats.leave, bg: '#FFF5F5', color: '#FC8181', border: '#FED7D7' },
                { id: 'permission', label: 'Perm', count: stats.permission, bg: '#F5F3FF', color: '#9F7AEA', border: '#DDD6FE' }
              ].map(filter => (
                <button
                  key={filter.id}
                  onClick={() => setFilterStatus(prev => prev === filter.id ? 'all' : filter.id)}
                  style={{
                    fontSize: '10.5px',
                    fontWeight: 800,
                    padding: '4px 10px',
                    borderRadius: '6px',
                    background: filter.bg,
                    color: filter.color,
                    border: `1px solid ${filter.border}`,
                    cursor: 'pointer',
                    opacity: filterStatus === 'all' || filterStatus === filter.id ? 1 : 0.5,
                    transform: filterStatus === filter.id ? 'scale(1.05)' : 'scale(1)',
                    transition: 'all 0.2s',
                    outline: 'none'
                  }}
                >
                  {filter.label}: {filter.count}
                </button>
              ))}
            </div>
          </div>
          <div style={{ overflowX: 'auto', maxHeight: '440px', overflowY: 'auto' }}>
            <table className="emp-table">
              <tbody>
                {displayLogs.map(log => (
                  <tr
                    key={log.id}
                    // Row click drives the inline employee panel above.
                    // Without this handler the panel was permanently
                    // empty (or — in earlier builds — stuck on whichever
                    // record happened to be the default seed), which
                    // looked exactly like the "Suriya for everyone"
                    // bug HR reported.
                    onClick={() => setSelectedLog(log)}
                    style={{
                      cursor: 'pointer',
                      background: selectedLog?.id === log.id ? 'rgba(76, 170, 23, 0.06)' : 'transparent',
                    }}
                  >
                    <td style={{ verticalAlign: 'middle' }}>
                      <div className="emp-table-user">
                        <div className="emp-table-avatar" style={{ background: (log.color || '#4299E1') + '15', color: log.color || '#4299E1', width: '32px', height: '32px', fontSize: '11px', flexShrink: 0 }}>
                          {log.initials}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div className="emp-table-name" style={{ color: 'var(--primary)' }}>{log.name}</div>
                          <div className="emp-table-role" style={{ fontSize: '10.5px', color: 'var(--text-light)', marginTop: '1px' }}>
                            {log.employeeId} • {log.role}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td><div className="emp-table-email" style={{ fontWeight: 600 }}>{log.checkIn}</div></td>
                    <td><div className="emp-table-email" style={{ fontWeight: 600 }}>{log.checkOut}</div></td>
                    <td><div className="emp-table-email" style={{ fontWeight: 700 }}>{log.workHours}</div></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          display: 'inline-block', padding: '4px 10px', borderRadius: 12,
                          fontSize: 11, fontWeight: 700,
                          // 'Half Day (early checkout without permission, counts
                          // toward LOP) gets its own amber pill so HR can tell
                          // it apart from the purple 'Permission' pill at a glance.
                          background: log.status === 'Present'    ? '#ECFDF5'
                                    : log.status === 'Late'       ? '#FFFBEB'
                                    : log.status === 'Absent'     ? '#FEF2F2'
                                    : log.status === 'Permission' ? '#F5F3FF'
                                    : log.status === 'Half Day'   ? '#FEF3C7'
                                    : '#F1F5F9',
                          color:      log.status === 'Present'    ? '#16A34A'
                                    : log.status === 'Late'       ? '#D97706'
                                    : log.status === 'Absent'     ? '#DC2626'
                                    : log.status === 'Permission' ? '#7C3AED'
                                    : log.status === 'Half Day'   ? '#B45309'
                                    : '#64748B',
                        }}>
                          {log.status}
                        </span>
                        {log.status === 'Absent' && !log._synthetic && log.checkIn && log.checkIn !== '--:--' && (
                          <button
                            type="button"
                            disabled={pendingMarked.has(log.employeeId)}
                            onClick={async (e) => {
                              e.stopPropagation();
                              // #398 — Guard against double-clicks while a
                              // mark is in flight for this same employee.
                              if (pendingMarked.has(log.employeeId)) return;
                              const ok = await confirm({
                                title: 'Mark as Present?',
                                message: `Change ${log.name}'s attendance status for the selected date to Present. This will overwrite the current Absent record.`,
                                confirmLabel: 'Mark Present',
                                cancelLabel: 'Cancel',
                              });
                              if (!ok) return;

                              // #398 — Enter pending state IMMEDIATELY so the
                              // button flips to "Presenting…" (disabled) and
                              // any subsequent refresh knows to preserve the
                              // local Present override for this employee.
                              // #406 — Also write the ref synchronously so
                              // the setTimeout merge helper below sees the
                              // fresh value (React state closure sees stale).
                              setPendingMarked(prev => {
                                const next = new Map(prev);
                                next.set(log.employeeId, Date.now());
                                return next;
                              });
                              pendingMarkedRef.current.set(log.employeeId, Date.now());

                              try {
                                const dateStr = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(selectedDay).padStart(2,'0')}`;
                                const r = await fetch(`${API}/attendance/mark-status`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    employeeId: log.employeeId,
                                    date: dateStr,
                                    status: 'present',
                                    note: 'HR override — late check-in regularised',
                                  }),
                                });
                                const j = await r.json().catch(() => ({}));
                                if (!r.ok || !j?.success) throw new Error(j?.message || 'Failed');
                                showNotification(`Marked ${log.name} as Present`, 'success');
                                // #386 — OPTIMISTIC UPDATE. Flip this row's
                                // status to 'On Time' (the backend rep of
                                // "Present") in local state IMMEDIATELY so
                                // the badge changes without waiting for the
                                // refresh fetch.
                                setApiLogs(prev => (Array.isArray(prev) ? prev : []).map(row => {
                                  const sameEmp =
                                    (row.employeeId && log.employeeId && row.employeeId === log.employeeId) ||
                                    (row._id && log._id && row._id === log._id) ||
                                    (row.employeeName && log.name && row.employeeName === log.name);
                                  if (!sameEmp) return row;
                                  return { ...row, status: 'On Time' };
                                }));

                                const ds = fmtDate(selectedDay);
                                // #398 — Refresh AND merge, don't blindly
                                // replace. If the server hasn't caught up
                                // and still returns Absent for the marked
                                // employee, keep the local Present override.
                                // Only remove the override once the server
                                // itself confirms non-Absent (or after
                                // 30 s max, guarded below in the merge
                                // helper).
                                setTimeout(() => {
                                  fetch(`${API}/attendance/logs?date=${ds}`)
                                    .then(r => r.json())
                                    .then(data => {
                                      if (!data.success || !Array.isArray(data.data)) return;
                                      setApiLogs(prevLocal => {
                                        const localByEmp = new Map();
                                        (Array.isArray(prevLocal) ? prevLocal : []).forEach(l => {
                                          if (l.employeeId) localByEmp.set(l.employeeId, l);
                                        });
                                        return data.data.map(serverRow => {
                                          const empId = serverRow.employeeId;
                                          const localRow = empId ? localByEmp.get(empId) : null;
                                          // #406 — Read the ref, NOT the state closure.
                                          // pendingMarked state closure is captured at
                                          // click-time and misses this click's write,
                                          // so it always reads empty for the row we
                                          // just marked. The ref is updated synchronously
                                          // and is always current.
                                          const isPending = empId && pendingMarkedRef.current.has(empId);
                                          if (isPending && localRow && serverRow.status === 'Absent') {
                                            return { ...serverRow, status: localRow.status || 'On Time' };
                                          }
                                          if (isPending && serverRow.status !== 'Absent') {
                                            pendingMarkedRef.current.delete(empId);
                                            queueMicrotask(() => {
                                              setPendingMarked(prev => {
                                                const next = new Map(prev);
                                                next.delete(empId);
                                                return next;
                                              });
                                            });
                                          }
                                          return serverRow;
                                        });
                                      });
                                    })
                                    .catch(() => {});
                                  fetch(`${API}/dashboard/attendance-today?date=${ds}`)
                                    .then(r => r.json())
                                    .then(data => setRosterCounts(data?.success ? data.data : null))
                                    .catch(() => {});
                                }, 1200);

                                // #398 — Hard safety expiry: 30 s after the
                                // click, forcibly drop the pending flag
                                // even if the server never caught up.
                                // #406 — Also drop from the ref.
                                setTimeout(() => {
                                  pendingMarkedRef.current.delete(log.employeeId);
                                  setPendingMarked(prev => {
                                    const next = new Map(prev);
                                    next.delete(log.employeeId);
                                    return next;
                                  });
                                }, 30000);
                              } catch (err) {
                                setPendingMarked(prev => {
                                  const next = new Map(prev);
                                  next.delete(log.employeeId);
                                  return next;
                                });
                                showNotification('Could not mark Present: ' + (err.message || 'unknown'), 'error');
                              }
                            }}
                            style={{
                              background: pendingMarked.has(log.employeeId) ? '#94A3B8' : '#4CAA17',
                              color: '#fff',
                              border: 'none',
                              borderRadius: 6,
                              padding: '4px 10px',
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: pendingMarked.has(log.employeeId) ? 'not-allowed' : 'pointer',
                              opacity: pendingMarked.has(log.employeeId) ? 0.7 : 1,
                            }}
                          >
                            {pendingMarked.has(log.employeeId) ? 'Presenting…' : 'Mark Present'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {displayLogs.length === 0 && (
              <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
                No records for the selected day.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
