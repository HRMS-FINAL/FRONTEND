import React, { useState, useEffect } from 'react';
import { ChevronRight, Fuel, Car, CheckCircle, XCircle, Clock } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';

// Mobile-app petrol/travel allowance requests arrive via HRMS backend proxy
// at /api/allowances (server-side talks to the mobile backend using
// MOBILE_ADMIN_SECRET). The UI below is unchanged — only the data source
// flipped from hardcoded mock arrays to real fetches.
import { API } from '../config/api';
const LS_KEY = 'tesco_hrms_allowance_cache';

/** Read last-fetched petrol+travel arrays from localStorage so the page
 *  populates instantly on refresh instead of being blank during the
 *  ~30 s mobile-backend cold-start. */
function readCache() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { petrol: [], travel: [] };
    const parsed = JSON.parse(raw);
    return {
      petrol: Array.isArray(parsed?.petrol) ? parsed.petrol : [],
      travel: Array.isArray(parsed?.travel) ? parsed.travel : [],
    };
  } catch { return { petrol: [], travel: [] }; }
}

export default function Allowance({ onBack }) {
  const { showNotification } = useNotification();

  // State to toggle between Petrol Allowance ('petrol') and Travel Allowance ('travel')
  const [allowanceType, setAllowanceType] = useState('petrol');
  // Per-employee filter — '' means "everyone". Drives both the visible table
  // rows and the CSV download so HR can pull a single person's report.
  const [employeeFilter, setEmployeeFilter] = useState('');

  // Seed both arrays from cache so neither tab is blank on refresh.
  const cached = readCache();
  const [petrolRequests, setPetrolRequests] = useState(cached.petrol);
  const [travelRequests, setTravelRequests] = useState(cached.travel);
  const [loading,        setLoading]        = useState(true);
  // Approval modal — opens when HR clicks Approve so they can enter the
  // amount they're signing off on (≤ requested amount). The rejected
  // portion is computed automatically and shown to HR before submit.
  const [approvalModal, setApprovalModal] = useState(null);   // { req, type } | null

  // Load + poll: refetch every 30s so newly-submitted mobile requests show
  // up without a page refresh. The /api/allowances response is already
  // split into petrol/travel arrays in the exact shape this UI expects
  // ({ id, empName, from, to, distance, amount, status, date, _id }).
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res  = await fetch(`${API}/allowances?limit=300`);
        const data = await res.json();
        if (cancelled || !data) return;
        if (Array.isArray(data.petrol)) setPetrolRequests(data.petrol);
        if (Array.isArray(data.travel)) setTravelRequests(data.travel);
        try {
          localStorage.setItem(LS_KEY, JSON.stringify({
            petrol: Array.isArray(data.petrol) ? data.petrol : [],
            travel: Array.isArray(data.travel) ? data.travel : [],
          }));
        } catch {}
      } catch { /* keep current data on screen */ }
      finally { if (!cancelled) setLoading(false); }
    };
    load();
    const t = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  // ─── Two-stage approval ─────────────────────────────────────────────
  // Manager Approve/Reject is a LOCAL-ONLY decision — it doesn't hit the
  // backend. It just gates whether the HR Approve/Reject buttons show
  // up in the Status column. Once the manager approves, HR sees the
  // buttons; if the manager rejects, the Status column shows "—".
  //
  // (We don't persist manager status to the backend yet because the
  // mobile Allowance model doesn't have a managerStatus field. If HR
  // needs that persisted, we can add it later — for now it's a UX gate.)
  const handleManagerAction = (id, type, newManagerStatus) => {
    const setList = type === 'petrol' ? setPetrolRequests : setTravelRequests;
    setList(prev => prev.map(req => req.id === id ? { ...req, managerStatus: newManagerStatus } : req));
    showNotification(`Manager ${newManagerStatus.toLowerCase()} request ${id}`, 'success');
  };

  // HR Approve/Reject — optimistically flip locally, then PATCH the
  // mobile backend through the HRMS proxy. Backend fires an in-app
  // notification to the employee on a real status transition.
  const handleAction = async (id, action, type, extras = {}) => {
    const newStatus = action === 'approve' ? 'Approved' : 'Rejected';
    const setList   = type === 'petrol' ? setPetrolRequests : setTravelRequests;
    const sourceArr = type === 'petrol' ? petrolRequests   : travelRequests;
    const target    = sourceArr.find((r) => r.id === id);
    // Block HR action if manager hasn't approved yet.
    if (target && target.managerStatus !== 'Approved') {
      showNotification('Cannot process — Manager has not approved yet.', 'error');
      return;
    }
    // Compute the breakdown locally so the row reflects it instantly.
    const requested      = Number(target?.amount) || 0;
    const approvedAmount = action === 'approve'
      ? Math.max(0, Math.min(Number(extras.approvedAmount) || 0, requested))
      : 0;
    const rejectedAmount = action === 'approve'
      ? Math.max(0, requested - approvedAmount)
      : requested;
    setList(prev => prev.map(req => req.id === id
      ? { ...req, status: newStatus, approvedAmount, rejectedAmount, amountComment: extras.amountComment || req.amountComment || '' }
      : req));
    try {
      const res = await fetch(`${API}/allowances/${target?._id || id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          status:        newStatus.toLowerCase(),
          reviewedBy:    'HR',
          approvedAmount,
          amountComment: extras.amountComment || '',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
      const breakdown = action === 'approve' && rejectedAmount > 0
        ? ` (₹${approvedAmount.toLocaleString('en-IN')} approved · ₹${rejectedAmount.toLocaleString('en-IN')} rejected)`
        : '';
      showNotification(`Request ${id} ${newStatus}!${breakdown}`, action === 'approve' ? 'success' : 'error');
    } catch (err) {
      // Roll back optimistic update if the server rejected it.
      setList(prev => prev.map(req => req.id === id ? { ...req, status: target?.status || 'Pending' } : req));
      showNotification(`Could not save: ${err.message}`, 'error');
    }
  };

  // Open the Approval modal — HR enters the amount they're signing off
  // on, the modal previews the rejected portion, then triggers
  // handleAction('approve', …) with the breakdown.
  const openApprovalModal = (req, type) => {
    if (req?.managerStatus !== 'Approved') {
      showNotification('Cannot process — Manager has not approved yet.', 'error');
      return;
    }
    setApprovalModal({
      req,
      type,
      approvedAmount: String(req.amount || ''),  // start with full claim
      amountComment:  '',
    });
  };
  const closeApprovalModal = () => setApprovalModal(null);
  const submitApproval = () => {
    if (!approvalModal) return;
    const requested = Number(approvalModal.req.amount) || 0;
    const approved  = Number(approvalModal.approvedAmount) || 0;
    if (approved < 0 || approved > requested) {
      showNotification(`Approved amount must be between 0 and ₹${requested.toLocaleString('en-IN')}`, 'error');
      return;
    }
    handleAction(approvalModal.req.id, 'approve', approvalModal.type, {
      approvedAmount: approved,
      amountComment:  approvalModal.amountComment,
    });
    closeApprovalModal();
  };

  return (
    <div className="emp-list-page">
      {/* Header */}
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
          
          {/* Dongle Toggle Switch */}
          <div style={{
            display: 'flex',
            background: '#F1F5F9',
            padding: '4px',
            borderRadius: '30px',
            border: '1px solid #E2E8F0',
            width: 'fit-content'
          }}>
            <button
              onClick={() => setAllowanceType('petrol')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 20px',
                borderRadius: '25px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 700,
                transition: 'all 0.2s ease',
                background: allowanceType === 'petrol' ? '#ffffff' : 'transparent',
                color: allowanceType === 'petrol' ? '#4CAA17' : 'var(--text-light)',
                boxShadow: allowanceType === 'petrol' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'
              }}
            >
              <Fuel size={16} />
              Petrol
            </button>
            <button
              onClick={() => setAllowanceType('travel')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 20px',
                borderRadius: '25px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 700,
                transition: 'all 0.2s ease',
                background: allowanceType === 'travel' ? '#ffffff' : 'transparent',
                color: allowanceType === 'travel' ? '#4299E1' : 'var(--text-light)',
                boxShadow: allowanceType === 'travel' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'
              }}
            >
              <Car size={16} />
              Travel
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: '24px' }}>

        {/* ── Summary tiles + download report ─────────────────────── */}
        {(() => {
          const allRows = (allowanceType === 'petrol' ? petrolRequests : travelRequests);
          // Build the unique employee list from the currently-loaded rows.
          // Falls back to id if no name is present so HR can still pick.
          const employees = Array.from(
            new Map(allRows.map(r => [r.empName || r.id || r._id, r.empName || r.id || r._id])).entries()
          ).map(([k]) => k).filter(Boolean).sort();
          const rows = employeeFilter
            ? allRows.filter(r => (r.empName || r.id || r._id) === employeeFilter)
            : allRows;
          const totalAmt    = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
          const approvedAmt = rows.reduce((s, r) => s + (r.status === 'Approved' ? (Number(r.approvedAmount) || Number(r.amount) || 0) : 0), 0);
          const rejectedAmt = rows.reduce((s, r) => {
            if (r.status === 'Rejected') return s + (Number(r.amount) || 0);
            if (r.status === 'Approved') return s + (Number(r.rejectedAmount) || 0);
            return s;
          }, 0);
          const pendingAmt  = rows.reduce((s, r) => s + (r.status !== 'Approved' && r.status !== 'Rejected' ? (Number(r.amount) || 0) : 0), 0);

          const downloadCsv = () => {
            const header = ['Request ID', 'Employee', 'Date', 'From', 'To', 'Distance (km)', 'Amount (₹)', 'Approved (₹)', 'Rejected (₹)', 'Status', 'Manager Status', 'Note'];
            const lines  = [header.join(',')];
            for (const r of rows) {
              const cells = [
                r.id || r._id || '',
                r.empName || '',
                r.date || '',
                r.from || '', r.to || '',
                Number(r.distance) || 0,
                Number(r.amount)   || 0,
                Number(r.approvedAmount) || 0,
                Number(r.rejectedAmount) || 0,
                r.status || '',
                r.managerStatus || '',
                String(r.amountComment || '').replace(/[",\n]/g, ' '),
              ];
              lines.push(cells.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(','));
            }
            const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href = url;
            const who = employeeFilter ? '-' + String(employeeFilter).replace(/[^a-zA-Z0-9]+/g, '_') : '';
            a.download = (allowanceType === 'petrol' ? 'petrol' : 'travel') + '-allowance' + who + '-report.csv';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          };

          const tile = (lbl, amt, color, bg) => (
            <div key={lbl} style={{
              flex: '1 1 180px', background: bg, borderRadius: 12, padding: '14px 16px',
              border: '1px solid var(--border-color)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.4 }}>{lbl}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color, marginTop: 4 }}>
                ₹{Number(amt || 0).toLocaleString('en-IN')}
              </div>
            </div>
          );

          return (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                {tile('Total Amount',    totalAmt,    '#0F172A', '#F8FAFC')}
                {tile('Approved Amount', approvedAmt, '#15803D', '#F0FDF4')}
                {tile('Rejected Amount', rejectedAmt, '#B91C1C', '#FEF2F2')}
                {tile('Pending Amount',  pendingAmt,  '#D97706', '#FFFBEB')}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: '#475569' }}>
                  Filter employee:
                  <select
                    value={employeeFilter}
                    onChange={(e) => setEmployeeFilter(e.target.value)}
                    style={{
                      padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                      border: '1px solid var(--border-color)', background: '#fff', color: '#0F172A',
                      minWidth: 200,
                    }}
                  >
                    <option value="">All employees</option>
                    {employees.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={downloadCsv}
                  disabled={rows.length === 0}
                  style={{
                    padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                    background: '#F0FDF4', color: '#15803D',
                    border: '1px solid #BBF7D0',
                    cursor: rows.length === 0 ? 'not-allowed' : 'pointer',
                    opacity: rows.length === 0 ? 0.5 : 1,
                  }}
                >
                  Download {allowanceType === 'petrol' ? 'Petrol' : 'Travel'} Report (CSV)
                </button>
              </div>
            </div>
          );
        })()}

        {/* PETROL APPROVALS TABLE */}
        {allowanceType === 'petrol' && (
          <div className="card">
            <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Fuel size={20} color="#4CAA17" />
              <div className="card-title">Petrol Allowance Requests</div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="emp-table">
                <thead>
                  <tr>
                    <th>Request ID</th>
                    <th>Employee</th>
                    <th>Route (From ➝ To)</th>
                    <th>Distance</th>
                    <th>Claim Amount</th>
                    <th>MANAGER STATUS</th>
                    <th>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {petrolRequests.filter(req => !employeeFilter || (req.empName || req.id || req._id) === employeeFilter).map(req => (
                    <tr key={req.id}>
                      <td><div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-light)' }}>{req.id}</div></td>
                      <td>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>{req.empName}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-light)' }}>{req.date}</div>
                      </td>
                      <td>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {req.from}
                          <ChevronRight size={12} color="var(--text-light)" />
                          {req.to}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>{req.distance} km</div>
                        {req.distanceSource === 'gps' && (
                          <div style={{ fontSize: '10px', color: '#16A34A', fontWeight: 700 }}>· from GPS</div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: '#4CAA17' }}>₹{Number(req.amount || 0).toLocaleString('en-IN')}</div>
                        {/* After HR approves with a haircut, show the
                            split inline so HR can audit at a glance. */}
                        {req.status === 'Approved' && (Number(req.approvedAmount) > 0 || Number(req.rejectedAmount) > 0) && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
                            <span style={{ fontSize: '10px', fontWeight: 700, color: '#15803D' }}>
                              ✓ Approved ₹{Number(req.approvedAmount || 0).toLocaleString('en-IN')}
                            </span>
                            {Number(req.rejectedAmount) > 0 && (
                              <span style={{ fontSize: '10px', fontWeight: 700, color: '#B91C1C' }}>
                                ✗ Rejected ₹{Number(req.rejectedAmount).toLocaleString('en-IN')}
                              </span>
                            )}
                            {req.amountComment && (
                              <span style={{ fontSize: '10px', color: '#64748B', fontStyle: 'italic', marginTop: 2 }} title={req.amountComment}>
                                {req.amountComment.length > 28 ? req.amountComment.slice(0, 28) + '…' : req.amountComment}
                              </span>
                            )}
                          </div>
                        )}
                        {req.status === 'Rejected' && (
                          <div style={{ fontSize: '10px', fontWeight: 700, color: '#B91C1C', marginTop: 4 }}>
                            ✗ Fully rejected
                          </div>
                        )}
                      </td>
                      {/* MANAGER STATUS — first gate. */}
                      <td>
                        {req.managerStatus === 'Approved' && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: '#F0FDF4', color: '#16A34A' }}>
                            <CheckCircle size={12} /> Approved
                          </span>
                        )}
                        {req.managerStatus === 'Rejected' && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: '#FEF2F2', color: '#DC2626' }}>
                            <XCircle size={12} /> Rejected
                          </span>
                        )}
                        {/* Manager status is set ONLY from ERM Web now —
                            HR no longer has inline approve/reject here. */}
                        {!req.managerStatus && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A' }}>
                            <Clock size={12} /> Awaiting Manager
                          </span>
                        )}
                      </td>
                      {/* STATUS — HR's column. Empty if manager rejected;
                          Approve/Reject buttons if manager approved; pill
                          once HR has acted. */}
                      <td>
                        {req.managerStatus === 'Rejected' ? (
                          // Manager rejected → Status column stays EMPTY.
                          null
                        ) : req.status === 'Approved' ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: '#F0FDF4', color: '#16A34A' }}>
                            <CheckCircle size={12} /> Approved
                          </span>
                        ) : req.status === 'Rejected' ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: '#FEF2F2', color: '#DC2626' }}>
                            <XCircle size={12} /> Rejected
                          </span>
                        ) : req.managerStatus === 'Approved' ? (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              onClick={() => openApprovalModal(req, 'petrol')}
                              style={{ background: '#F0FDF4', color: '#16A34A', border: '1px solid #BBF7D0', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleAction(req.id, 'reject', 'petrol')}
                              style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A' }}>
                            <Clock size={12} /> Awaiting Manager
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {petrolRequests.length === 0 && (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-light)', fontSize: '13px' }}>No requests found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TRAVEL APPROVALS TABLE */}
        {allowanceType === 'travel' && (
          <div className="card">
            <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Car size={20} color="#4299E1" />
              <div className="card-title">Travel Allowance Requests</div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="emp-table">
                <thead>
                  <tr>
                    <th>Request ID</th>
                    <th>Employee</th>
                    <th>Route (From ➝ To)</th>
                    <th>Distance</th>
                    <th>Claim Amount</th>
                    <th>MANAGER STATUS</th>
                    <th>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {travelRequests.filter(req => !employeeFilter || (req.empName || req.id || req._id) === employeeFilter).map(req => (
                    <tr key={req.id}>
                      <td><div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-light)' }}>{req.id}</div></td>
                      <td>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>{req.empName}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-light)' }}>{req.date}</div>
                      </td>
                      <td>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {req.from}
                          <ChevronRight size={12} color="var(--text-light)" />
                          {req.to}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>{req.distance} km</div>
                        {req.distanceSource === 'gps' && (
                          <div style={{ fontSize: '10px', color: '#16A34A', fontWeight: 700 }}>· from GPS</div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: '#4299E1' }}>₹{Number(req.amount || 0).toLocaleString('en-IN')}</div>
                        {/* After HR approves with a haircut, show the
                            split inline so HR can audit at a glance. */}
                        {req.status === 'Approved' && (Number(req.approvedAmount) > 0 || Number(req.rejectedAmount) > 0) && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
                            <span style={{ fontSize: '10px', fontWeight: 700, color: '#15803D' }}>
                              ✓ Approved ₹{Number(req.approvedAmount || 0).toLocaleString('en-IN')}
                            </span>
                            {Number(req.rejectedAmount) > 0 && (
                              <span style={{ fontSize: '10px', fontWeight: 700, color: '#B91C1C' }}>
                                ✗ Rejected ₹{Number(req.rejectedAmount).toLocaleString('en-IN')}
                              </span>
                            )}
                            {req.amountComment && (
                              <span style={{ fontSize: '10px', color: '#64748B', fontStyle: 'italic', marginTop: 2 }} title={req.amountComment}>
                                {req.amountComment.length > 28 ? req.amountComment.slice(0, 28) + '…' : req.amountComment}
                              </span>
                            )}
                          </div>
                        )}
                        {req.status === 'Rejected' && (
                          <div style={{ fontSize: '10px', fontWeight: 700, color: '#B91C1C', marginTop: 4 }}>
                            ✗ Fully rejected
                          </div>
                        )}
                      </td>
                      {/* MANAGER STATUS — first gate. */}
                      <td>
                        {req.managerStatus === 'Approved' && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: '#F0FDF4', color: '#16A34A' }}>
                            <CheckCircle size={12} /> Approved
                          </span>
                        )}
                        {req.managerStatus === 'Rejected' && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: '#FEF2F2', color: '#DC2626' }}>
                            <XCircle size={12} /> Rejected
                          </span>
                        )}
                        {/* Manager status is set ONLY from ERM Web now —
                            HR no longer has inline approve/reject here. */}
                        {!req.managerStatus && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A' }}>
                            <Clock size={12} /> Awaiting Manager
                          </span>
                        )}
                      </td>
                      {/* STATUS — HR's column. Empty if manager rejected. */}
                      <td>
                        {req.managerStatus === 'Rejected' ? (
                          // Manager rejected → Status column stays EMPTY.
                          null
                        ) : req.status === 'Approved' ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: '#F0FDF4', color: '#16A34A' }}>
                            <CheckCircle size={12} /> Approved
                          </span>
                        ) : req.status === 'Rejected' ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: '#FEF2F2', color: '#DC2626' }}>
                            <XCircle size={12} /> Rejected
                          </span>
                        ) : req.managerStatus === 'Approved' ? (
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={() => openApprovalModal(req, 'travel')}
                              style={{ background: '#F0FDF4', color: '#16A34A', border: '1px solid #BBF7D0', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleAction(req.id, 'reject', 'travel')}
                              style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A' }}>
                            <Clock size={12} /> Awaiting Manager
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {travelRequests.length === 0 && (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-light)', fontSize: '13px' }}>No requests found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* Approval-amount modal — opens when HR clicks Approve. HR can
          dial down the approved amount (e.g. when the GPS-derived
          distance is less than what the employee typed) and the
          rejected portion is computed live. The note is forwarded to
          the employee in the in-app notification. */}
      {approvalModal && (() => {
        const requested = Number(approvalModal.req.amount) || 0;
        const approved  = Number(approvalModal.approvedAmount) || 0;
        const rejected  = Math.max(0, requested - approved);
        const r = approvalModal.req;
        return (
          <div
            onClick={closeApprovalModal}
            style={{
              position: 'fixed', inset: 0, zIndex: 1000,
              background: 'rgba(15,23,42,0.45)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 24,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: '#fff', borderRadius: 14, padding: 24,
                width: '100%', maxWidth: 480,
                boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>
                Approve {approvalModal.type === 'petrol' ? 'Petrol' : 'Travel'} Claim
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginBottom: 18 }}>
                {r.empName} · {r.from} → {r.to} · {r.distance} km
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
                <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.4 }}>Requested</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginTop: 2 }}>
                    ₹{requested.toLocaleString('en-IN')}
                  </div>
                </div>
                <div style={{ background: '#F0FDF4', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#15803D', textTransform: 'uppercase', letterSpacing: 0.4 }}>Approved</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#15803D', marginTop: 2 }}>
                    ₹{approved.toLocaleString('en-IN')}
                  </div>
                </div>
                <div style={{ background: '#FEF2F2', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#B91C1C', textTransform: 'uppercase', letterSpacing: 0.4 }}>Rejected</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#B91C1C', marginTop: 2 }}>
                    ₹{rejected.toLocaleString('en-IN')}
                  </div>
                </div>
              </div>

              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>
                Approved Amount (₹)
              </label>
              <input
                type="number"
                min={0}
                max={requested}
                value={approvalModal.approvedAmount}
                onChange={(e) => setApprovalModal({ ...approvalModal, approvedAmount: e.target.value })}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  border: '1.5px solid #E2E8F0', fontSize: 13, marginBottom: 14,
                  boxSizing: 'border-box',
                }}
                placeholder={`max ₹${requested.toLocaleString('en-IN')}`}
              />

              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>
                Note (shown to employee, optional)
              </label>
              <textarea
                value={approvalModal.amountComment}
                onChange={(e) => setApprovalModal({ ...approvalModal, amountComment: e.target.value })}
                rows={3}
                placeholder="e.g. Approved at GPS-measured distance instead of claimed distance."
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  border: '1.5px solid #E2E8F0', fontSize: 13, marginBottom: 16,
                  boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit',
                }}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={closeApprovalModal}
                  style={{
                    padding: '9px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                    background: 'transparent', color: '#64748B',
                    border: '1px solid #E2E8F0', cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitApproval}
                  style={{
                    padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 800,
                    background: '#16A34A', color: '#fff',
                    border: 'none', cursor: 'pointer',
                  }}
                >
                  Approve {approved > 0 ? `₹${approved.toLocaleString('en-IN')}` : ''}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
