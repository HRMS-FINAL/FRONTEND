import React, { useState, useEffect } from 'react';
// `Search` icon dropped Jun 2026 — search bar removed from the page.
import { ChevronRight, ClipboardList, AlertCircle, Check, X, Clock, Inbox } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';

// Mobile-app leave & permission requests arrive via HRMS backend proxy at
// /api/leave-requests (server-side talks to https://backend-emqy.onrender.com
// using MOBILE_ADMIN_SECRET). The UI below is unchanged — only the data
// source switched from the hardcoded mock array to real fetches.
import { API } from '../config/api';
// Bumped Jun 2026 — older caches predated the requestType field so the
// type classifier had nothing to read and rows leaked into the wrong
// tab. Changing the key invalidates every stale browser cache in one
// shot, forcing a fresh fetch.
const LS_KEY = 'tesco_hrms_leave_requests_cache_v2';

/** Read last-fetched requests from localStorage so the page populates
 *  instantly on refresh instead of waiting for the ~30s mobile-backend
 *  cold-start to complete. */
function readCache() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export default function LeavePermissionRequest({ onBack }) {
  const { showNotification } = useNotification();
  const [activeTab, setActiveTab] = useState('leave-requests'); // 'leave-requests' or 'permission-requests'
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('');
  const [actionModal, setActionModal] = useState(null);
  const [actionMessage, setActionMessage] = useState('');

  // Seed from cache so the table is never blank on refresh.
  const [requests, setRequests] = useState(() => readCache());
  const [loading,  setLoading]  = useState(true);

  // Load + poll: refetch every 30s so newly-filed mobile requests show up
  // automatically. The shape returned by /api/leave-requests already matches
  // the field names this UI expects (name/role/dept/type/duration/date/...).
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res  = await fetch(`${API}/leave-requests?limit=200`);
        const data = await res.json();
        if (!cancelled && data && Array.isArray(data.items)) {
          setRequests(data.items);
          try { localStorage.setItem(LS_KEY, JSON.stringify(data.items)); } catch {}
        }
      } catch { /* leave previous data on screen */ }
      finally { if (!cancelled) setLoading(false); }
    };
    load();
    const t = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const handleManagerAction = async (rowKey, newManagerStatus) => {
    // IMPORTANT: rowKey is the row's mongo `_id`, NOT the company
    // employee ID. Earlier this function looked rows up by `r.id`
    // (which equals empId like "TES026") — that key collides for
    // every employee with > 1 pending request, so the patch landed
    // on the wrong leave document and the employee's ERM app never
    // saw their actual request update. Now we match on _id so each
    // row maps to exactly one server document.
    const targetReq = requests.find(r => r._id === rowKey);
    if (!targetReq) {
      showNotification('Could not locate that request locally. Please refresh.', 'error');
      return;
    }
    setRequests(prev => prev.map(r => r._id === rowKey ? { ...r, managerStatus: newManagerStatus } : r));
    try {
      const res = await fetch(`${API}/leave-requests/${targetReq._id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          managerStatus: newManagerStatus.toLowerCase(),
          reviewedBy:    'Manager',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
      showNotification(`Manager status updated to ${newManagerStatus}!`, 'success');
    } catch (err) {
      // Roll back optimistic update if the server rejected the write.
      setRequests(prev => prev.map(r => r._id === rowKey ? { ...r, managerStatus: targetReq.managerStatus || '' } : r));
      showNotification(`Could not save manager decision: ${err.message}`, 'error');
    }
  };

  const initiateAction = (rowKey, newStatus) => {
    // rowKey is the mongo _id of the row HR clicked. Same uniqueness
    // story as handleManagerAction above.
    const targetReq = requests.find(r => r._id === rowKey);
    if (!targetReq) {
      showNotification('Could not locate that request locally. Please refresh.', 'error');
      return;
    }
    if (targetReq.managerStatus !== 'Approved') {
      showNotification("Cannot process request until Manager approves!", "error");
      return;
    }
    setActionModal({ rowKey, status: newStatus });
    setActionMessage('');
  };

  // Confirm action — sends PATCH to HRMS backend, which forwards to mobile
  // backend, which in turn notifies the employee in-app. Targets the row
  // by its mongo _id so an employee with multiple pending requests has
  // each one updated independently (employee-ID matching used to cause
  // cross-row collisions, which is why ERM kept seeing Pending).
  const confirmAction = async () => {
    if (!actionModal) return;
    const { rowKey, status } = actionModal;
    const finalMessage = actionMessage.trim() || `Your request has been ${status.toLowerCase()}.`;
    const targetReq = requests.find(r => r._id === rowKey);
    if (!targetReq) {
      showNotification('Could not locate that request locally. Please refresh.', 'error');
      setActionModal(null);
      return;
    }
    setRequests(prev => prev.map(r => r._id === rowKey ? { ...r, status, message: finalMessage } : r));
    try {
      const res = await fetch(`${API}/leave-requests/${targetReq._id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          status:    status.toLowerCase(),
          hrComment: finalMessage,
          reviewedBy:'HR',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
      showNotification(`Request successfully ${status.toLowerCase() === 'approved' ? 'approved' : 'rejected'}!`, "success");
    } catch (err) {
      setRequests(prev => prev.map(r => r._id === rowKey ? { ...r, status: targetReq.status || 'Pending' } : r));
      showNotification(`Could not save: ${err.message}`, "error");
    }
    setActionModal(null);
  };

  // ── Row classifier ───────────────────────────────────────────────────
  // The mobile backend serialises permission rows with requestType
  // 'permission' and renders type as "Permission (Nh)". Leave rows have
  // requestType undefined / 'leave' and type set to the leave category
  // ("Sick Leave", "Casual Leave", "Earned Leave", etc.). A defensive
  // classifier that checks BOTH fields plus the date-shape clues
  // (durationHours / startTime + endTime ⇒ permission) prevents an
  // unusual leave-type string from leaking into the Permission tab.
  function classify(r) {
    // Rewritten Jun 2026 (#288 — final): the source-of-truth is the
    // `type` STRING on each row, not `requestType` (which has been seen
    // inverted on some legacy records). The reshape stamps permission
    // rows with type = "Permission (Nh)" and leave rows with the leave
    // category name ("Casual Leave", "Sick Leave", etc.). We bias
    // hard on the visible label so the table NEVER disagrees with
    // what the type column shows the user.
    const t = String(r?.type || '').toLowerCase().trim();
    if (t.startsWith('permission')) return 'permission';
    if (t.includes('leave'))        return 'leave';

    // Structural signal — permission rows always have a duration/time
    // window; leaves always have a date range. If both are present
    // (shouldn't happen) we treat the time window as more specific.
    if (r?.durationHours || r?.startTime || r?.endTime || r?.permissionDate) return 'permission';
    if (r?.startDate || r?.endDate) return 'leave';

    // Last-resort: requestType. This is checked LAST because we've
    // seen it inverted on legacy records, while the type STRING is
    // generated by the reshape from authoritative fields.
    const rt = String(r?.requestType || '').toLowerCase().trim();
    if (rt === 'permission') return 'permission';
    if (rt === 'leave')      return 'leave';
    return 'leave';
  }

  const leaveReqCount      = requests.filter(r => r.status === 'Pending' && classify(r) === 'leave').length;
  const permissionReqCount = requests.filter(r => r.status === 'Pending' && classify(r) === 'permission').length;

  const displayRecords = React.useMemo(() => {
    // Diagnostic — lets us confirm in DevTools that the memo IS
    // recomputing on every tab click and that the source set is being
    // classified correctly. Remove after a few days in prod.
    try {
      const distribution = requests.reduce((acc, r) => {
        const k = classify(r);
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {});
      // eslint-disable-next-line no-console
      console.log('[Approvals] tab=', activeTab, ' total=', requests.length, ' kinds=', distribution);
    } catch (_) { /* swallow — diagnostic only */ }

    return requests.filter(item => {
      // 1. Tab gate — leave rows only in Leave tab, permission rows only
      //    in Permission tab. Uses the shared classifier so both the
      //    count badges above and the table below agree perfectly on
      //    what each row is. Anything that doesn't fit a tab is hidden.
      const kind = classify(item);
      if (activeTab === 'leave-requests'      && kind !== 'leave')      return false;
      if (activeTab === 'permission-requests' && kind !== 'permission') return false;

      // 2. Search query — case-insensitive across every field HR might
      // type into the box (name, employee id in either field, role,
      // department, reason, type label, status). We coerce every
      // candidate with String() so a single missing field doesn't crash
      // the whole filter and leave the table silently empty.
      const q = String(searchQuery || '').trim().toLowerCase();
      if (q) {
        const haystack = [
          item.name, item.employeeName,
          item.employeeId, item.id, item.empId,
          item.role, item.dept,
          item.reason, item.type,
          item.duration, item.date,
          item.status, item.managerStatus,
          item.employee?.userId, item.employee?.email,
          item.employee?.designation, item.employee?.department,
        ]
          .filter(Boolean)
          .map((s) => String(s).toLowerCase())
          .join(' || ');
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [requests, activeTab, searchQuery]);

  const filterTabs = [];   // secondary leave/permission selector removed per HR request

  return (
    // Override the global .emp-list-page rules (`flex: 1`, `min-height: 0`,
    // `overflow-y: auto`) which cap the page to the viewport and force the
    // table into an inner scroll. HR couldn't see the full Pending Leave
    // Requests list because of that. With `flex: 'unset'`, `minHeight:
    // 'auto'`, `height: 'auto'`, `overflow: 'visible'` the page grows to
    // its content's natural height and the BROWSER WINDOW scrolls — every
    // row is reachable just by scrolling the page itself.
    <div
      className="emp-list-page"
      style={{
        flex: 'unset',
        minHeight: 'auto',
        height: 'auto',
        overflow: 'visible',
      }}
    >
      <div className="emp-list-header">
        <div className="ne-breadcrumb">
          <span className="ne-breadcrumb-link" onClick={onBack}>Dashboard</span>
          <ChevronRight size={13} />
          <span>Attendance</span>
          <ChevronRight size={13} />
          <span>Leave & Permission Request</span>
        </div>
        <div className="emp-list-title-row">
          <div>
            <h1 className="ne-page-title">Leave & Permission Requests</h1>
            <p className="ne-page-sub">Manage and track employee leave and permission requests.</p>
          </div>
        </div>
      </div>

      <div className="stats-row" style={{ marginTop: '20px' }}>
        {/* Leave Requests Card */}
        <div 
          className={`stat-card attendance-stat-card ${activeTab === 'leave-requests' ? 'active-filter' : ''}`}
          onClick={() => { setActiveTab('leave-requests'); setFilterType(''); }}
          style={{ cursor: 'pointer' }}
        >
          <div className="stat-card-top">
            <div className="stat-icon-wrap" style={{ background: '#4299E115' }}>
              <ClipboardList size={18} color="#4299E1" />
            </div>
            <div className="stat-trend-badge down" style={{ fontSize: '10.5px', padding: '2px 8px', background: '#FC8181', color: 'white', fontWeight: '800' }}>
              {leaveReqCount} Pending
            </div>
          </div>
          <div>
            <div className="stat-value">{leaveReqCount}</div>
            <div className="stat-label">Leave Requests</div>
          </div>
        </div>

        {/* Permission Requests Card */}
        <div 
          className={`stat-card attendance-stat-card ${activeTab === 'permission-requests' ? 'active-filter' : ''}`}
          onClick={() => { setActiveTab('permission-requests'); setFilterType(''); }}
          style={{ cursor: 'pointer' }}
        >
          <div className="stat-card-top">
            <div className="stat-icon-wrap" style={{ background: '#ECC94B15' }}>
              <AlertCircle size={18} color="#ECC94B" />
            </div>
            <div className="stat-trend-badge down" style={{ fontSize: '10.5px', padding: '2px 8px', background: '#FC8181', color: 'white', fontWeight: '800' }}>
              {permissionReqCount} Pending
            </div>
          </div>
          <div>
            <div className="stat-value">{permissionReqCount}</div>
            <div className="stat-label">Permission Requests</div>
          </div>
        </div>
      </div>

      <div className="emp-table-card" style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text-main)' }}>
              {activeTab === 'leave-requests' ? 'Pending Leave Requests' : 'Pending Permission Requests'}
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: 'var(--text-light)' }}>
              Action pending items to approve or reject requests.
            </p>
          </div>
        </div>

        {/* Filters & Search row removed entirely (Jun 2026 final brief).
            The two stat cards at the top of the page are now the only
            way to switch between leave and permission tabs; the search
            input and the secondary type selector were both dropped per
            HR's "keep it clean" request. */}

        <div style={{ overflowX: 'auto' }}>
          <table className="emp-table" style={{ tableLayout: 'fixed', width: '100%' }}>
            <colgroup>
              <col style={{ width: '20%' }} />{/* Employee */}
              <col style={{ width: '12%' }} />{/* Type */}
              <col style={{ width: '10%' }} />{/* Duration */}
              <col style={{ width: '16%' }} />{/* Date Range */}
              <col style={{ width: '14%' }} />{/* Reason */}
              <col style={{ width: '14%' }} />{/* Manager Status */}
              <col style={{ width: '14%' }} />{/* Status */}
            </colgroup>
            <thead>
              <tr>
                <th style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5, boxShadow: 'inset 0 -1px 0 var(--border-color)', textAlign: 'left' }}>Employee</th>
                <th style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5, boxShadow: 'inset 0 -1px 0 var(--border-color)', textAlign: 'left' }}>Type</th>
                <th style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5, boxShadow: 'inset 0 -1px 0 var(--border-color)', textAlign: 'left' }}>Duration</th>
                <th style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5, boxShadow: 'inset 0 -1px 0 var(--border-color)', textAlign: 'left' }}>Date Range</th>
                <th style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5, boxShadow: 'inset 0 -1px 0 var(--border-color)', textAlign: 'left' }}>Reason</th>
                <th style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5, boxShadow: 'inset 0 -1px 0 var(--border-color)', textAlign: 'center' }}>Manager Status</th>
                <th style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5, boxShadow: 'inset 0 -1px 0 var(--border-color)', textAlign: 'center' }}>Status</th>
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
                          {/* Reject any 24-char hex ObjectId that may have
                              leaked through from the mobile-backend
                              populate. Show "—" if both fields are unsafe
                              instead of leaking raw Mongo hex. */}
                          {(() => {
                            const isHex = (s) => typeof s === 'string' && /^[a-f0-9]{24}$/i.test(s.trim());
                            const role  = isHex(rec.role) ? '' : (rec.role || '');
                            const dept  = isHex(rec.dept) ? '' : (rec.dept || '');
                            const parts = [role, dept].filter(Boolean);
                            return parts.length ? parts.join(' • ') : '—';
                          })()}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td><div className="emp-table-email" style={{ fontWeight: 700, fontSize: '11.5px' }}>{rec.type}</div></td>
                  <td>
                    <div style={{ fontWeight: 700, fontSize: '11.5px', color: 'var(--text-main)' }}>{rec.duration}</div>
                    {rec.type && rec.type.toLowerCase().includes('permission') && rec.date && rec.date.includes('(') && (
                      <div style={{ fontSize: '10px', color: 'var(--text-light)', marginTop: '4px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={11} /> {rec.date.match(/\(([^)]+)\)/)?.[1]}
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
                      <div style={{ fontSize: '10px', color: 'var(--text-light)', marginTop: '4px', fontWeight: 500, display: 'flex', alignItems: 'flex-start', gap: '4px', maxWidth: '130px' }}>
                        <Inbox size={11} style={{ marginTop: '2px', flexShrink: 0 }} /> 
                        <span style={{ lineHeight: '1.3' }}>Requested: {rec.requestedAt.replace('2024', '\n2024')}</span>
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ fontSize: '11px', color: 'var(--text-main)', lineHeight: '1.4', fontWeight: 500, whiteSpace: 'normal', wordBreak: 'break-word' }}>
                      {rec.reason}
                    </div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {/* Manager Status is now READ-ONLY here. The manager
                        does Approve/Reject from ERM Web; HRMS only mirrors
                        that decision and uses it to gate the Status column. */}
                    {rec.managerStatus === 'Approved' ? (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 700, fontSize: 11, padding: '4px 10px', borderRadius: 20, minWidth: 120, boxSizing: 'border-box', 
                        background: '#F1F9EE', color: '#4CAA17',
                        border: '1px solid #C2E7B0',
                      }}>
                        Approved
                      </span>
                    ) : rec.managerStatus === 'Rejected' ? (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 700, fontSize: 11, padding: '4px 10px', borderRadius: 20, minWidth: 120, boxSizing: 'border-box', 
                        background: '#FFF5F5', color: '#C53030',
                        border: '1px solid #FED7D7',
                      }}>
                        Rejected
                      </span>
                    ) : (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 700, fontSize: 11, padding: '4px 10px', borderRadius: 20, minWidth: 120, boxSizing: 'border-box', 
                        background: '#FFFBEB', color: '#D97706',
                        border: '1px solid #FDE68A',
                      }}>
                        <Clock size={12} /> Awaiting Manager
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {rec.managerStatus === 'Rejected' ? (
                      // Manager rejected → Status column stays EMPTY.
                      null
                    ) : rec.status === 'Approved' ? (
                      <span
                        title={rec.message || ''}
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          fontWeight: 700, fontSize: 11,
                          padding: '4px 10px', borderRadius: 20,
                          minWidth: 120, boxSizing: 'border-box',
                          background: '#F1F9EE', color: '#4CAA17',
                          border: '1px solid #C2E7B0',
                        }}
                      >
                        Approved
                      </span>
                    ) : rec.status === 'Rejected' ? (
                      <span
                        title={rec.message || ''}
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          fontWeight: 700, fontSize: 11,
                          padding: '4px 10px', borderRadius: 20,
                          minWidth: 120, boxSizing: 'border-box',
                          background: '#FFF5F5', color: '#C53030',
                          border: '1px solid #FED7D7',
                        }}
                      >
                        Rejected
                      </span>
                    ) : rec.managerStatus === 'Approved' ? (
                      // Manager approved → HR can now Approve or Reject.
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        <button
                          className="req-btn reject"
                          onClick={() => initiateAction(rec._id, 'Rejected')}
                          style={{
                            padding: '6px 10px', fontSize: '11px', fontWeight: 700,
                            borderRadius: '6px',
                            border: '1px solid #FED7D7',
                            background: '#FFF5F5', color: '#FC8181',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '3px',
                          }}
                          title="Reject request"
                        >
                          <X size={12} /> Reject
                        </button>
                        <button
                          className="req-btn approve"
                          onClick={() => initiateAction(rec._id, 'Approved')}
                          style={{
                            padding: '6px 10px', fontSize: '11px', fontWeight: 700,
                            borderRadius: '6px',
                            border: '1px solid #C2E7B0',
                            background: '#F1F9EE', color: '#4CAA17',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '3px',
                          }}
                          title="Approve request"
                        >
                          <Check size={12} /> Approve
                        </button>
                      </div>
                    ) : (
                      // Manager hasn't acted yet → show a clear "awaiting"
                      // hint instead of disabled buttons that confused HR.
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 700, fontSize: 11, padding: '4px 10px', borderRadius: 20, minWidth: 120, boxSizing: 'border-box', 
                        background: '#FFFBEB', color: '#D97706',
                        border: '1px solid #FDE68A',
                      }}>
                        <Clock size={12} /> Awaiting Manager
                      </span>
                    )}
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

      {/* Action Modal */}
      {actionModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: '12px', width: '100%', maxWidth: '400px', padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {actionModal.status === 'Approved' ? <Check color="#4CAA17" /> : <X color="#FC8181" />}
              {actionModal.status === 'Approved' ? 'Approve Request' : 'Reject Request'}
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: 'var(--text-light)' }}>
              Write a message to the employee explaining your decision.
            </p>
            <textarea
              value={actionMessage}
              onChange={e => setActionMessage(e.target.value)}
              placeholder="e.g., Approved for the requested period."
              style={{
                width: '100%',
                minHeight: '90px',
                padding: '10px 12px',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                fontSize: '13px',
                resize: 'vertical',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <button
                type="button"
                onClick={() => { setActionModal(null); setActionMessage(''); }}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-main)',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => confirmAction()}
                style={{
                  background: actionModal.status === 'Approved' ? '#4CAA17' : '#FC8181',
                  border: 'none',
                  color: 'white',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                Confirm {actionModal.status}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
