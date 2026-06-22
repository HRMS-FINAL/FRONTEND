import React, { useState, useEffect } from 'react';
import {
  ChevronRight, User, Bell, Shield, Save
} from 'lucide-react';
import { useNotification } from '../context/NotificationContext';

import { API } from '../config/api';

export default function Settings({ onBack }) {
  const { showNotification } = useNotification();
  const [activeSection, setActiveSection] = useState('notifications'); // #333 — was 'account'; section removed
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  // ─── State that maps to the backend's settings document ────────────
  const [company, setCompany] = useState({
    name: 'Tesco Structures', address: '', phone: '', email: '', website: '',
  });
  const [notifications, setNotifications] = useState({
    email: true, inApp: true, announcement: true, attendanceAlerts: true,
  });
  // "Your Profile" — auto-fetched from /api/auth/me on mount so whatever
  // the user typed during sign-up flows through unedited. Rendered as
  // read-only; HR is the only one who can change these via the Employee
  // List edit panel.
  const [account, setAccount] = useState({
    name: '', email: '', role: '', phone: '',
  });

  // ─── Change password form ─────────────────────────────────────────
  const [pwd, setPwd] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwdSaving, setPwdSaving] = useState(false);

  // Load existing company-wide settings.
  useEffect(() => {
    fetch(`${API}/settings`)
      .then(r => r.json())
      .then(d => {
        if (d?.success && d?.data) {
          if (d.data.company)       setCompany(prev => ({ ...prev, ...d.data.company }));
          if (d.data.notifications) setNotifications(prev => ({ ...prev, ...d.data.notifications }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Load the logged-in user's profile from the backend (not from localStorage).
  useEffect(() => {
    const token = localStorage.getItem('hrms_token') || '';
    if (!token) return;
    fetch(`${API}/auth/me`, { headers: { Authorization: 'Bearer ' + token } })
      .then(r => r.json())
      .then(d => {
        if (!d?.success || !d?.user) return;
        const u = d.user;
        setAccount({
          name:  u.name  || ((u.firstName || '') + ' ' + (u.lastName || '')).trim(),
          email: u.email || '',
          role:  u.role  || '',
          phone: u.phone || '',
        });
        try { localStorage.setItem('hrms_user', JSON.stringify(u)); } catch { /* */ }
      })
      .catch(() => {});
  }, []);

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const body = { company, notifications };
      const res = await fetch(`${API}/settings`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        showNotification(data?.message || 'Could not save settings.', 'error');
      } else {
        showNotification('Settings saved.', 'success');
      }
    } catch (err) {
      showNotification('Network error: ' + (err?.message || 'unknown'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!pwd.currentPassword || !pwd.newPassword) {
      showNotification('Both current and new password are required.', 'error');
      return;
    }
    if (pwd.newPassword.length < 6) {
      showNotification('New password must be at least 6 characters.', 'error');
      return;
    }
    if (pwd.newPassword !== pwd.confirmPassword) {
      showNotification('Passwords do not match.', 'error');
      return;
    }
    setPwdSaving(true);
    try {
      // The mobile backend's change-password endpoint is reused: it's a JWT
      // route that takes oldPassword + newPassword. If the HRMS user has a
      // token, send it as Authorization. Otherwise, fall back to the
      // forgot-password OTP flow.
      const token = localStorage.getItem('hrms_token') || '';
      const url   = `${API}/auth/change-password`;
      const res = await fetch(url, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
        },
        body: JSON.stringify({
          oldPassword: pwd.currentPassword,
          newPassword: pwd.newPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        showNotification(data?.message || 'Could not update password.', 'error');
        return;
      }
      showNotification('Password updated.', 'success');
      setPwd({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      showNotification('Network error: ' + (err?.message || 'unknown'), 'error');
    } finally {
      setPwdSaving(false);
    }
  };

  // #333 — 'Account Info' tab (company info form + Your Profile name/
  // email read-only block) removed per HR — they didn't want personal
  // admin name/email surfaced on the Settings page.
  const sections = [
    { id: 'notifications', label: 'Notifications',        icon: <Bell size={18} /> },
    { id: 'security',      label: 'Security & Privacy',   icon: <Shield size={18} /> },
  ];

  return (
    <div className="emp-list-page">
      <div className="emp-list-header">
        <div className="ne-breadcrumb">
          <span className="ne-breadcrumb-link" onClick={onBack}>Dashboard</span>
          <ChevronRight size={13} />
          <span>Settings</span>
        </div>
        <div className="emp-list-title-row">
          <div>
            <h1 className="ne-page-title">Global Settings</h1>
            <p className="ne-page-sub">Configure your personal preferences and system-wide configurations.</p>
          </div>
          <button
            className="ne-btn-primary"
            onClick={handleSaveSettings}
            disabled={saving || loading}
          >
            <Save size={16} /> {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="settings-layout" style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '30px', marginTop: '24px' }}>
        <aside className="settings-nav card" style={{ padding: '12px', alignSelf: 'start' }}>
          {sections.map(s => (
            <div
              key={s.id}
              className={`notif-item ${activeSection === s.id ? 'unread' : ''}`}
              style={{ borderBottom: 'none', borderRadius: '8px', padding: '14px', cursor: 'pointer' }}
              onClick={() => setActiveSection(s.id)}
            >
              <div className="notif-icon-circle" style={{ background: 'transparent', color: activeSection === s.id ? 'var(--primary)' : 'var(--text-light)' }}>
                {s.icon}
              </div>
              <div className="notif-content">
                <span className="notif-title" style={{ fontWeight: activeSection === s.id ? 700 : 500 }}>{s.label}</span>
              </div>
            </div>
          ))}
        </aside>

        <main className="settings-content">
          <div className="card" style={{ padding: '30px' }}>
            {activeSection === 'notifications' && (
              <div className="settings-pane">
                <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '24px' }}>Notification Preferences</h2>
                <div className="reminder-list">
                  {[
                    { key: 'email',            title: 'Email Notifications',        desc: 'Daily digests and priority alerts via email.' },
                    { key: 'inApp',            title: 'In-App Notifications',       desc: 'Notification bell in the top bar.' },
                    { key: 'announcement',     title: 'Announcement Notifications', desc: 'Alert me when HR posts a new announcement.' },
                    { key: 'attendanceAlerts', title: 'Attendance Alerts',          desc: 'Late check-in / missing checkout alerts.' },
                  ].map(item => (
                    <div className="reminder-item" key={item.key} style={{ padding: '20px 0' }}>
                      <div style={{ flex: 1 }}>
                        <div className="reminder-text" style={{ fontSize: '15px' }}>{item.title}</div>
                        <div className="reminder-due">{item.desc}</div>
                      </div>
                      <div
                        onClick={() => setNotifications(n => ({ ...n, [item.key]: !n[item.key] }))}
                        style={{ width: '44px', height: '24px', borderRadius: '12px', position: 'relative', cursor: 'pointer', background: notifications[item.key] ? 'var(--primary)' : '#CBD5E0' }}
                      >
                        <div style={{ position: 'absolute', top: '2px', left: notifications[item.key] ? '22px' : '2px', width: '20px', height: '20px', background: 'white', borderRadius: '50%', transition: 'all 0.2s' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeSection === 'security' && (
              <div className="settings-pane">
                <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '24px' }}>Security Settings</h2>
                <div className="ne-field" style={{ maxWidth: '420px', marginBottom: '16px' }}>
                  <label className="ne-label">Current Password</label>
                  <input
                    className="ne-input" type="password" placeholder="••••••••"
                    value={pwd.currentPassword}
                    onChange={e => setPwd(p => ({ ...p, currentPassword: e.target.value }))}
                  />
                </div>
                <div className="ne-field" style={{ maxWidth: '420px', marginBottom: '16px' }}>
                  <label className="ne-label">New Password</label>
                  <input
                    className="ne-input" type="password" placeholder="At least 6 characters"
                    value={pwd.newPassword}
                    onChange={e => setPwd(p => ({ ...p, newPassword: e.target.value }))}
                  />
                </div>
                <div className="ne-field" style={{ maxWidth: '420px', marginBottom: '20px' }}>
                  <label className="ne-label">Confirm New Password</label>
                  <input
                    className="ne-input" type="password" placeholder="Re-enter new password"
                    value={pwd.confirmPassword}
                    onChange={e => setPwd(p => ({ ...p, confirmPassword: e.target.value }))}
                  />
                </div>
                <button
                  className="ne-btn-primary"
                  onClick={handleUpdatePassword}
                  disabled={pwdSaving}
                >
                  {pwdSaving ? 'Updating…' : 'Update Password'}
                </button>
              </div>
            )}

          </div>
        </main>
      </div>
    </div>
  );
}
