import React, { useState, useEffect } from 'react';
import { 
  Search, ChevronRight, Hash, Zap, TrendingUp, 
  Settings, Users, Plus, MoreVertical, X, Check
} from 'lucide-react';
import { useNotification } from '../context/NotificationContext';

const API = 'http://localhost:8001/api';
const COLORS = ['#4299E1','#9F7AEA','#4CAA17','#ECC94B','#F687B3','#ED8936','#38B2AC','#FC8181'];

// Map index to icon name string — render icon in JSX using this
const ICON_NAMES = ['Hash','Zap','TrendingUp','Settings','Users'];

const MOCK_DEPTS = [
  { id: 'eng', name: 'Engineering', count: 485, manager: 'Ethan Brown',  managerInitials: 'EB', color: '#4299E1', iconIdx: 0, status: 'Active' },
  { id: 'des', name: 'Design',      count: 342, manager: 'Sarah Wilson', managerInitials: 'SW', color: '#9F7AEA', iconIdx: 1, status: 'Active' },
  { id: 'sls', name: 'Sales',       count: 289, manager: 'James Wilson', managerInitials: 'JW', color: '#4CAA17', iconIdx: 2, status: 'Active' },
  { id: 'ops', name: 'Operations',  count: 168, manager: 'Emma Davis',   managerInitials: 'ED', color: '#ECC94B', iconIdx: 3, status: 'Active' },
  { id: 'hr',  name: 'HR',          count: 45,  manager: 'Priya Sharma', managerInitials: 'PS', color: '#F687B3', iconIdx: 4, status: 'Active' },
];

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
  const { showNotification } = useNotification();
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [departments, setDepartments] = useState(MOCK_DEPTS);
  const [newDept, setNewDept] = useState({ name: '', manager: '' });

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
            {filteredDepts.map(dept => (
              <tr key={dept.id}>
                <td>
                  <div className="emp-table-user">
                    <div className="emp-table-avatar" style={{ background: dept.color + '20', color: dept.color }}>
                      <DeptIcon idx={dept.iconIdx} />
                    </div>
                    <div>
                      <div className="emp-table-name">{dept.name} Team</div>
                      <div className="emp-table-id">DEPT-{String(dept.id).toUpperCase().slice(0,6)}</div>
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
                <td><button className="emp-table-btn"><MoreVertical size={16} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
