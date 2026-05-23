import React, { useState, useMemo } from 'react';
import { 
  ChevronRight, Mail, Phone, MapPin, Calendar, 
  Briefcase, DollarSign, Clock, Shield, Star, 
  FileText, Download, Edit2, ArrowLeft, X, Upload
} from 'lucide-react';
import { useNotification } from '../context/NotificationContext';

const API = 'http://localhost:8001/api';

export default function EmployeeDetails({ employee, employees, setEmployees, setSelectedEmployee, onBack }) {
  const { showNotification } = useNotification();
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
            <button className="ne-btn-primary"><Download size={16} /> Export CV</button>
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
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>+1 (555) 098-7654</span>
                </div>
              </div>
              <div className="p-contact-item">
                <div className="p-contact-icon" style={{ background: 'var(--bg-main)', padding: '8px', borderRadius: '6px' }}><MapPin size={16} color="var(--primary)" /></div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-light)', fontWeight: 700 }}>LOCATION</label>
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>London, United Kingdom</span>
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: '24px' }}>
            <h3 className="p-card-title" style={{ marginBottom: '20px', fontSize: '16px' }}>Productivity</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              <div style={{ textAlign: 'center', padding: '12px 8px', background: 'var(--bg-main)', borderRadius: '12px' }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#48BB78' }}>2.5</div>
                <div style={{ fontSize: '10px', color: 'var(--text-light)', fontWeight: 700, textTransform: 'uppercase' }}>CL</div>
              </div>
              <div style={{ textAlign: 'center', padding: '12px 8px', background: 'var(--bg-main)', borderRadius: '12px' }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#9F7AEA' }}>4.0h</div>
                <div style={{ fontSize: '10px', color: 'var(--text-light)', fontWeight: 700, textTransform: 'uppercase' }}>Perm</div>
              </div>
              <div style={{ textAlign: 'center', padding: '12px 8px', background: 'var(--bg-main)', borderRadius: '12px' }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#4299E1' }}>0</div>
                <div style={{ fontSize: '10px', color: 'var(--text-light)', fontWeight: 700, textTransform: 'uppercase' }}>Comp</div>
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
                <div className="reminder-item" style={{ padding: '0 0 12px 0', borderBottom: '1px solid var(--border-color)', marginBottom: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <div className="reminder-text">Summer Vacation</div>
                    <div className="reminder-due">June 15 - June 20 (5 Days)</div>
                  </div>
                  <span className="dash-emp-status approved">Approved</span>
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 className="p-card-title" style={{ margin: 0, fontSize: '16px' }}>Recent Documents</h3>
              <button className="ne-btn-secondary" style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }} onClick={() => showNotification('Upload dialog would open here', 'info')}>
                <Upload size={14} /> Upload Document
              </button>
            </div>
            <div className="p-activity-list">
              {[
                { name: 'Offer Letter.pdf', size: '2.4 MB', date: 'Jan 05, 2023' },
                { name: 'Performance Review Q1.pdf', size: '1.2 MB', date: 'Mar 31, 2024' },
              ].map((doc, i) => (
                <div key={i} className="p-contact-item" style={{ marginBottom: '12px', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <FileText size={18} color="var(--primary)" />
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600 }}>{doc.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-light)' }}>{doc.size} • Uploaded on {doc.date}</div>
                    </div>
                  </div>
                  <button className="emp-table-btn"><Download size={14} /></button>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>

      {/* Right Side Edit Profile Panel Drawer */}
      {editingEmp && (
        <>
          <div className="edit-panel-overlay" onClick={() => setEditingEmp(null)} />
          <div className="edit-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="emp-table-avatar" style={{ background: employee.color + '20', color: employee.color, width: '40px', height: '40px', fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>{employee.initials}</div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-main)' }}>Edit Profile</h3>
                  <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-light)', fontWeight: 600 }}>{employee.employeeId || `EMP-10${employee.id}`}</p>
                </div>
              </div>
              <button
                onClick={() => setEditingEmp(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '50%', display: 'flex', alignItems: 'center', color: 'var(--text-light)' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-main)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', height: 'calc(100% - 81px)' }}>
              <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                <div className="edit-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Full Name</label>
                  <input type="text" value={editForm.name} onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))} className="filter-input-small" style={{ width: '100%', padding: '10px 12px', fontSize: '13px' }} required />
                </div>

                <div className="edit-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Email Address</label>
                  <input type="email" value={editForm.email} onChange={e => setEditForm(prev => ({ ...prev, email: e.target.value }))} className="filter-input-small" style={{ width: '100%', padding: '10px 12px', fontSize: '13px' }} required />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="edit-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Department</label>
                    <select value={editForm.dept} onChange={e => setEditForm(prev => ({ ...prev, dept: e.target.value }))} className="filter-select" style={{ width: '100%', padding: '10px 12px', fontSize: '13px', height: '40px' }}>
                      {departments.map(dept => <option key={dept} value={dept}>{dept}</option>)}
                    </select>
                  </div>
                  <div className="edit-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Designation</label>
                    <select value={editForm.role} onChange={e => setEditForm(prev => ({ ...prev, role: e.target.value }))} className="filter-select" style={{ width: '100%', padding: '10px 12px', fontSize: '13px', height: '40px' }}>
                      {roles.map(role => <option key={role} value={role}>{role}</option>)}
                    </select>
                  </div>
                </div>

                <div className="edit-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Assigned Manager</label>
                  <select value={editForm.manager} onChange={e => setEditForm(prev => ({ ...prev, manager: e.target.value }))} className="filter-select" style={{ width: '100%', padding: '10px 12px', fontSize: '13px', height: '40px' }}>
                    <option value="">No Manager / Self</option>
                    <option value="Alex Morrison">Alex Morrison (HR Manager)</option>
                    {candidateManagers.filter(n => n !== 'Alex Morrison').map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="edit-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Salary ($ / mo)</label>
                    <input type="number" value={editForm.salary} onChange={e => setEditForm(prev => ({ ...prev, salary: parseFloat(e.target.value) || '' }))} className="filter-input-small" style={{ width: '100%', padding: '10px 12px', fontSize: '13px' }} />
                  </div>
                  <div className="edit-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Joining Date</label>
                    <input type="date" value={editForm.joiningDate} onChange={e => setEditForm(prev => ({ ...prev, joiningDate: e.target.value }))} className="filter-input-small" style={{ width: '100%', padding: '10px 12px', fontSize: '13px', height: '40px' }} />
                  </div>
                </div>

                <div className="edit-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</label>
                  <select value={editForm.status} onChange={e => setEditForm(prev => ({ ...prev, status: e.target.value }))} className="filter-select" style={{ width: '100%', padding: '10px 12px', fontSize: '13px', height: '40px' }}>
                    <option value="Active">Active</option>
                    <option value="On Leave">On Leave</option>
                    <option value="Suspended">Suspended</option>
                    <option value="Terminated">Terminated</option>
                  </select>
                </div>

              </div>

              <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: '#fafafa' }}>
                <button type="button" onClick={() => setEditingEmp(null)} className="ne-btn-secondary" style={{ padding: '8px 16px', fontSize: '13px' }}>Cancel</button>
                <button type="submit" className="ne-btn-primary" style={{ padding: '8px 20px', fontSize: '13px', background: 'var(--primary)', color: 'white', border: '1px solid var(--primary-dark)' }}>Save Changes</button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
