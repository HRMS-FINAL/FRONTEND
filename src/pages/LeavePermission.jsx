import React, { useState, useEffect } from 'react';
import {
  ChevronRight, Calendar, Clock, Search, Filter,
  User, ClipboardList, AlertCircle, Bookmark, Check, X, CalendarCheck, CalendarOff, FileText
} from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
// Reports for Leave & Permission (Jun 2026): wire jsPDF + xlsx so the
// header button generates a real downloadable file instead of just
// firing a toast. Same libraries the rest of the HRMS already uses.
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
// #303 — Shared branded template (logo, header, footer, polished table).
import { buildBrandedPdf, buildBrandedExcel } from '../utils/reportTemplate';

// Approved leaves & permissions from the mobile app arrive via HRMS backend
// proxy at /api/leave-requests?status=approved. The UI below is unchanged —
// only the data source switched. Hardcoded mock seed below stays as a
// fallback when the backend is unreachable, so the page still shows the
// original demo content offline.
import { API } from '../config/api';

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

export default function LeavePermission({ onBack }) {
  const { showNotification } = useNotification();
  const today = new Date();
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-indexed
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const [activeTab, setActiveTab] = useState('leave');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('');
  const monthLabel = `${MONTH_NAMES[viewMonth]} ${viewYear}`;

  // Directory records of active/approved leaves and permissions. Starts
  // empty — populated below from /api/leave-requests once it loads. The
  // historical mock seed is gone (it was producing ghost rows on a fresh
  // tenant). The structure of each record is preserved in the IIFE-style
  // helper below so the table renderer still gets the same shape.
  const [records, setRecords] = useState([]);
  const _hiddenMockSeed = [
    { 
      id: 1, 
      name: 'Liam Foster', 
      role: 'Frontend Developer',
      dept: 'Engineering',
      type: 'Sick Leave', 
      duration: '2 Days', 
      date: 'May 05 - May 06, 2024', 
      avatar: 'LF', 
      color: '#4299E1',
      reason: 'Suffering from severe viral fever and doctor recommended absolute bed rest.'
    },
    { 
      id: 2, 
      name: 'Zoe Martinez', 
      role: 'UX Designer',
      dept: 'Design',
      type: 'Annual Leave', 
      duration: '5 Days', 
      date: 'May 10 - May 15, 2024', 
      avatar: 'ZM', 
      color: '#9F7AEA',
      reason: 'Pre-planned family trip to visit grandparents and attend sibling wedding ceremony.'
    },
    { 
      id: 3, 
      name: 'Ryan Patel', 
      role: 'Product Manager',
      dept: 'Sales',
      type: 'Casual Leave', 
      duration: '1 Day', 
      date: 'May 12, 2024', 
      avatar: 'RP', 
      color: '#4CAA17',
      reason: 'Urgent banking work and land registrar office appointment at hometown.'
    },
    { 
      id: 4, 
      name: 'Emma Davis', 
      role: 'QA Engineer',
      dept: 'Engineering',
      type: 'Permission', 
      duration: '2 Hours', 
      date: 'May 02, 2024 (10:00 AM - 12:00 PM)', 
      avatar: 'ED', 
      color: '#ECC94B',
      reason: 'Routine quarterly dental checkup and orthodontic check.'
    },
    { 
      id: 5, 
      name: 'Alex Thompson', 
      role: 'Software Architect',
      dept: 'Engineering',
      type: 'Permission', 
      duration: '2 Hours', 
      date: 'May 04, 2024 (03:00 PM - 05:00 PM)', 
      avatar: 'AT', 
      color: '#FC8181',
      reason: 'Need to pick up children from school early due to half-day exam schedule.'
    },
    { 
      id: 6, 
      name: 'Sophia Carter', 
      role: 'UX Designer',
      dept: 'Design',
      type: 'Sick Leave', 
      duration: '3 Days', 
      date: 'May 20 - May 22, 2024', 
      avatar: 'SC', 
      color: '#48BB78',
      reason: 'Scheduled wisdom teeth extraction surgery and recovery period.'
    },
    { 
      id: 7, 
      name: 'James Wilson', 
      role: 'Operations Coordinator',
      dept: 'Operations',
      type: 'Permission', 
      duration: '2 Hours', 
      date: 'May 06, 2024 (09:00 AM - 11:00 AM)', 
      avatar: 'JW', 
      color: '#F6AD55',
      reason: 'Emergency car repair and maintenance service appointment.'
    },
    { 
      id: 8, 
      name: 'Ryan Patel', 
      role: 'Product Manager',
      dept: 'Sales',
      type: 'Late Arrival', 
      duration: '1 Hour', 
      date: 'May 20, 2024', 
      avatar: 'RP', 
      color: '#4CAA17',
      reason: 'Delayed due to unexpected traffic block on expressway.'
    },
    { 
      id: 9, 
      name: 'Emma Davis', 
      role: 'QA Engineer',
      dept: 'Engineering',
      type: 'Late Arrival', 
      duration: '45 Mins', 
      date: 'May 19, 2024', 
      avatar: 'ED', 
      color: '#ECC94B',
      reason: 'Doctor checkup ran late in the morning.'
    },
    { 
      id: 10, 
      name: 'Emma Davis', 
      role: 'QA Engineer',
      dept: 'Engineering',
      type: 'Permission', 
      duration: '2 Hours', 
      date: 'May 20, 2024 (10:00 AM - 12:00 PM)', 
      avatar: 'ED', 
      color: '#ECC94B',
      reason: 'Urgent dentist consultation.'
    }
  ];

  // Fetch approved records from the mobile backend (via HRMS proxy) on
  // mount and every 30s. On success we REPLACE the mock seed with real data.
  // If the fetch fails or returns empty, the page keeps showing the mock
  // seed so the demo still works offline.
  useEffect(() => {
    let cancelled = false;
    // Fetch approved leave/permission for the VIEWED month, keyed on the
    // request's own dates — so a request approved after its date passed
    // still shows on that date, and none drop off a recent-N cap.
    const mm   = String(viewMonth + 1).padStart(2, '0');
    const from = `${viewYear}-${mm}-01`;
    const lastDay = new Date(viewYear, viewMonth + 1, 0).getDate();
    const to   = `${viewYear}-${mm}-${String(lastDay).padStart(2, '0')}`;
    const load = async () => {
      try {
        const res  = await fetch(`${API}/leave-requests?status=approved&from=${from}&to=${to}`);
        const data = await res.json();
        if (!cancelled && data && Array.isArray(data.items)) {
          setRecords(data.items);
        }
      } catch { /* keep current records on screen */ }
    };
    load();
    const t = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [viewYear, viewMonth]);

  // Rewritten Jun 2026 — the old impl only looked at day numbers in the
  // formatted `date` string, so a May 15 record matched June 15 too
  // (any month's 15th lit up as "on leave"). Now we also derive the
  // record's MONTH + YEAR (preferring the raw startDate/endDate /
  // permissionDate fields the backend reshape sets) and only match if
  // the calendar's selected day falls inside the record's true range.
  // This lets HR navigate to any past month and see exactly who was
  // out that day.
  const isRecordActiveOnDay = (rec, day) => {
    // Prefer the raw ISO fields the backend reshape always sets.
    const startIso = rec.startDate || rec.permissionDate || '';
    const endIso   = rec.endDate   || rec.permissionDate || rec.startDate || '';
    if (startIso && /^\d{4}-\d{2}-\d{2}/.test(startIso)) {
      const s = new Date(startIso.slice(0, 10) + 'T00:00:00');
      const e = endIso && /^\d{4}-\d{2}-\d{2}/.test(endIso)
        ? new Date(endIso.slice(0, 10) + 'T00:00:00')
        : s;
      const target = new Date(viewYear, viewMonth, day);
      return target >= s && target <= e;
    }

    // Fallback for legacy / mock rows where only the formatted display
    // string exists. Still gated on month-name match so we don't bleed
    // across months any more.
    const dateStr = String(rec.date || '').toLowerCase();
    const monthName = MONTH_NAMES[viewMonth].toLowerCase();
    if (!dateStr.includes(monthName.slice(0, 3))) return false;
    const yearMatch = dateStr.match(/\b(\d{4})\b/);
    if (yearMatch && Number(yearMatch[1]) !== viewYear) return false;
    const dayPart = dateStr.split('(')[0].split(',')[0].trim();
    // Strip the year so it doesn't get treated as a day number.
    const matches = dayPart
      .replace(/\b\d{4}\b/g, '')
      .match(/\b\d+\b/g);
    if (!matches) return false;
    const dayNumbers = matches.map(Number);
    if (dayNumbers.length === 1) {
      return dayNumbers[0] === day;
    } else if (dayNumbers.length >= 2) {
      const start = Math.min(dayNumbers[0], dayNumbers[1]);
      const end = Math.max(dayNumbers[0], dayNumbers[1]);
      return day >= start && day <= end;
    }
    return false;
  };

  // Live calendar grid for the active month + year.
  const calendarGrid = React.useMemo(() => {
    const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();   // 0 = Sun
    const daysInMonth     = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDayOfMonth; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++)   cells.push(d);
    return cells;
  }, [viewYear, viewMonth]);

  const stats = React.useMemo(() => {
    const onLeave = records.filter(r => r.type.toLowerCase().includes('leave') && isRecordActiveOnDay(r, selectedDay)).length;
    const onPermission = records.filter(r => r.type.toLowerCase().includes('permission') && isRecordActiveOnDay(r, selectedDay)).length;
    return { onLeave, onPermission };
  }, [records, selectedDay]);

  const lpStats = React.useMemo(() => [
    { label: 'Absent', value: stats.onLeave, key: 'leave', color: '#FC8181', Icon: CalendarOff, badgeCount: 0, trend: `${MONTH_NAMES[viewMonth].slice(0,3)} ${selectedDay < 10 ? `0${selectedDay}` : selectedDay}` },
    { label: 'On Permission', value: stats.onPermission, key: 'permission', color: '#9F7AEA', Icon: Clock, badgeCount: 0, trend: `${MONTH_NAMES[viewMonth].slice(0,3)} ${selectedDay < 10 ? `0${selectedDay}` : selectedDay}` }
  ], [stats, selectedDay]);

  const displayRecords = React.useMemo(() => {
    return records.filter(item => {
      // 1. Check active day
      const matchesDay = isRecordActiveOnDay(item, selectedDay);
      if (!matchesDay) return false;

      // 2. Check search query
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.reason.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.role.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      // 3. Check status type matching
      // If filterType is active, it overrides activeTab type filter
      const targetType = filterType || activeTab;
      const matchesType = item.type.toLowerCase().includes(targetType.toLowerCase());

      return matchesType;
    });
  }, [records, activeTab, selectedDay, searchQuery, filterType]);

  const departments = ['late', 'permission', 'leave'];

  return (
    <div className="emp-list-page">
      <div className="emp-list-header">
        <div className="ne-breadcrumb">
          <span className="ne-breadcrumb-link" onClick={onBack}>Dashboard</span>
          <ChevronRight size={13} />
          <span>Leave & Permission</span>
        </div>
        <div className="emp-list-title-row">
          <div>
            <h1 className="ne-page-title">Leave & Permission Directory</h1>
            <p className="ne-page-sub">View list of employees currently on leave or out on permissions, and manage requests.</p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            {/* Split into Download PDF + Download Excel (#288). Single
                "Reports" button previously fired both at once which was
                confusing; HR usually wants one format at a time. */}
            <button
              className="ne-btn-secondary"
              onClick={() => {
                const rows = displayRecords.map((r) => ({
                  Employee:    r.name || r.employeeName || '—',
                  'Emp ID':    r.employeeId || r.id || '',
                  Role:        r.role || '',
                  Department:  r.dept || '',
                  Type:        r.type || '',
                  Duration:    r.duration || '',
                  'Date':      r.date || '',
                  Reason:      r.reason || '',
                  Status:      r.status || 'Approved',
                }));
                if (rows.length === 0) {
                  showNotification('No records to export for the current filter.', 'info');
                  return;
                }
                (async () => {
                  try {
                    const subtype = activeTab === 'leave' ? 'Leave' : 'Permission';
                    const periodMonth = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`;
                    const doc = await buildBrandedPdf({
                      title: `${subtype} Records`,
                      subtitle: `${MONTH_NAMES[viewMonth]} ${viewYear}  ·  ${rows.length} record${rows.length === 1 ? '' : 's'}`,
                      meta:  { date: periodMonth },
                      head:  Object.keys(rows[0]),
                      body:  rows.map((r) => Object.values(r)),
                      orientation: 'landscape',
                    });
                    doc.save(`leave-permission-${MONTH_NAMES[viewMonth]}-${viewYear}.pdf`);
                    showNotification(`Downloaded ${rows.length} records (PDF).`, 'success');
                  } catch (err) {
                    console.error('[LeavePermission] PDF error:', err);
                    showNotification('Could not generate PDF.', 'error');
                  }
                })();
              }}
            >
              <FileText size={16} /> Download PDF
            </button>
            <button
              className="ne-btn-secondary"
              onClick={() => {
                const rows = displayRecords.map((r) => ({
                  Employee:    r.name || r.employeeName || '—',
                  'Emp ID':    r.employeeId || r.id || '',
                  Role:        r.role || '',
                  Department:  r.dept || '',
                  Type:        r.type || '',
                  Duration:    r.duration || '',
                  'Date':      r.date || '',
                  Reason:      r.reason || '',
                  Status:      r.status || 'Approved',
                }));
                if (rows.length === 0) {
                  showNotification('No records to export for the current filter.', 'info');
                  return;
                }
                try {
                  const subtype = activeTab === 'leave' ? 'Leave' : 'Permission';
                  const periodMonth = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`;
                  const head = Object.keys(rows[0]);
                  const body = rows.map((r) => Object.values(r));
                  const wb = buildBrandedExcel({
                    title:    `${subtype} Records`,
                    subtitle: `${MONTH_NAMES[viewMonth]} ${viewYear}`,
                    meta:     { date: periodMonth },
                    head, body,
                  });
                  XLSX.writeFile(wb, `leave-permission-${MONTH_NAMES[viewMonth]}-${viewYear}.xlsx`);
                  showNotification(`Downloaded ${rows.length} records (Excel).`, 'success');
                } catch (err) {
                  console.error('[LeavePermission] Excel error:', err);
                  showNotification('Could not generate Excel.', 'error');
                }
              }}
            >
              <FileText size={16} /> Download Excel
            </button>
          </div>
        </div>
      </div>

      <div className="stats-row" style={{ marginTop: '20px' }}>
        {lpStats.map(s => {
          const isActiveFilter = activeTab === s.key;
          return (
            <div 
              className={`stat-card attendance-stat-card ${isActiveFilter ? 'active-filter' : ''}`} 
              key={s.label}
              onClick={() => setActiveTab(s.key)}
              style={{ cursor: 'pointer' }}
            >
              <div className="stat-card-top">
                <div className="stat-icon-wrap" style={{ background: s.color + '15' }}>
                  <s.Icon size={18} color={s.color} />
                </div>
                {s.badgeCount > 0 ? (
                  <div className="stat-trend-badge down" style={{ fontSize: '10.5px', padding: '2px 8px', background: '#FC8181', color: 'white', fontWeight: '800' }}>
                    {s.badgeCount} Pending
                  </div>
                ) : (
                  <div className={`stat-trend-badge up`} style={{ fontSize: '10px', padding: '2px 8px' }}>{s.trend}</div>
                )}
              </div>
              <div>
                <div className="stat-value">{s.value}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="attendance-logs-container" style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '24px', marginTop: '20px', alignItems: 'start' }}>
        
        {/* Left Column: Interactive Calendar Card */}
        <div className="card" style={{ padding: '20px', background: 'white', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
            {/* Month navigator — added Jun 2026 so HR can browse past
                months and see who was on leave / permission on any
                given day. Today button jumps back to the current month
                and selects today's day. */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <button
                onClick={() => {
                  // Step one month back. December wraps the year.
                  if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
                  else { setViewMonth(viewMonth - 1); }
                  setSelectedDay(1);
                }}
                style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border-color)', background: '#fff', cursor: 'pointer', fontWeight: 700, color: 'var(--text-main)' }}
                title="Previous month"
              >‹</button>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text-main)' }}>{monthLabel}</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {(viewMonth !== today.getMonth() || viewYear !== today.getFullYear()) && (
                  <button
                    onClick={() => { setViewMonth(today.getMonth()); setViewYear(today.getFullYear()); setSelectedDay(today.getDate()); }}
                    style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, color: 'var(--primary)', background: 'var(--primary-light)', border: '1px solid var(--primary)', cursor: 'pointer' }}
                  >Today</button>
                )}
                <button
                  onClick={() => {
                    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
                    else { setViewMonth(viewMonth + 1); }
                    setSelectedDay(1);
                  }}
                  style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border-color)', background: '#fff', cursor: 'pointer', fontWeight: 700, color: 'var(--text-main)' }}
                  title="Next month"
                >›</button>
              </div>
            </div>
            <div className="mini-calendar" style={{ padding: 0 }}>
              <div className="cal-grid" style={{ gap: '6px' }}>
                {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
                  <div className="cal-day-label" key={d} style={{ fontSize: '10px', fontWeight: '800', color: 'var(--text-light)', textAlign: 'center', marginBottom: '4px' }}>{d}</div>
                ))}
                {calendarGrid.map((day, idx) => {
                  if (!day) return <div key={idx} className="cal-day empty" />;
                  const isSelected = selectedDay === day;
                  
                  // Compute dynamic dots based on active leaves, permissions, and late arrivals
                  const hasLeave = records.some(r => r.type.toLowerCase().includes('leave') && isRecordActiveOnDay(r, day));
                  const hasPermission = records.some(r => r.type.toLowerCase().includes('permission') && isRecordActiveOnDay(r, day));
                  const hasLate = records.some(r => r.type.toLowerCase().includes('late') && isRecordActiveOnDay(r, day));

                  return (
                    <div 
                      key={idx} 
                      className={`cal-day ${isSelected ? 'present' : ''}`}
                      onClick={() => {
                        setSelectedDay(day);
                        showNotification(`Viewing leaves & permissions for ${MONTH_NAMES[viewMonth]} ${day < 10 ? `0${day}` : day}, ${viewYear}`, "info");
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
                      {/* Per HR (Jun 2026 brief): status dots removed from each
                          day — the table below already tells the whole story
                          and the dots were just visual clutter. */}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Status legend removed — the dot indicators it explained are
                gone too (Jun 2026 HR brief: keep the calendar clean). */}
          </div>

        {/* Right Column: Attendance Records or Requests */}
        <div className="emp-table-card" style={{ margin: 0 }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text-main)' }}>
                {activeTab === 'leave' && `Employees on Leave: ${MONTH_NAMES[viewMonth]} ${selectedDay < 10 ? `0${selectedDay}` : selectedDay}, ${viewYear}`}
                {activeTab === 'permission' && `Employees on Permission: ${MONTH_NAMES[viewMonth]} ${selectedDay < 10 ? `0${selectedDay}` : selectedDay}, ${viewYear}`}
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: 'var(--text-light)' }}>
                Showing active records matching selected calendar date.
              </p>
            </div>
            
            {/* Summary Badges */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 800, padding: '4px 10px', borderRadius: '6px', background: '#FFF5F5', color: '#FC8181', border: '1px solid #FED7D7' }}>
                Absent: {stats.onLeave}
              </span>
              <span style={{ fontSize: '10.5px', fontWeight: 800, padding: '4px 10px', borderRadius: '6px', background: '#F5F3FF', color: '#9F7AEA', border: '1px solid #DDD6FE' }}>
                Permission: {stats.onPermission}
              </span>
            </div>
          </div>

          {/* Filters & Search Row */}
          <div className="announcement-filters" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="topbar-search" style={{ flex: 1, maxWidth: '280px' }}>
              <Search size={14} />
              <input 
                placeholder="Search name, role or reason..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            {/* Inline Status Filter Tabs */}
            <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-main)', padding: '3px', borderRadius: '8px' }}>
              {departments.map(dept => (
                <button
                  key={dept}
                  onClick={() => setFilterType(prev => prev === dept ? '' : dept)}
                  style={{
                    border: 'none',
                    background: filterType === dept ? 'white' : 'transparent',
                    color: filterType === dept ? 'var(--primary)' : 'var(--text-muted)',
                    padding: '6px 12px',
                    fontSize: '11px',
                    fontWeight: '700',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    boxShadow: filterType === dept ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                    textTransform: 'capitalize'
                  }}
                >
                  {dept}
                </button>
              ))}
            </div>
          </div>

          {/* Page-level scroll — no inner cap. HR can see every row without
              the 440px viewport cramping the table. */}
          <div style={{ overflowX: 'auto' }}>
            <table className="emp-table">
              <thead>
                <tr>
                  <th style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5, boxShadow: 'inset 0 -1px 0 var(--border-color)' }}>Employee</th>
                  <th style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5, boxShadow: 'inset 0 -1px 0 var(--border-color)' }}>Type</th>
                  <th style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5, boxShadow: 'inset 0 -1px 0 var(--border-color)' }}>Duration</th>
                  <th style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5, boxShadow: 'inset 0 -1px 0 var(--border-color)' }}>Date Range</th>
                  <th style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5, boxShadow: 'inset 0 -1px 0 var(--border-color)', width: '25%' }}>Reason</th>
                  <th style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5, boxShadow: 'inset 0 -1px 0 var(--border-color)' }}>Manager Status</th>
                  <th style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5, boxShadow: 'inset 0 -1px 0 var(--border-color)', textAlign: 'right' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {displayRecords.map(rec => (
                  <tr key={rec.id}>
                    <td>
                      <div className="emp-table-user">
                        <div className="emp-table-avatar" style={{ background: rec.color + '15', color: rec.color, width: '32px', height: '32px', fontSize: '11px', fontWeight: 'bold' }}>
                          {rec.avatar}
                        </div>
                        <div>
                          <div className="emp-table-name">{rec.name}</div>
                          <div className="emp-table-role" style={{ fontSize: '11px', color: 'var(--text-light)', marginTop: '2px' }}>
                            {rec.role} • {rec.dept}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td><div className="emp-table-email" style={{ fontWeight: 700, fontSize: '11.5px' }}>{rec.type}</div></td>
                    <td>
                      <div style={{ fontWeight: 700, fontSize: '11.5px', color: 'var(--text-main)' }}>{rec.duration}</div>
                      {rec.type && rec.type.toLowerCase().includes('permission') && rec.date && rec.date.includes('(') && (
                        <div style={{ fontSize: '10px', color: 'var(--text-light)', marginTop: '3px', fontWeight: 600 }}>
                          🕐 {rec.date.match(/\(([^)]+)\)/)?.[1]}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '11px', color: 'var(--text-muted)' }}>
                        {rec.type && rec.type.toLowerCase().includes('permission')
                          ? rec.date.split('(')[0].trim()
                          : rec.date}
                      </div>
                      {rec.requestedAt && (
                        <div style={{ fontSize: '10px', color: 'var(--text-light)', marginTop: '3px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <span style={{ fontSize: '9px' }}>📩</span> Requested: {rec.requestedAt}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontSize: '11px', color: 'var(--text-main)', lineHeight: '1.4', fontWeight: 500, whiteSpace: 'normal', wordBreak: 'break-word' }}>
                        {rec.reason}
                      </div>
                    </td>
                    <td>
                      <span style={{
                        fontWeight: 800,
                        fontSize: '10px',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        background: rec.status === 'Rejected' ? '#FFF5F5' : '#F1F9EE',
                        color: rec.status === 'Rejected' ? '#FC8181' : '#4CAA17',
                        border: rec.status === 'Rejected' ? '1px solid #FED7D7' : '1px solid #C2E7B0',
                        display: 'inline-block'
                      }}>
                        {rec.status || 'Approved'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span style={{
                        fontWeight: 800,
                        fontSize: '10px',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        background: rec.status === 'Rejected' ? '#FFF5F5' : '#F1F9EE',
                        color: rec.status === 'Rejected' ? '#FC8181' : '#4CAA17',
                        border: rec.status === 'Rejected' ? '1px solid #FED7D7' : '1px solid #C2E7B0',
                        display: 'inline-block'
                      }}>
                        {rec.status || 'Approved'}
                      </span>
                    </td>
                  </tr>
                ))}
                {displayRecords.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-light)' }}>
                      No matching records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
