import React, { useState, useEffect } from 'react';
import { ChevronRight, Fuel, Car, CheckCircle, XCircle, Clock } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { useNotification } from '../context/NotificationContext';
import { API } from '../config/api';

const LS_KEY = 'tesco_hrms_allowance_cache';

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
  const [allowanceType, setAllowanceType] = useState('petrol');
  const [employeeFilter, setEmployeeFilter] = useState('');
  const cached = readCache();
  const [petrolRequests, setPetrolRequests] = useState(cached.petrol);
  const [travelRequests, setTravelRequests] = useState(cached.travel);
  const [loading, setLoading] = useState(true);
  const [approvalModal, setApprovalModal] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${API}/allowances?limit=300`);
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
      } catch {}
      finally { if (!cancelled) setLoading(false); }
    };
    load();
    const t = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const handleManagerAction = async (id, type, newManagerStatus) => {
    const setList = type === 'petrol' ? setPetrolRequests : setTravelRequests;
    const sourceArr = type === 'petrol' ? petrolRequests : travelRequests;
    const target = sourceArr.find(r => r.id === id);
    setList(prev => prev.map(req => req.id === id ? { ...req, managerStatus: newManagerStatus } : req));
    try {
      await fetch(`${API}/allowances/${target?._id || id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ managerStatus: newManagerStatus.toLowerCase(), reviewedBy: 'Manager' }),
      });
      showNotification(`Manager ${newManagerStatus.toLowerCase()} request ${id}`, 'success');
    } catch (err) {
      setList(prev => prev.map(req => req.id === id ? { ...req, managerStatus: target?.managerStatus || '' } : req));
      showNotification('Could not save manager decision', 'error');
    }
  };

  const handleAction = async (id, action, type, extras = {}) => {
    const newStatus = action === 'approve' ? 'Approved' : 'Rejected';
    const setList = type === 'petrol' ? setPetrolRequests : setTravelRequests;
    const sourceArr = type === 'petrol' ? petrolRequests : travelRequests;
    const target = sourceArr.find(r => r.id === id);
    if (target && target.managerStatus !== 'Approved') {
      showNotification('Cannot process — Manager has not approved yet.', 'error');
      return;
    }
    const requested = Number(target?.amount) || 0;
    const approvedAmount = action === 'approve'
      ? Math.max(0, Math.min(Number(extras.approvedAmount) || 0, requested))
      : 0;
    const rejectedAmount = action === 'approve' ? Math.max(0, requested - approvedAmount) : requested;
    setList(prev => prev.map(req => req.id === id
      ? { ...req, status: newStatus, approvedAmount, rejectedAmount, amountComment: extras.amountComment || req.amountComment || '' }
      : req));
    try {
      const res = await fetch(`${API}/allowances/${target?._id || id}`, {
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
      showNotification(`Request ${id} ${newStatus}!`, action === 'approve' ? 'success' : 'error');
    } catch (err) {
      setList(prev => prev.map(req => req.id === id ? { ...req, status: target?.status || 'Pending' } : req));
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
    handleAction(approvalModal.req.id, 'approve', approvalModal.type, {
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
          <colgroup>
            <col style={{ width: '8%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '11%' }} />
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
                <tr key={req.id}>
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
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#F0FDF4', color: '#16A34A', minWidth: 130, boxSizing: 'border-box' }}>
                        <CheckCircle size={12} /> Approved
                      </span>
                    ) : mgrRejected ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#FEF2F2', color: '#DC2626', minWidth: 130, boxSizing: 'border-box' }}>
                        <XCircle size={12} /> Rejected
                      </span>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A', minWidth: 130, boxSizing: 'border-box' }}>
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
                        <button onClick={() => openApprovalModal(req, type)} style={{ background: '#F0FDF4', color: '#16A34A', border: '1px solid #BBF7D0', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Approve</button>
                        <button onClick={() => handleAction(req.id, 'reject', type)} style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Reject</button>
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

  const downloadPdf = () => {
    try {
      const filteredRows = allRows.filter(r => !employeeFilter || (r.empName || r.id || r._id) === employeeFilter);
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const M = 40;
      doc.setFillColor(76, 170, 23);
      doc.rect(0, 0, pageW, 64, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(255, 255, 255);
      doc.text(`TESCO STRUCTURES â ${allowanceType === 'petrol' ? 'Petrol' : 'Travel'} Allowance Report`, M, 38);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text('HR Â· Allowance audit', M, 54);

      let y = 100;
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text(`Total: ₹${totalAmt.toLocaleString('en-IN')}   ` +
               `Approved: ₹${approvedAmt.toLocaleString('en-IN')}   ` +
               `Rejected: ₹${rejectedAmt.toLocaleString('en-IN')}   ` +
               `Pending: ₹${pendingAmt.toLocaleString('en-IN')}`, M, y);
      if (employeeFilter) {
        y += 16;
        doc.setTextColor(100, 116, 139);
        doc.text(`Filtered: ${employeeFilter}`, M, y);
      }

      autoTable(doc, {
        startY: y + 24,
        head: [['Req ID', 'Employee', 'Route', 'Distance', 'Claim', 'Approved', 'Rejected', 'Status']],
        body: filteredRows.map(r => [
          r.id || '',
          r.empName || '',
          (r.from || '') + ' → ' + (r.to || ''),
          (Number(r.distance) || 0) + ' km',
          '₹' + Number(r.amount || 0).toLocaleString('en-IN'),
          '₹' + Number(r.approvedAmount || 0).toLocaleString('en-IN'),
          '₹' + Number(r.rejectedAmount || 0).toLocaleString('en-IN'),
          r.status || 'Pending',
        ]),
        theme: 'striped',
        styles: { fontSize: 9, cellPadding: 5 },
        headStyles: { fillColor: '#4CAA17', textColor: '#fff', fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
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
      const summary = [
        [`Tesco Structures â ${allowanceType === 'petrol' ? 'Petrol' : 'Travel'} Allowance Report`],
        [],
        ['Filter',          employeeFilter || 'All employees'],
        ['Generated',       new Date().toLocaleDateString('en-GB')],
        [],
        ['Total Amount',    Number(totalAmt)],
        ['Approved Amount', Number(approvedAmt)],
        ['Rejected Amount', Number(rejectedAmt)],
        ['Pending Amount',  Number(pendingAmt)],
      ];
      const rowsAoA = [
        ['Request ID', 'Employee', 'Date', 'From', 'To', 'Distance (km)',
         'Claim (₹)', 'Approved (₹)', 'Rejected (₹)',
         'Status', 'Manager Status', 'Note'],
        ...filteredRows.map(r => [
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
        ]),
      ];
      const wb = XLSX.utils.book_new();
      const wsS = XLSX.utils.aoa_to_sheet(summary);
      const wsR = XLSX.utils.aoa_to_sheet(rowsAoA);
      wsS['!cols'] = [{ wch: 22 }, { wch: 22 }];
      wsR['!cols'] = [
        { wch: 10 }, { wch: 22 }, { wch: 12 }, { wch: 18 }, { wch: 18 },
        { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 14 }, { wch: 30 },
      ];
      XLSX.utils.book_append_sheet(wb, wsS, 'Summary');
      XLSX.utils.book_append_sheet(wb, wsR, 'Requests');
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
              <button type="button" onClick={downloadCsv} disabled={rows.length === 0}
                style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: '#fff', color: '#475569', border: '1px solid #E2E8F0', cursor: rows.length === 0 ? 'not-allowed' : 'pointer', opacity: rows.length === 0 ? 0.5 : 1 }}>
                Download CSV
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {allowanceType === 'petrol' ? <Fuel size={20} color="#4CAA17" /> : <Car size={20} color="#4299E1" />}
            <div className="card-title">{allowanceType === 'petrol' ? 'Petrol' : 'Travel'} Allowance Requests</div>
          </div>
          {renderTable(rows, allowanceType)}
        </div>
      </div>

      {approvalModal && (() => {
        const requested = Number(approvalModal.req?.amount) || 0;
        const approved = Number(approvalModal.approvedAmount) || 0;
        const rejected = Math.max(0, requested - approved);
        return (
          <div onClick={closeApprovalModal} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 22, width: 'min(440px, 100%)', boxShadow: '0 18px 48px rgba(0,0,0,0.25)' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>Approve allowance</div>
              <div style={{ fontSize: 12, color: '#64748B', marginBottom: 14 }}>
                Claim amount: <b>&#8377;{requested.toLocaleString('en-IN')}</b>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>Approved amount</div>
              <input type="number" min={0} max={requested} value={approvalModal.approvedAmount}
                onChange={(e) => setApprovalModal({ ...approvalModal, approvedAmount: e.target.value })}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: 13, marginBottom: 14, boxSizing: 'border-box' }} />
              <div style={{ fontSize: 12, color: '#475569', marginBottom: 12, padding: '8px 10px', borderRadius: 8, background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                Rejected portion (auto):{' '}
                <b style={{ color: rejected > 0 ? '#B91C1C' : '#15803D' }}>&#8377;{rejected.toLocaleString('en-IN')}</b>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>Note to employee (optional)</div>
              <textarea rows={3} value={approvalModal.amountComment || ''}
                onChange={(e) => setApprovalModal({ ...approvalModal, amountComment: e.target.value })}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: 13, marginBottom: 16, boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' }}
                placeholder="Why this amount was approved/rejected..." />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" onClick={closeApprovalModal}
                  style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: '#F1F5F9', color: '#0F172A', border: '1px solid #CBD5E1', cursor: 'pointer' }}>Cancel</button>
                <button type="button" onClick={submitApproval}
                  style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: '#16A34A', color: '#fff', border: 'none', cursor: 'pointer' }}>Confirm</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
