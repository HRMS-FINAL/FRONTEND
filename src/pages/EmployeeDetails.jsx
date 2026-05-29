import React, { useState, useMemo, useEffect, useRef } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  ChevronRight, Mail, Phone, MapPin, Calendar, 
  Briefcase, DollarSign, Clock, Shield, Star, 
  FileText, Download, Edit2, ArrowLeft, X, Upload
} from 'lucide-react';
import { useNotification } from '../context/NotificationContext';

import { API } from '../config/api';

export default function EmployeeDetails({ employee, employees, setEmployees, setSelectedEmployee, onBack }) {
  const { showNotification, confirmDialog } = useNotification();
  const [editingEmp, setEditingEmp] = useState(null);
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    role: '',
    dept: '',
    manager: '',
    status: '',
    salary: '',
    joiningDate: ''
  });

  const departments = useMemo(() => {
    if (!employees) return [];
    const depts = employees.map(emp => emp.dept);
    return [...new Set(depts)].sort();
  }, [employees]);

  const roles = useMemo(() => {
    if (!employees) return [];
    const r = employees.map(emp => emp.role);
    return [...new Set(r)].sort();
  }, [employees]);

  const candidateManagers = useMemo(() => {
    if (!employees || !employee) return [];
    return employees.filter(emp => emp.id !== employee.id).map(emp => emp.name).sort();
  }, [employees, employee]);

  // ─── Live data for the detail panels ─────────────────────────────
  const [upcomingLeaves, setUpcomingLeaves] = useState([]);
  const [productivity, setProductivity] = useState({
    leavesUsed: 0, permsUsed: 0, permHoursUsed: 0, absent: 0,
    // LOP (Loss of Pay) — days the employee was absent / on leave beyond
    // the monthly policy (1 CL + 2 perms). 1/2 LOP is the half-day
    // equivalent that piles up when permissions exceed quota.
    lopDays: 0, halfLopDays: 0,
  });
  const [documents, setDocuments] = useState([]);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!employee?.id) return;
    let cancelled = false;
    const now = new Date();
    const m = now.getMonth() + 1, y = now.getFullYear();

    // Upcoming approved leaves for THIS employee (toDate >= today).
    fetch(`${API}/leave-requests?status=approved&limit=200`)
      .then(r => r.json())
      .then(d => {
        if (cancelled || !d || !Array.isArray(d.items)) return;
        const todayIso = new Date().toISOString().slice(0, 10);
        const mine = d.items
          .filter(l => {
            const empId = String(l.employee?._id || l.employee || l.userId || '');
            return empId === String(employee.id) ||
                   (l.employee?.email && employee.email && l.employee.email.toLowerCase() === employee.email.toLowerCase());
          })
          .filter(l => (l.toDate || l.endDate || '') >= todayIso)
          .map(l => ({
            id:     l._id,
            type:   l.leaveType || l.type || 'Leave',
            from:   l.fromDate  || l.startDate || '',
            to:     l.toDate    || l.endDate   || '',
            days:   l.days || l.duration || '',
            status: l.status || 'Approved',
          }));
        setUpcomingLeaves(mine);
      })
      .catch(() => {});

    // Productivity from this month's attendance: full-day leaves (CL),
    // permissions (2h each per policy), and absent days.
    fetch(`${API}/attendance/logs?month=${m}&year=${y}&search=${encodeURIComponent(employee.employeeId || '')}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled || !d || !Array.isArray(d.data)) return;
        const mine = d.data.filter(a =>
          (a.employeeId && employee.employeeId && a.employeeId === employee.employeeId) ||
          (a.email && employee.email && a.email.toLowerCase() === employee.email.toLowerCase())
        );
        const leavesUsed    = mine.filter(a => a.status === 'On Leave').length;
        const permsUsed     = mine.filter(a => a.status === 'Permission' || a.status === 'Half Day').length;
        const permHoursUsed = permsUsed * 2;
        const absent        = mine.filter(a => a.status === 'Absent').length;
        // Policy: 1 CL + 2 permissions per month, anything above hits LOP.
        //   LOP days        = absences + leaves beyond the 1-CL allowance.
        //   1/2 LOP (half)  = each permission past the 2/month policy is
        //                     billed as a half-day loss.
        const lopDays     = Math.max(0, absent + Math.max(0, leavesUsed - 1));
        const halfLopDays = Math.max(0, permsUsed - 2);
        setProductivity({ leavesUsed, permsUsed, permHoursUsed, absent, lopDays, halfLopDays });
      })
      .catch(() => {});

    // Documents: per-employee localStorage so they survive a page reload.
    // (No backend docs collection yet — easy follow-up.)
    try {
      const stored = JSON.parse(localStorage.getItem('emp_docs_' + employee.id) || '[]');
      if (!cancelled && Array.isArray(stored)) setDocuments(stored);
    } catch { /* ignore */ }

    return () => { cancelled = true; };
  }, [employee?.id]);

  const handleUploadDocument = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      showNotification('File too large — max 5 MB.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const doc = {
        id:    Date.now().toString(),
        name:  f.name,
        size:  (f.size / 1024).toFixed(1) + ' KB',
        date:  new Date().toLocaleDateString('en-GB'),
        type:  f.type || 'application/octet-stream',
        data:  ev.target.result,
      };
      const next = [doc, ...documents];
      setDocuments(next);
      try { localStorage.setItem('emp_docs_' + employee.id, JSON.stringify(next)); } catch { /* quota */ }
      showNotification(`Uploaded "${f.name}".`, 'success');
    };
    reader.onerror = () => showNotification('Could not read file.', 'error');
    reader.readAsDataURL(f);
    e.target.value = '';
  };

  const handleDownloadDocument = (doc) => {
    if (!doc.data) { showNotification('Document has no stored data.', 'error'); return; }
    const a = document.createElement('a');
    a.href = doc.data;
    a.download = doc.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDeleteDocument = async (doc) => {
    if (!(await confirmDialog({ title: "Confirm", message: `Remove "${doc.name}"?`, confirmText: "Delete", tone: "danger" }))) return;
    const next = documents.filter(d => d.id !== doc.id);
    setDocuments(next);
    try { localStorage.setItem('emp_docs_' + employee.id, JSON.stringify(next)); } catch { /* */ }
  };

  const handleExportCV = () => {
    try {
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const W = doc.internal.pageSize.getWidth();
      const M = 40;
      let cy = 60;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.setTextColor(30, 41, 59);
      doc.text(employee.name || 'Employee', M, cy);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(employee.role || '', M, cy + 18);
      doc.setDrawColor(76, 170, 23);
      doc.setLineWidth(2);
      doc.line(M, cy + 30, W - M, cy + 30);
      cy += 56;

      const section = (t) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(76, 170, 23);
        doc.text(t, M, cy);
        cy += 18;
      };
      const row = (label, value) => {
        if (!value) return;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139);
        doc.text(label, M, cy);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.setTextColor(30, 41, 59);
        doc.text(String(value), M + 130, cy);
        cy += 16;
      };

      section('Contact');
      row('Email',    employee.email);
      row('Phone',    employee.phone);
      row('Location', [employee.address?.city, employee.address?.state, employee.address?.country].filter(Boolean).join(', '));
      cy += 8;

      section('Employment');
      row('Employee ID', employee.employeeId || ('EMP-100' + employee.id));
      row('Department',  employee.dept);
      row('Designation', employee.role);
      row('Reporting to',employee.manager);
      row('Joining Date',employee.joiningDate);
      row('Type',        employee.employmentType || 'Full-time');
      cy += 8;

      if (employee.education) {
        section('Education');
        row('Degree',     employee.education.degree);
        row('University', employee.education.university);
        row('Field',      employee.education.fieldOfStudy);
        row('Year',       employee.education.graduationYear);
      }

      const safe = (employee.name || 'cv').replace(/[^\w]+/g, '_');
      doc.save(`CV_${safe}.pdf`);
      showNotification('CV downloaded.', 'success');
    } catch (err) {
      showNotification('Could not build CV: ' + (err?.message || 'unknown'), 'error');
    }
  };

  const onEditProfile = () => {
    setEditingEmp(employee);
    setEditForm({
      name: employee.name || '',
      email: employee.email || '',
      role: employee.role || '',
      dept: employee.dept || '',
      manager: employee.manager || '',
      status: employee.status || '',
      salary: employee.salary || '',
      joiningDate: employee.joiningDate || ''
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

    const updatedEmp = {
      ...employee,
      ...editForm,
      initials: editForm.name.split(' ').map(n => n[0]).join('').toUpperCase()
    };

    setEmployees(prev => prev.map(emp => emp.id === employee.id ? updatedEmp : emp));
    setSelectedEmployee(updatedEmp);
    showNotification("Employee profile updated successfully!", "success");
    setEditingEmp(null);

    // Persist to API
    try {
      await fetch(`${API}/employees/${employee.id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName,
          email:       editForm.email,
          designation: editForm.role,
          department:  editForm.dept,
          assignedTo:  editForm.manager,
          status:      editForm.status,
          salary:      editForm.salary,
          joiningDate: editForm.joiningDate,
        }),
      });
    } catch {
      // UI already updated; API sync is best-effort
    }
  };

  if (!employee) return <div>Employee not found</div>;

  return (
    <div className="emp-list-page">
      <div className="emp-list-header">
        <div className="ne-breadcrumb">
          <span className="ne-breadcrumb-link" onClick={onBack}><ArrowLeft size={14} /> Back to Directory</span>
        </div>
        <div className="emp-list-title-row">
          <div className="emp-details-profile-header">
            <div className="emp-table-avatar" style={{ width: '64px', height: '64px', fontSize: '24px', background: employee.color + '20', color: employee.color }}>
              {employee.initials}
            </div>
            <div>
              <h1 className="ne-page-title">{employee.name}</h1>
              <div className="profile-user-badges">
                <span className="p-badge">{employee.role}</span>
                <span className="p-badge" style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)' }}>{employee.status}</span>
                <span className="p-badge">ID: {employee.employeeId || 'EMP-100' + employee.id}</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="ne-btn-primary" onClick={handleExportCV}><Download size={16} /> Export CV</button>
          </div>
        </div>
      </div>

      <div className="employee-details-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '30px', marginTop: '24px' }}>
        <aside className="emp-details-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="card" style={{ padding: '24px' }}>
            <h3 className="p-card-title" style={{ marginBottom: '20px', fontSize: '16px' }}>Contact Information</h3>
            <div className="p-contact-list">
              <div className="p-contact-item" style={{ marginBottom: '16px' }}>
                <div className="p-contact-icon" style={{ background: 'var(--bg-main)', padding: '8px', borderRadius: '6px' }}><Mail size={16} color="var(--primary)" /></div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-light)', fontWeight: 700 }}>EMAIL</label>
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>{employee.email}</span>
                </div>
              </div>
              <div className="p-contact-item" style={{ marginBottom: '16px' }}>
                <div className="p-contact-icon" style={{ background: 'var(--bg-main)', padding: '8px', borderRadius: '6px' }}><Phone size={16} color="var(--primary)" /></div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-light)', fontWeight: 700 }}>PHONE</label>
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>{employee.phone || 'N/A'}</span>
                </div>
              </div>
              <div className="p-contact-item">
                <div className="p-contact-icon" style={{ background: 'var(--bg-main)', padding: '8px', borderRadius: '6px' }}><MapPin size={16} color="var(--primary)" /></div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-light)', fontWeight: 700 }}>LOCATION</label>
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>{[employee.address?.city, employee.address?.state, employee.address?.country].filter(Boolean).join(', ') || 'N/A'}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: '24px' }}>
            <h3 className="p-card-title" style={{ marginBottom: '6px', fontSize: '16px' }}>Productivity</h3>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '14px' }}>
              This month — policy: 1 CL + 2 perm (2 hrs each)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              <div style={{ textAlign: 'center', padding: '12px 8px', background: 'var(--bg-main)', borderRadius: '12px' }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#48BB78' }}>{productivity.leavesUsed}/1</div>
                <div style={{ fontSize: '10px', color: 'var(--text-light)', fontWeight: 700, textTransform: 'uppercase' }}>CL</div>
              </div>
              <div style={{ textAlign: 'center', padding: '12px 8px', background: 'var(--bg-main)', borderRadius: '12px' }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#9F7AEA' }}>{productivity.permHoursUsed.toFixed(1)}h</div>
                <div style={{ fontSize: '10px', color: 'var(--text-light)', fontWeight: 700, textTransform: 'uppercase' }}>Perm</div>
              </div>
              <div style={{ textAlign: 'center', padding: '12px 8px', background: 'var(--bg-main)', borderRadius: '12px' }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: productivity.absent > 0 ? '#FC8181' : '#4299E1' }}>{productivity.absent}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-light)', fontWeight: 700, textTransform: 'uppercase' }}>Absent</div>
              </div>
              <div style={{ textAlign: 'center', padding: '12px 8px', background: 'var(--bg-main)', borderRadius: '12px' }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: productivity.lopDays > 0 ? '#DC2626' : '#4299E1' }}>{productivity.lopDays}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-light)', fontWeight: 700, textTransform: 'uppercase' }}>LOP</div>
              </div>
              <div style={{ textAlign: 'center', padding: '12px 8px', background: 'var(--bg-main)', borderRadius: '12px' }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: productivity.halfLopDays > 0 ? '#F97316' : '#4299E1' }}>{productivity.halfLopDays}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-light)', fontWeight: 700, textTransform: 'uppercase' }}>1/2 LOP</div>
              </div>
            </div>
          </div>
        </aside>

        <main className="emp-details-main" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="card" style={{ padding: '30px' }}>
            <h3 className="p-card-title" style={{ marginBottom: '24px', fontSize: '18px' }}>Employment Details</h3>
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '30px' }}>
              <div className="ps-info-block">
                <label>DEPARTMENT</label>
                <div>{employee.dept}</div>
              </div>
              <div className="ps-info-block">
                <label>DESIGNATION</label>
                <div>{employee.role}</div>
              </div>
              <div className="ps-info-block">
                <label>REPORTING TO</label>
                <div>{employee.manager || 'N/A'}</div>
              </div>
              <div className="ps-info-block">
                <label>JOINING DATE</label>
                <div>{employee.joiningDate || 'N/A'}</div>
              </div>
              <div className="ps-info-block">
                <label>EMPLOYMENT TYPE</label>
                <div>Full Time</div>
              </div>
              <div className="ps-info-block">
                <label>SALARY</label>
                <div>{employee.salary ? `$${Number(employee.salary).toLocaleString()} / mo` : 'N/A'}</div>
              </div>
            </div>
          </div>

          <div className="middle-row" style={{ marginTop: 0, gap: '24px' }}>

            <div className="card" style={{ flex: 1, padding: '24px' }}>
              <h3 className="p-card-title" style={{ marginBottom: '20px', fontSize: '16px' }}>Upcoming Leaves</h3>
              <div className="reminder-list">
                {upcomingLeaves.length === 0 && (
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '8px 0' }}>
                    No upcoming approved leaves.
                  </div>
                )}
                {upcomingLeaves.map(l => (
                  <div key={l.id} className="reminder-item" style={{ padding: '0 0 12px 0', borderBottom: '1px solid var(--border-color)', marginBottom: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <div className="reminder-text">{l.type}</div>
                      <div className="reminder-due">
                        {l.from} — {l.to}{l.days ? ' (' + l.days + ')' : ''}
                      </div>
                    </div>
                    <span className="dash-emp-status approved">{l.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 className="p-card-title" style={{ margin: 0, fontSize: '16px' }}>Recent Documents</h3>
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: 'none' }}
                onChange={handleUploadDocument}
              />
              <button
                className="ne-btn-secondary"
                style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={14} /> Upload Document
              </button>
            </div>
            <div className="p-activity-list">
              {documents.length === 0 && (
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '8px 0' }}>
                  No documents uploaded yet.
                </div>
              )}
              {documents.map(doc => (
                <div key={doc.id} className="p-contact-item" style={{ marginBottom: '12px', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <FileText size={18} color="var(--primary)" />
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600 }}>{doc.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-light)' }}>{doc.size} • Uploaded on {doc.date}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button className="emp-table-btn" title="Download" onClick={() => handleDownloadDocument(doc)}><Download size={14} /></button>
                    <button className="emp-table-btn" title="Remove" style={{ color: '#FC8181' }} onClick={() => handleDeleteDocument(doc)}><X size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
