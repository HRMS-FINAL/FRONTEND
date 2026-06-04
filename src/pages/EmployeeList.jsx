import React, { useState, useMemo, useEffect } from 'react';
import { ChevronRight, FileText, Download, Table, Filter, X, Trash2 } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { useNotification } from '../context/NotificationContext';

import { API } from '../config/api';
import { MANAGERS } from '../data/companyData';

// Live manager catalogue — fetched once per mount from /api/managers so
// new entries added via the HRMS Manager directory appear in the
// Assigned-To dropdown automatically. The static MANAGERS array stays
// as the boot-time fallback so the dropdown is never empty.

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
      name:           emp.name           || '',
      email:          emp.email          || '',
      role:           emp.role           || '',
      dept:           emp.dept           || '',
      manager:        emp.manager        || '',
      status:         emp.status         || '',
      salary:         emp.salary         || '',
      joiningDate:    emp.joiningDate    || '',
      accessRole:     emp.accessRole     || 'Employee',
      // Extended onboarding fields — surfaced in the edit drawer below
      // so HR can keep them current without re-creating the employee.
      phone:          emp.phone          || '',
      dob:            emp.dob            || '',
      gender:         emp.gender         || '',
      bloodGroup:     emp.bloodGroup     || '',
      employmentType: emp.employmentType || '',
      street:         emp.address?.street  || emp.street  || '',
      city:           emp.address?.city    || emp.city    || '',
      state:          emp.address?.state   || emp.state   || '',
      country:        emp.address?.country || emp.country || '',
      // Petrol allowance opt-in (Jun 2026) — seed from the existing
      // record so HR can see and toggle the current value.
      petrolEligible: !!emp.petrolEligible,
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
          email:          emailClean,
          designation:    editForm.role,
          department:     editForm.dept,
          assignedTo:     editForm.manager,
          // Access role (Employee / Manager / HR) — flipped via the
          // 'Convert to Manager' toggle in the edit drawer. Backend
          // stores this on Employee.role (a String enum). We DO NOT
          // send accessRole — that field is an ObjectId ref on the
          // model and the string 'Manager' would CastError on save.
          role:           editForm.accessRole === 'Manager' ? 'manager' : (editForm.accessRole === 'HR' ? 'hr' : 'employee'),
          status:         editForm.status,
          salary:         editForm.salary,
          joiningDate:    editForm.joiningDate,
          // Extended fields — phone, personal info, address. The backend
          // Employee model already has all of these — we just weren't
          // sending them, so HR edits to (say) phone number silently
          // dropped before reaching Mongo.
          phone:          editForm.phone,
          dob:            editForm.dob,
          gender:         editForm.gender,
          bloodGroup:     editForm.bloodGroup,
          employmentType: editForm.employmentType,
          address: {
            street:  editForm.street,
            city:    editForm.city,
            state:   editForm.state,
            country: editForm.country,
          },
          // Petrol allowance opt-in — flips the flag on the existing
          // Employee doc so the mobile backend's auto-bill cron picks
          // up the employee on their next check-out. Critical for
          // pre-existing employees who were created before the flag
          // existed.
          petrolEligible: !!editForm.petrolEligible,
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

  // Live manager list from the API. Initialises to the static MANAGERS
  // array so the first paint of the edit drawer is never empty.
  const [managerOptions, setManagerOptions] = useState(MANAGERS.slice());
  useEffect(() => {
    fetch(`${API}/managers`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && Array.isArray(data.data) && data.data.length > 0) {
          setManagerOptions(data.data.map((m) => ({ name: m.name, title: m.title || '' })));
        }
      })
      .catch(() => {});
  }, []);

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

  // Status tab config — "On Leave" dropped Jun 2026. HR doesn't filter
  // the employee directory by who's on leave today; that's what the
  // Leave & Permission page is for. Keep only the lifecycle states.
  const statusTabs = [
    { key: 'All',      label: 'All Employees', color: '#64748b', bg: '#F1F5F9', activeBg: '#0F172A', activeColor: '#fff' },
    { key: 'Active',   label: 'Active',        color: '#16a34a', bg: '#F0FDF4', activeBg: '#16a34a', activeColor: '#fff' },
    { key: 'Resigned', label: 'Resigned',      color: '#dc2626', bg: '#FEF2F2', activeBg: '#dc2626', activeColor: '#fff' },
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
          <div className="edit-panel" style={{ width: 520, maxWidth: '92vw' }}>
            {/* Hero header — gradient strip + avatar + name + role chip.
                Replaces the older flat 16px title. Sticky so it stays
                visible while HR scrolls through the long form below. */}
            <div className="edit-panel-header" style={{
              position: 'relative',
              padding: '22px 24px 18px',
              borderBottom: '1px solid var(--border-color)',
              background: 'linear-gradient(180deg, #F8FAFC 0%, #FFFFFF 100%)',
            }}>
              <button
                type="button"
                onClick={() => setEditingEmp(null)}
                aria-label="Close"
                style={{ position: 'absolute', top: 14, right: 14, width: 32, height: 32, borderRadius: 16, background: '#fff', border: '1px solid var(--border-color)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}
              >
                <X size={16} />
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div className="emp-table-avatar" style={{
                  background: (editingEmp.color || '#4CAA17') + '22',
                  color: editingEmp.color || '#4CAA17',
                  width: 52, height: 52, borderRadius: 26,
                  fontSize: 18, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: `2px solid ${editingEmp.color || '#4CAA17'}33`,
                }}>{editingEmp.initials}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.2px' }}>
                    {editingEmp.name || 'Edit Profile'}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: '#64748B', fontWeight: 700, letterSpacing: 0.3 }}>
                      {editingEmp.employeeId || `EMP-10${editingEmp.id}`}
                    </span>
                    {editingEmp.role && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#4CAA17', background: '#ECFDF5', padding: '2px 8px', borderRadius: 999, border: '1px solid #BBF7D0' }}>
                        {editingEmp.role}
                      </span>
                    )}
                    {editingEmp.dept && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#1D4ED8', background: '#EFF6FF', padding: '2px 8px', borderRadius: 999, border: '1px solid #BFDBFE' }}>
                        {editingEmp.dept}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', height: 'calc(100% - 112px)' }}>
              <div className="edit-panel-body" style={{
                flex: 1,
                overflowY: 'auto',
                padding: '20px 24px 28px',
                display: 'flex',
                flexDirection: 'column',
                gap: 24,
                background: '#FAFBFC',
              }}>

                {/* ─── Personal Information ───────────────────────── */}
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: '18px 18px 16px', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <div style={{ width: 4, height: 16, borderRadius: 2, background: '#4CAA17' }} />
                    <h4 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.1px' }}>Personal Information</h4>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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

                {/* Phone + Date of Birth */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="edit-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Phone</label>
                    <input
                      type="tel"
                      value={editForm.phone || ''}
                      onChange={e => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
                      className="filter-input-small"
                      style={{ width: '100%', padding: '10px 12px', fontSize: '13px' }}
                      placeholder="e.g. 9876543210"
                    />
                  </div>
                  <div className="edit-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date of Birth</label>
                    <input
                      type="date"
                      value={editForm.dob || ''}
                      onChange={e => setEditForm(prev => ({ ...prev, dob: e.target.value }))}
                      className="filter-input-small"
                      style={{ width: '100%', padding: '10px 12px', fontSize: '13px' }}
                    />
                  </div>
                </div>

                {/* Gender + Blood Group */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="edit-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Gender</label>
                    <select
                      value={editForm.gender || ''}
                      onChange={e => setEditForm(prev => ({ ...prev, gender: e.target.value }))}
                      className="filter-select"
                      style={{ width: '100%', padding: '10px 12px', fontSize: '13px', height: '40px' }}
                    >
                      <option value="">— Select —</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="edit-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Blood Group</label>
                    <select
                      value={editForm.bloodGroup || ''}
                      onChange={e => setEditForm(prev => ({ ...prev, bloodGroup: e.target.value }))}
                      className="filter-select"
                      style={{ width: '100%', padding: '10px 12px', fontSize: '13px', height: '40px' }}
                    >
                      <option value="">— Select —</option>
                      {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(bg => (
                        <option key={bg} value={bg}>{bg}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Employment Type */}
                <div className="edit-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Employment Type</label>
                  <select
                    value={editForm.employmentType || ''}
                    onChange={e => setEditForm(prev => ({ ...prev, employmentType: e.target.value }))}
                    className="filter-select"
                    style={{ width: '100%', padding: '10px 12px', fontSize: '13px', height: '40px' }}
                  >
                    <option value="">— Select —</option>
                    <option value="Full-time">Full-time</option>
                    <option value="Part-time">Part-time</option>
                    <option value="Contract">Contract</option>
                    <option value="Intern">Intern</option>
                  </select>
                </div>

                  </div>
                </div>

                {/* ─── Address ────────────────────────────────────── */}
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: '18px 18px 16px', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <div style={{ width: 4, height: 16, borderRadius: 2, background: '#1D4ED8' }} />
                    <h4 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.1px' }}>Address</h4>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="edit-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Street</label>
                  <input
                    type="text"
                    value={editForm.street || ''}
                    onChange={e => setEditForm(prev => ({ ...prev, street: e.target.value }))}
                    className="filter-input-small"
                    style={{ width: '100%', padding: '10px 12px', fontSize: '13px' }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                  <div className="edit-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>City</label>
                    <input
                      type="text"
                      value={editForm.city || ''}
                      onChange={e => setEditForm(prev => ({ ...prev, city: e.target.value }))}
                      className="filter-input-small"
                      style={{ width: '100%', padding: '10px 12px', fontSize: '13px' }}
                    />
                  </div>
                  <div className="edit-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>State</label>
                    <input
                      type="text"
                      value={editForm.state || ''}
                      onChange={e => setEditForm(prev => ({ ...prev, state: e.target.value }))}
                      className="filter-input-small"
                      style={{ width: '100%', padding: '10px 12px', fontSize: '13px' }}
                    />
                  </div>
                  <div className="edit-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Country</label>
                    <input
                      type="text"
                      value={editForm.country || ''}
                      onChange={e => setEditForm(prev => ({ ...prev, country: e.target.value }))}
                      className="filter-input-small"
                      style={{ width: '100%', padding: '10px 12px', fontSize: '13px' }}
                    />
                  </div>
                </div>

                  </div>
                </div>

                {/* ─── Employment Details ─────────────────────────── */}
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: '18px 18px 16px', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <div style={{ width: 4, height: 16, borderRadius: 2, background: '#7C3AED' }} />
                    <h4 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.1px' }}>Employment Details</h4>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="edit-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</label>
                    <select
                      value={editForm.status}
                      onChange={e => setEditForm(prev => ({ ...prev, status: e.target.value }))}
                      className="filter-select"
                      style={{ width: '100%', padding: '10px 12px', fontSize: '13px', height: '40px' }}
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                      <option value="On Leave">On Leave</option>
                      <option value="Terminated">Terminated</option>
                    </select>
                  </div>
                  <div className="edit-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Joining Date</label>
                    <input
                      type="date"
                      value={editForm.joiningDate || ''}
                      onChange={e => setEditForm(prev => ({ ...prev, joiningDate: e.target.value }))}
                      className="filter-input-small"
                      style={{ width: '100%', padding: '10px 12px', fontSize: '13px' }}
                    />
                  </div>
                </div>

                <div className="edit-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Salary (annual)</label>
                  <input
                    type="number"
                    value={editForm.salary || ''}
                    onChange={e => setEditForm(prev => ({ ...prev, salary: e.target.value }))}
                    className="filter-input-small"
                    style={{ width: '100%', padding: '10px 12px', fontSize: '13px' }}
                  />
                </div>

                  </div>
                </div>

                {/* ─── Manager & Access ───────────────────────────── */}
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: '18px 18px 16px', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <div style={{ width: 4, height: 16, borderRadius: 2, background: '#F59E0B' }} />
                    <h4 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.1px' }}>Manager & Access</h4>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="edit-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Assigned to (Manager)</label>
                  <select
                    value={editForm.manager}
                    onChange={e => setEditForm(prev => ({ ...prev, manager: e.target.value }))}
                    className="filter-select"
                    style={{ width: '100%', padding: '10px 12px', fontSize: '13px', height: '40px' }}
                  >
                    <option value="">Select Manager</option>
                    {managerOptions.map(m => (
                      <option key={`${m.name}-${m.title}`} value={m.name}>
                        {m.name}{m.title ? ` — ${m.title}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Convert to Manager toggle (Jun 2026). When on, flips
                    the employee's access role to Manager, which:
                      - Adds them to the Assigned-To dropdown app-wide
                      - Grants ERM Web manager-side access (Leave /
                        Allowance / Attendance approvals)
                    Flip back to Employee to revoke. */}
                <div className="edit-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', border: '1px solid #E5E7EB', borderRadius: 10, background: editForm.accessRole === 'Manager' ? '#FFFBEB' : '#FAFAFA', cursor: 'pointer', transition: 'background 0.15s' }}>
                    <input
                      type="checkbox"
                      checked={editForm.accessRole === 'Manager'}
                      onChange={(e) => setEditForm(prev => ({
                        ...prev,
                        accessRole: e.target.checked ? 'Manager' : 'Employee',
                      }))}
                      style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#F59E0B' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13 }}>Convert to Manager</div>
                      <div style={{ fontSize: 11, color: '#64748B', fontWeight: 500, marginTop: 2 }}>
                        Grants ERM Web manager access + adds them to the Assigned-To dropdown app-wide.
                      </div>
                    </div>
                  </label>
                </div>

                  </div>
                </div>

                {/* ─── Allowances ─────────────────────────────────── */}
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: '18px 18px 16px', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <div style={{ width: 4, height: 16, borderRadius: 2, background: '#DC2626' }} />
                    <h4 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.1px' }}>Allowances</h4>
                  </div>
                <div className="edit-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', border: '1px solid #E5E7EB', borderRadius: 10, background: editForm.petrolEligible ? '#F0FDF4' : '#FAFAFA', cursor: 'pointer', transition: 'background 0.15s' }}>
                    <input
                      type="checkbox"
                      checked={!!editForm.petrolEligible}
                      onChange={(e) => setEditForm(prev => ({ ...prev, petrolEligible: e.target.checked }))}
                      style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#4CAA17' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13 }}>Eligible for petrol allowance</div>
                      <div style={{ fontSize: 11, color: '#64748B', fontWeight: 500, marginTop: 2 }}>
                        Auto-bills daily at GPS km × ₹3.50 between check-in and check-out.
                      </div>
                    </div>
                  </label>
                </div>
                </div>
              </div>
              <div style={{
                padding: '14px 24px',
                borderTop: '1px solid #E5E7EB',
                background: '#FFFFFF',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 10,
                boxShadow: '0 -2px 8px rgba(0,0,0,0.04)',
              }}>
                <button
                  type="button"
                  onClick={() => setEditingEmp(null)}
                  style={{ padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: '#FFFFFF', color: '#475569', border: '1px solid #E5E7EB', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '10px 22px', borderRadius: 8, fontSize: 13, fontWeight: 800, background: '#4CAA17', color: '#fff', border: 'none', cursor: 'pointer', boxShadow: '0 2px 6px rgba(76,170,23,0.3)' }}
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
