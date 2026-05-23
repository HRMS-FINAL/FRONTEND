import React, { useState } from 'react';
import { ChevronRight, Fuel, CheckCircle, XCircle, Clock } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';

export default function PetrolAllowance({ onBack }) {
  const { showNotification } = useNotification();
  
  // Mock Petrol Requests State
  const [petrolRequests, setPetrolRequests] = useState([
    { id: 'REQ-101', empName: 'Liam Foster', from: 'Main Office', to: 'Client Tech Corp', distance: 15, amount: 225, status: 'Pending', date: '2026-05-19' },
    { id: 'REQ-102', empName: 'Zoe Martinez', from: 'Home', to: 'Design Summit', distance: 40, amount: 600, status: 'Pending', date: '2026-05-20' },
    { id: 'REQ-103', empName: 'Ryan Patel', from: 'Factory', to: 'Warehouse B', distance: 8, amount: 120, status: 'Approved', date: '2026-05-15' },
  ]);

  const handleAction = (id, action) => {
    setPetrolRequests(prev => prev.map(req => {
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
          <span>Petrol Allowance</span>
        </div>
        <div className="emp-list-title-row">
          <div>
            <h1 className="ne-page-title">Petrol Allowance</h1>
            <p className="ne-page-sub">Manage and approve Petrol allowance requests.</p>
          </div>
        </div>
      </div>

      <div style={{ padding: '24px' }}>
        
        {/* PETROL APPROVALS TABLE */}
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
                    <td><div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>{req.distance} km</div></td>
                    <td><div style={{ fontSize: '14px', fontWeight: 800, color: '#4CAA17' }}>₹{req.amount}</div></td>
                  </tr>
                ))}
                {petrolRequests.length === 0 && (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-light)', fontSize: '13px' }}>No requests found.</td>
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
