import React, { useState, useEffect } from 'react';
import { 
  Search, ChevronRight, Zap, Eye, Briefcase, 
  BarChart2, Users, Plus, X, Check, Edit2, Trash2
} from 'lucide-react';
import { useNotification } from '../context/NotificationContext';

import { API } from '../config/api';
const COLORS = ['#4299E1','#9F7AEA','#4CAA17','#ECC94B','#F687B3','#ED8936','#38B2AC','#FC8181'];

// Hardcoded mock removed — list now comes from /api/designations only.
const MOCK_DESGS = [];

function DesgIcon({ idx }) {
  const icons = [<Zap size={18}/>, <Eye size={18}/>, <Briefcase size={18}/>, <BarChart2 size={18}/>, <Users size={18}/>];
  return icons[idx % icons.length];
}

function mapApiDesg(d, i) {
  const min = d.minSalary || '';
  const max = d.maxSalary || '';
  return {
    id:          d._id,
    title:       d.title,
    dept:        d.dept || d.department || '',
    count:       d.employeeCount || 0,
    salaryRange: d.salaryRange || (min && max ? `$${min}k - $${max}k` : ''),
    iconIdx:     i % 5,
    color:       COLORS[i % COLORS.length],
  };
}

export default function Designation({ onBack }) {
  const { showNotification, confirmDialog } = useNotification();
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal]     = useState(false);
  const [designations, setDesignations] = useState(MOCK_DESGS);
  const [newRole, setNewRole] = useState({ title: '', dept: 'Engineering', minSalary: '', maxSalary: '' });
  const [editTarget, setEditTarget] = useState(null);  // current designation being edited

  // Silently load from API on mount
  useEffect(() => {
    fetch(`${API}/designations`)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.data && data.data.length > 0) {
          setDesignations(data.data.map(mapApiDesg));
        }
      })
      .catch(() => {});
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newRole.title.trim()) return;
    const tempEntry = {
      id:          Date.now(),
      title:       newRole.title,
      dept:        newRole.dept,
      count:       0,
      salaryRange: newRole.minSalary && newRole.maxSalary ? `$${newRole.minSalary}k - $${newRole.maxSalary}k` : '',
      iconIdx:     designations.length % 5,
      color:       COLORS[designations.length % COLORS.length],
    };
    setDesignations(prev => [...prev, tempEntry]);
    showNotification(`Job role "${newRole.title}" added!`, 'success');
    setShowModal(false);
    setNewRole({ title: '', dept: 'Engineering', minSalary: '', maxSalary: '' });
    // Persist to API silently then re-sync
    try {
      await fetch(`${API}/designations`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ title: newRole.title.trim(), dept: newRole.dept, minSalary: newRole.minSalary, maxSalary: newRole.maxSalary }),
      });
      const res  = await fetch(`${API}/designations`);
      const data = await res.json();
      if (data.success && data.data && data.data.length > 0) {
        setDesignations(data.data.map(mapApiDesg));
      }
    } catch { /* silent */ }
  };

  const refresh = async () => {
    try {
      const res  = await fetch(`${API}/designations`);
      const data = await res.json();
      if (data.success) setDesignations((data.data || []).map(mapApiDesg));
    } catch { /* silent */ }
  };

  const handleEdit = (d) => setEditTarget({ ...d, minSalary: '', maxSalary: '' });

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editTarget?.title?.trim()) return;
    try {
      const res = await fetch(`${API}/designations/${editTarget.id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          title:     editTarget.title.trim(),
          dept:      editTarget.dept,
          minSalary: editTarget.minSalary || undefined,
          maxSalary: editTarget.maxSalary || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        showNotification(data?.message || 'Could not update designation', 'error');
        return;
      }
      showNotification(`Updated "${editTarget.title}"`, 'success');
      setEditTarget(null);
      refresh();
    } catch (err) {
      showNotification('Network error: ' + err.message, 'error');
    }
  };

  const handleDelete = async (d) => {
    if (!(await confirmDialog({ title: "Confirm", message: `Delete designation "${d.title}"?`, confirmText: "Delete", tone: "danger" }))) return;
    try {
      const res = await fetch(`${API}/designations/${d.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        showNotification(data?.message || 'Could not delete designation', 'error');
        return;
      }
      showNotification(`Deleted "${d.title}"`, 'success');
      setDesignations(prev => prev.filter(x => x.id !== d.id));
    } catch (err) {
      showNotification('Network error: ' + err.message, 'error');
    }
  };

  const filtered = designations.filter(d =>
    d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.dept.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="emp-list-page">
      <div className="emp-list-header">
        <div className="ne-breadcrumb">
          <span className="ne-breadcrumb-link" onClick={onBack}>Dashboard</span>
          <ChevronRight size={13} />
          <span>Designations</span>
        </div>
        <div className="emp-list-title-row">
          <div>
            <h1 className="ne-page-title">Job Designations</h1>
            <p className="ne-page-sub">Manage roles and job titles across departments.</p>
          </div>
          <div className="emp-list-actions">
            <div className="dept-search" style={{ maxWidth: '300px' }}>
              <Search size={18} />
              <input
                type="text"
                placeholder="Search designations..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <button className="ne-btn-primary" onClick={() => setShowModal(true)}>
              <Plus size={16} /> Add Role
            </button>
          </div>
        </div>
      </div>

      <div className="emp-table-card">
        <table className="emp-table">
          <thead>
            <tr>
              <th>Job Title</th>
              <th>Department</th>
              <th>Employees</th>
              <th>Salary Range</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(d => (
              <tr key={d.id}>
                <td>
                  <div className="emp-table-user">
                    <div className="emp-table-avatar" style={{ background: d.color + '20', color: d.color }}>
                      <DesgIcon idx={d.iconIdx} />
                    </div>
                    <div className="emp-table-name">{d.title}</div>
                  </div>
                </td>
                <td><div className="emp-table-dept">{d.dept}</div></td>
                <td><div className="emp-table-dept" style={{ color: 'var(--text-main)', fontWeight: '600' }}>{d.count} Staff</div></td>
                <td><div className="emp-table-email">{d.salaryRange}</div></td>
                <td>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="emp-table-btn" style={{ padding: '6px' }} onClick={() => handleEdit(d)}><Edit2 size={14} /></button>
                    <button className="emp-table-btn" style={{ padding: '6px', color: '#FC8181' }} onClick={() => handleDelete(d)}><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editTarget && (
        <div className="drawer-overlay" onClick={() => setEditTarget(null)}>
          <div className="drawer-card" onClick={e => e.stopPropagation()}>
            <div className="drawer-header">
              <h2 className="modal-title">Edit Designation</h2>
              <button className="modal-close-btn" onClick={() => setEditTarget(null)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', height: 'calc(100% - 73px)' }}>
              <div className="drawer-body">
                <div className="ne-field" style={{ marginBottom: '20px' }}>
                  <label className="ne-label">Job Title <span style={{ color: 'red' }}>*</span></label>
                  <input
                    className="ne-input"
                    value={editTarget.title}
                    onChange={e => setEditTarget({ ...editTarget, title: e.target.value })}
                    required
                  />
                </div>
                <div className="ne-field" style={{ marginBottom: '20px' }}>
                  <label className="ne-label">Department</label>
                  <input
                    className="ne-input"
                    value={editTarget.dept || ''}
                    onChange={e => setEditTarget({ ...editTarget, dept: e.target.value })}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="ne-field">
                    <label className="ne-label">Min Salary (k)</label>
                    <input className="ne-input" type="number" value={editTarget.minSalary || ''} onChange={e => setEditTarget({ ...editTarget, minSalary: e.target.value })} />
                  </div>
                  <div className="ne-field">
                    <label className="ne-label">Max Salary (k)</label>
                    <input className="ne-input" type="number" value={editTarget.maxSalary || ''} onChange={e => setEditTarget({ ...editTarget, maxSalary: e.target.value })} />
                  </div>
                </div>
              </div>
              <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" className="ne-btn-secondary" onClick={() => setEditTarget(null)}>Cancel</button>
                <button type="submit" className="ne-btn-primary"><Check size={16} /> Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showModal && (
        <div className="drawer-overlay" onClick={() => setShowModal(false)}>
          <div className="drawer-card" onClick={e => e.stopPropagation()}>
            <div className="drawer-header">
              <h2 className="modal-title">Add New Designation</h2>
              <button className="modal-close-btn" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', height: 'calc(100% - 73px)' }}>
              <div className="drawer-body">
                <div className="ne-field" style={{ marginBottom: '20px' }}>
                  <label className="ne-label">Job Title <span style={{ color: 'red' }}>*</span></label>
                  <input
                    className="ne-input"
                    placeholder="e.g. Senior Frontend Developer"
                    value={newRole.title}
                    onChange={e => setNewRole({ ...newRole, title: e.target.value })}
                    required
                  />
                </div>
                <div className="ne-field" style={{ marginBottom: '20px' }}>
                  <label className="ne-label">Department</label>
                  <select
                    className="ne-input"
                    value={newRole.dept}
                    onChange={e => setNewRole({ ...newRole, dept: e.target.value })}
                  >
                    <option>Engineering</option>
                    <option>Design</option>
                    <option>Sales</option>
                    <option>Operations</option>
                    <option>HR</option>
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="ne-field">
                    <label className="ne-label">Min Salary (k)</label>
                    <input
                      className="ne-input"
                      type="number"
                      placeholder="e.g. 60"
                      value={newRole.minSalary}
                      onChange={e => setNewRole({ ...newRole, minSalary: e.target.value })}
                    />
                  </div>
                  <div className="ne-field">
                    <label className="ne-label">Max Salary (k)</label>
                    <input
                      className="ne-input"
                      type="number"
                      placeholder="e.g. 100"
                      value={newRole.maxSalary}
                      onChange={e => setNewRole({ ...newRole, maxSalary: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" className="ne-btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="ne-btn-primary"><Check size={16} /> Add Designation</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
