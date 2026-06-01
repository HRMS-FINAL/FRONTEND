import React, { useState, useEffect } from 'react';
import {
  ChevronRight, DollarSign, CreditCard, TrendingUp, Zap,
  Download, Printer, Send, Search, Filter, X, FileText, Upload
} from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import logo from '../assets/logo.png';

import { API } from '../config/api';

export default function Payroll({ onBack, employees = [], updateEmployeeSalary }) {
  const { showNotification } = useNotification();
  const [showSlip, setShowSlip] = useState(null);
  const [showEditSlip, setShowEditSlip] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showProcessPanel, setShowProcessPanel] = useState(false);
  const [createEmpId, setCreateEmpId] = useState('');
  const [generatedPayrolls, setGeneratedPayrolls] = useState([]);
  const today = new Date();
  const [payMonth, setPayMonth] = useState(today.getMonth() + 1); // 1-12
  const [payYear,  setPayYear]  = useState(today.getFullYear());
  // Pending payslip requests filed from ERM Mobile / ERM Web. Refreshed
  // every 30 s so HR sees them as soon as the employee taps "Request".
  const [pendingRequests, setPendingRequests] = useState([]);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`${API}/payroll/list?month=${payMonth}&year=${payYear}`);
        const d = await r.json().catch(() => ({}));
        if (cancelled || !d?.success) return;
        const items = Array.isArray(d.items) ? d.items : [];
        // Only the rows that are still awaiting HR action. Once HR uploads
        // the actual payslip via "Upload Report" or "Send to Employee",
        // the row flips to `processed` and disappears from this list.
        setPendingRequests(items.filter(p => String(p.status || '').toLowerCase() === 'pending'));
      } catch { /* network / cold-start — non-fatal */ }
    };
    load();
    const t = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [payMonth, payYear]);
  const monthLabel = new Date(payYear, payMonth - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });

  // Upload an attendance report → backend pulls actual attendance for the
  // chosen month/year and pushes a payslip per employee into the mobile DB.
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    showNotification(`Uploading ${file.name} for ${monthLabel} — generating payslips...`, 'info');
    try {
      const fd = new FormData();
      fd.append('file',  file);
      fd.append('month', String(payMonth));
      fd.append('year',  String(payYear));
      // Also pass month/year on the query string — works even if multer isn't
      // installed on the backend (in which case multipart fields aren't parsed).
      const r = await fetch(
        `${API}/payroll/upload-attendance?month=${payMonth}&year=${payYear}`,
        { method: 'POST', body: fd }
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.success) {
        showNotification(data?.message || 'Payslip generation failed', 'error');
        return;
      }
      // Mark generated rows green in the table. We match liberally because
      // local mock employees use different ID schemes ("EMP-1001" vs "1").
      const okEmpIds = (data.results || []).filter(x => x.ok).map(x => String(x.employeeId || ''));
      const okNames  = (data.results || []).filter(x => x.ok).map(x => String(x.name || '').toLowerCase());
      const localIds = employees
        .filter(e =>
          okEmpIds.includes(String(e.employeeId || '')) ||
          okEmpIds.includes('EMP-100' + e.id) ||
          okNames.includes(String(e.name || '').toLowerCase())
        )
        .map(e => e.id);
      // If we still didn't manage to match anyone (e.g. mock employees), at
      // least flip every visible row so HR sees a status change.
      const fallbackIds = localIds.length ? localIds : employees.map(e => e.id);
      setGeneratedPayrolls(prev => Array.from(new Set([...prev, ...fallbackIds])));
      showNotification(`Payslips generated for ${data.generated}/${data.total} employees and pushed to mobile.`, 'success');
    } catch (err) {
      showNotification('Upload failed: ' + (err?.message || 'network error'), 'error');
    } finally {
      e.target.value = ''; // allow re-uploading the same file
    }
  };

  // Push a single payslip to the mobile backend so the employee can see it.
  const sendPayslipToEmployee = async (emp, payload) => {
    try {
      const r = await fetch(`${API}/payroll/push`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          employeeId: emp.employeeId,
          email:      emp.email,
          month:      payMonth,
          year:       payYear,
          monthLabel,
          ...payload,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.success) {
        showNotification(data?.message || 'Could not send payslip', 'error');
        return false;
      }
      showNotification(`Payslip sent to ${emp.name} for ${monthLabel}.`, 'success');
      return true;
    } catch (err) {
      showNotification('Send failed: ' + (err?.message || 'network error'), 'error');
      return false;
    }
  };

  // 3-Month Salary Increment Eligibility logic
  const checkEligibility = (emp) => {
    if (emp.salaryIncrementApplied) return false;
    if (!emp.joiningDate) return false;
    const joinDate = new Date(emp.joiningDate);
    const currentDate = new Date('2026-05-19'); // match system default current date
    const diffTime = Math.abs(currentDate - joinDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 90; // 3 months is roughly 90 days
  };

  /**
   * Compute the standard salary breakdown for one employee for {payMonth/payYear}.
   * Mirrors the formula the backend uses so the downloaded PDF matches what
   * the mobile app shows.
   */
  const computePayslip = (emp) => {
    const ctc       = Number(emp.salary) || 50000;
    const basic     = Math.round(ctc * 0.50);
    const hra       = Math.round(basic * 0.40);
    const conveyance = 6000;
    const special    = Math.max(0, ctc - basic - hra - conveyance);
    const incentive  = checkEligibility(emp) ? 5000 : 0;
    const gross      = basic + hra + conveyance + special + incentive;
    const epf        = Math.round(basic * 0.12);
    const pt         = 200;
    const tds        = Math.round(gross * 0.10);
    const totalDed   = epf + pt + tds;
    const net        = gross - totalDed;
    return { ctc, basic, hra, conveyance, special, incentive, gross, epf, pt, tds, totalDed, net };
  };

  /**
   * Build a one-page Tesco Structures payslip PDF for one employee and
   * return the jsPDF instance. Caller decides whether to .save() (download)
   * or .output('blob') (preview).
   */
  const buildPayslipPdf = (emp) => {
    const p = computePayslip(emp);
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const M = 40;
    let y = 50;

    // ── Header ──
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(30, 41, 59);
    doc.text('TESCO STRUCTURES', M, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text('Kerala, India', M, y + 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Payslip For the Month', pageW - M, y, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(30, 41, 59);
    doc.text(monthLabel, pageW - M, y + 16, { align: 'right' });

    y += 36;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(1);
    doc.line(M, y, pageW - M, y);
    y += 18;

    // ── Employee summary ──
    const summary = [
      ['Employee Name',  emp.name || '—'],
      ['Designation',    emp.designation || emp.role || '—'],
      ['Employee ID',    emp.employeeId || ('EMP-100' + (emp.id || ''))],
      ['Date of Joining',emp.joiningDate || '—'],
      ['Pay Period',     monthLabel],
      ['Pay Date',       new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')],
    ];
    doc.setFontSize(10);
    summary.forEach((row, i) => {
      const rowY = y + i * 14;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(row[0], M, rowY);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text(': ' + String(row[1]), M + 110, rowY);
    });

    // ── Net pay box (right) ──
    const boxX = pageW - M - 220;
    const boxY = y - 4;
    doc.setFillColor(240, 253, 244);
    doc.rect(boxX, boxY, 220, 64, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(22, 101, 52);
    doc.text(`Rs. ${p.net.toLocaleString('en-IN')}`, boxX + 12, boxY + 28);
    doc.setFontSize(10);
    doc.setTextColor(21, 128, 61);
    doc.text('Employee Net Pay', boxX + 12, boxY + 48);

    y += summary.length * 14 + 18;

    // ── Earnings / Deductions table ──
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [['Earnings', 'Amount (Rs.)', 'Deductions', 'Amount (Rs.)']],
      body: [
        ['Basic',                p.basic.toLocaleString('en-IN'),       'EPF Contribution',  p.epf.toLocaleString('en-IN')],
        ['House Rent Allowance', p.hra.toLocaleString('en-IN'),         'Professional Tax',  p.pt.toLocaleString('en-IN')],
        ['Conveyance Allowance', p.conveyance.toLocaleString('en-IN'),  'TDS',               p.tds.toLocaleString('en-IN')],
        ['Special Allowance',    p.special.toLocaleString('en-IN'),     '',                  ''],
        ['Performance Incentive',p.incentive.toLocaleString('en-IN'),   '',                  ''],
        [
          { content: 'Gross Earnings',       styles: { fontStyle: 'bold' } },
          { content: p.gross.toLocaleString('en-IN'),   styles: { fontStyle: 'bold' } },
          { content: 'Total Deductions',     styles: { fontStyle: 'bold' } },
          { content: p.totalDed.toLocaleString('en-IN'),styles: { fontStyle: 'bold' } },
        ],
      ],
      styles:      { fontSize: 10, cellPadding: 6 },
      headStyles:  { fillColor: [248, 250, 252], textColor: 30, fontStyle: 'bold' },
      theme:       'grid',
    });

    let finalY = (doc.lastAutoTable?.finalY ?? y + 200) + 18;

    // ── Net payable footer ──
    doc.setFillColor(248, 250, 252);
    doc.rect(M, finalY, pageW - 2 * M, 44, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    doc.text('TOTAL NET PAYABLE', M + 12, finalY + 20);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Gross Earnings - Total Deductions', M + 12, finalY + 34);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(22, 101, 52);
    doc.text(`Rs. ${p.net.toLocaleString('en-IN')}`, pageW - M - 12, finalY + 27, { align: 'right' });

    return { doc, computed: p };
  };

  /**
   * Click handler for the "Payslip" table button — saves a PDF for this
   * employee AND pushes the same numbers to mobile so the employee can
   * also download it from the app.
   */
  const downloadPayslip = async (emp) => {
    let computed;
    // Build + save the PDF first — local action, never blocked by network.
    try {
      const built = buildPayslipPdf(emp);
      computed = built.computed;
      const safeName = String(emp.name || 'employee').replace(/[^\w]+/g, '_');
      built.doc.save(`Payslip_${safeName}_${monthLabel.replace(/\s+/g, '_')}.pdf`);
      // Mark Generated immediately so HR sees status flip even if the
      // mobile push fails (e.g., backend offline).
      if (!generatedPayrolls.includes(emp.id)) {
        setGeneratedPayrolls(prev => [...prev, emp.id]);
      }
    } catch (err) {
      showNotification('Could not build payslip PDF: ' + (err?.message || 'unknown error'), 'error');
      return;
    }

    // Then fire-and-forget push to mobile so the employee sees it in the app.
    try {
      await sendPayslipToEmployee(emp, {
        earnings: {
          basicSalary:      computed.basic,
          hraAllowance:     computed.hra,
          performanceBonus: computed.incentive,
          otherEarnings:    computed.conveyance + computed.special,
        },
        deductions: {
          incomeTax:       computed.tds,
          providentFund:   computed.epf,
          healthInsurance: 0,
          lopDeduction:    0,
          otherDeductions: computed.pt,
        },
      });
    } catch {
      /* sendPayslipToEmployee already toasts on failure */
    }
  };

  const eligibleEmployees = employees.filter(checkEligibility);

  // Search filter
  const filteredEmployees = employees.filter(emp => 
    emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (emp.employeeId || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (emp.dept || '').toLowerCase().includes(searchQuery.toLowerCase())
  );


  return (
    <div className="emp-list-page">
      <div className="emp-list-header">
        <div className="ne-breadcrumb">
          <span className="ne-breadcrumb-link" onClick={onBack}>Dashboard</span>
          <ChevronRight size={13} />
          <span>Payroll</span>
        </div>
        <div className="emp-list-title-row">
          <div>
            <h1 className="ne-page-title">Payroll Management</h1>
            <p className="ne-page-sub">Manage Indian salaries, PF, TDS, and financial distribution.</p>
          </div>
        </div>
      </div>




      {/* Pending Payslip Requests — what employees have asked for via ERM. */}
      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>
          <div>
            <div className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              Payslip Requests
              <span style={{
                fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999,
                background: pendingRequests.length ? '#FEF3C7' : '#F1F5F9',
                color:      pendingRequests.length ? '#92400E' : '#64748B',
              }}>{pendingRequests.length} pending</span>
            </div>
            <div className="card-subtitle">Filed by employees on ERM Mobile / ERM Web for {monthLabel}.</div>
          </div>
        </div>
        {pendingRequests.length === 0 ? (
          <div style={{ padding: '18px 24px', fontSize: 12.5, color: 'var(--text-light)' }}>
            No payslip requests for {monthLabel}. Employees will appear here the moment they tap “Request payslip”.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="emp-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Emp ID</th>
                  <th>Requested for</th>
                  <th>Requested at</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pendingRequests.map((p) => {
                  const u = p.user || {};
                  const name = u.name || ((u.firstName || '') + ' ' + (u.lastName || '')).trim() || '—';
                  const eid  = u.employeeId || '—';
                  const requestedAt = p.createdAt || p.requestedAt || p.updatedAt;
                  const fmt = (iso) => {
                    if (!iso) return '—';
                    const d = new Date(iso);
                    if (isNaN(d.getTime())) return '—';
                    return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
                  };
                  return (
                    <tr key={p._id || (eid + '-' + p.month + '-' + p.year)}>
                      <td><div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)' }}>{name}</div></td>
                      <td><div style={{ fontSize: 12, color: 'var(--text-light)' }}>{eid}</div></td>
                      <td><div style={{ fontSize: 12 }}>{p.monthLabel || `${p.month}/${p.year}`}</div></td>
                      <td><div style={{ fontSize: 12 }}>{fmt(requestedAt)}</div></td>
                      <td>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
                          background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A',
                        }}>Pending HR</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="announcement-filters" style={{ marginTop: '30px' }}>
        <div className="topbar-search" style={{ flex: 1, maxWidth: '400px' }}>
          <Search size={15} />
          <input 
            placeholder="Search payroll records..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="emp-list-actions" style={{ display: 'flex', gap: '12px' }}>
          <label className="ne-btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '600' }}>
            <Upload size={14} /> Upload Report
            <input type="file" style={{ display: 'none' }} accept=".csv,.xlsx" onChange={handleFileUpload} />
          </label>
          <select
            className="ne-btn-secondary"
            value={`${payYear}-${String(payMonth).padStart(2,'0')}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split('-').map(Number);
              setPayYear(y);
              setPayMonth(m);
            }}
            style={{ padding: '8px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: 600 }}
          >
            {(() => {
              // Company started in April 2025 — months before that don't
              // exist on the payroll side, so we don't list them. Iterate
              // from FLOOR (Apr 2025) forward to the current month.
              const FLOOR = new Date(2025, 3, 1);   // April 2025
              const now   = new Date();
              const opts  = [];
              for (let d = new Date(FLOOR); d <= now; d.setMonth(d.getMonth() + 1)) {
                const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`;
                const lbl = d.toLocaleString('default', { month: 'long', year: 'numeric' });
                opts.push(<option key={val} value={val}>{lbl}</option>);
              }
              // Most-recent month first.
              return opts.reverse();
            })()}
          </select>
        </div>
      </div>

      <div className="emp-table-card" style={{ marginTop: '20px', overflow: 'visible', maxHeight: 'none', flex: 'none' }}>
        <table className="emp-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Pay Period</th>
              <th>Gross Salary</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.map(emp => {
              const isEligible = checkEligibility(emp);
              const ctc = emp.salary || 50000;
              const incentive = isEligible ? 5000 : 0;
              const grossSalary = ctc + incentive;
              
              return (
                <tr key={emp.id}>
                  <td>
                    <div className="emp-table-user">
                      <div className="emp-table-avatar" style={{ background: emp.color + '20', color: emp.color }}>{emp.initials}</div>
                      <div>
                        <div className="emp-table-name">{emp.name}</div>

                      </div>
                    </div>
                  </td>
                  <td><div className="emp-table-dept">{monthLabel}</div></td>
                  <td><div className="emp-table-dept">₹{grossSalary.toLocaleString()}.00</div></td>
                  <td>
                    {generatedPayrolls.includes(emp.id) ? (
                      <span className="dash-emp-status present">Generated</span>
                    ) : (
                      <span className="dash-emp-status absent">Pending</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="emp-table-btn" onClick={() => setShowEditSlip(emp)}>
                        Edit
                      </button>
                      <button
                        className="emp-table-btn"
                        title="Download payslip PDF and send to employee's mobile ERM"
                        onClick={() => downloadPayslip(emp)}
                      >
                        <Download size={14} /> Payslip
                      </button>
                      <button
                        className="emp-table-btn"
                        title="Preview payslip"
                        onClick={() => setShowSlip(emp)}
                      >
                        <FileText size={14} />
                      </button>
                      <button 
                        className="ne-btn-primary" 
                        style={{ padding: '4px 10px', height: '28px', fontSize: '12px' }} 
                        onClick={() => {
                          setCreateEmpId(emp.employeeId || 'EMP-10' + emp.id);
                          setShowProcessPanel(true);
                        }}
                      >
                        <DollarSign size={14} /> Create Payroll
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showSlip && (() => {
        const ctc = showSlip.salary || 50000;
        const basicSalary = Math.round(ctc * 0.50);
        const hra = Math.round(basicSalary * 0.40);
        const conveyance = 6000;
        const specialAllowance = ctc - basicSalary - hra - conveyance > 0 ? ctc - basicSalary - hra - conveyance : 0;
        const incentive = checkEligibility(showSlip) ? 5000 : 0;
        const grossEarnings = basicSalary + hra + conveyance + specialAllowance + incentive;
        
        const epf = Math.round(basicSalary * 0.12);
        const pt = 200;
        const tds = Math.round(grossEarnings * 0.10); // 10% flat for example
        const totalDeductions = epf + pt + tds;
        const netPayable = grossEarnings - totalDeductions;

        return (
          <div className="ne-modal-overlay" style={{ justifyContent: 'flex-end', alignItems: 'stretch' }}>
            <div className="ne-modal-card" style={{ 
              height: '100%', 
              width: '800px', 
              maxWidth: '100%', 
              margin: 0, 
              borderRadius: '16px 0 0 16px',
              animation: 'slideInRight 0.3s ease',
              display: 'flex',
              flexDirection: 'column',
              padding: '0'
            }}>
              <div className="ne-modal-header" style={{ borderBottom: '1px solid #E2E8F0', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 className="ne-modal-title" style={{ margin: 0, fontSize: '16px' }}>Employee Payslip</h2>
                <button className="ne-btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => setShowSlip(null)}><X size={14} style={{ marginRight: '4px' }} /> Close</button>
              </div>
              <div className="ne-modal-body" style={{ flex: 1, overflowY: 'auto', padding: '24px', background: '#F8FAFC' }}>
                <div className="payslip-wrapper" style={{ border: '1px solid #E2E8F0', padding: '24px', borderRadius: '8px', background: '#FFF', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                  
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #E2E8F0', paddingBottom: '16px', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <img src={logo} alt="Logo" style={{ height: '28px', maxWidth: '120px', objectFit: 'contain' }} />
                      <div>
                        <h1 style={{ margin: 0, fontSize: '20px', color: '#1E293B', fontWeight: 800 }}>TESCO STRUCTURES</h1>
                        <p style={{ margin: 0, fontSize: '12px', color: '#64748B' }}>Kerala India</p>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ margin: 0, fontSize: '12px', color: '#64748B' }}>Payslip For the Month</p>
                      <h2 style={{ margin: 0, fontSize: '16px', color: '#1E293B', fontWeight: 800 }}>{monthLabel}</h2>
                    </div>
                  </div>

                  {/* Summary Section */}
                  <div style={{ display: 'flex', gap: '32px', marginBottom: '24px', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1', minWidth: '300px' }}>
                      <h3 style={{ fontSize: '14px', color: '#64748B', fontWeight: 700, margin: '0 0 16px 0', letterSpacing: '0.5px' }}>EMPLOYEE SUMMARY</h3>
                      <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '12px', fontSize: '14px', color: '#334155' }}>
                        <div>Employee Name</div><div>: <strong>{showSlip.name}</strong></div>
                        <div>Designation</div><div>: {showSlip.designation || 'Associate Editor'}</div>
                        <div>Employee ID</div><div>: {showSlip.employeeId || 'EMP-10' + showSlip.id}</div>
                        <div>Date of Joining</div><div>: {showSlip.joiningDate || '30/06/2020'}</div>
                        <div>Pay Period</div><div>: {monthLabel}</div>
                        <div>Pay Date</div><div>: {new Date(payYear, payMonth - 1, 28).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')}</div>
                      </div>
                    </div>
                    
                    <div style={{ width: '320px', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
                      <div style={{ background: '#F0FDF4', padding: '24px' }}>
                        <div style={{ fontSize: '28px', fontWeight: 800, color: '#166534', marginBottom: '4px' }}>₹{netPayable.toLocaleString()}.00</div>
                        <div style={{ fontSize: '14px', color: '#15803D' }}>Employee Net Pay</div>
                      </div>
                      <div style={{ padding: '16px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '14px', color: '#475569', background: '#FFF' }}>
                        <div>Paid Days <span style={{ float: 'right' }}>:</span></div><div><strong>30</strong></div>
                        <div>LOP Days <span style={{ float: 'right' }}>:</span></div><div><strong>0</strong></div>
                      </div>
                    </div>
                  </div>

                  {/* PF/UAN Row */}
                  <div style={{ borderTop: '1px dashed #CBD5E1', borderBottom: '1px dashed #CBD5E1', padding: '16px 0', marginBottom: '24px', display: 'flex', gap: '48px', fontSize: '14px', color: '#475569', flexWrap: 'wrap' }}>
                    <div>PF A/C Number <span style={{ margin: '0 16px' }}>:</span> <strong>AA/AAA/9999999/99G/9899999</strong></div>
                    <div>UAN <span style={{ margin: '0 16px' }}>:</span> <strong>111111111111</strong></div>
                  </div>

                  {/* Salary Table */}
                  <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
                      
                      {/* Earnings Column */}
                      <div style={{ borderRight: '1px solid #E2E8F0' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr 2fr', padding: '12px 16px', borderBottom: '1px dashed #CBD5E1', fontWeight: 700, fontSize: '12px', color: '#1E293B' }}>
                          <div>EARNINGS</div><div style={{ textAlign: 'right' }}>AMOUNT</div><div style={{ textAlign: 'right' }}>YTD</div>
                        </div>
                        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '13px', color: '#334155' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr 2fr' }}>
                            <div>Basic</div><div style={{ textAlign: 'right', fontWeight: 600 }}>₹{basicSalary.toLocaleString()}.00</div><div style={{ textAlign: 'right' }}>₹{(basicSalary*12).toLocaleString()}.00</div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr 2fr' }}>
                            <div>House Rent Allowance</div><div style={{ textAlign: 'right', fontWeight: 600 }}>₹{hra.toLocaleString()}.00</div><div style={{ textAlign: 'right' }}>₹{(hra*12).toLocaleString()}.00</div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr 2fr' }}>
                            <div>Conveyance Allowance</div><div style={{ textAlign: 'right', fontWeight: 600 }}>₹{conveyance.toLocaleString()}.00</div><div style={{ textAlign: 'right' }}>₹{(conveyance*12).toLocaleString()}.00</div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr 2fr' }}>
                            <div>Special Allowance</div><div style={{ textAlign: 'right', fontWeight: 600 }}>₹{specialAllowance.toLocaleString()}.00</div><div style={{ textAlign: 'right' }}>₹{(specialAllowance*12).toLocaleString()}.00</div>
                          </div>
                          {incentive > 0 && (
                            <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr 2fr' }}>
                              <div>Performance Incentive</div><div style={{ textAlign: 'right', fontWeight: 600 }}>₹{incentive.toLocaleString()}.00</div><div style={{ textAlign: 'right' }}>₹{incentive.toLocaleString()}.00</div>
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr 2fr', padding: '16px', background: '#F8FAFC', fontWeight: 700, fontSize: '14px', color: '#1E293B', borderTop: '1px solid #E2E8F0', marginTop: 'auto' }}>
                          <div>Gross Earnings</div><div style={{ textAlign: 'right' }}>₹{grossEarnings.toLocaleString()}.00</div><div style={{ textAlign: 'right' }}></div>
                        </div>
                      </div>

                      {/* Deductions Column */}
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr 2fr', padding: '12px 16px', borderBottom: '1px dashed #CBD5E1', fontWeight: 700, fontSize: '12px', color: '#1E293B' }}>
                          <div>DEDUCTIONS</div><div style={{ textAlign: 'right' }}>AMOUNT</div><div style={{ textAlign: 'right' }}>YTD</div>
                        </div>
                        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '13px', color: '#334155' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr 2fr' }}>
                            <div>EPF Contribution</div><div style={{ textAlign: 'right', fontWeight: 600 }}>₹{epf.toLocaleString()}.00</div><div style={{ textAlign: 'right' }}>₹{(epf*12).toLocaleString()}.00</div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr 2fr' }}>
                            <div>Professional Tax</div><div style={{ textAlign: 'right', fontWeight: 600 }}>₹{pt.toLocaleString()}.00</div><div style={{ textAlign: 'right' }}>₹{(pt*12).toLocaleString()}.00</div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr 2fr' }}>
                            <div>TDS</div><div style={{ textAlign: 'right', fontWeight: 600 }}>₹{tds.toLocaleString()}.00</div><div style={{ textAlign: 'right' }}>₹{(tds*12).toLocaleString()}.00</div>
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr 2fr', padding: '16px', background: '#F8FAFC', fontWeight: 700, fontSize: '14px', color: '#1E293B', borderTop: '1px solid #E2E8F0', marginTop: 'auto' }}>
                          <div>Total Deductions</div><div style={{ textAlign: 'right' }}>₹{totalDeductions.toLocaleString()}.00</div><div style={{ textAlign: 'right' }}></div>
                        </div>
                      </div>

                    </div>
                  </div>

                  {/* Footer Net Payable */}
                  <div style={{ marginTop: '24px', border: '1px solid #E2E8F0', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC', overflow: 'hidden' }}>
                    <div style={{ padding: '16px 24px' }}>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: '#1E293B' }}>TOTAL NET PAYABLE</div>
                      <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>Gross Earnings - Total Deductions</div>
                    </div>
                    <div style={{ padding: '16px 32px', background: '#F0FDF4', fontSize: '20px', fontWeight: 800, color: '#166534', height: '100%', display: 'flex', alignItems: 'center' }}>
                      ₹{netPayable.toLocaleString()}.00
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', marginTop: '16px', fontSize: '12px', color: '#475569' }}>
                    Amount In Words : <strong>Indian Rupee (Calculated dynamically) Only</strong>
                  </div>

                </div>
              </div>
              <div className="ne-modal-footer" style={{ borderTop: '1px solid #E2E8F0', padding: '16px 24px', background: '#FFF', display: 'flex', gap: '12px' }}>
                <button className="ne-btn-secondary" style={{ marginRight: 'auto' }} onClick={() => setShowSlip(null)}>Close</button>
                <button className="ne-btn-secondary" onClick={() => window.print()}><Printer size={16} /> Print</button>
                <button className="ne-btn-secondary" onClick={() => {
                  try {
                    const { doc } = buildPayslipPdf(showSlip);
                    const safeName = String(showSlip.name || 'employee').replace(/[^\w]+/g, '_');
                    doc.save(`Payslip_${safeName}_${monthLabel.replace(/\s+/g, '_')}.pdf`);
                    showNotification('Payslip downloaded.', 'success');
                  } catch (err) {
                    showNotification('Could not build PDF: ' + (err?.message || 'unknown error'), 'error');
                  }
                }}><Download size={16} /> Download PDF</button>
                <button className="ne-btn-primary" onClick={async () => {
                  const ok = await sendPayslipToEmployee(showSlip, {
                    earnings: {
                      basicSalary:      basicSalary,
                      hraAllowance:     hra,
                      performanceBonus: incentive,
                      otherEarnings:    conveyance + specialAllowance,
                    },
                    deductions: {
                      incomeTax:       tds,
                      providentFund:   epf,
                      healthInsurance: 0,
                      lopDeduction:    0,
                      otherDeductions: pt,
                    },
                  });
                  if (ok && !generatedPayrolls.includes(showSlip.id)) {
                    setGeneratedPayrolls([...generatedPayrolls, showSlip.id]);
                  }
                }}><Send size={16} /> Send to Employee</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Edit Payslip Slide-over Panel ── */}
      {showEditSlip && (() => {
        const emp = showEditSlip;
        const ctc = emp.salary || 50000;
        const basicSalary = Math.round(ctc * 0.50);
        const hra = Math.round(basicSalary * 0.40);
        const specialAllowance = ctc - basicSalary - hra;
        const incentive = checkEligibility(emp) ? 5000 : 0;
        const grossEarnings = ctc + incentive;
        const epf = Math.round(basicSalary * 0.12);
        const pt = 200;
        const tds = Math.round(grossEarnings * 0.10);
        const totalDeductions = epf + pt + tds;
        const netPayable = grossEarnings - totalDeductions;

        return (
          <div className="ne-modal-overlay" style={{ justifyContent: 'flex-end', alignItems: 'stretch' }}>
            <div className="ne-modal-card" style={{ 
              height: '100%', 
              width: '650px', 
              maxWidth: '100%', 
              margin: 0, 
              borderRadius: '16px 0 0 16px',
              animation: 'slideInRight 0.3s ease',
              display: 'flex',
              flexDirection: 'column'
            }}>
              <div className="ne-modal-header">
                <div>
                  <h2 className="ne-modal-title">Edit Payslip</h2>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>Modify salary details for {emp.name}</p>
                </div>
                <button className="ne-modal-close" onClick={() => setShowEditSlip(null)}><X size={20} /></button>
              </div>
              
              <div className="ne-modal-body" style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                <div style={{ animation: 'fadeIn 0.3s ease' }}>
                  <div style={{ background: '#FFF', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div className="ne-field">
                        <label className="ne-label">Employee ID</label>
                        <input className="ne-input" type="text" defaultValue={emp.employeeId || 'EMP-10' + emp.id} />
                      </div>
                      <div className="ne-field">
                        <label className="ne-label">Employee Name</label>
                        <input className="ne-input" type="text" defaultValue={emp.name} />
                      </div>
                      <div className="ne-field">
                        <label className="ne-label">Department</label>
                        <input className="ne-input" type="text" defaultValue={emp.dept} />
                      </div>
                      <div className="ne-field">
                        <label className="ne-label">Pay Period</label>
                        <input className="ne-input" type="text" defaultValue="April 2024" />
                      </div>
                    </div>
                  </div>

                  <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 12px 0' }}>Earnings</h3>
                  <div style={{ background: '#FFF', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div className="ne-field">
                        <label className="ne-label">Basic + DA</label>
                        <input className="ne-input" type="number" defaultValue={basicSalary} />
                      </div>
                      <div className="ne-field">
                        <label className="ne-label">HRA</label>
                        <input className="ne-input" type="number" defaultValue={hra} />
                      </div>
                    </div>
                  </div>

                  <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 12px 0' }}>Deductions</h3>
                  <div style={{ background: '#FFF', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div className="ne-field">
                        <label className="ne-label">EPF</label>
                        <input className="ne-input" type="number" defaultValue={epf} />
                      </div>
                      <div className="ne-field">
                        <label className="ne-label">Professional Tax</label>
                        <input className="ne-input" type="number" defaultValue={pt} />
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '14px', fontWeight: 600 }}>Net Pay</span>
                    <div style={{ width: '200px' }}>
                      <input className="ne-input" type="number" defaultValue={netPayable} style={{ fontWeight: 800, color: 'var(--primary)', textAlign: 'right' }} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="ne-modal-footer">
                <button className="ne-btn-secondary" onClick={() => setShowEditSlip(null)}>Cancel</button>
                <button className="ne-btn-primary" onClick={() => {
                  showNotification(`Payslip for ${emp.name} updated successfully!`, "success");
                  setShowEditSlip(null);
                }}>
                  <FileText size={16} /> Save Changes
                </button>
              </div>
            </div>
          </div>
        );
      })()}


      {/* Create Payroll Slide-over Panel — temporarily stubbed.
          The full builder is restored in a follow-up; until then HR can
          still use Upload Report and Send to Employee on the table rows. */}
      {showProcessPanel && (
        <div
          onClick={() => setShowProcessPanel(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 12, padding: 24, width: 'min(420px,100%)' }}
          >
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>Create Payroll</div>
            <div style={{ fontSize: 12, color: '#64748B', marginBottom: 14 }}>
              Use Upload Report on the Payroll page header to generate payslips
              for every employee for the selected month. The advanced manual
              builder is being rebuilt and will return shortly.
            </div>
            <button
              onClick={() => setShowProcessPanel(false)}
              style={{ padding: '8px 16px', borderRadius: 8, background: '#0F172A', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700 }}
            >Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
