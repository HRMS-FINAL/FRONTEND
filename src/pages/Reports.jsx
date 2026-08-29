import React, { useState, useEffect } from 'react';
import {
  ChevronRight, Users, Calendar,
  Download, TrendingUp, Clock,
  Table as TableIcon, CheckCircle, XCircle,
  AlertCircle
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { API } from '../config/api';
import logoHrm from '../assets/logo-hrm.png';

// ── Report definitions ────────────────────────────────────────────
const REPORT_TYPES = [
  {
    id: 'employee',
    label: 'Employee Master',
    icon: Users,
    color: '#4299E1',
    bg: '#EBF4FD',
    desc: 'Full workforce headcount, department distribution and status overview.'
  },
  {
    id: 'attendance',
    label: 'Attendance Report',
    icon: Calendar,
    color: '#9F7AEA',
    bg: '#FAF5FF',
    desc: 'Late arrivals, leaves, permissions and daily attendance patterns.'
  },
];

export default function Reports({ onBack }) {
  const [reportId, setReportId]     = useState('attendance');
  const [startDate, setStartDate]   = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate]       = useState(() => new Date().toISOString().split('T')[0]);
  const [isExporting, setIsExporting] = useState(false);

  // ── API data ──────────────────────────────────────────────────
  const [attendanceData, setAttendanceData] = useState(null);
  const [employeeData, setEmployeeData]     = useState([]);
  // Map of employeeId → total leave DAYS approved inside the picked
  // date range. Computed from /api/leave-requests so the Employee
  // Master report shows real leave usage instead of the synthetic
  // "Absent" status flag on the Employee record.
  const [leaveByEmpId, setLeaveByEmpId]     = useState({});
  // Map of employeeId → PRESENT days inside the picked range, pulled from the
  // SAME canonical attendance report the Attendance tab uses. Drives the new
  // "Present Days" column + tile + chart on the Employee Master report so its
  // numbers match the Attendance report exactly.
  const [presentByEmpId, setPresentByEmpId] = useState({});
  const [loading, setLoading]               = useState(false);

  // Company logo preloaded as a PNG data-URL so the synchronous jsPDF export
  // can embed it without an async image load mid-render. Rendered in the
  // on-screen report header too.
  const [logoDataUrl, setLogoDataUrl] = useState('');
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width  = img.naturalWidth  || img.width;
        canvas.height = img.naturalHeight || img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);
        setLogoDataUrl(canvas.toDataURL('image/png'));
      } catch { /* canvas taint or unsupported — PDF simply omits the logo */ }
    };
    img.src = logoHrm;
  }, []);

  // Fetch attendance report from API
  const fetchAttendanceReport = async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API}/reports/attendance?startDate=${startDate}&endDate=${endDate}`);
      const data = await res.json();
      if (data.success) setAttendanceData(data.data);
    } catch {
      console.error('Failed to load attendance report');
    } finally {
      setLoading(false);
    }
  };

  // Fetch employee list for Employee Master report
  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API}/employees?limit=500`);
      const data = await res.json();
      if (data.success) setEmployeeData(data.employees || []);
    } catch {
      console.error('Failed to load employees');
    } finally {
      setLoading(false);
    }
  };

  // Fetch approved leaves + permissions for the picked range and roll
  // them up per employee. Counts each leave day (inclusive of both
  // endpoints) so a 1-day Casual Leave shows up as 1, a 3-day Sick
  // Leave as 3.  Permissions count as 0.5 (half-day equivalent).
  const fetchLeavesForReport = async () => {
    try {
      // /api/leave-requests is the HRMS proxy that lists every mobile
      // leave + permission with the populated employeeId.
      const res  = await fetch(`${API}/leave-requests?limit=500&status=approved`);
      const data = await res.json();
      if (!data?.success || !Array.isArray(data.items)) {
        setLeaveByEmpId({});
        return;
      }
      const startStr = String(startDate || '');
      const endStr   = String(endDate   || '');
      const tally = {};
      for (const lv of data.items) {
        const empId = lv.employeeId || lv.empId || lv.employee?.employeeId;
        if (!empId) continue;
        // Permission rows carry a single `date`; leave rows carry
        // startDate/endDate (both as YYYY-MM-DD).
        const isPerm = String(lv.requestType || lv.type || '').toLowerCase().includes('permission');
        if (isPerm) {
          // The HRMS proxy emits a human-formatted `date` ("May 30, 2026")
          // for display; the raw ISO sits on `permissionDate`. Prefer the
          // ISO so the >= / <= range compare actually works.
          const d = String(lv.permissionDate || lv.date || '').slice(0, 10);
          if (d && d >= startStr && d <= endStr) {
            tally[empId] = (tally[empId] || 0) + 0.5;
          }
          continue;
        }
        const ls = String(lv.startDate || lv.fromDate || '').slice(0, 10);
        const le = String(lv.endDate   || lv.toDate   || '').slice(0, 10);
        if (!ls || !le) continue;
        // Clip the leave window to the picked range, then count days
        // inclusive of both ends. ISO string compare doubles as date
        // compare (YYYY-MM-DD sorts lexically).
        const from = ls < startStr ? startStr : ls;
        const to   = le > endStr   ? endStr   : le;
        if (from > to) continue;  // leave doesn't overlap the range
        const days =
          Math.floor((new Date(to + 'T00:00:00').getTime() - new Date(from + 'T00:00:00').getTime()) / 86400000) + 1;
        if (days > 0) tally[empId] = (tally[empId] || 0) + days;
      }
      setLeaveByEmpId(tally);
    } catch (err) {
      console.error('Failed to load leave report:', err);
      setLeaveByEmpId({});
    }
  };

  // Pull PRESENT days per employee for the picked range from the canonical
  // attendance report, so the Employee Master's "Present Days" column/tile/
  // chart uses the exact same counts as the Attendance report.
  const fetchPresentForReport = async () => {
    try {
      const res  = await fetch(`${API}/reports/attendance?startDate=${startDate}&endDate=${endDate}`);
      const data = await res.json();
      if (!data?.success || !Array.isArray(data.data?.rows)) {
        setPresentByEmpId({});
        return;
      }
      const map = {};
      for (const r of data.data.rows) {
        if (r.employeeId) map[r.employeeId] = Number(r.present) || 0;
      }
      setPresentByEmpId(map);
    } catch (err) {
      console.error('Failed to load present-days for report:', err);
      setPresentByEmpId({});
    }
  };

  useEffect(() => {
    if (reportId === 'attendance') {
      fetchAttendanceReport();
    } else {
      fetchEmployees();
      // Pull live leave aggregates so the "Absent" tile reflects real usage
      // inside the picked range, not just the static status flag.
      fetchLeavesForReport();
      // Pull present-days so the Present Days column/tile/chart match the
      // Attendance report exactly.
      fetchPresentForReport();
    }
  }, [reportId, startDate, endDate]);

  const activeReport = REPORT_TYPES.find(r => r.id === reportId);

  // ── Date-filtered Employee Master (must come BEFORE the metrics +
  //    chart blocks that reference it — they live above the table) ───
  // An employee belongs in the report for the selected date range when:
  //   • they joined on or before endDate (already on payroll), AND
  //   • they hadn't left before startDate (still active during the span).
  // Date strings from the API are ISO (YYYY-MM-DD), so plain string
  // comparison works as a date comparison.
  const employeeDataInRange = React.useMemo(() => {
    if (reportId !== 'employee') return employeeData;
    const start = String(startDate || '');
    const end   = String(endDate   || '');
    return employeeData.filter(e => {
      const joined = String(e.joiningDate || '').slice(0, 10);
      if (start && joined && joined > end)   return false;  // joined AFTER the range
      const left   = String(e.terminationDate || e.exitDate || '').slice(0, 10);
      if (left && start && left < start)     return false;  // left BEFORE the range
      return true;
    });
  }, [employeeData, startDate, endDate, reportId]);

  // ── Table rows ────────────────────────────────────────────────
  // Declared BEFORE metrics + chartData so both can be derived from the exact
  // same rows the table renders — guaranteeing chart totals reconcile to the
  // table (#495).
  const tableRows = reportId === 'attendance'
    ? (attendanceData?.rows || [])
    : employeeDataInRange.filter(e => e.isActive !== false && e.status !== 'Terminated').map(e => {
        // Reject raw ObjectId strings — fall through to the denormalised
        // departmentName / designationTitle sidecar fields, then to '—'.
        const isHexId = (s) => typeof s === 'string' && /^[a-f0-9]{24}$/i.test(s);
        const pickTitle = (val, sidecar) => {
          if (val && typeof val === 'object') {
            const t = val.title || val.name || '';
            return isHexId(t) ? (sidecar || '—') : (t || sidecar || '—');
          }
          if (typeof val === 'string' && val && !isHexId(val)) return val;
          return sidecar || '—';
        };
        const empId = e.employeeId || e._id;
        return {
          employeeId:   empId,
          employeeName: e.name || `${e.firstName || ''} ${e.lastName || ''}`.trim(),
          avatar:       ((e.firstName?.[0] || '') + (e.lastName?.[0] || '')).toUpperCase() || (e.name?.slice(0,2).toUpperCase() || '??'),
          color:        e.color || '#4299E1',
          department:   pickTitle(e.department,  e.departmentName),
          designation:  pickTitle(e.designation, e.designationTitle),
          manager:      e.assignedTo || '—',
          status:       e.status || 'Active',
          // #495 — PRESENT days inside the picked range, from the canonical
          // attendance report (same source as the Attendance tab).
          presentDays:  presentByEmpId[empId] || 0,
        };
      });

  // ── Metrics ───────────────────────────────────────────────────
  const metrics = reportId === 'attendance' && attendanceData ? [
    { label: 'Total Present',  value: attendanceData.summary.totalPresent,   icon: <CheckCircle size={18} />, color: '#4CAA17', bg: '#F1F9EE' },
    { label: 'Late Arrivals',  value: attendanceData.summary.totalLate,      icon: <AlertCircle size={18} />, color: '#ECC94B', bg: '#FFFFF0' },
    // Leave + Absent collapsed: backend's `totalAbsent` already rolls raw
    // 'leave' status into 'Absent', so showing both was double-counting in
    // the eyes of HR. Permission is added in its place so the dashboard
    // reflects everything HR actually acts on.
    // #381 — Permission tile now reads the TRUE permission count
    // (totalPermission). Previously read totalHalfDay which conflated
    // permission + half-day-LOP — 15 shown here was actually
    // permissions PLUS half-day LOP entries combined.
    { label: 'Permission',     value: attendanceData.summary.totalPermission ?? attendanceData.summary.totalHalfDay ?? 0, icon: <Clock size={18} />,    color: '#9F7AEA', bg: '#FAF5FF' },
    { label: 'Absent Days',    value: attendanceData.summary.totalAbsent      || 0, icon: <XCircle size={18} />,  color: '#FC8181', bg: '#FFF5F5' },
  ] : reportId === 'employee' ? [
    { label: 'Total Employees', value: employeeDataInRange.length,                                                             icon: <Users size={18} />,        color: '#4299E1', bg: '#EBF4FD' },
    { label: 'Active Staff',    value: employeeDataInRange.filter(e => e.isActive !== false && e.status !== 'Terminated').length, icon: <CheckCircle size={18} />, color: '#4CAA17', bg: '#F1F9EE' },
    // "Absent" used to compare against the static `e.status === 'On
    // Leave'` flag on the Employee directory — that was almost always 0.
    // Replaced with a count of distinct employees who took any approved
    // leave inside the picked date range (via leaveByEmpId), so the
    // tile reflects real usage.
    { label: 'Absent',        value: Object.values(leaveByEmpId).filter(v => v > 0).length,                                  icon: <XCircle size={18} />,       color: '#FC8181', bg: '#FFF5F5' },
    // #495 — Leave Days tile replaced with Present Days (total present days
    // across in-range employees), summed from the SAME per-employee present
    // counts shown in the table's Present Days column.
    { label: 'Present Days',    value: employeeDataInRange.reduce((s, e) => s + (presentByEmpId[e.employeeId || e._id] || 0), 0), icon: <CheckCircle size={18} />, color: '#4CAA17', bg: '#F1F9EE' },
  ] : [];

  // ── Chart data from real API ──────────────────────────────────
  const chartData = reportId === 'attendance' && attendanceData
    ? (() => {
        // #381b — CHART = DISJOINT DAILY-ATTENDANCE CATEGORIES.
        //
        // Bars sum cleanly to the total workday-employee-days across
        // the filtered range because each day of each employee is
        // counted in EXACTLY ONE bar:
        //
        //   • Present    = on-time attendance   (r.presentOnTime, backend g.present)
        //   • Late       = late arrival         (r.late)
        //   • Permission = approved partial-day (r.permission)
        //   • Absent     = no attendance + no leave for a workday (r.absent)
        //
        // Previously the Present bar read r.present which already
        // INCLUDED lates (HR tile convention #60) — so Late arrivals
        // showed up in BOTH the Present bar AND the Late bar,
        // inflating the department's apparent activity. Chart bars
        // are now truly disjoint categories.
        //
        // Slice(0,8) dropped — every department represented.
        // Sorted alphabetically for stable rendering across polls.
        // #495 — Chart bars are the DEPARTMENT SUMS of the EXACT same
        // per-employee values the table shows (row.present / late /
        // permission / absent). No separate calculation, so a change in the
        // table (date range, etc.) moves the chart identically. Each column
        // in the table therefore reconciles to its bar total.
        const deptMap = {};
        (attendanceData.rows || []).forEach(r => {
          const dept = r.department || 'Unknown';
          if (!deptMap[dept]) {
            deptMap[dept] = { period: dept, present: 0, late: 0, permission: 0, absent: 0 };
          }
          deptMap[dept].present    += Number(r.present    || 0);
          deptMap[dept].late       += Number(r.late       || 0);
          deptMap[dept].permission += Number(r.permission || 0);
          deptMap[dept].absent     += Number(r.absent     || 0);
        });
        return Object.values(deptMap).sort((a, b) => a.period.localeCompare(b.period));
      })()
    : reportId === 'employee'
    ? (() => {
        // #495 — Employee Master chart = PRESENT DAYS per department, summed
        // from the SAME per-employee present counts shown in the table's
        // "Present Days" column. No separate calculation, so the bars always
        // reconcile to the table.
        const deptMap = {};
        (tableRows || []).forEach(r => {
          const dept = r.department || 'Unknown';
          if (!deptMap[dept]) deptMap[dept] = { period: dept, present: 0 };
          deptMap[dept].present += Number(r.presentDays || 0);
        });
        return Object.values(deptMap).sort((a, b) => a.period.localeCompare(b.period));
      })()
    : [];

  // ── Export PDF ────────────────────────────────────────────────
  const exportToPDF = () => {
    setIsExporting(true);
    // Landscape for BOTH reports — the attendance report has 11 columns and
    // the employee master's long dept/designation/manager names wrap and
    // misalign in portrait. Landscape gives every column room.
    const doc = new jsPDF({ orientation: 'landscape' });

    // #495 — Company logo in the PDF header, kept in proportion. Text is
    // pushed right of the logo so nothing overlaps.
    let textX = 14;
    if (logoDataUrl) {
      try {
        const props = doc.getImageProperties(logoDataUrl);
        const logoH = 14;                                   // mm
        const logoW = props.width ? (props.width / props.height) * logoH : 40;
        doc.addImage(logoDataUrl, 'PNG', 14, 10, logoW, logoH);
        textX = 14 + logoW + 6;
      } catch { /* if the logo can't be embedded, fall back to text only */ }
    }
    doc.setFontSize(18);
    doc.setTextColor(20);
    doc.text(`${activeReport.label} — ${startDate} to ${endDate}`, textX, 19);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Tesco Structures  ·  Generated: ${new Date().toLocaleString()}`, textX, 26);

    if (reportId === 'attendance') {
      const rows = tableRows.map(r => [
        r.employeeId, r.employeeName, r.department, r.designation,
        r.present, r.late,
        // #381 — Permission column now reads the TRUE permission count,
        // not halfDay (which is 1/2 LOP). Both LOP figures come from
        // the backend policy calc (1 CL + 2 perms free, lates count
        // toward LOP).
        r.permission ?? r.halfDay ?? 0,
        r.absent,
        r.lop,
        r.halfLop || 0,
        r.status,
      ]);
      autoTable(doc, {
        startY: 34,
        head: [['ID', 'Name', 'Dept', 'Designation', 'Present', 'Late', 'Permission', 'Absent', 'LOP', '1/2 LOP', 'Status']],
        body: rows,
      });
    } else {
      // #495 — Employee Master now carries a Present Days column (was Leave).
      const rows = tableRows.map(r => [r.employeeId, r.employeeName, r.department, r.designation, r.presentDays || 0, r.manager, r.status]);
      autoTable(doc, {
        startY: 34,
        head: [['ID', 'Name', 'Dept', 'Designation', 'Present Days', 'Manager', 'Status']],
        body: rows,
      });
    }
    doc.save(`${activeReport.label.replace(/ /g, '_')}_${startDate}_${endDate}.pdf`);
    setIsExporting(false);
  };

  // ── Export Excel ──────────────────────────────────────────────
  const exportToExcel = () => {
    // For attendance reports, reshape so the same columns appear as the
    // PDF: ID, Name, Dept, Designation, Present, Late, Permission, Absent,
    // LOP, 1/2 LOP, Status.  Leave is dropped (it duplicates Absent in the
    // backend rollup); Permission and 1/2 LOP are added.
    const sheetRows = reportId === 'attendance'
      ? tableRows.map(r => ({
          'Emp ID':      r.employeeId,
          'Name':        r.employeeName,
          'Department':  r.department,
          'Designation': r.designation,
          'Present':     r.present,
          'Late':        r.late,
          // #381 — Use the TRUE permission field; halfDay is now 1/2 LOP only.
          'Permission':  r.permission ?? r.halfDay ?? 0,
          'Absent':      r.absent,
          'LOP':         r.lop,
          '1/2 LOP':     r.halfLop || 0,
          'Status':      r.status,
        }))
      : tableRows.map(r => ({
          'Emp ID':      r.employeeId,
          'Name':        r.employeeName,
          'Department':  r.department,
          'Designation': r.designation,
          // #495 — Present Days replaces the old leave-based column.
          'Present Days': r.presentDays || 0,
          'Manager':     r.manager,
          'Status':      r.status,
        }));
    // #495 — Branded title block. The XLSX community build can't embed an
    // image, so the company name + report title are written as header rows
    // above the table (the closest supported equivalent of a logo header).
    const ws = XLSX.utils.aoa_to_sheet([
      ['Tesco Structures'],
      [`${activeReport.label} — ${startDate} to ${endDate}`],
      [`Generated: ${new Date().toLocaleString()}`],
      [],
    ]);
    XLSX.utils.sheet_add_json(ws, sheetRows, { origin: 'A5' });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `${activeReport.label.replace(/ /g, '_')}_${startDate}_${endDate}.xlsx`);
  };

  return (
    <div className="emp-list-page">
      <style>{`
        .reports-table th, .reports-table td { padding: 10px 8px !important; }
        .reports-table th { font-size: 10px !important; }
      `}</style>

      {/* ── Header ── */}
      <div className="emp-list-header">
        <div className="ne-breadcrumb">
          <span className="ne-breadcrumb-link" onClick={onBack}>Dashboard</span>
          <ChevronRight size={13} />
          <span>Reports</span>
        </div>
        <div className="emp-list-title-row">
          <div>
            <h1 className="ne-page-title">Reports Center</h1>
            <p className="ne-page-sub">Generate full calendar date-based HR reports.</p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="ne-btn-secondary" onClick={exportToExcel}>
              <TableIcon size={16} /> Excel
            </button>
            <button className="ne-btn-primary" onClick={exportToPDF} disabled={isExporting}>
              <Download size={16} /> {isExporting ? 'Generating...' : 'Export PDF'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Layout: Sidebar + Main ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: '24px', marginTop: '24px', alignItems: 'start' }}>

        {/* ── Left Sidebar ── */}
        <aside>
          <div className="card" style={{ padding: '8px', overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px 8px', borderBottom: '1px solid var(--border-color)', marginBottom: '6px' }}>
              <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Report Type</div>
            </div>

            {REPORT_TYPES.map(r => {
              const active = reportId === r.id;
              return (
                <div key={r.id} onClick={() => setReportId(r.id)} style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '13px 14px', borderRadius: '10px', cursor: 'pointer', marginBottom: '2px',
                  background: active ? r.bg : 'transparent',
                  border: active ? `1px solid ${r.color}22` : '1px solid transparent',
                  transition: 'all 0.15s ease'
                }}>
                  <div style={{
                    width: '34px', height: '34px', borderRadius: '8px', flexShrink: 0,
                    background: active ? r.color : 'var(--bg-main)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: active ? 'white' : r.color, transition: 'all 0.15s ease'
                  }}>
                    <r.icon size={16} />
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: active ? 700 : 600, color: active ? r.color : 'var(--text-main)' }}>{r.label}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-light)', marginTop: '1px' }}>Date Range report</div>
                  </div>
                </div>
              );
            })}

            {/* Date Range */}
            <div style={{ padding: '14px 14px 8px', borderTop: '1px solid var(--border-color)', marginTop: '8px' }}>
              <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '10px' }}>Date Range</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-light)', marginBottom: '4px' }}>Quick Select</label>
                  <select
                    className="ne-input"
                    style={{ width: '100%', fontSize: '13px', padding: '8px 10px' }}
                    value={`${new Date(startDate).getFullYear()}-${String(new Date(startDate).getMonth() + 1).padStart(2,'0')}`}
                    onChange={e => {
                      const [y, m] = e.target.value.split('-').map(Number);
                      const first = new Date(y, m - 1, 1);
                      const last  = new Date(y, m, 0);
                      const toISO = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                      setStartDate(toISO(first));
                      setEndDate(toISO(last));
                    }}
                  >
                    {(() => {
                      // Cap the floor at April 2025 (company start). Older
                      // months don't apply, so we never offer them.
                      const FLOOR = new Date(2025, 3, 1);   // April 2025
                      const now   = new Date();
                      const opts  = [];
                      for (let d = new Date(FLOOR); d <= now; d.setMonth(d.getMonth() + 1)) {
                        const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`;
                        const lbl = d.toLocaleString('default', { month: 'long', year: 'numeric' });
                        opts.push(<option key={val} value={val}>{lbl}</option>);
                      }
                      return opts.reverse();
                    })()}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-light)', marginBottom: '4px' }}>From Date</label>
                  <input type="date" className="ne-input" value={startDate} onChange={e => setStartDate(e.target.value)} max={new Date().toISOString().slice(0,10)} style={{ width: '100%', fontSize: '13px', padding: '8px 10px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-light)', marginBottom: '4px' }}>To Date</label>
                  <input type="date" className="ne-input" value={endDate} onChange={e => setEndDate(e.target.value)} max={new Date().toISOString().slice(0,10)} style={{ width: '100%', fontSize: '13px', padding: '8px 10px' }} />
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Main Content ── */}
        <main style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Report title bar */}
          <div className="card" style={{ padding: '18px 24px', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              {/* #495 — Company logo, professionally aligned in the report
                  header. A divider keeps it visually distinct from the
                  report-type block. */}
              <img src={logoHrm} alt="Tesco Structures" style={{ height: '34px', width: 'auto', objectFit: 'contain' }} />
              <div style={{ width: '1px', height: '34px', background: 'var(--border-color)' }} />
              <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: activeReport.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: activeReport.color }}>
                <activeReport.icon size={20} />
              </div>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-main)' }}>{activeReport.label}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-light)', marginTop: '2px' }}>{activeReport.desc}</div>
              </div>
            </div>
            <span style={{ padding: '5px 14px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: activeReport.bg, color: activeReport.color, border: `1px solid ${activeReport.color}33` }}>
              {loading ? 'Loading...' : `${tableRows.length} records`}
            </span>
          </div>

          {/* Metric cards */}
          {metrics.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${metrics.length}, 1fr)`, gap: '16px' }}>
              {metrics.map((m, i) => (
                <div key={i} className="card" style={{ padding: '18px', minWidth: 0 }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: m.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: m.color, marginBottom: '12px' }}>
                    {m.icon}
                  </div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-main)' }}>{loading ? '...' : m.value}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-light)', marginTop: '4px', fontWeight: 600 }}>{m.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Chart */}
          <div className="card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-main)' }}>{activeReport.label} — {startDate} to {endDate}</div>
              <span style={{ fontSize: '11px', color: 'var(--text-light)', fontWeight: 600 }}>
                {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}
              </span>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              {reportId === 'attendance' ? (
                <BarChart data={chartData} barGap={3}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                  {/*
                    #383 — Force every department label to render on
                    the X-axis. By default Recharts uses
                    `interval="preserveEnd"` which drops labels that
                    would overlap — with 7+ departments some names
                    (Human Resource Management, Software Development)
                    silently disappeared, making the chart look like
                    those departments had no data. `interval={0}`
                    renders ALL ticks; `angle={-25}` + `dy=10` slants
                    them slightly so long department names don't
                    collide. `height={70}` reserves enough vertical
                    space for the slanted labels so the legend row
                    below doesn't get clipped.
                  */}
                  <XAxis
                    dataKey="period"
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    angle={-25}
                    dy={10}
                    height={70}
                    tick={{ fontSize: 11, fill: 'var(--text-light)' }}
                  />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-light)' }} />
                  <Tooltip contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 8px 20px rgba(0,0,0,0.1)' }} />
                  <Legend />
                  <Bar dataKey="present" name="Present"  fill="#4CAA17" radius={[4,4,0,0]} barSize={14} />
                  <Bar dataKey="late"    name="Late"     fill="#ECC94B" radius={[4,4,0,0]} barSize={14} />
                  <Bar dataKey="permission" name="Permission" fill="#9F7AEA" radius={[4,4,0,0]} barSize={14} />
                  <Bar dataKey="absent"     name="Absent"     fill="#FC8181" radius={[4,4,0,0]} barSize={14} />
                </BarChart>
              ) : (
                <BarChart data={chartData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                  {/*
                    #383 — Force every department label to render on
                    the X-axis. By default Recharts uses
                    `interval="preserveEnd"` which drops labels that
                    would overlap — with 7+ departments some names
                    (Human Resource Management, Software Development)
                    silently disappeared, making the chart look like
                    those departments had no data. `interval={0}`
                    renders ALL ticks; `angle={-25}` + `dy=10` slants
                    them slightly so long department names don't
                    collide. `height={70}` reserves enough vertical
                    space for the slanted labels so the legend row
                    below doesn't get clipped.
                  */}
                  <XAxis
                    dataKey="period"
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    angle={-25}
                    dy={10}
                    height={70}
                    tick={{ fontSize: 11, fill: 'var(--text-light)' }}
                  />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-light)' }} />
                  <Tooltip contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 8px 20px rgba(0,0,0,0.1)' }} />
                  <Legend />
                  {/* #495 — Present Days per department, straight from the
                      table's Present Days column so chart == table. */}
                  <Bar dataKey="present" name="Present Days" fill="#4CAA17" radius={[4,4,0,0]} barSize={22} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>

          {/* Detailed table */}
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="card-title">Detailed {activeReport.label} Data</div>
              <span style={{ fontSize: '11px', color: 'var(--text-light)', fontWeight: 600 }}>
                {loading ? 'Loading...' : `Showing ${tableRows.length} records`}
              </span>
            </div>
            <div style={{ overflowX: 'auto', maxHeight: '380px', overflowY: 'auto' }}>
              {loading ? (
                <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)', fontSize: 14 }}>Loading report data...</div>
              ) : tableRows.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)', fontSize: 14 }}>No data found for the selected date range.</div>
              ) : (
                <table className="emp-table reports-table">
                  <thead>
                    <tr>
                      <th style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5 }}>Employee</th>
                      <th style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5 }}>Emp ID</th>
                      <th style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5 }}>Department</th>
                      <th style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5 }}>Designation</th>
                      {reportId === 'attendance' && (
                        <>
                          <th style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5 }}>Present</th>
                          <th style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5 }}>Late</th>
                          <th style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5 }}>Permission</th>
                          <th style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5 }}>Absent</th>
                          <th style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5 }}>LOP</th>
                          <th style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5 }}>1/2 LOP</th>
                        </>
                      )}
                      {reportId === 'employee' && (
                        <th style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5 }}>Present Days</th>
                      )}
                      <th style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5 }}>Manager</th>
                      <th style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((row, i) => (
                      <tr key={i}>
                        <td>
                          <div className="emp-table-user">
                            <div className="emp-table-avatar" style={{ background: (row.color || '#4299E1') + '20', color: row.color || '#4299E1', width: '30px', height: '30px', fontSize: '11px' }}>
                              {row.avatar || (row.employeeName || '??').slice(0, 2).toUpperCase()}
                            </div>
                            <div className="emp-table-name">{row.employeeName}</div>
                          </div>
                        </td>
                        <td><div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-light)', fontFamily: 'monospace' }}>{row.employeeId || '—'}</div></td>
                        <td><div className="emp-table-dept">{row.department || '—'}</div></td>
                        <td><div className="emp-table-role">{row.designation || '—'}</div></td>
                        {reportId === 'attendance' && (
                          <>
                            <td><div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>{row.present} <span style={{ fontSize: '10px', color: 'var(--text-light)', fontWeight: 500 }}>days</span></div></td>
                            <td><div style={{ fontSize: '13px', fontWeight: 600, color: row.late > 0 ? '#ECC94B' : 'var(--text-main)' }}>{row.late} <span style={{ fontSize: '10px', color: 'var(--text-light)', fontWeight: 500 }}>times</span></div></td>
                            {/* #381 — Permission column reads the TRUE permission count.
                                Previously used row.halfDay which conflated permission
                                with 1/2 LOP entries. */}
                            <td><div style={{ fontSize: '13px', fontWeight: 600, color: (row.permission ?? row.halfDay ?? 0) > 0 ? '#9F7AEA' : 'var(--text-main)' }}>{row.permission ?? row.halfDay ?? 0} <span style={{ fontSize: '10px', color: 'var(--text-light)', fontWeight: 500 }}>days</span></div></td>
                            <td><div style={{ fontSize: '13px', fontWeight: 600, color: row.absent > 0 ? '#FC8181' : 'var(--text-main)' }}>{row.absent} <span style={{ fontSize: '10px', color: 'var(--text-light)', fontWeight: 500 }}>days</span></div></td>
                            <td><div style={{ fontSize: '13px', fontWeight: 600, color: row.lop > 0 ? '#FC8181' : 'var(--text-main)' }}>{row.lop} <span style={{ fontSize: '10px', color: 'var(--text-light)', fontWeight: 500 }}>days</span></div></td>
                            <td><div style={{ fontSize: '13px', fontWeight: 600, color: (row.halfLop || 0) > 0 ? '#F97316' : 'var(--text-main)' }}>{row.halfLop || 0} <span style={{ fontSize: '10px', color: 'var(--text-light)', fontWeight: 500 }}>days</span></div></td>
                          </>
                        )}
                        {reportId === 'employee' && (
                          <td><div style={{ fontSize: '13px', fontWeight: 600, color: (row.presentDays || 0) > 0 ? '#4CAA17' : 'var(--text-main)' }}>{row.presentDays || 0} <span style={{ fontSize: '10px', color: 'var(--text-light)', fontWeight: 500 }}>days</span></div></td>
                        )}
                        <td><div className="emp-table-dept">{row.manager || '—'}</div></td>
                        <td>
                          <span
                            className="emp-table-status"
                            style={{
                              background:
                                row.status === 'Active'      ? '#E8F5E9' :
                                row.status === 'Terminated'  ? '#FEE2E2' :
                                                                '#F1F5F9',
                              color:
                                row.status === 'Active'      ? '#1B5E20' :
                                row.status === 'Terminated'  ? '#991B1B' :
                                                                '#334155',
                            }}
                          >
                            {row.status || 'Active'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
