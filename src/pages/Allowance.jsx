import React, { useState, useEffect } from 'react';
import { ChevronRight, Fuel, Car, CheckCircle, XCircle, Clock } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
// #303 — branded report template.
import { buildBrandedPdf, buildBrandedExcel } from '../utils/reportTemplate';
import * as XLSX from 'xlsx';
import { useNotification } from '../context/NotificationContext';
import { API } from '../config/api';

// #302 — Bumped cache key so any browser that hydrated from a v0 cache
// (where the same row could end up in BOTH `petrol` and `travel` due to
// the strict-equality backend filter) gets a fresh, properly-split set
// on first load.
const LS_KEY = 'tesco_hrms_allowance_cache_v3';

/**
 * Defensive client-side classifier mirroring the backend (#302). Used
 * to RE-SPLIT the rows the backend returns, so even if the backend
 * version is stale and lumps everything into one bucket, the UI still
 * shows the right rows under the right card.
 *
 * Priority:
 *   1. The row's `_kind` (stamped by the new backend).
 *   2. The row's `type` string, lowercased + trimmed.
 *   3. Structural fingerprint — petrol-from-GPS has `distance` set
 *      by the auto-biller; travel has `purpose` (other than the
 *      auto-biller default) or `fromLat`/`toLat` coordinates.
 */
function classifyAllowance(r) {
  // #309 — PRIMARY: the backend's stamped _kind. This is set by the
  // HRMS backend route (routes/allowanceRoutes.js) using the SAME
  // tolerant logic, so if the backend says petrol the row IS petrol.
  if (r?._kind === 'petrol' || r?._kind === 'travel') return r._kind;
  // FALLBACK 1: the row's `type` string, lowercased.
  const t = String(r?.type || '').toLowerCase().trim();
  if (t === 'petrol' || t.includes('petrol')) return 'petrol';
  if (t === 'travel' || t.includes('travel')) return 'travel';
  // FALLBACK 2: structural fingerprints — travel rows have route
  // coordinates or an employee-supplied purpose; petrol-GPS rows
  // have a numeric distance from live-tracking.
  if (r?.fromLat || r?.toLat || r?.fromLng || r?.toLng) return 'travel';
  if (r?.purpose && r.purpose !== 'Daily Commute')      return 'travel';
  if (typeof r?.distance === 'number' && r.distance > 0) return 'petrol';
  return 'travel';
}

/** Merge backend petrol+travel arrays and re-split by classifyAllowance.
 *  De-duplicates by `_id` so a row that the backend mistakenly returned
 *  in both arrays only renders once. */
function reSplit(rawPetrol, rawTravel) {
  const seen = new Set();
  const all = [];
  for (const r of [...(rawPetrol || []), ...(rawTravel || [])]) {
    const key = r?._id || r?.id || JSON.stringify(r);
    if (seen.has(key)) continue;
    seen.add(key);
    all.push({ ...r, _kind: classifyAllowance(r) });
  }
  return {
    petrol: all.filter((r) => r._kind === 'petrol'),
    travel: all.filter((r) => r._kind === 'travel'),
  };
}

function readCache() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { petrol: [], travel: [] };
    const parsed = JSON.parse(raw);
    // Re-classify cached rows on read so a future classifier upgrade
    // takes effect immediately instead of waiting for the next poll.
    return reSplit(parsed?.petrol, parsed?.travel);
  } catch { return { petrol: [], travel: [] }; }
}

export default function Allowance({ onBack }) {
  const { showNotification } = useNotification();
  const [allowanceType, setAllowanceType] = useState('petrol');
  const [employeeFilter, setEmployeeFilter] = useState('');
  const cached = readCache();
  const [petrolRequests, setPetrolRequests] = useState(cached.petrol);
  const [travelRequests, setTravelRequests] = useState(cached.travel);
  const [loading, setLoading] = useState(true);
  const [approvalModal, setApprovalModal] = useState(null);

  // Petrol allowance rows are now generated automatically by the mobile
  // backend's autoPetrolBilling cron — every 5 min it scans checked-out
  // petrol-eligible employees and creates the missing row. No HR action
  // is required, so the manual "Backfill Petrol" button has been removed.

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${API}/allowances?limit=300`);
        const data = await res.json();
        if (cancelled || !data) return;
        // #302 — Re-split defensively. The backend was previously case-
        // sensitive on `type` which let rows leak into the wrong bucket
        // (or vanish from both). reSplit() lowercases + falls back to
        // structural fingerprints AND de-duplicates by _id, so each row
        // appears exactly ONCE under exactly ONE card.
        const fixed = reSplit(data.petrol, data.travel);
        // eslint-disable-next-line no-console
        console.log('[Allowance] petrol=', fixed.petrol.length, ' travel=', fixed.travel.length,
                    ' (raw petrol=', (data.petrol || []).length,
                    ' raw travel=', (data.travel || []).length, ')');
        // #309 — first-row diagnostic. Logs the type/_kind of the very
        // first row of each bucket so we can verify in DevTools that the
        // backend is sending what we expect. If you see e.g.
        //   first petrol { type: 'travel', _kind: 'petrol' }
        // the backend reshape is wrong and the data needs server-side fix.
        if (fixed.petrol[0]) {
          const f = fixed.petrol[0];
          console.log('[Allowance] first petrol',
            { _id: f._id, type: f.type, purpose: f.purpose,
              distance: f.distance, _kind: f._kind });
        }
        if (fixed.travel[0]) {
          const f = fixed.travel[0];
          console.log('[Allowance] first travel',
            { _id: f._id, type: f.type, purpose: f.purpose,
              distance: f.distance, _kind: f._kind });
        }
        setPetrolRequests(fixed.petrol);
        setTravelRequests(fixed.travel);
        try {
          localStorage.setItem(LS_KEY, JSON.stringify(fixed));
        } catch {}
      } catch {}
      finally { if (!cancelled) setLoading(false); }
    };
    load();
    const t = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  // Row identity is by mongo _id, not company empId — multiple
  // requests for the same employee share the empId, so r.id matching
  // would patch the wrong document and the employee's ERM app would
  // never see their request change state.
  const handleManagerAction = async (rowKey, type, newManagerStatus) => {
    const setList = type === 'petrol' ? setPetrolRequests : setTravelRequests;
    const sourceArr = type === 'petrol' ? petrolRequests : travelRequests;
    const target = sourceArr.find(r => r._id === rowKey);
    if (!target) {
      showNotification('Could not locate that request locally. Please refresh.', 'error');
      return;
    }
    setList(prev => prev.map(req => req._id === rowKey ? { ...req, managerStatus: newManagerStatus } : req));
    try {
      await fetch(`${API}/allowances/${target._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ managerStatus: newManagerStatus.toLowerCase(), reviewedBy: 'Manager' }),
      });
      showNotification(`Manager ${newManagerStatus.toLowerCase()} the request`, 'success');
    } catch (err) {
      setList(prev => prev.map(req => req._id === rowKey ? { ...req, managerStatus: target.managerStatus || '' } : req));
      showNotification('Could not save manager decision', 'error');
    }
  };

  const handleAction = async (rowKey, action, type, extras = {}) => {
    const newStatus = action === 'approve' ? 'Approved' : 'Rejected';
    const setList = type === 'petrol' ? setPetrolRequests : setTravelRequests;
    const sourceArr = type === 'petrol' ? petrolRequests : travelRequests;
    const target = sourceArr.find(r => r._id === rowKey);
    if (!target) {
      showNotification('Could not locate that request locally. Please refresh.', 'error');
      return;
    }
    if (target.managerStatus !== 'Approved') {
      showNotification('Cannot process — Manager has not approved yet.', 'error');
      return;
    }
    const requested = Number(target.amount) || 0;
    const approvedAmount = action === 'approve'
      ? Math.max(0, Math.min(Number(extras.approvedAmount) || 0, requested))
      : 0;
    const rejectedAmount = action === 'approve' ? Math.max(0, requested - approvedAmount) : requested;
    setList(prev => prev.map(req => req._id === rowKey
      ? { ...req, status: newStatus, approvedAmount, rejectedAmount, amountComment: extras.amountComment || req.amountComment || '' }
      : req));
    try {
      const res = await fetch(`${API}/allowances/${target._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus.toLowerCase(),
          reviewedBy: 'HR',
          approvedAmount,
          amountComment: extras.amountComment || '',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
      showNotification(`Request ${newStatus}!`, action === 'approve' ? 'success' : 'error');
    } catch (err) {
      setList(prev => prev.map(req => req._id === rowKey ? { ...req, status: target.status || 'Pending' } : req));
      showNotification(`Could not save: ${err.message}`, 'error');
    }
  };

  const openApprovalModal = (req, type) => {
    if (req?.managerStatus !== 'Approved') {
      showNotification('Cannot process — Manager has not approved yet.', 'error');
      return;
    }
    setApprovalModal({ req, type, approvedAmount: String(req.amount || ''), amountComment: '' });
  };
  const closeApprovalModal = () => setApprovalModal(null);
  const submitApproval = () => {
    if (!approvalModal) return;
    const requested = Number(approvalModal.req.amount) || 0;
    const approved = Number(approvalModal.approvedAmount) || 0;
    if (approved < 0 || approved > requested) {
      showNotification(`Approved amount must be between 0 and ₹${requested.toLocaleString('en-IN')}`, 'error');
      return;
    }
    handleAction(approvalModal.req._id, 'approve', approvalModal.type, {
      approvedAmount: approved,
      amountComment: approvalModal.amountComment,
    });
    closeApprovalModal();
  };

  const renderTable = (rows, type) => {
    const filtered = rows.filter(r => !employeeFilter || (r.empName || r.id || r._id) === employeeFilter);
    return (
      <div style={{ overflowX: 'auto' }}>
        <table className="emp-table" style={{ tableLayout: 'fixed', width: '100%' }}>
          {/* Column widths tuned so the two right-most pills ("Awaiting
              Manager" / Approved / Rejected) never overlap. Each pill is
              ~120 px wide; giving the Manager Status + Status columns
              ~15% each guarantees they sit on their own line at any
              viewport ≥ 1280 px. Earlier widths (11% each) clipped the
              pill text and made the two columns look merged. */}
          <colgroup>
            <col style={{ width: '8%' }} />   {/* Request ID    */}
            <col style={{ width: '13%' }} />  {/* Employee      */}
            <col style={{ width: '15%' }} />  {/* Route         */}
            <col style={{ width: '7%' }} />   {/* Distance      */}
            <col style={{ width: '9%' }} />   {/* Claim Amount  */}
            <col style={{ width: '9%' }} />   {/* Approved ₹    */}
            <col style={{ width: '9%' }} />   {/* Rejected ₹    */}
            <col style={{ width: '15%' }} />  {/* Manager Status*/}
            <col style={{ width: '15%' }} />  {/* Status        */}
          </colgroup>
          <thead>
            <tr>
              <th>Request ID</th>
              <th>Employee</th>
              <th>Route (From &rarr; To)</th>
              <th>Distance</th>
              <th>Claim Amount</th>
              <th>Approved &#8377;</th>
              <th>Rejected &#8377;</th>
              <th>Manager Status</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan="9" style={{ textAlign: 'center', padding: 40, color: 'var(--text-light)', fontSize: 13 }}>
                  No requests found.
                </td>
              </tr>
            )}
            {filtered.map(req => {
              const claim = Number(req.amount) || 0;
              const isApproved = req.status === 'Approved';
              const isRejected = req.status === 'Rejected';
              const mgrApproved = req.managerStatus === 'Approved';
              const mgrRejected = req.managerStatus === 'Rejected';
              return (
                // #493 — key on the REAL mongo id (unique per claim), not
                // req.id (the employee id, which repeats when one employee
                // has several claims). Prevents duplicate-key reconciliation
                // that left stale rows on the Petrol/Travel switch.
                <tr key={req._id || req.id}>
                  <td><div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-light)' }}>{req.id}</div></td>
                  <td>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)' }}>{req.empName}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-light)' }}>{req.date}</div>
                  </td>
                  <td>
                    <div style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{req.from || '—'}</span>
                      <ChevronRight size={12} color="var(--text-light)" />
                      <span>{req.to || '—'}</span>
                    </div>
                  </td>
                  <td><div style={{ fontSize: 13 }}>{req.distance || 0} km</div></td>
                  <td><div style={{ fontSize: 14, fontWeight: 800, color: '#4CAA17' }}>&#8377;{claim.toLocaleString('en-IN')}</div></td>
                  <td>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#15803D' }}>
                      {isApproved ? '₹' + Number(req.approvedAmount ?? claim).toLocaleString('en-IN')
                        : mgrApproved ? '₹' + Number(req.approvedAmount ?? claim).toLocaleString('en-IN')
                        : mgrRejected ? '₹0' : '—'}
                    </div>
                  </td>
                  <td>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#B91C1C' }}>
                      {isApproved && Number(req.rejectedAmount) > 0 ? '₹' + Number(req.rejectedAmount).toLocaleString('en-IN')
                        : isRejected ? '₹' + claim.toLocaleString('en-IN')
                        : mgrApproved && Number(req.rejectedAmount) > 0 ? '₹' + Number(req.rejectedAmount).toLocaleString('en-IN')
                        : mgrRejected ? '₹' + claim.toLocaleString('en-IN')
                        : '—'}
                    </div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {/* Manager Status is set ONLY from the ERM Web manager
                        view — HRMS shows a read-only pill. Until the
                        manager acts, the cell carries the "Awaiting
                        Manager" pill (same width / shape as the green
                        and red variants so the column never jumps). */}
                    {mgrApproved ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#F0FDF4', color: '#16A34A', minWidth: 110, boxSizing: 'border-box' }}>
                        <CheckCircle size={12} /> Approved
                      </span>
                    ) : mgrRejected ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#FEF2F2', color: '#DC2626', minWidth: 110, boxSizing: 'border-box' }}>
                        <XCircle size={12} /> Rejected
                      </span>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A', minWidth: 110, boxSizing: 'border-box' }}>
                        <Clock size={12} /> Awaiting Manager
                      </span>
                    )}
                  </td>
                  <td>
                    {isApproved ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#F0FDF4', color: '#16A34A' }}>
                        <CheckCircle size={12} /> Approved
                      </span>
                    ) : isRejected ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#FEF2F2', color: '#DC2626' }}>
                        <XCircle size={12} /> Rejected
                      </span>
                    ) : mgrApproved ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        {/* HR doesn't enter approved / rejected amounts —
                            those were already split by the manager from
                            the ERM Web Manager Approve modal. HR just
                            confirms or overrides the decision; the
                            existing amounts + manager's note flow
                            through to the employee via the same notify
                            we already fire on status change. */}
                        <button
                          onClick={() => handleAction(req._id, 'approve', type, {
                            approvedAmount: Number(req.approvedAmount ?? req.amount) || 0,
                            amountComment:  req.amountComment || '',
                          })}
                          style={{ background: '#F0FDF4', color: '#16A34A', border: '1px solid #BBF7D0', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                        >Approve</button>
                        <button
                          onClick={() => handleAction(req._id, 'reject', type)}
                          style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                        >Reject</button>
                      </div>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A' }}>
                        <Clock size={12} /> Awaiting Manager
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const rows = allowanceType === 'petrol' ? petrolRequests : travelRequests;
  const allRows = rows;
  const totalAmt = allRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const approvedAmt = allRows.reduce((s, r) => s + (r.status === 'Approved' ? (Number(r.approvedAmount) || Number(r.amount) || 0) : 0), 0);
  const rejectedAmt = allRows.reduce((s, r) => {
    if (r.status === 'Rejected') return s + (Number(r.amount) || 0);
    if (r.status === 'Approved') return s + (Number(r.rejectedAmount) || 0);
    return s;
  }, 0);
  const pendingAmt = allRows.reduce((s, r) => s + (r.status !== 'Approved' && r.status !== 'Rejected' ? (Number(r.amount) || 0) : 0), 0);

  const employees = Array.from(new Set(allRows.map(r => r.empName || r.id || r._id).filter(Boolean))).sort();

  const downloadCsv = () => {
    const filteredRows = allRows.filter(r => !employeeFilter || (r.empName || r.id || r._id) === employeeFilter);
    const header = ['Request ID', 'Employee', 'Date', 'From', 'To', 'Distance', 'Amount', 'Approved', 'Rejected', 'Status', 'Manager Status', 'Note'];
    const lines = [header.join(',')];
    for (const r of filteredRows) {
      const cells = [r.id || '', r.empName || '', r.date || '', r.from || '', r.to || '', r.distance || 0, r.amount || 0, r.approvedAmount || 0, r.rejectedAmount || 0, r.status || '', r.managerStatus || '', (r.amountComment || '').replace(/[",\n]/g, ' ')];
      lines.push(cells.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const who = employeeFilter ? '-' + employeeFilter.replace(/[^a-zA-Z0-9]+/g, '_') : '';
    a.download = `${allowanceType}-allowance${who}-report.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const downloadPdf = async () => {
    try {
      const filteredRows = allRows.filter(r => !employeeFilter || (r.empName || r.id || r._id) === employeeFilter);
      const kindLabel = allowanceType === 'petrol' ? 'Petrol' : 'Travel';
      // #303 — branded template.
      const doc = await buildBrandedPdf({
        title:    `${kindLabel} Allowance Report`,
        subtitle: 'HR allowance audit  ·  amounts approved, rejected, pending',
        meta: {
          employeeName: employeeFilter || 'All employees',
        },
        head: ['Req ID', 'Employee', 'Route', 'Distance', 'Claim (Rs)', 'Approved (Rs)', 'Rejected (Rs)', 'Status'],
        body: filteredRows.map(r => [
          r.id || '',
          r.empName || '',
          (r.from || '') + ' -> ' + (r.to || ''),
          (Number(r.distance) || 0) + ' km',
          Number(r.amount || 0).toLocaleString('en-IN'),
          Number(r.approvedAmount || 0).toLocaleString('en-IN'),
          Number(r.rejectedAmount || 0).toLocaleString('en-IN'),
          r.status || 'Pending',
        ]),
        totals: [[
          { content: 'Totals', colSpan: 4, styles: { halign: 'right' } },
          { content: Number(totalAmt).toLocaleString('en-IN'),    styles: { halign: 'right' } },
          { content: Number(approvedAmt).toLocaleString('en-IN'), styles: { halign: 'right' } },
          { content: Number(rejectedAmt).toLocaleString('en-IN'), styles: { halign: 'right' } },
          { content: `${filteredRows.length} rows`, styles: { halign: 'center' } },
        ]],
        orientation: 'landscape',
      });
      const who = employeeFilter ? '-' + employeeFilter.replace(/[^a-zA-Z0-9]+/g, '_') : '';
      doc.save(`${allowanceType}-allowance${who}-report.pdf`);
    } catch (err) {
      console.error('[downloadPdf]', err);
      showNotification('Could not generate PDF', 'error');
    }
  };

  const downloadExcel = () => {
    try {
      const filteredRows = allRows.filter(r => !employeeFilter || (r.empName || r.id || r._id) === employeeFilter);
      const kindLabel = allowanceType === 'petrol' ? 'Petrol' : 'Travel';
      // #303 — branded Excel template.
      const head = ['Request ID', 'Employee', 'Date', 'From', 'To', 'Distance (km)',
                    'Claim (Rs)', 'Approved (Rs)', 'Rejected (Rs)',
                    'Status', 'Manager Status', 'Note'];
      const body = filteredRows.map(r => [
        r.id || '',
        r.empName || '',
        r.date || '',
        r.from || '',
        r.to || '',
        Number(r.distance) || 0,
        Number(r.amount) || 0,
        Number(r.approvedAmount) || 0,
        Number(r.rejectedAmount) || 0,
        r.status || 'Pending',
        r.managerStatus || '',
        r.amountComment || '',
      ]);
      const wb = buildBrandedExcel({
        title:    `${kindLabel} Allowance Report`,
        subtitle: 'HR allowance audit',
        meta: {
          employeeName: employeeFilter || 'All employees',
        },
        head, body,
        totals: [
          ['', '', '', '', '', '', 'Total Amount',    Number(totalAmt)],
          ['', '', '', '', '', '', 'Approved Amount', Number(approvedAmt)],
          ['', '', '', '', '', '', 'Rejected Amount', Number(rejectedAmt)],
          ['', '', '', '', '', '', 'Pending Amount',  Number(pendingAmt)],
        ],
      });
      const who = employeeFilter ? '-' + employeeFilter.replace(/[^a-zA-Z0-9]+/g, '_') : '';
      XLSX.writeFile(wb, `${allowanceType}-allowance${who}-report.xlsx`);
    } catch (err) {
      console.error('[downloadExcel]', err);
      showNotification('Could not generate Excel', 'error');
    }
  };

  const tile = (lbl, amt, color, bg) => (
    <div key={lbl} style={{ flex: '1 1 180px', background: bg, borderRadius: 12, padding: '14px 16px', border: '1px solid var(--border-color)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.4 }}>{lbl}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color, marginTop: 4 }}>&#8377;{Number(amt || 0).toLocaleString('en-IN')}</div>
    </div>
  );

  return (
    <div className="emp-list-page">
      <div className="emp-list-header">
        <div className="ne-breadcrumb">
          <span className="ne-breadcrumb-link" onClick={onBack}>Dashboard</span>
          <ChevronRight size={13} />
          <span>Allowance</span>
        </div>
        <div className="emp-list-title-row">
          <div>
            <h1 className="ne-page-title">Allowance Approvals</h1>
            <p className="ne-page-sub">Manage and approve Petrol and Travel allowance requests.</p>
          </div>
          <div style={{ display: 'flex', background: '#F1F5F9', padding: 4, borderRadius: 30, border: '1px solid #E2E8F0' }}>
            <button onClick={() => setAllowanceType('petrol')} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 20px', borderRadius: 25, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: allowanceType === 'petrol' ? '#fff' : 'transparent', color: allowanceType === 'petrol' ? '#4CAA17' : 'var(--text-light)' }}>
              <Fuel size={16} /> Petrol
            </button>
            <button onClick={() => setAllowanceType('travel')} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 20px', borderRadius: 25, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: allowanceType === 'travel' ? '#fff' : 'transparent', color: allowanceType === 'travel' ? '#4299E1' : 'var(--text-light)' }}>
              <Car size={16} /> Travel
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: 24 }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            {tile('Total Amount', totalAmt, '#0F172A', '#F8FAFC')}
            {tile('Approved Amount', approvedAmt, '#15803D', '#F0FDF4')}
            {tile('Rejected Amount', rejectedAmt, '#B91C1C', '#FEF2F2')}
            {tile('Pending Amount', pendingAmt, '#D97706', '#FFFBEB')}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: '#475569' }}>
              Filter employee:
              <select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)} style={{ padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: '1px solid var(--border-color)', background: '#fff', color: '#0F172A', minWidth: 200 }}>
                <option value="">All employees</option>
                {employees.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={downloadPdf} disabled={rows.length === 0}
                style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', cursor: rows.length === 0 ? 'not-allowed' : 'pointer', opacity: rows.length === 0 ? 0.5 : 1 }}>
                Download PDF
              </button>
              <button type="button" onClick={downloadExcel} disabled={rows.length === 0}
                style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0', cursor: rows.length === 0 ? 'not-allowed' : 'pointer', opacity: rows.length === 0 ? 0.5 : 1 }}>
                Download Excel
              </button>
              {/* Download CSV removed (#288 — HR uses PDF/Excel only). */}
            </div>
          </div>
        </div>

        {/* #493 — key={allowanceType} forces React to REMOUNT this whole
            card (header + table) whenever the Petrol/Travel toggle changes.
            Without it, React reconciles the existing <table>/<tr> nodes in
            place; because two claims from the SAME employee share the same
            row key (employee id), it reuses petrol <tr> DOM for travel data
            and the table shows stale rows even though the heading/cards
            already switched. Remounting guarantees the table data always
            matches the selected allowance type. */}
        <div className="card" key={allowanceType}>
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {allowanceType === 'petrol' ? <Fuel size={20} color="#4CAA17" /> : <Car size={20} color="#4299E1" />}
            <div className="card-title">{allowanceType === 'petrol' ? 'Petrol' : 'Travel'} Allowance Requests</div>
          </div>
          {renderTable(rows, allowanceType)}
        </div>
      </div>

      {/* Approve-with-amount modal removed — HR no longer enters the
          approved / rejected split. The manager's decision (set via
          ERM Web's Approve Allowance modal) is the canonical breakdown
          and propagates to the employee with the note. */}
    </div>
  );
}
