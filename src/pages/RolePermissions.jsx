import React, { useState, useEffect } from 'react';
import { 
  Zap, Users, UserCheck, User, LayoutDashboard, DollarSign, 
  CalendarCheck, TrendingUp, Settings, ChevronRight, Plus, Check, X, Shield, Activity 
} from 'lucide-react';
import { useNotification } from '../context/NotificationContext';

const API = 'http://localhost:8001/api';

const ROLE_ICONS_FN = [
  <Zap size={18}/>, <UserCheck size={18}/>, <User size={18}/>, <Shield size={18}/>, <Users size={18}/>
];

export default function RolePermissions({ onBack }) {
  const { showNotification } = useNotification();
  const [selectedRole, setSelectedRole] = useState('hr_admin');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newRole, setNewRole] = useState({ name: '', description: '', color: '#4CAA17' });

  const [roles, setRoles] = useState([
    { id: 'hr_admin', name: 'HR Manager', icon: <Zap size={18} />,      color: '#4CAA17', members: 3 },
    { id: 'manager',  name: 'Manager',    icon: <UserCheck size={18} />, color: '#9F7AEA', members: 12 },
    { id: 'employee', name: 'Employee',   icon: <User size={18} />,      color: '#A0AEC0', members: 1261 },
  ]);

  const dashboardModules = [
    { id: 'dashboard',    name: 'Dashboard & Analytics', icon: <LayoutDashboard size={18} /> },
    { id: 'employees',    name: 'Employee Directory',    icon: <Users size={18} /> },
    { id: 'payroll',      name: 'Payroll & Finance',     icon: <DollarSign size={18} /> },
    { id: 'attendance',   name: 'Attendance & Leave',    icon: <CalendarCheck size={18} /> },
    { id: 'performance',  name: 'Performance Metrics',   icon: <TrendingUp size={18} /> },
    { id: 'settings',     name: 'System Settings',       icon: <Settings size={18} /> },
    { id: 'live_tracking',name: 'Live Tracking',         icon: <Activity size={18} /> },
  ];

  const [permissions, setPermissions] = useState({
    hr_admin: Object.fromEntries(dashboardModules.map(m => [m.id, { view: true,  create: true,             edit: true,  delete: true  }])),
    manager:  Object.fromEntries(dashboardModules.map(m => [m.id, { view: true,  create: m.id==='employees', edit: false, delete: false }])),
    employee: Object.fromEntries(dashboardModules.map(m => [m.id, { view: m.id==='dashboard', create: false, edit: false, delete: false }])),
  });

  // Silently load custom roles from API on mount
  useEffect(() => {
    fetch(`${API}/access-management`)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.data && data.data.length > 0) {
          const defaultIds = ['hr_admin', 'manager', 'employee'];
          const extras = data.data
            .filter(r => !defaultIds.includes(r._id))
            .map((r, i) => ({
              id:      r._id,
              name:    r.name,
              icon:    ROLE_ICONS_FN[(i + 3) % ROLE_ICONS_FN.length],
              color:   r.color || '#4CAA17',
              members: r.members || 0,
            }));
          if (extras.length > 0) {
            setRoles(prev => [...prev, ...extras]);
            const extraPerms = {};
            extras.forEach(r => {
              extraPerms[r.id] = Object.fromEntries(dashboardModules.map(m => [m.id, { view: false, create: false, edit: false, delete: false }]));
            });
            setPermissions(prev => ({ ...prev, ...extraPerms }));
          }
        }
      })
      .catch(() => {});
  }, []);

  const toggleAction = (roleId, modId, action) => {
    setPermissions(prev => ({
      ...prev,
      [roleId]: {
        ...prev[roleId],
        [modId]: { ...prev[roleId][modId], [action]: !prev[roleId][modId][action] }
      }
    }));
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

  const activeRole = roles.find(r => r.id === selectedRole);

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
              <button className="ne-btn-secondary">Discard</button>
              <button className="ne-btn-primary" onClick={() => showNotification("Permissions updated!", "success")}>Save Changes</button>
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
                      className="ne-input" style={{ height: '120px', padding: '12px', resize: 'none' }}
                      placeholder="What can users with this role do?"
                      value={newRole.description} onChange={e => setNewRole({...newRole, description: e.target.value})}
                    />
                  </div>
                </div>
                <div style={{ marginBottom: '32px' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px', color: 'var(--text-main)' }}>Visual Identity</h4>
                  <div className="ne-field">
                    <label className="ne-label">Role Color</label>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '8px' }}>
                      {['#4CAA17','#4299E1','#9F7AEA','#ECC94B','#F687B3','#ED8936','#38B2AC','#FC8181'].map(c => (
                        <div
                          key={c}
                          onClick={() => setNewRole({...newRole, color: c})}
                          style={{
                            width: '28px', height: '28px', borderRadius: '50%', background: c,
                            cursor: 'pointer',
                            border: newRole.color === c ? '3px solid white' : 'none',
                            boxShadow: newRole.color === c ? '0 0 0 2px ' + c : '0 2px 4px rgba(0,0,0,0.1)',
                          }}
                        />
                      ))}
                    </div>
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
