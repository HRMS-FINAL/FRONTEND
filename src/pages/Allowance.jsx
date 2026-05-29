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

  // Seed both arrays from cache so neither tab is blank on refresh.
  const cached = readCache();
  const [petrolRequests, setPetrolRequests] = useState(cached.petrol);
  const [travelRequests, setTravelRequests] = useState(cached.travel);
  const [loading,        setLoading]        = useState(true);

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
  const handleAction = async (id, action, type) => {
    const newStatus = action === 'approve' ? 'Approved' : 'Rejected';
    const setList   = type === 'petrol' ? setPetrolRequests : setTravelRequests;
    const sourceArr = type === 'petrol' ? petrolRequests   : travelRequests;
    const target    = sourceArr.find((r) => r.id === id);
    // Block HR action if manager hasn't approved yet.
    if (target && target.managerStatus !== 'Approved') {
      showNotification('Cannot process — Manager has not approved yet.', 'error');
      return;
    }
    setList(prev => prev.map(req => req.id === id ? { ...req, status: newStatus } : req));
    try {
      const res = await fetch(`${API}/allowances/${target?._id || id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          status:    newStatus.toLowerCase(),
          reviewedBy:'HR',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
      showNotification(`Request ${id} ${newStatus}!`, action === 'approve' ? 'success' : 'error');
    } catch (err) {
      // Roll back optimistic update if the server rejected it.
      setList(prev => prev.map(req => req.id === id ? { ...req, status: target?.status || 'Pending' } : req));
      showNotification(`Could not save: ${err.message}`, 'error');
    }
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
                  {petrolRequests.map(req => (
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
                      <td><div style={{ fontSize: '14px', fontWeight: 800, color: '#4CAA17' }}>₹{req.amount}</div></td>
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
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: '#F1F5F9', color: '#64748B' }}>
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
                              onClick={() => handleAction(req.id, 'approve', 'petrol')}
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
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: '#FFFBEB', color: '#D97706' }}>
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
                  {travelRequests.map(req => (
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
                      <td><div style={{ fontSize: '14px', fontWeight: 800, color: '#4299E1' }}>₹{req.amount}</div></td>
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
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: '#F1F5F9', color: '#64748B' }}>
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
                              onClick={() => handleAction(req.id, 'approve', 'travel')}
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
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: '#FFFBEB', color: '#D97706' }}>
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

    </div>
  );
}
