import React, { useState, useMemo, useEffect, useRef } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  ChevronRight, Mail, Phone, MapPin, Calendar, 
  Briefcase, DollarSign, Clock, Shield, Star, 
  FileText, Download, Edit2, ArrowLeft, X, Upload,
  Package, Laptop, Monitor, Mouse, Keyboard, CreditCard, Cpu, Smartphone,
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
    joiningDate: '',
    // Extended fields — captured during Add Employee. HR can now edit all
    // of them from the Employee Details page so the source of truth lives
    // in one place rather than being silently dropped after onboarding.
    phone: '',
    dob: '',
    gender: '',
    bloodGroup: '',
    employmentType: '',
    street: '',
    city: '',
    state: '',
    country: '',
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
    lateCount: 0,
    // LOP (Loss of Pay) — applied when the employee exceeds the monthly
    // policy (1 CL + 2 perms) or accumulates lates.
    //   • 1 CL/month free; extra CLs = 1 LOP each.
    //   • 2 perms/month free; extra perms = 0.5 LOP each (1/2 LOP).
    //   • Every 3 lates = 0.5 LOP, every 6 lates = 1 LOP.
    lopDays: 0, halfLopDays: 0,
  });
  const [documents, setDocuments] = useState([]);
  // Company assets assigned to this employee — laptop, monitor, ID
  // card, etc. Loaded from /api/assets and filtered by employeeId so
  // HR sees the IT inventory linked to this person without leaving
  // Employee Details.
  const [assets, setAssets] = useState([]);
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
        // Late = check-in after 10:01 AM. The day still counts as present
        // (the employee showed up), but the late tally drives LOP below.
        const lateCount     = mine.filter(a => a.status === 'Late').length;

        // LOP policy (set by HR 2026-05-28):
        //   • 1 CL/month free; extras = 1 LOP each.
        //   • 2 perms/month free; extras = 0.5 LOP each (1/2 LOP).
        //   • Every 3 lates = 0.5 LOP; every 6 lates = 1 LOP.
        //   • Absent (no leave taken) = 1 LOP.
        const excessLeaves = Math.max(0, leavesUsed - 1);
        const excessPerms  = Math.max(0, permsUsed - 2);
        const lateFullLop  = Math.floor(lateCount / 6);
        const lateHalfLop  = (lateCount % 6 >= 3) ? 1 : 0;
        const lopDays      = excessLeaves + absent + lateFullLop;
        const halfLopDays  = excessPerms + lateHalfLop;
        setProductivity({
          leavesUsed, permsUsed, permHoursUsed, absent, lateCount,
          lopDays, halfLopDays,
        });
      })
      .catch(() => {});

    // Documents: per-employee localStorage so they survive a page reload.
    // (No backend docs collection yet — easy follow-up.)
    try {
      const stored = JSON.parse(localStorage.getItem('emp_docs_' + employee.id) || '[]');
      if (!cancelled && Array.isArray(stored)) setDocuments(stored);
    } catch { /* ignore */ }

    // Assigned company assets — fetch from /api/assets and filter to
    // this employee's empId. Silent fail so the page still renders if
    // the assets backend is unreachable.
    (async () => {
      try {
        const empId = employee.employeeId || '';
        if (!empId) { if (!cancelled) setAssets([]); return; }
        const res  = await fetch(`${API}/assets`);
        const data = await res.json();
        if (cancelled || !data?.success || !Array.isArray(data.data)) return;
        setAssets(data.data.filter(a => String(a.employeeId || '').toUpperCase() === String(empId).toUpperCase()));
      } catch {
        if (!cancelled) setAssets([]);
      }
    })();

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
        date:  new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-'),
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
      name:           employee.name           || '',
      email:          employee.email          || '',
      role:           employee.role           || '',
      dept:           employee.dept           || '',
      manager:        employee.manager        || '',
      status:         employee.status         || '',
      salary:         employee.salary         || '',
      joiningDate:    employee.joiningDate    || '',
      phone:          employee.phone          || '',
      dob:            employee.dob            || '',
      gender:         employee.gender         || '',
      bloodGroup:     employee.bloodGroup     || '',
      employmentType: employee.employmentType || '',
      street:         employee.address?.street  || '',
      city:           employee.address?.city    || '',
      state:          employee.address?.state   || '',
      country:        employee.address?.country || '',
    });
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!editForm.name || !editForm.email) {
      showNotification("Name and Email are required!", "error");
      return;
    }

    const nameParts  = editForm.name.trim().split(' ');
    const firstName  = nameParts[0] || '';
    const lastName   = nameParts.slice(1).join(' ') || '';
    const emailClean = String(editForm.email || '').trim().toLowerCase();

    // Persist FIRST, mirror INTO the local list only after the server
    // confirms the write. The previous code fired an optimistic update
    // and the "Updated successfully" toast before the PUT, and silently
    // swallowed every backend error — that's why edits looked like they
    // saved but then reverted on the next 30 s poll (the polled response
    // still carried the OLD value because the write actually failed).
    let res;
    try {
      res = await fetch(`${API}/employees/${employee.id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName,
          email:          emailClean,
          designation:    editForm.role,
          department:     editForm.dept,
          assignedTo:     editForm.manager,
          status:         editForm.status,
          // Extended onboarding fields — sent through so the doc in
          // Mongo carries everything HR sees + edits on this page.
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
      if (data?.code === 'READ_ONLY') {
        showNotification('You are signed in as a view-only user. Only HR admins can edit employees.', 'error');
      } else if (res.status === 400 && /duplicate/i.test(data?.message || '')) {
        showNotification('Could not save: that email is already used by another employee.', 'error');
      } else {
        showNotification(data?.message || `Save failed (HTTP ${res.status})`, 'error');
      }
      return;
    }

    const updatedEmp = {
      ...employee,
      ...editForm,
      email: emailClean,
      initials: editForm.name.split(' ').map(n => n[0]).join('').toUpperCase(),
    };
    setEmployees(prev => prev.map(emp => emp.id === employee.id ? updatedEmp : emp));
    setSelectedEmployee(updatedEmp);
    showNotification("Employee profile updated. Changes are live in the DB.", "success");
    setEditingEmp(null);
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
              This month — policy: 1 CL + 2 perms (2 hrs each); 3 lates = 1/2 LOP, 6 = 1 LOP
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
                <div style={{ fontSize: '18px', fontWeight: 800, color: productivity.lateCount > 0 ? '#ECC94B' : '#4299E1' }}>{productivity.lateCount}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-light)', fontWeight: 700, textTransform: 'uppercase' }}>Late</div>
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

          {/* Assigned Assets — read-only mirror of what the Assets page
              shows for this employee. Hidden when the employee has no
              assets so the sidebar doesn't waste vertical space. */}
          {assets.length > 0 && (
            <div className="card" style={{ padding: '24px' }}>
              <h3 className="p-card-title" style={{ marginBottom: '6px', fontSize: '16px' }}>Assigned Assets</h3>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '14px' }}>
                {assets.length} {assets.length === 1 ? 'item' : 'items'} issued by HR
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {assets.map((a) => {
                  const t = String(a.type || '').toLowerCase();
                  const Icon =
                    t.includes('laptop')          ? Laptop     :
                    t.includes('monitor')         ? Monitor    :
                    t.includes('mouse')           ? Mouse      :
                    t.includes('keyboard')        ? Keyboard   :
                    t.includes('id')              ? CreditCard :
                    t.includes('pc')              ? Cpu        :
                    (t.includes('mobile') || t.includes('phone')) ? Smartphone :
                    Package;
                  const tc =
                    t.includes('laptop')          ? { bg: '#EBF4FD', color: '#4299E1' } :
                    t.includes('monitor')         ? { bg: '#EDE9FE', color: '#9F7AEA' } :
                    t.includes('mouse')           ? { bg: '#FEF3C7', color: '#D97706' } :
                    t.includes('keyboard')        ? { bg: '#FCE7F3', color: '#ED64A6' } :
                    t.includes('id')              ? { bg: '#F1F9EE', color: '#4CAA17' } :
                    t.includes('pc')              ? { bg: '#E0F2FE', color: '#0284C7' } :
                    (t.includes('mobile') || t.includes('phone')) ? { bg: '#E6FFFA', color: '#319795' } :
                    { bg: '#F1F5F9', color: '#64748B' };
                  // ID Card display name override — legacy rows may carry
                  // a brand name like "DELL" even though the type is ID
                  // Card; show "ID Card" instead.
                  const name = /id ?card/i.test(a.type || '') ? 'ID Card' : (a.assetName || a.type || '—');
                  return (
                    <div
                      key={a._id || a.assetId || a.serialNo}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 12px', borderRadius: 10,
                        background: 'var(--bg-main)',
                      }}
                    >
                      <div style={{
                        width: 34, height: 34, borderRadius: 8,
                        background: tc.bg, color: tc.color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <Icon size={18} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {name}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-light)', fontFamily: 'monospace' }}>
                          {a.serialNo || a.assetId || '—'}
                        </div>
                      </div>
                      <span style={{
                        fontSize: 10, fontWeight: 800,
                        padding: '3px 8px', borderRadius: 6,
                        background:
                          a.status === 'Available' ? '#F1F9EE' :
                          a.status === 'Under Repair' ? '#FFF5F5' : '#EBF4FD',
                        color:
                          a.status === 'Available' ? '#4CAA17' :
                          a.status === 'Under Repair' ? '#FC8181' : '#4299E1',
                        textTransform: 'uppercase', letterSpacing: 0.4, whiteSpace: 'nowrap',
                      }}>
                        {a.status || 'Assigned'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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
                type="button"
                className="ne-btn-secondary"
                style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                onClick={() => onBack && onBack()}
              >
                Back
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
