import React, { useState, useEffect } from 'react';
import { ChevronRight, ClipboardList, AlertCircle, Search, Check, X, Clock, Inbox } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';

// Mobile-app leave & permission requests arrive via HRMS backend proxy at
// /api/leave-requests (server-side talks to https://backend-emqy.onrender.com
// using MOBILE_ADMIN_SECRET). The UI below is unchanged — only the data
// source switched from the hardcoded mock array to real fetches.
import { API } from '../config/api';
const LS_KEY = 'tesco_hrms_leave_requests_cache';

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

  const handleManagerAction = (id, newManagerStatus) => {
    setRequests(prev => prev.map(r => r.id === id ? { ...r, managerStatus: newManagerStatus } : r));
    showNotification(`Manager status updated to ${newManagerStatus}!`, "success");
  };

  const initiateAction = (id, newStatus) => {
    const targetReq = requests.find(r => r.id === id);
    if (targetReq && targetReq.managerStatus !== 'Approved') {
      showNotification("Cannot process request until Manager approves!", "error");
      return;
    }
    setActionModal({ id, status: newStatus });
    setActionMessage('');
  };

  // Confirm action — sends PATCH to HRMS backend, which forwards to mobile
  // backend, which in turn notifies the employee in-app.
  const confirmAction = async () => {
    if (!actionModal) return;
    const { id, status } = actionModal;
    const finalMessage = actionMessage.trim() || `Your request has been ${status.toLowerCase()}.`;
    const targetReq = requests.find(r => r.id === id);
    // Optimistic UI update — flip status locally so the user sees instant feedback.
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status, message: finalMessage } : r));
    try {
      const res = await fetch(`${API}/leave-requests/${targetReq?._id || id}`, {
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
      // Roll back optimistic update if the server rejected it.
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status: targetReq?.status || 'Pending' } : r));
      showNotification(`Could not save: ${err.message}`, "error");
    }
    setActionModal(null);
  };

  const leaveReqCount = requests.filter(r => r.status === 'Pending' && r.type.toLowerCase().includes('leave')).length;
  const permissionReqCount = requests.filter(r => r.status === 'Pending' && !r.type.toLowerCase().includes('leave')).length;

  const displayRecords = React.useMemo(() => {
    return requests.filter(item => {
      // 1. Check tab match
      const isLeave = item.type.toLowerCase().includes('leave');
      if (activeTab === 'leave-requests' && !isLeave) return false;
      if (activeTab === 'permission-requests' && isLeave) return false;

      // 2. Check search query
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.reason.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.role.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      // 3. Check inline filter type
      if (filterType) {
        if (!item.type.toLowerCase().includes(filterType.toLowerCase())) return false;
      }

      return true;
    });
  }, [requests, activeTab, searchQuery, filterType]);

  const filterTabs = ['permission', 'leave'];

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
          
          <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-main)', padding: '3px', borderRadius: '8px' }}>
            {filterTabs.map(tab => (
              <button
                key={tab}
                onClick={() => setFilterType(prev => prev === tab ? '' : tab)}
                style={{
                  border: 'none',
                  background: filterType === tab ? 'white' : 'transparent',
                  color: filterType === tab ? 'var(--primary)' : 'var(--text-muted)',
                  padding: '6px 12px',
                  fontSize: '11px',
                  fontWeight: '700',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  boxShadow: filterType === tab ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                  textTransform: 'capitalize'
                }}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="emp-table">
            <thead>
              <tr>
                <th style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5, boxShadow: 'inset 0 -1px 0 var(--border-color)' }}>Employee</th>
                <th style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5, boxShadow: 'inset 0 -1px 0 var(--border-color)' }}>Type</th>
                <th style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5, boxShadow: 'inset 0 -1px 0 var(--border-color)' }}>Duration</th>
                <th style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5, boxShadow: 'inset 0 -1px 0 var(--border-color)' }}>Date Range</th>
                <th style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5, boxShadow: 'inset 0 -1px 0 var(--border-color)', width: '20%' }}>Reason</th>
                <th style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5, boxShadow: 'inset 0 -1px 0 var(--border-color)', width: '140px', textAlign: 'center' }}>Manager Status</th>
                <th style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5, boxShadow: 'inset 0 -1px 0 var(--border-color)', width: '140px', textAlign: 'center' }}>Status</th>
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
                          onClick={() => initiateAction(rec.id, 'Rejected')}
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
                          onClick={() => initiateAction(rec.id, 'Approved')}
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
              placeholder="Enter your message here..."
              style={{ width: '100%', height: '100px', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', resize: 'none', fontSize: '13px', marginBottom: '20px', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button 
                onClick={() => setActionModal(null)}
                style={{ padding: '8px 16px', borderRadius: '6px', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button 
                onClick={confirmAction}
                style={{ padding: '8px 16px', borderRadius: '6px', background: actionModal.status === 'Approved' ? '#4CAA17' : '#FC8181', border: 'none', color: 'white', fontWeight: 600, cursor: 'pointer' }}
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
