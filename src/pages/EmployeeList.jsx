import React, { useState, useMemo } from 'react';
import { ChevronRight, FileText, Download, Table, Filter, X, Trash2 } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { useNotification } from '../context/NotificationContext';

import { API } from '../config/api';

export default function EmployeeList({ onBack, employees, setEmployees, setSelectedEmployee, setActiveView }) {
  const { showNotification, confirmDialog } = useNotification();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');

  const [editingEmp, setEditingEmp] = useState(null);
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    role: '',
    dept: '',
    manager: '',
    status: '',
    salary: '',
    joiningDate: '',
    accessRole: 'Employee'
  });

  const onEditProfile = (emp) => {
    setEditingEmp(emp);
    setEditForm({
      name: emp.name || '',
      email: emp.email || '',
      role: emp.role || '',
      dept: emp.dept || '',
      manager: emp.manager || '',
      status: emp.status || '',
      salary: emp.salary || '',
      joiningDate: emp.joiningDate || '',
      accessRole: emp.accessRole || 'Employee'
    });
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!editForm.name || !editForm.email) {
      showNotification("Name and Email are required!", "error");
      return;
    }

    const nameParts = editForm.name.trim().split(' ');
    const firstName = nameParts[0] || '';
    const lastName  = nameParts.slice(1).join(' ') || '';
    const emailClean = String(editForm.email || '').trim().toLowerCase();

    // ─── Persist FIRST, then UPDATE UI ───────────────────────────────
    // The old flow flipped the local list optimistically and showed a
    // "successfully" toast BEFORE the PUT, then swallowed every backend
    // error in a silent catch. So when an edit failed (write-gate,
    // duplicate-email index, validation, network blip), HR saw success
    // but the DB never changed — which is exactly why editing an
    // employee's email then trying to log in with the new email on ERM
    // returned "no employee found". Now we send the request, surface
    // the real failure, and only mirror it into the local list once
    // the server confirms the write.
    let res;
    try {
      res = await fetch(`${API}/employees/${editingEmp.id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName,
          email:       emailClean,
          designation: editForm.role,
          department:  editForm.dept,
          assignedTo:  editForm.manager,
          status:      editForm.status,
          salary:      editForm.salary,
          joiningDate: editForm.joiningDate,
        }),
      });
    } catch (err) {
      showNotification(`Could not save: ${err?.message || 'network error'}`, 'error');
      return;
    }

    let data = {};
    try { data = await res.json(); } catch { /* non-JSON */ }
    if (!res.ok || !data?.success) {
      // Surface the actual failure mode instead of pretending it worked.
      if (data?.code === 'READ_ONLY') {
        showNotification('You are signed in as a view-only user. Only HR admins can edit employees.', 'error');
      } else if (res.status === 400 && /duplicate/i.test(data?.message || '')) {
        showNotification(`Could not save: that email is already used by another employee.`, 'error');
      } else {
        showNotification(data?.message || `Save failed (HTTP ${res.status})`, 'error');
      }
      return;
    }

    // ── Server confirmed → mirror into local list and close drawer ──
    setEmployees(prev => prev.map(emp => {
      if (emp.id === editingEmp.id) {
        const initials = editForm.name.split(' ').map(n => n[0]).join('').toUpperCase();
        return {
          ...emp,
          ...editForm,
          email: emailClean,
          initials,
        };
      }
      return emp;
    }));
    showNotification("Employee profile updated. New email is live in ERM login.", "success");
    setEditingEmp(null);
  };

  const candidateManagers = useMemo(() => {
    if (!editingEmp) return [];
    return employees.filter(emp => emp.id !== editingEmp.id).map(emp => emp.name).sort();
  }, [employees, editingEmp]);

  const onViewDetails = (emp) => {
    setSelectedEmployee(emp);
    setActiveView('employee-details');
  };

  // Soft-delete an employee via DELETE /api/employees/:id. Optimistic update
  // — row disappears immediately, rolls back if the API call fails.
  const onDeleteEmp = async (emp) => {
    const label = emp.name || emp.employeeId || 'this employee';
    if (!(await confirmDialog({ title: "Confirm", message: `Remove ${label} from the directory? This cannot be undone from the UI.`, confirmText: "Delete", tone: "danger" }))) return;
    const snapshot = employees;
    setEmployees(prev => prev.filter(e => e.id !== emp.id));
    try {
      const res = await fetch(`${API}/employees/${emp.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setEmployees(snapshot);
        showNotification(data?.message || 'Could not delete employee', 'error');
        return;
      }
      showNotification(`${label} removed`, 'success');
    } catch (err) {
      setEmployees(snapshot);
      showNotification('Network error: ' + (err?.message || 'unknown'), 'error');
    }
  };

  // Extract unique departments and roles for filters
  const departments = useMemo(() => {
    const depts = employees.map(emp => emp.dept);
    return [...new Set(depts)].sort();
  }, [employees]);

  const roles = useMemo(() => {
    const r = employees.map(emp => emp.role);
    return [...new Set(r)].sort();
  }, [employees]);

  // Status category counts
  const statusCategories = useMemo(() => {
    const counts = { All: employees.length, Active: 0, Resigned: 0, 'On Leave': 0 };
    employees.forEach(emp => {
      const s = emp.status || 'Active';
      if (counts[s] !== undefined) counts[s]++;
    });
    return counts;
  }, [employees]);

  const filteredEmployees = employees.filter(emp => {
    const empIdStr = emp.employeeId || `EMP-10${emp.id}`;

    const matchesSearch = !searchQuery ||
      emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      empIdStr.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesDept = !filterDept || emp.dept === filterDept;
    const matchesRole = !filterRole || emp.role === filterRole;
    const matchesStatus = filterStatus === 'All' || (emp.status || 'Active') === filterStatus;

    return matchesSearch && matchesDept && matchesRole && matchesStatus;
  });

  const clearFilters = () => {
    setSearchQuery('');
    setFilterDept('');
    setFilterRole('');
    setFilterStatus('All');
  };

  const exportToPDF = () => {
    showNotification("Generating PDF report...", "info");
    const doc = new jsPDF();
    // ... rest of code
    const tableColumn = ["Employee ID", "Name", "Department", "Role", "Manager", "Status", "Email"];
    const tableRows = [];

    filteredEmployees.forEach(emp => {
      const empData = [
        emp.employeeId || `EMP-10${emp.id}`,
        emp.name,
        emp.dept,
        emp.role,
        emp.manager || 'N/A',
        emp.status,
        emp.email
      ];
      tableRows.push(empData);
    });

    // jsPDF-autotable v3+ is no longer a doc method — it's imported and
    // called as a function on the doc instance. The previous doc.autoTable
    // call silently threw and the PDF never downloaded.
    doc.text("Employee Directory Report", 14, 15);
    autoTable(doc, {
      head:    [tableColumn],
      body:    tableRows,
      startY:  20,
      theme:   'grid',
      styles:  { fontSize: 8 },
      // fillColor accepts a hex string or [r,g,b]. fillStyle was wrong.
      headStyles: { fillColor: '#4CAA17', textColor: '#ffffff', fontStyle: 'bold' },
    });
    doc.save(`Employees_${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')}.pdf`);
    showNotification("PDF downloaded successfully!", "success");
  };

  const exportToExcel = () => {
    showNotification("Preparing Excel file...", "info");
    const worksheet = XLSX.utils.json_to_sheet(filteredEmployees.map(emp => ({
      ID: emp.employeeId || `EMP-10${emp.id}`,
      Name: emp.name,
      Department: emp.dept,
      Role: emp.role,
      Manager: emp.manager || 'N/A',
      Status: emp.status,
      Email: emp.email
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Employees");
    XLSX.writeFile(workbook, `Employees_${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')}.xlsx`);
    showNotification("Excel file exported!", "success");
  };

  // Status tab config
  const statusTabs = [
    { key: 'All',      label: 'All Employees', color: '#64748b', bg: '#F1F5F9', activeBg: '#0F172A', activeColor: '#fff' },
    { key: 'Active',   label: 'Active',        color: '#16a34a', bg: '#F0FDF4', activeBg: '#16a34a', activeColor: '#fff' },
    { key: 'Resigned', label: 'Resigned',      color: '#dc2626', bg: '#FEF2F2', activeBg: '#dc2626', activeColor: '#fff' },
    { key: 'On Leave', label: 'On Leave',      color: '#d97706', bg: '#FFFBEB', activeBg: '#d97706', activeColor: '#fff' },
  ];

  return (
    <div className="emp-list-page">
      <div className="emp-list-header">
        <div className="ne-breadcrumb">
          <span className="ne-breadcrumb-link" onClick={onBack}>Dashboard</span>
          <ChevronRight size={13} />
          <span>Employee List</span>
        </div>
        <div className="emp-list-title-row">
          <div>
            <h1 className="ne-page-title">Employee Directory</h1>
            <p className="ne-page-sub">Manage and view all registered team members.</p>
          </div>
          <div className="emp-list-actions">
            <button className="export-btn pdf" onClick={exportToPDF}>
              <FileText size={16} /> PDF
            </button>
            <button className="export-btn excel" onClick={exportToExcel}>
              <Table size={16} /> Excel
            </button>
          </div>
        </div>

        {/* ── Working Status Category Tabs ── */}
        <div style={{
          display: 'flex', gap: 8, flexWrap: 'wrap',
          padding: '16px 0 4px', borderBottom: '1px solid var(--border-color)', marginBottom: 16,
        }}>
          {statusTabs.map(tab => {
            const count = statusCategories[tab.key] || 0;
            const active = filterStatus === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setFilterStatus(tab.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 16px', borderRadius: 999, border: 'none',
                  cursor: 'pointer', transition: 'all .18s',
                  background: active ? tab.activeBg : tab.bg,
                  color: active ? tab.activeColor : tab.color,
                  fontWeight: active ? 700 : 600, fontSize: 13,
                  boxShadow: active ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
                  transform: active ? 'translateY(-1px)' : 'none',
                }}
              >
                {tab.label}
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  minWidth: 20, height: 20, padding: '0 6px', borderRadius: 999,
                  fontSize: 11, fontWeight: 700,
                  background: active ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.08)',
                  color: active ? tab.activeColor : tab.color,
                }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Filter Bar */}
        <div className="emp-filter-bar">
          <div className="filter-group">
            <Filter size={16} className="filter-icon" />
            <span className="filter-label">Filters:</span>
          </div>
          
          <div className="filter-inputs">
            <div className="filter-item">
              <input 
                type="text" 
                placeholder="Search name, email or ID..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="filter-input-small"
                style={{ width: '220px' }}
              />
            </div>

            <div className="filter-item">
              <select 
                value={filterDept} 
                onChange={(e) => setFilterDept(e.target.value)}
                className="filter-select"
              >
                <option value="">All Departments</option>
                {departments.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>

            <div className="filter-item">
              <select 
                value={filterRole} 
                onChange={(e) => setFilterRole(e.target.value)}
                className="filter-select"
              >
                <option value="">All Designations</option>
                {roles.map(role => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </div>

            {(searchQuery || filterDept || filterRole || filterStatus !== 'All') && (
              <button className="clear-filter-btn" onClick={clearFilters}>
                <X size={14} /> Clear Filters
              </button>
            )}
          </div>

          <div className="filter-stats">
            Found <strong>{filteredEmployees.length}</strong> employees
          </div>
        </div>
      </div>

      <div className="emp-table-card">
        <table className="emp-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Dept & Role</th>
              <th>Manager</th>
              <th>Status</th>
              <th>Email</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.map(emp => (
              <tr key={emp.id}>
                <td>
                  <div className="emp-table-user">
                    <div className="emp-table-avatar" style={{ background: emp.color + '20', color: emp.color }}>{emp.initials}</div>
                    <div>
                      <div className="emp-table-name">{emp.name}</div>
                      <div className="emp-table-id">{emp.employeeId || `EMP-10${emp.id}`}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <div className="emp-table-dept">{emp.dept}</div>
                  <div className="emp-table-role">{emp.role}</div>
                </td>
                <td><div className="emp-table-manager" style={{ fontSize: '13px', fontWeight: '500' }}>{emp.manager || 'N/A'}</div></td>
                <td>
                  {(() => {
                    const s = emp.status || 'Active';
                    const cfg = {
                      'Active':     { bg: '#F0FDF4', color: '#16a34a', dot: '#22c55e' },
                      'Resigned':   { bg: '#FEF2F2', color: '#dc2626', dot: '#ef4444' },
                      'On Leave':   { bg: '#FFFBEB', color: '#d97706', dot: '#f59e0b' },
                      'Suspended':  { bg: '#F5F3FF', color: '#7c3aed', dot: '#8b5cf6' },
                      'Terminated': { bg: '#FFF1F2', color: '#9f1239', dot: '#e11d48' },
                    }[s] || { bg: '#F1F5F9', color: '#64748b', dot: '#94a3b8' };
                    return (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                        background: cfg.bg, color: cfg.color,
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
                        {s}
                      </span>
                    );
                  })()}
                </td>
                <td><div className="emp-table-email">{emp.email}</div></td>
                 <td>
                   <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                     <button className="emp-table-btn" onClick={() => onViewDetails(emp)}>Details</button>
                     <button
                       className="emp-table-btn"
                       style={{
                         background: 'rgba(76, 170, 23, 0.08)',
                         color: 'var(--primary)',
                         border: '1px solid rgba(76, 170, 23, 0.2)',
                         padding: '6px 12px',
                         borderRadius: '6px',
                         fontSize: '11px',
                         fontWeight: '700',
                         cursor: 'pointer',
                       }}
                       onClick={() => onEditProfile(emp)}
                     >
                       Edit
                     </button>
                     <button
                       className="emp-table-btn"
                       title="Delete employee"
                       style={{
                         background: 'rgba(220, 38, 38, 0.08)',
                         color: '#dc2626',
                         border: '1px solid rgba(220, 38, 38, 0.2)',
                         padding: '6px 8px',
                         borderRadius: '6px',
                         cursor: 'pointer',
                         display: 'inline-flex',
                         alignItems: 'center',
                         justifyContent: 'center',
                       }}
                       onClick={() => onDeleteEmp(emp)}
                     >
                       <Trash2 size={14} />
                     </button>
                   </div>
                 </td>
               </tr>
             ))}
           </tbody>
         </table>
       </div>

      {/* Right Side Edit Profile Panel Drawer */}
      {editingEmp && (
        <>
          <div className="edit-panel-overlay" onClick={() => setEditingEmp(null)} />
          <div className="edit-panel">
            <div className="edit-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="emp-table-avatar" style={{ background: editingEmp.color + '20', color: editingEmp.color, width: '40px', height: '40px', fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>{editingEmp.initials}</div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-main)' }}>Edit Profile</h3>
                  <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-light)', fontWeight: 600 }}>{editingEmp.employeeId || `EMP-10${editingEmp.id}`}</p>
                </div>
              </div>
              <button 
                onClick={() => setEditingEmp(null)} 
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-light)', transition: 'background-color 0.2s' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-main)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', height: 'calc(100% - 81px)' }}>
              <div className="edit-panel-body" style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                {/* Form Group: Name */}
                <div className="edit-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Full Name</label>
                  <input 
                    type="text" 
                    value={editForm.name} 
                    onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                    className="filter-input-small" 
                    style={{ width: '100%', padding: '10px 12px', fontSize: '13px' }} 
                    required
                  />
                </div>

                {/* Form Group: Email */}
                <div className="edit-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Email Address</label>
                  <input 
                    type="email" 
                    value={editForm.email} 
                    onChange={e => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                    className="filter-input-small" 
                    style={{ width: '100%', padding: '10px 12px', fontSize: '13px' }} 
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  {/* Form Group: Department */}
                  <div className="edit-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Department</label>
                    <select 
                      value={editForm.dept} 
                      onChange={e => setEditForm(prev => ({ ...prev, dept: e.target.value }))}
                      className="filter-select" 
                      style={{ width: '100%', padding: '10px 12px', fontSize: '13px', height: '40px' }}
                    >
                      {departments.map(dept => (
                        <option key={dept} value={dept}>{dept}</option>
                      ))}
                    </select>
                  </div>

                  {/* Form Group: Designation */}
                  <div className="edit-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Designation</label>
                    <select 
                      value={editForm.role} 
                      onChange={e => setEditForm(prev => ({ ...prev, role: e.target.value }))}
                      className="filter-select" 
                      style={{ width: '100%', padding: '10px 12px', fontSize: '13px', height: '40px' }}
                    >
                      {roles.map(role => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Form Group: Assigned Manager */}
                <div className="edit-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Assigned Manager</label>
                  <select 
                    value={editForm.manager} 
                    onChange={e => setEditForm(prev => ({ ...prev, manager: e.target.value }))}
                    className="filter-select" 
                    style={{ width: '100%', padding: '10px 12px', fontSize: '13px', height: '40px' }}
                  >
                    <option value="">No Manager / Self</option>
                    <option value="Alex Morrison">Alex Morrison (HR Manager)</option>
                    {candidateManagers.map(mgrName => (
                      mgrName !== 'Alex Morrison' && (
                        <option key={mgrName} value={mgrName}>{mgrName}</option>
                      )
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  {/* Form Group: Salary */}
                  <div className="edit-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Salary ($ / mo)</label>
                    <input 
                      type="number" 
                      value={editForm.salary} 
                      onChange={e => setEditForm(prev => ({ ...prev, salary: parseFloat(e.target.value) || '' }))}
                      className="filter-input-small" 
                      style={{ width: '100%', padding: '10px 12px', fontSize: '13px' }} 
                    />
                  </div>

                  {/* Form Group: Joining Date */}
                  <div className="edit-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Joining Date</label>
                    <input 
                      type="date" 
                      value={editForm.joiningDate} 
                      onChange={e => setEditForm(prev => ({ ...prev, joiningDate: e.target.value }))}
                      className="filter-input-small" 
                      style={{ width: '100%', padding: '10px 12px', fontSize: '13px', height: '40px' }} 
                    />
                  </div>
                </div>

                {/* Form Group: Status */}
                <div className="edit-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</label>
                  <select 
                    value={editForm.status} 
                    onChange={e => setEditForm(prev => ({ ...prev, status: e.target.value }))}
                    className="filter-select" 
                    style={{ width: '100%', padding: '10px 12px', fontSize: '13px', height: '40px' }}
                  >
                    <option value="Active">Active</option>
                    <option value="Resigned">Resigned</option>
                    <option value="On Leave">On Leave</option>
                  </select>
                </div>

                {/* Form Group: Access Role */}
                <div className="edit-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>System Access Role</label>
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'center', height: '40px', background: '#F8FAFC', padding: '0 12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: 600, color: 'var(--text-main)' }}>
                      <input 
                        type="radio" 
                        name="accessRole" 
                        value="Employee" 
                        checked={editForm.accessRole === 'Employee'} 
                        onChange={() => setEditForm(prev => ({ ...prev, accessRole: 'Employee' }))} 
                        style={{ accentColor: 'var(--primary)', width: '16px', height: '16px' }}
                      />
                      Employee
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: 600, color: 'var(--text-main)' }}>
                      <input 
                        type="radio" 
                        name="accessRole" 
                        value="Manager" 
                        checked={editForm.accessRole === 'Manager'} 
                        onChange={() => setEditForm(prev => ({ ...prev, accessRole: 'Manager' }))} 
                        style={{ accentColor: 'var(--primary)', width: '16px', height: '16px' }}
                      />
                      Manager
                    </label>
                  </div>
                </div>

              </div>

              {/* Drawer Footer Actions */}
              <div className="edit-panel-footer" style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: '#fafafa' }}>
                <button 
                  type="button" 
                  onClick={() => setEditingEmp(null)} 
                  className="ne-btn-secondary"
                  style={{ padding: '8px 16px', fontSize: '13px' }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="ne-btn-primary"
                  style={{ padding: '8px 20px', fontSize: '13px', background: 'var(--primary)', color: 'white', border: '1px solid var(--primary-dark)' }}
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      <style>{`
        .edit-panel-overlay { position: fixed; top:0; left:0; width:100vw; height:100vh; background: rgba(0,0,0,0.4); backdrop-filter: blur(4px); z-index: 999; opacity: 0; animation: editFadeIn 0.2s forwards ease-out; }
        .edit-panel { position: fixed; top:0; right:-480px; width:480px; height:100vh; background:white; box-shadow: -10px 0 30px rgba(0,0,0,0.15); z-index:1000; display:flex; flex-direction:column; animation: editSlideIn 0.3s forwards cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes editFadeIn { to { opacity: 1; } }
        @keyframes editSlideIn { to { right: 0; } }
        .edit-form-group input:focus, .edit-form-group select:focus { border-color: var(--primary) !important; outline: none; box-shadow: 0 0 0 3px rgba(76, 170, 23, 0.15) !important; }
      `}</style>
    </div>
  );
}
