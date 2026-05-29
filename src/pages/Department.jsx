import React, { useState, useEffect } from 'react';
import { 
  Search, ChevronRight, Hash, Zap, TrendingUp, 
  Settings, Users, Plus, MoreVertical, X, Check
} from 'lucide-react';
import { useNotification } from '../context/NotificationContext';

import { API } from '../config/api';
const COLORS = ['#4299E1','#9F7AEA','#4CAA17','#ECC94B','#F687B3','#ED8936','#38B2AC','#FC8181'];

// Map index to icon name string — render icon in JSX using this
const ICON_NAMES = ['Hash','Zap','TrendingUp','Settings','Users'];

// Hardcoded mock removed — list comes from /api/departments only.
const MOCK_DEPTS = [];

function DeptIcon({ idx }) {
  const icons = [<Hash size={18}/>, <Zap size={18}/>, <TrendingUp size={18}/>, <Settings size={18}/>, <Users size={18}/>];
  return icons[idx % icons.length];
}

function mapApiDept(d, i) {
  return {
    id:              d._id,
    name:            d.name,
    count:           d.employeeCount || 0,
    manager:         d.manager || '',
    managerInitials: (d.manager || 'NA').split(' ').map(n => n[0]).join('').toUpperCase(),
    color:           COLORS[i % COLORS.length],
    iconIdx:         i % 5,
    status:          d.status || 'Active',
  };
}

export default function Department({ onBack }) {
  const { showNotification, confirmDialog } = useNotification();
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [departments, setDepartments] = useState(MOCK_DEPTS);
  const [newDept, setNewDept] = useState({ name: '', manager: '' });
  const [editTarget, setEditTarget] = useState(null);
  const [openMenu, setOpenMenu]     = useState(null);  // id whose 3-dot menu is open

  // Silently load from API on mount
  useEffect(() => {
    fetch(`${API}/departments`)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.data && data.data.length > 0) {
          setDepartments(data.data.map(mapApiDept));
        }
      })
      .catch(() => {});
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newDept.name.trim()) return;
    const tempEntry = {
      id: Date.now().toString(),
      name: newDept.name,
      manager: newDept.manager,
      count: 0,
      managerInitials: (newDept.manager || 'NA').split(' ').map(n => n[0]).join('').toUpperCase(),
      color: COLORS[departments.length % COLORS.length],
      iconIdx: departments.length % 5,
      status: 'Active',
    };
    setDepartments(prev => [...prev, tempEntry]);
    showNotification(`Department "${newDept.name}" created!`, 'success');
    setShowAddModal(false);
    setNewDept({ name: '', manager: '' });
    // Persist to API silently then re-sync
    try {
      await fetch(`${API}/departments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newDept.name.trim(), manager: newDept.manager }),
      });
      const res = await fetch(`${API}/departments`);
      const data = await res.json();
      if (data.success && data.data && data.data.length > 0) {
        setDepartments(data.data.map(mapApiDept));
      }
    } catch { /* silent */ }
  };

  const refresh = async () => {
    try {
      const res  = await fetch(`${API}/departments`);
      const data = await res.json();
      if (data.success) setDepartments((data.data || []).map(mapApiDept));
    } catch { /* silent */ }
  };

  const handleEdit = (d) => { setOpenMenu(null); setEditTarget({ ...d }); };

  const [savingEdit, setSavingEdit] = useState(false);
  const handleSaveEdit = async (e) => {
    e?.preventDefault?.();
    const name = String(editTarget?.name || '').trim();
    const manager = String(editTarget?.manager || '').trim();
    if (!name) {
      showNotification('Department name is required.', 'error');
      return;
    }
    if (!editTarget?.id) {
      showNotification('Cannot identify which department to update.', 'error');
      return;
    }
    setSavingEdit(true);
    try {
      const res = await fetch(`${API}/departments/${editTarget.id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name, manager }),
      });
      let data = {};
      try { data = await res.json(); } catch { /* non-JSON */ }

      // Surface the real failure mode rather than a generic "Could not update".
      if (!res.ok) {
        if (data?.code === 'READ_ONLY') {
          showNotification('You are signed in as a view-only user. Only HR admins can edit departments.', 'error');
        } else {
          showNotification(data?.message || `Save failed (HTTP ${res.status})`, 'error');
        }
        return;
      }
      if (!data?.success) {
        showNotification(data?.message || 'Department update did not succeed.', 'error');
        return;
      }

      // Apply the server response optimistically so the row reflects the
      // edit even before the /departments refetch completes.
      const fresh = data.data;
      if (fresh && fresh._id) {
        setDepartments(prev => prev.map(d => d.id === editTarget.id
          ? { ...d, name: fresh.name, manager: fresh.manager,
              managerInitials: (fresh.manager || 'NA').split(' ').map(n => n[0]).join('').toUpperCase() }
          : d));
      }
      showNotification(`Updated "${name}"`, 'success');
      setEditTarget(null);
      refresh();
    } catch (err) {
      showNotification('Network error: ' + (err?.message || 'unknown'), 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (d) => {
    setOpenMenu(null);
    if (!(await confirmDialog({ title: "Confirm", message: `Delete department "${d.name}"?`, confirmText: "Delete", tone: "danger" }))) return;
    try {
      const res = await fetch(`${API}/departments/${d.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        showNotification(data?.message || 'Could not delete department', 'error');
        return;
      }
      showNotification(`Deleted "${d.name}"`, 'success');
      setDepartments(prev => prev.filter(x => x.id !== d.id));
    } catch (err) {
      showNotification('Network error: ' + err.message, 'error');
    }
  };

  const filteredDepts = departments.filter(dept =>
    dept.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (dept.manager || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="emp-list-page">
      <div className="emp-list-header">
        <div className="ne-breadcrumb">
          <span className="ne-breadcrumb-link" onClick={onBack}>Dashboard</span>
          <ChevronRight size={13} />
          <span>Departments</span>
        </div>
        <div className="emp-list-title-row">
          <div>
            <h1 className="ne-page-title">Department Directory</h1>
            <p className="ne-page-sub">Manage and view all organizational departments.</p>
          </div>
          <div className="emp-list-actions">
            <div className="dept-search" style={{ maxWidth: '300px' }}>
              <Search size={18} />
              <input
                type="text"
                placeholder="Search departments..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <button className="ne-btn-primary" onClick={() => setShowAddModal(true)}>
              <Plus size={16} /> Add Dept
            </button>
          </div>
        </div>
      </div>

      <div className="emp-table-card">
        <table className="emp-table">
          <thead>
            <tr>
              <th>Department</th>
              <th>Dept. Manager</th>
              <th>Headcount</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredDepts.map((dept, idx) => (
              <tr key={dept.id}>
                <td>
                  <div className="emp-table-user">
                    <div className="emp-table-avatar" style={{ background: dept.color + '20', color: dept.color }}>
                      <DeptIcon idx={dept.iconIdx} />
                    </div>
                    <div>
                      <div className="emp-table-name">{dept.name} Team</div>
                      {/* Team ID is a clean sequential code (TES-TEAM-01,
                          02, …) keyed on the row's position in the
                          alphabetically-sorted dept list. Replaces the
                          old `DEPT-<first-6-of-ObjectId>` which leaked
                          raw Mongo hex into the UI. */}
                      <div className="emp-table-id">
                        TES-TEAM-{String(idx + 1).padStart(2, '0')}
                      </div>
                    </div>
                  </div>
                </td>
                <td>
                  <div className="emp-table-user">
                    <div className="emp-table-avatar" style={{ width: '28px', height: '28px', fontSize: '10px', background: '#f1f5f9', color: '#64748b' }}>{dept.managerInitials}</div>
                    <div className="emp-table-name" style={{ fontSize: '13px' }}>{dept.manager}</div>
                  </div>
                </td>
                <td><div className="emp-table-dept" style={{ color: 'var(--text-main)', fontWeight: '600' }}>{dept.count} Staff</div></td>
                <td><span className="dash-emp-status active">{dept.status}</span></td>
                <td style={{ position: 'relative' }}>
                  <button
                    className="emp-table-btn"
                    onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === dept.id ? null : dept.id); }}
                  >
                    <MoreVertical size={16} />
                  </button>
                  {openMenu === dept.id && (
                    <div
                      onMouseLeave={() => setOpenMenu(null)}
                      style={{
                        position: 'absolute', right: '20px', top: '40px', zIndex: 30,
                        background: '#fff', border: '1px solid var(--border-color)',
                        borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                        minWidth: '140px', padding: '4px 0',
                      }}
                    >
                      <button
                        onClick={() => handleEdit(dept)}
                        style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--text-main)' }}
                      >Edit</button>
                      <button
                        onClick={() => handleDelete(dept)}
                        style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#FC8181' }}
                      >Delete</button>
                    </div>
                  )}
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
              <h2 className="modal-title">Edit Department</h2>
              <button className="modal-close-btn" onClick={() => setEditTarget(null)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', height: 'calc(100% - 73px)' }}>
              <div className="drawer-body">
                <div className="ne-field">
                  <label className="ne-label">Department Name <span style={{ color: 'red' }}>*</span></label>
                  <input
                    className="ne-input"
                    value={editTarget.name}
                    onChange={e => setEditTarget({ ...editTarget, name: e.target.value })}
                    required
                  />
                </div>
                <div className="ne-field" style={{ marginTop: '16px' }}>
                  <label className="ne-label">Department Manager</label>
                  <input
                    className="ne-input"
                    value={editTarget.manager || ''}
                    onChange={e => setEditTarget({ ...editTarget, manager: e.target.value })}
                  />
                </div>
              </div>
              <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" className="ne-btn-secondary" onClick={() => setEditTarget(null)}>Cancel</button>
                <button type="submit" className="ne-btn-primary" disabled={savingEdit}>
                  <Check size={16} /> {savingEdit ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="drawer-overlay" onClick={() => setShowAddModal(false)}>
          <div className="drawer-card" onClick={e => e.stopPropagation()}>
            <div className="drawer-header">
              <h2 className="modal-title">Create New Department</h2>
              <button className="modal-close-btn" onClick={() => setShowAddModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', height: 'calc(100% - 73px)' }}>
              <div className="drawer-body">
                <div className="ne-field">
                  <label className="ne-label">Department Name <span style={{color:'red'}}>*</span></label>
                  <input
                    className="ne-input"
                    placeholder="e.g. Marketing"
                    value={newDept.name}
                    onChange={e => setNewDept({ ...newDept, name: e.target.value })}
                    required
                  />
                </div>
                <div className="ne-field" style={{ marginTop: '16px' }}>
                  <label className="ne-label">Department Manager</label>
                  <input
                    className="ne-input"
                    placeholder="e.g. John Doe"
                    value={newDept.manager}
                    onChange={e => setNewDept({ ...newDept, manager: e.target.value })}
                  />
                </div>
              </div>
              <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" className="ne-btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="ne-btn-primary"><Check size={16} /> Create Department</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
