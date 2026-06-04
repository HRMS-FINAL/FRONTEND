/**
 * Manager directory page (Jun 2026).
 *
 * Sits under Employees → Manager. Lists every entry HR has flagged as a
 * "reporting-line target", and feeds the Assigned-To dropdown across
 * HRMS (Add Employee + Employee List edit). Adding a manager here:
 *
 *   - inserts a row into the `managers` collection (auto-seeded with
 *     the canonical 8 names from companyData.js on first API call)
 *   - if the email matches an existing Employee record, that employee's
 *     `role` is flipped to 'manager' so ERM Web manager-side access
 *     unlocks on their next sign-in.
 *
 * Visual language matches the Designation page so HR has no surprises.
 */
import React, { useState, useEffect } from 'react';
import {
  Search, ChevronRight, UserCheck, Plus, X, Trash2, Mail, Briefcase,
} from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { API } from '../config/api';

const COLORS = ['#4299E1', '#9F7AEA', '#4CAA17', '#ECC94B', '#F687B3', '#ED8936', '#38B2AC', '#FC8181'];

function mapApi(m, i) {
  return {
    id:    m._id,
    name:  m.name,
    title: m.title || '',
    email: m.email || '',
    color: COLORS[i % COLORS.length],
  };
}

export default function Manager({ onBack }) {
  const { showNotification, confirmDialog } = useNotification();
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal]     = useState(false);
  const [managers, setManagers]       = useState([]);
  const [form, setForm]               = useState({ name: '', title: '', email: '' });
  const [saving, setSaving]           = useState(false);

  const load = () => {
    fetch(`${API}/managers`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && Array.isArray(data.data)) {
          setManagers(data.data.map(mapApi));
        }
      })
      .catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      showNotification('Name is required.', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API}/managers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:  form.name.trim(),
          title: form.title.trim(),
          email: form.email.trim().toLowerCase(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        showNotification(data?.message || 'Could not add manager.', 'error');
        return;
      }
      showNotification(
        `Manager "${form.name}" added.` +
          (data.promoted ? ' ERM Web manager access granted.' : ''),
        'success'
      );
      setShowModal(false);
      setForm({ name: '', title: '', email: '' });
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (m) => {
    const ok = await confirmDialog({
      title: 'Remove manager',
      message: `Remove ${m.name} from the Manager directory? They will be demoted to Employee on ERM Web and dropped from the Assigned-To dropdown.`,
      confirmText: 'Remove',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const res = await fetch(`${API}/managers/${m.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        showNotification(data?.message || 'Could not remove manager.', 'error');
        return;
      }
      // Surface the cleanup summary so HR sees the cascade kicked in.
      const c = data?.cleanup || {};
      const parts = [];
      if (c.demoted)    parts.push(`${c.demoted} employee${c.demoted === 1 ? '' : 's'} demoted`);
      if (c.unassigned) parts.push(`${c.unassigned} report${c.unassigned === 1 ? '' : 's'} unassigned`);
      const suffix = parts.length ? ` — ${parts.join(', ')}.` : '';
      showNotification(`${m.name} removed.${suffix}`, 'success');
      load();
    } catch (err) {
      showNotification('Network error. Try again.', 'error');
    }
  };

  const filtered = managers.filter((m) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      m.name.toLowerCase().includes(q) ||
      m.title.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q)
    );
  });

  return (
    <div className="ne-page">
      <div className="ne-page-head">
        <div className="ne-breadcrumb">
          <span className="ne-breadcrumb-link" onClick={onBack}>Dashboard</span>
          <ChevronRight size={13} />
          <span>Manager</span>
        </div>
        <div className="emp-list-title-row">
          <div>
            <h1 className="ne-page-title">Manager Directory</h1>
            <p className="ne-page-sub">
              People who appear in the Assigned-To dropdown and get ERM Web manager access.
            </p>
          </div>
          <button className="ne-btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={16} style={{ marginRight: 6 }} /> Add Manager
          </button>
        </div>
      </div>

      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 400 }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: 11, color: '#94A3B8' }} />
            <input
              className="filter-input-small"
              placeholder="Search managers…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '10px 12px 10px 36px', fontSize: 13 }}
            />
          </div>
          <span style={{ fontSize: 13, color: '#64748B', fontWeight: 600 }}>
            {filtered.length} manager{filtered.length === 1 ? '' : 's'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {filtered.length === 0 ? (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 60, color: '#64748B' }}>
              {searchQuery ? `No managers match "${searchQuery}".` : 'No managers yet. Click "Add Manager" to create one.'}
            </div>
          ) : (
            filtered.map((m) => (
              <div
                key={m.id}
                style={{
                  background: '#fff',
                  border: '1px solid #E5E7EB',
                  borderRadius: 12,
                  padding: 18,
                  position: 'relative',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div
                    style={{
                      width: 44, height: 44, borderRadius: 22,
                      background: m.color + '22',
                      color: m.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 16, fontWeight: 800,
                      border: `2px solid ${m.color}33`,
                    }}
                  >
                    <UserCheck size={20} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A' }}>{m.name}</div>
                    {m.title && (
                      <div style={{ fontSize: 12, color: '#64748B', fontWeight: 600, marginTop: 2 }}>
                        <Briefcase size={11} style={{ marginRight: 4, verticalAlign: 'text-bottom' }} />
                        {m.title}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(m)}
                    title="Remove manager"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: '#94A3B8', padding: 4, borderRadius: 6,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#DC2626')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#94A3B8')}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                {m.email && (
                  <div style={{ fontSize: 11.5, color: '#475569', display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <Mail size={12} /> {m.email}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {showModal && (
        <div
          onClick={() => !saving && setShowModal(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(15,23,42,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 12, width: 480, maxWidth: '92vw',
              padding: '22px 22px 18px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0F172A' }}>Add Manager</h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                disabled={saving}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAdd}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                    Name *
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    className="filter-input-small"
                    style={{ width: '100%', padding: '10px 12px', fontSize: 13 }}
                    placeholder="e.g. Suresh Kumar"
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                    Title
                  </label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                    className="filter-input-small"
                    style={{ width: '100%', padding: '10px 12px', fontSize: 13 }}
                    placeholder="e.g. Sales Head / Project Manager"
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                    Email (optional)
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                    className="filter-input-small"
                    style={{ width: '100%', padding: '10px 12px', fontSize: 13 }}
                    placeholder="If set, ERM Web manager access is granted automatically"
                  />
                  <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>
                    When the email matches an existing employee, their role flips to Manager and they unlock the ERM Web manager screens.
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  disabled={saving}
                  style={{ padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: '#fff', color: '#475569', border: '1px solid #E5E7EB', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !form.name.trim()}
                  style={{ padding: '10px 22px', borderRadius: 8, fontSize: 13, fontWeight: 800, background: saving ? '#94A3B8' : '#4CAA17', color: '#fff', border: 'none', cursor: (saving || !form.name.trim()) ? 'not-allowed' : 'pointer' }}
                >
                  {saving ? 'Adding…' : 'Add Manager'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
