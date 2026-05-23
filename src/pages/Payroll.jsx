import React, { useState } from 'react';
import { 
  ChevronRight, DollarSign, CreditCard, TrendingUp, Zap, 
  Download, Printer, Send, Search, Filter, X, FileText, Upload
} from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import logo from '../assets/logo.png';

export default function Payroll({ onBack, employees = [], updateEmployeeSalary }) {
  const { showNotification } = useNotification();
  const [showSlip, setShowSlip] = useState(null);
  const [showEditSlip, setShowEditSlip] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showProcessPanel, setShowProcessPanel] = useState(false);
  const [createEmpId, setCreateEmpId] = useState('');
  const [generatedPayrolls, setGeneratedPayrolls] = useState([]);
  
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      showNotification(`Report ${file.name} uploaded! Generating payslips based on attendance...`, 'success');
      const allEmpIds = employees.map(emp => emp.id);
      setTimeout(() => {
        setGeneratedPayrolls(allEmpIds);
        showNotification(`Payslips automatically generated for ${allEmpIds.length} employees.`, 'success');
      }, 1500);
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
          <button className="ne-btn-secondary"><Filter size={14} /> Month: April 2024</button>
        </div>
      </div>

      <div className="emp-table-card" style={{ marginTop: '20px' }}>
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
                  <td><div className="emp-table-dept">April 2024</div></td>
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
                      <button className="emp-table-btn" onClick={() => setShowSlip(emp)}>
                        <FileText size={14} /> Payslip
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
                      <h2 style={{ margin: 0, fontSize: '16px', color: '#1E293B', fontWeight: 800 }}>April 2024</h2>
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
                        <div>Pay Period</div><div>: April 2024</div>
                        <div>Pay Date</div><div>: 29/04/2024</div>
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
                <button className="ne-btn-secondary" onClick={() => showNotification("Payslip downloaded successfully!", "success")}><Download size={16} /> Download PDF</button>
                <button className="ne-btn-primary" onClick={() => showNotification(`Payslip emailed to ${showSlip.email}!`, "success")}><Send size={16} /> Send to Employee</button>
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

      {/* ── Create Payroll Slide-over Panel ── */}
      {showProcessPanel && (() => {
        const foundEmp = employees.find(e => (e.employeeId || 'EMP-10' + e.id) === createEmpId);
        
        let ctc = 0, basic = 0, hra = 0, special = 0, incentive = 0, gross = 0;
        let epf = 0, pt = 0, tds = 0, deductions = 0, net = 0;

        if (foundEmp) {
          ctc = foundEmp.salary || 50000;
          basic = Math.round(ctc * 0.50);
          hra = Math.round(basic * 0.40);
          special = ctc - basic - hra;
          incentive = checkEligibility(foundEmp) ? 5000 : 0;
          gross = ctc + incentive;
          
          epf = Math.round(basic * 0.12);
          pt = 200;
          tds = Math.round(gross * 0.10);
          deductions = epf + pt + tds;
          net = gross - deductions;
        }

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
              <div className="ne-modal-header" style={{ padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <img src={logo} alt="Logo" style={{ height: '40px' }} />
                  <div>
                    <h2 className="ne-modal-title" style={{ margin: 0 }}>Create Payroll</h2>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748B' }}>Generate a payslip for a specific employee</p>
                  </div>
                </div>
                <button className="ne-modal-close" onClick={() => setShowProcessPanel(false)}><X size={20} /></button>
              </div>
              <div className="ne-modal-body" style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                <div style={{ animation: 'fadeIn 0.3s ease' }}>
                  <div style={{ background: '#FFF', padding: '16px', borderRadius: '12px', border: '1px solid #E2E8F0', marginBottom: '20px', overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', border: '1px solid #000' }}>
                      <tbody>
                        <tr>
                          <td style={{ border: '1px solid #000', padding: '6px 8px', fontWeight: 'bold', width: '20%' }}>Emp ID</td>
                          <td style={{ border: '1px solid #000', padding: '6px 8px', width: '20%' }}>
                            <input type="text" placeholder="" style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none' }} />
                          </td>
                          <td style={{ border: '1px solid #000', padding: '6px 8px', fontWeight: 'bold', width: '20%' }}>Employee Name</td>
                          <td style={{ border: '1px solid #000', padding: '6px 8px' }} colSpan="2">
                            <input type="text" placeholder="" style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none' }} />
                          </td>
                        </tr>
                        <tr>
                          <td style={{ border: '1px solid #000', padding: '6px 8px', fontWeight: 'bold' }}>Paid Days</td>
                          <td style={{ border: '1px solid #000', padding: '6px 8px' }}>
                            <input type="number" defaultValue="30" style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none' }} />
                          </td>
                          <td style={{ border: '1px solid #000', padding: '6px 8px', fontWeight: 'bold' }}>Designation</td>
                          <td style={{ border: '1px solid #000', padding: '6px 8px' }} colSpan="2">
                            <input type="text" placeholder="" style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none' }} />
                          </td>
                        </tr>
                        <tr>
                          <td style={{ border: '1px solid #000', padding: '6px 8px', fontWeight: 'bold' }}>Department</td>
                          <td style={{ border: '1px solid #000', padding: '6px 8px' }}>
                            <input type="text" placeholder="" style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none' }} />
                          </td>
                          <td style={{ border: '1px solid #000', padding: '6px 8px' }}></td>
                          <td style={{ border: '1px solid #000', padding: '6px 8px' }} colSpan="2"></td>
                        </tr>
                        <tr>
                          <td style={{ border: '1px solid #000', padding: '6px 8px', fontWeight: 'bold' }}>BAL. ADVANCE</td>
                          <td style={{ border: '1px solid #000', padding: '6px 8px' }}>
                            <input type="number" defaultValue="0" style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none' }} />
                          </td>
                          <td style={{ border: '1px solid #000', padding: '6px 8px' }}></td>
                          <td style={{ border: '1px solid #000', padding: '6px 8px' }} colSpan="2"></td>
                        </tr>
                        
                        <tr>
                          <td style={{ border: '1px solid #000', padding: '6px 8px', fontWeight: 'bold', background: '#F8FAFC' }}>Earnings</td>
                          <td style={{ border: '1px solid #000', padding: '6px 8px', fontWeight: 'bold', background: '#F8FAFC' }}>Rate</td>
                          <td style={{ border: '1px solid #000', padding: '6px 8px', fontWeight: 'bold', background: '#F8FAFC' }}>Amount</td>
                          <td style={{ border: '1px solid #000', padding: '6px 8px', fontWeight: 'bold', background: '#F8FAFC' }}>Deductions</td>
                          <td style={{ border: '1px solid #000', padding: '6px 8px', fontWeight: 'bold', background: '#F8FAFC' }}>Amount</td>
                        </tr>
                        
                        <tr>
                          <td style={{ border: '1px solid #000', padding: '6px 8px' }}>BASIC + DA</td>
                          <td style={{ border: '1px solid #000', padding: '6px 8px' }}>
                            <input type="number" placeholder="" style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none' }} />
                          </td>
                          <td style={{ border: '1px solid #000', padding: '6px 8px' }}>
                            <input type="number" placeholder="" style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none' }} />
                          </td>
                          <td style={{ border: '1px solid #000', padding: '6px 8px' }}>PF</td>
                          <td style={{ border: '1px solid #000', padding: '6px 8px' }}>
                            <input type="number" placeholder="" style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none' }} />
                          </td>
                        </tr>
                        <tr>
                          <td style={{ border: '1px solid #000', padding: '6px 8px' }}>HRA</td>
                          <td style={{ border: '1px solid #000', padding: '6px 8px' }}>
                            <input type="number" placeholder="" style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none' }} />
                          </td>
                          <td style={{ border: '1px solid #000', padding: '6px 8px' }}>
                            <input type="number" placeholder="" style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none' }} />
                          </td>
                          <td style={{ border: '1px solid #000', padding: '6px 8px' }}>Prof. Tax</td>
                          <td style={{ border: '1px solid #000', padding: '6px 8px' }}>
                            <input type="number" placeholder="" style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none' }} />
                          </td>
                        </tr>
                        
                        <tr>
                          <td style={{ border: '1px solid #000', padding: '6px 8px', fontWeight: 'bold' }}>Total</td>
                          <td style={{ border: '1px solid #000', padding: '6px 8px', fontWeight: 'bold' }}>
                            <input type="number" placeholder="" style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontWeight: 'bold' }} />
                          </td>
                          <td style={{ border: '1px solid #000', padding: '6px 8px', fontWeight: 'bold' }}>
                            <input type="number" placeholder="" style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontWeight: 'bold' }} />
                          </td>
                          <td style={{ border: '1px solid #000', padding: '6px 8px', fontWeight: 'bold' }}>Total</td>
                          <td style={{ border: '1px solid #000', padding: '6px 8px', fontWeight: 'bold' }}>
                            <input type="number" placeholder="" style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontWeight: 'bold' }} />
                          </td>
                        </tr>
                        
                        <tr>
                          <td style={{ border: '1px solid #000', padding: '6px 8px', fontWeight: 'bold' }}>Net Pay</td>
                          <td colSpan="4" style={{ border: '1px solid #000', padding: '6px 8px', fontWeight: 'bold', fontSize: '14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              ₹<input type="number" placeholder="" style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontWeight: 'bold', fontSize: '14px', marginLeft: '4px' }} />
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              <div className="ne-modal-footer" style={{ borderTop: '1px solid #E2E8F0', padding: '24px', display: 'flex', gap: '12px' }}>
                <button className="ne-btn-secondary" style={{ flex: 1, padding: '12px' }} onClick={() => setShowProcessPanel(false)}>Cancel</button>
                <button 
                  className="ne-btn-primary" 
                  style={{ flex: 2, padding: '12px', background: '#10B981', border: 'none', cursor: 'pointer' }} 
                  onClick={() => {
                    if (foundEmp && !generatedPayrolls.includes(foundEmp.id)) {
                      setGeneratedPayrolls([...generatedPayrolls, foundEmp.id]);
                    }
                    setShowProcessPanel(false);
                    showNotification(`Payroll generated successfully!`, "success");
                  }}>
                  Generate Payslip
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
