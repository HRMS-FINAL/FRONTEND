import React, { useState } from 'react';
import { ChevronRight, Car, CheckCircle, XCircle, Clock } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';

export default function TravelAllowance({ onBack }) {
  const { showNotification } = useNotification();

  // Mock Travel Requests State
  const [travelRequests, setTravelRequests] = useState([
    { id: 'TRV-201', empName: 'Ethan Brown', from: 'City Center', to: 'Branch Office', distance: 45, amount: 450, status: 'Pending', date: '2026-05-21' },
    { id: 'TRV-202', empName: 'Priya Sharma', from: 'Airport', to: 'Hotel HQ', distance: 12, amount: 120, status: 'Pending', date: '2026-05-22' },
    { id: 'TRV-203', empName: 'Alex Morrison', from: 'Main Office', to: 'Expo Center', distance: 25, amount: 250, status: 'Approved', date: '2026-05-18' },
  ]);

  const handleAction = (id, action) => {
    setTravelRequests(prev => prev.map(req => {
      if (req.id === id) return { ...req, status: action === 'approve' ? 'Approved' : 'Rejected' };
      return req;
    }));
    showNotification(`Request ${id} ${action === 'approve' ? 'Approved' : 'Rejected'}!`, action === 'approve' ? 'success' : 'error');
  };

  return (
    <div className="emp-list-page">
      {/* Header */}
      <div className="emp-list-header">
        <div className="ne-breadcrumb">
          <span className="ne-breadcrumb-link" onClick={onBack}>Dashboard</span>
          <ChevronRight size={13} />
          <span>Travel Allowance</span>
        </div>
        <div className="emp-list-title-row">
          <div>
            <h1 className="ne-page-title">Travel Allowance</h1>
            <p className="ne-page-sub">Manage and approve Travel allowance requests.</p>
          </div>
        </div>
      </div>

      <div style={{ padding: '24px' }}>

        {/* TRAVEL APPROVALS TABLE */}
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
                    <td><div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>{req.distance} km</div></td>
                    <td><div style={{ fontSize: '14px', fontWeight: 800, color: '#4299E1' }}>₹{req.amount}</div></td>
                    <td>
                      {req.status === 'Pending' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: '#FFFBEB', color: '#D97706' }}><Clock size={12} /> Pending</span>}
                      {req.status === 'Approved' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: '#F0FDF4', color: '#16A34A' }}><CheckCircle size={12} /> Approved</span>}
                      {req.status === 'Rejected' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: '#FEF2F2', color: '#DC2626' }}><XCircle size={12} /> Rejected</span>}
                    </td>
                    <td>
                      {req.status === 'Pending' ? (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button 
                            onClick={() => handleAction(req.id, 'approve')}
                            style={{ background: '#F0FDF4', color: '#16A34A', border: '1px solid #BBF7D0', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                          >
                            Approve
                          </button>
                          <button 
                            onClick={() => handleAction(req.id, 'reject')}
                            style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: '11px', color: 'var(--text-light)', fontWeight: 600 }}>No actions available</span>
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

      </div>
    </div>
  );
}
