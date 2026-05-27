import React, { useState, useEffect } from 'react';
import { 
  Zap, Users, UserCheck, User, LayoutDashboard, DollarSign, 
  CalendarCheck, TrendingUp, Settings, ChevronRight, Plus, Check, X, Shield, Activity 
} from 'lucide-react';
import { useNotification } from '../context/NotificationContext';

import { API } from '../config/api';

const ROLE_ICONS_FN = [
  <Zap size={18}/>, <UserCheck size={18}/>, <User size={18}/>, <Shield size={18}/>, <Users size={18}/>
];

export default function RolePermissions({ onBack }) {
  const { showNotification, confirmDialog } = useNotification();
  const [selectedRole, setSelectedRole] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newRole, setNewRole] = useState({ name: '', description: '', color: '#4CAA17' });

  // Roles start empty — the /api/access-management call below populates
  // them. The backend auto-seeds HR/Manager/Employee on first request and
  // returns live member counts derived from the real employees list.
  const [roles, setRoles] = useState([]);

  const dashboardModules = [
    { id: 'dashboard',    name: 'Dashboard & Analytics', icon: <LayoutDashboard size={18} /> },
    { id: 'employees',    name: 'Employee Directory',    icon: <Users size={18} /> },
    { id: 'payroll',      name: 'Payroll & Finance',     icon: <DollarSign size={18} /> },
    { id: 'attendance',   name: 'Attendance & Leave',    icon: <CalendarCheck size={18} /> },
    { id: 'performance',  name: 'Performance Metrics',   icon: <TrendingUp size={18} /> },
    { id: 'settings',     name: 'System Settings',       icon: <Settings size={18} /> },
    { id: 'live_tracking',name: 'Live Tracking',         icon: <Activity size={18} /> },
  ];

  // Permission matrix gets populated per-role-id by the API loader below.
  const [permissions, setPermissions] = useState({});
  // Snapshot of what's on the server, used for Discard + dirty-checking.
  const [serverPermissions, setServerPermissions] = useState({});
  const [saving, setSaving] = useState(false);

  // Build a fresh "all false" permission map for one role.
  const emptyPermMap = () => Object.fromEntries(
    dashboardModules.map(m => [m.id, { view: false, create: false, edit: false, delete: false }])
  );
  // Merge whatever shape the API returned into our canonical { module: { view, create, edit, delete } }
  // shape. The Mongo schema stores exactly this shape, but old rows may be
  // missing a module key entirely.
  const normalisePerms = (apiPerms) => {
    const base = emptyPermMap();
    if (apiPerms && typeof apiPerms === 'object') {
      for (const m of dashboardModules) {
        const fromApi = apiPerms[m.id] || {};
        base[m.id] = {
          view:   !!fromApi.view,
          create: !!fromApi.create,
          edit:   !!fromApi.edit,
          delete: !!fromApi.delete,
        };
      }
    }
    return base;
  };

  // Load all roles from API on mount (and every 30s) — the backend
  // auto-seeds HR/Manager/Employee and returns live member counts.
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch(`${API}/access-management`)
        .then(r => r.json())
        .then(data => {
          if (cancelled || !data.success || !Array.isArray(data.data)) return;
          const apiRoles = data.data.map((r, i) => ({
            id:      r._id,
            name:    r.name,
            icon:    ROLE_ICONS_FN[i % ROLE_ICONS_FN.length],
            color:   r.color || '#4CAA17',
            members: r.members || 0,
          }));
          setRoles(apiRoles);

          // Build the canonical permission map from the API's actual rows.
          const freshPerms = {};
          data.data.forEach(r => {
            freshPerms[r._id] = normalisePerms(r.permissions);
          });
          setServerPermissions(freshPerms);
          // Only overwrite local `permissions` for roles that are NOT
          // currently being edited (i.e. roles whose local map still
          // matches the previous server state). This way a 30s tick
          // doesn't blow away unsaved checkbox edits.
          setPermissions(prev => {
            const next = { ...prev };
            apiRoles.forEach(r => {
              const dirty = JSON.stringify(prev[r.id]) !== JSON.stringify(serverPermissions[r.id]);
              if (!prev[r.id] || !dirty) {
                next[r.id] = freshPerms[r.id];
              }
            });
            return next;
          });
          // Auto-select first role if nothing is selected yet OR if the
          // previously-selected role no longer exists (was deleted).
          setSelectedRole(prev => {
            if (apiRoles.length === 0) return '';
            if (prev && apiRoles.find(r => r.id === prev)) return prev;
            return apiRoles[0].id;
          });
        })
        .catch(() => {});
    };
    load();
    const tick = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(tick); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleAction = (roleId, modId, action) => {
    if (!roleId) return;
    setPermissions(prev => ({
      ...prev,
      [roleId]: {
        ...(prev[roleId] || emptyPermMap()),
        [modId]: {
          ...(prev[roleId]?.[modId] || { view: false, create: false, edit: false, delete: false }),
          [action]: !(prev[roleId]?.[modId]?.[action]),
        },
      },
    }));
  };

  // PUT the current permission matrix back to the API for the active role.
  const handleSavePermissions = async () => {
    if (!selectedRole) {
      showNotification('Pick a role first.', 'error');
      return;
    }
    const matrix = permissions[selectedRole];
    if (!matrix) {
      showNotification('Nothing to save for this role yet.', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API}/access-management/${selectedRole}/permissions`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ permissions: matrix }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        showNotification(data?.message || 'Could not save permissions', 'error');
        return;
      }
      // Update the snapshot so the next 30s tick doesn't fight us.
      setServerPermissions(prev => ({ ...prev, [selectedRole]: matrix }));
      showNotification(`${activeRole?.name || 'Role'} permissions saved.`, 'success');
    } catch (err) {
      showNotification('Network error: ' + (err?.message || 'unknown'), 'error');
    } finally {
      setSaving(false);
    }
  };

  // Revert local edits to whatever the server last returned.
  const handleDiscard = () => {
    if (!selectedRole) return;
    const snap = serverPermissions[selectedRole];
    if (snap) {
      setPermissions(prev => ({ ...prev, [selectedRole]: snap }));
      showNotification('Discarded unsaved changes.', 'info');
    }
  };

  // Soft-delete a role.
  const handleDeleteRole = async (role) => {
    if (!role?.id) return;
    if (!(await confirmDialog({ title: "Confirm", message: `Delete role "${role.name}"?`, confirmText: "Delete", tone: "danger" }))) return;
    try {
      const res = await fetch(`${API}/access-management/${role.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        showNotification(data?.message || 'Could not delete role', 'error');
        return;
      }
      setRoles(prev => prev.filter(r => r.id !== role.id));
      showNotification(`Role "${role.name}" deleted.`, 'success');
    } catch (err) {
      showNotification('Network error: ' + (err?.message || 'unknown'), 'error');
    }
  };

  const handleCreateRole = async (e) => {
    e.preventDefault();
    if (!newRole.name.trim()) return;
    const tempId = Date.now().toString();
    const tempRole = {
      id:      tempId,
      name:    newRole.name,
      icon:    ROLE_ICONS_FN[roles.length % ROLE_ICONS_FN.length],
      color:   newRole.color,
      members: 0,
    };
    setRoles(prev => [...prev, tempRole]);
    setPermissions(prev => ({
      ...prev,
      [tempId]: Object.fromEntries(dashboardModules.map(m => [m.id, { view: false, create: false, edit: false, delete: false }])),
    }));
    showNotification(`Role "${newRole.name}" created successfully!`, 'success');
    setIsModalOpen(false);
    setNewRole({ name: '', description: '', color: '#4CAA17' });
    try {
      await fetch(`${API}/access-management`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: newRole.name.trim(), description: newRole.description, color: newRole.color }),
      });
    } catch { /* silent */ }
  };

  // Loose fallback so we never crash on the first render (before API loads)
  // or when the selected role's id is stale.
  const activeRole = roles.find(r => r.id === selectedRole)
    || roles[0]
    || { id: '', name: '—', color: '#cbd5e1', icon: null, members: 0 };

  return (
    <div className="dash-roles-page">
      <div className="dash-roles-header">
        <div className="ne-breadcrumb">
          <span className="ne-breadcrumb-link" onClick={onBack}>Dashboard</span>
          <ChevronRight size={13} />
          <span>Role & Permissions</span>
        </div>
        <div className="dash-roles-title-row">
          <div>
            <h1 className="ne-page-title">Role Management</h1>
            <p className="ne-page-sub">Configure access levels for each organizational role.</p>
          </div>
          <button className="ne-btn-primary" onClick={() => setIsModalOpen(true)}>
            <Plus size={16} /> Create New Role
          </button>
        </div>
      </div>

      <div className="dash-roles-layout">
        <aside className="dash-roles-list-card">
          <div className="role-list-header">Roles</div>
          <div className="role-list-scroll">
            {roles.map(role => (
              <div
                key={role.id}
                className={`role-list-item ${selectedRole === role.id ? 'active' : ''}`}
                onClick={() => setSelectedRole(role.id)}
              >
                <div className="role-item-icon-wrap" style={{ background: role.color + '20', color: role.color }}>
                  {role.icon}
                </div>
                <div className="role-item-body">
                  <div className="role-item-name">{role.name}</div>
                  <div className="role-item-count">{role.members} Users</div>
                </div>
                {selectedRole === role.id && <ChevronRight size={16} className="role-active-arrow" />}
              </div>
            ))}
          </div>
        </aside>

        <main className="dash-permissions-card">
          <div className="perm-card-header">
            <div className="perm-active-role">
              <span className="role-dot-lg" style={{ background: activeRole.color }} />
              <div>
                <h3 className="perm-role-name">{activeRole.name} Permissions</h3>
                <p className="perm-role-sub">Access level for {activeRole.name.toLowerCase()} users.</p>
              </div>
            </div>
            <div className="perm-card-actions">
              <button
                className="ne-btn-secondary"
                onClick={handleDiscard}
                disabled={saving}
              >
                Discard
              </button>
              <button
                className="ne-btn-primary"
                onClick={handleSavePermissions}
                disabled={saving || !selectedRole}
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>

          <div className="perm-matrix-wrap">
            <table className="dash-perm-table">
              <thead>
                <tr>
                  <th>Module / Feature</th>
                  <th>View</th>
                  <th>Create</th>
                  <th>Edit</th>
                  <th>Delete</th>
                </tr>
              </thead>
              <tbody>
                {dashboardModules.map(mod => (
                  <tr key={mod.id}>
                    <td>
                      <div className="mod-cell">
                        <div className="mod-icon-mini">{mod.icon}</div>
                        <span className="mod-name-text">{mod.name}</span>
                      </div>
                    </td>
                    {['view', 'create', 'edit', 'delete'].map(action => (
                      <td key={action}>
                        <div
                          className={`perm-check ${permissions[selectedRole]?.[mod.id]?.[action] ? 'checked' : ''}`}
                          onClick={() => toggleAction(selectedRole, mod.id, action)}
                        >
                          {permissions[selectedRole]?.[mod.id]?.[action] && <Check size={14} />}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>

      {isModalOpen && (
        <div className="drawer-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="drawer-card" onClick={e => e.stopPropagation()}>
            <div className="drawer-header">
              <h2 className="modal-title">Create New Role</h2>
              <button className="modal-close-btn" onClick={() => setIsModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateRole} style={{ display: 'flex', flexDirection: 'column', height: 'calc(100% - 73px)' }}>
              <div className="drawer-body">
                <div style={{ marginBottom: '32px' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '8px', color: 'var(--text-main)' }}>Role Details</h4>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>Define the identity and primary function of this new access level.</p>
                  <div className="ne-field" style={{ marginBottom: '24px' }}>
                    <label className="ne-label">Role Name</label>
                    <input
                      type="text" className="ne-input" placeholder="e.g. Finance Admin"
                      value={newRole.name} onChange={e => setNewRole({...newRole, name: e.target.value})}
                      required
                    />
                  </div>
                  <div className="ne-field">
                    <label className="ne-label">Description</label>
                    <textarea
                      className="ne-input"
                      rows={3}
                      placeholder="What can users with this role do?"
                      value={newRole.description}
                      onChange={e => setNewRole({ ...newRole, description: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" className="ne-btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="ne-btn-primary"><Check size={16} /> Create Role</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
