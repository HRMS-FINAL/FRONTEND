import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronRight, Calendar, Check, X, Clock,
  Search, Filter, CalendarCheck, FileText,
  UserCheck, CalendarOff, AlertTriangle
} from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { allEmployees } from '../data/mockData';

import { API } from '../config/api';

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

export default function Attendance({ onBack, employees = [] }) {
  const { showNotification } = useNotification();
  const today = new Date();
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-indexed
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedLog, setSelectedLog] = useState(null);
  const [apiLogs, setApiLogs] = useState([]);

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
      // 'On Time' → 'Present' for the badge; 'Absent' → 'On Leave';
      // 'Half Day' is now distinct from 'Permission' (Jun 2026 — policy fix). 'Permission' = filed permission request; 'Half Day' = early checkout without permission (counts toward LOP).
      status: log.status === 'On Time' ? 'Present' : log.status === 'Absent' ? 'On Leave' : log.status,
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

      if (status === 'On Leave') {
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
        const norm = (s) => s === 'On Time' ? 'Present' : s === 'Absent' ? 'On Leave' : s;
        // Present count folds Late in (employee did come in); the Late
        // figure is preserved separately so the monthly view can still
        // surface it.
        setMonthlyOverview({
          present:    mine.filter(l => norm(l.status) === 'Present' || norm(l.status) === 'Late').length,
          late:       mine.filter(l => norm(l.status) === 'Late').length,
          leave:      mine.filter(l => norm(l.status) === 'On Leave').length,
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
        const norm = (s) => s === 'On Time' ? 'Present' : s === 'Absent' ? 'On Leave' : s;
        const doc = new jsPDF({ unit: 'pt', format: 'a4' });
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text(`Attendance Report — ${selectedLog.name}`, 40, 50);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text(`${monthLabel} • ${selectedLog.employeeId || ''}`, 40, 70);
        autoTable(doc, {
          startY: 90,
          head: [['Date', 'Status', 'Check In', 'Check Out', 'Work Hours']],
          body: mine.map(l => [l.date || '', norm(l.status), l.checkIn || '--', l.checkOut || '--', l.workHours || '0h']),
          styles:     { fontSize: 10, cellPadding: 6 },
          headStyles: { fillColor: [76, 170, 23], textColor: 255, fontStyle: 'bold' },
          theme:      'grid',
        });
        const safe = (selectedLog.name || 'employee').replace(/[^\w]+/g, '_');
        doc.save(`Attendance_${safe}_${monthLabel.replace(/\s+/g, '_')}.pdf`);
        showNotification('Attendance report downloaded.', 'success');
      })
      .catch(err => showNotification('Could not build report: ' + (err?.message || 'unknown'), 'error'));
  };

  // Stats for the selected day.
  // Present INCLUDES late — the employee did show up, they were just late.
  // Late is also surfaced separately so HR can see how many of them crossed
  // the 10:01 AM cut-off.
  const stats = React.useMemo(() => {
    const onlyPresent = dailyLogs.filter(l => l.status === 'Present').length;
    const late        = dailyLogs.filter(l => l.status === 'Late').length;
    const leave       = dailyLogs.filter(l => l.status === 'On Leave').length;
    const permission  = dailyLogs.filter(l => l.status === 'Permission').length;
    return { present: onlyPresent + late, late, leave, permission };
  }, [dailyLogs]);

  // Dynamic Attendance Summary cards based on selected day and filters
  const attStats = React.useMemo(() => [
    { label: 'Present', value: stats.present, trend: `${MONTH_NAMES[viewMonth].slice(0,3)} ${selectedDay < 10 ? `0${selectedDay}` : selectedDay}`, type: 'up', color: '#4CAA17', Icon: UserCheck },
    { label: 'On Leave', value: stats.leave, trend: `${MONTH_NAMES[viewMonth].slice(0,3)} ${selectedDay < 10 ? `0${selectedDay}` : selectedDay}`, type: 'down', color: '#FC8181', Icon: CalendarOff },
    { label: 'Permission', value: stats.permission, trend: `${MONTH_NAMES[viewMonth].slice(0,3)} ${selectedDay < 10 ? `0${selectedDay}` : selectedDay}`, type: 'up', color: '#9F7AEA', Icon: Clock },
    { label: 'Late', value: stats.late, trend: `${MONTH_NAMES[viewMonth].slice(0,3)} ${selectedDay < 10 ? `0${selectedDay}` : selectedDay}`, type: 'up', color: '#ECC94B', Icon: AlertTriangle },
  ], [stats, selectedDay]);

  const getFilterKey = (label) => {
    if (label === 'Present') return 'present';
    if (label === 'On Leave') return 'leave';
    if (label === 'Permission') return 'permission';
    if (label === 'Late') return 'late';
    return 'all';
  };

  const handleCardClick = (label) => {
    const key = getFilterKey(label);
    setFilterStatus(prev => prev === key ? 'all' : key);
  };

  // Filtering based on search and sub-tab selection.
  // Defensive: any missing field would previously crash the .toLowerCase()
  // call and silently leave the table unfiltered. Default all strings first.
  const displayLogs = dailyLogs.filter(log => {
    const q = String(searchQuery || '').trim().toLowerCase();
    const name = String(log?.name        || '').toLowerCase();
    const eid  = String(log?.employeeId  || '').toLowerCase();
    const role = String(log?.role        || '').toLowerCase();
    const dept = String(log?.department  || '').toLowerCase();
    const matchesSearch = !q || name.includes(q) || eid.includes(q) || role.includes(q) || dept.includes(q);

    if (!matchesSearch) return false;

    if (filterStatus === 'all') return true;
    // Present pill now includes late rows so the count + the rows match.
    if (filterStatus === 'present') return log.status === 'Present' || log.status === 'Late';
    if (filterStatus === 'late') return log.status === 'Late';
    if (filterStatus === 'leave') return log.status === 'On Leave';
    if (filterStatus === 'permission') return log.status === 'Permission';
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
                  const dateLabel = `${selectedDay}-${months[selectedMonth] || ''}-${selectedYear}`;
                  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
                  doc.setFontSize(16);
                  doc.setFont('helvetica', 'bold');
                  doc.text('Attendance Log', 40, 50);
                  doc.setFontSize(11);
                  doc.setFont('helvetica', 'normal');
                  doc.setTextColor(100, 116, 139);
                  doc.text(`Date: ${dateLabel}`, 40, 68);
                  autoTable(doc, {
                    startY: 86,
                    head: [['Emp ID', 'Name', 'Role', 'Department', 'Check In', 'Check Out', 'Work Hours', 'Status']],
                    body: rows.map(r => [
                      r.employeeId || '', r.name || '',
                      r.role || r.designation || '',
                      r.department || r.dept || '',
                      r.checkIn || '--', r.checkOut || '--',
                      r.workHours || '0h', r.status || '',
                    ]),
                    styles:     { fontSize: 9, cellPadding: 5 },
                    headStyles: { fillColor: [76, 170, 23], textColor: 255, fontStyle: 'bold' },
                    theme:      'grid',
                  });
                  doc.save(`attendance_${dateLabel}.pdf`);
                  showNotification('Attendance PDF downloaded.', 'success');
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
                  const rows = (Array.isArray(displayLogs) && displayLogs.length)
                    ? displayLogs
                    : (Array.isArray(dailyLogs) ? dailyLogs : []);
                  console.log('[Attendance Excel] rows:', rows.length);
                  if (!rows.length) {
                    showNotification('No attendance records to export.', 'info');
                    return;
                  }
                  const dateLabel = `${selectedDay}-${months[selectedMonth] || ''}-${selectedYear}`;
                  const sheet = rows.map(r => ({
                    'Emp ID':     r.employeeId || '',
                    'Name':       r.name || '',
                    'Role':       r.role || r.designation || '',
                    'Department': r.department || r.dept || '',
                    'Check In':   r.checkIn || '',
                    'Check Out':  r.checkOut || '',
                    'Work Hours': r.workHours || '0h',
                    'Status':     r.status || '',
                  }));
                  const wb = XLSX.utils.book_new();
                  const ws = XLSX.utils.json_to_sheet(sheet);
                  XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
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
                  selectedLog.status === 'On Leave' ? 'on-leave' : 'permission'
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
                    { label: 'On Leave',   value: monthlyOverview.leave,      color: '#FC8181' },
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
                { id: 'leave', label: 'Leave', count: stats.leave, bg: '#FFF5F5', color: '#FC8181', border: '#FED7D7' },
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
                      <span style={{
                        display: 'inline-block', padding: '4px 10px', borderRadius: 12,
                        fontSize: 11, fontWeight: 700,
                        // 'Half Day' (early checkout without permission, counts
                        // toward LOP) gets its own amber pill so HR can tell
                        // it apart from the purple 'Permission' pill at a glance.
                        background: log.status === 'Present'    ? '#ECFDF5'
                                  : log.status === 'Late'       ? '#FFFBEB'
                                  : log.status === 'On Leave'   ? '#FEF2F2'
                                  : log.status === 'Permission' ? '#F5F3FF'
                                  : log.status === 'Half Day'   ? '#FEF3C7'
                                  : '#F1F5F9',
                        color:      log.status === 'Present'    ? '#16A34A'
                                  : log.status === 'Late'       ? '#D97706'
                                  : log.status === 'On Leave'   ? '#DC2626'
                                  : log.status === 'Permission' ? '#7C3AED'
                                  : log.status === 'Half Day'   ? '#B45309'
                                  : '#64748B',
                      }}>
                        {log.status}
                      </span>
    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {dailyLogs.length === 0 && (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-light)', fontSize: 13 }}>
                No records for {MONTH_NAMES[viewMonth]} {String(selectedDay).padStart(2, '0')}, {viewYear}.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
