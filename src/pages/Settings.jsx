import React, { useState } from 'react';
import { 
  ChevronRight, Check, User, Bell, Shield, 
  Globe, Moon, Smartphone, HelpCircle, Save
} from 'lucide-react';

export default function Settings({ onBack }) {
  const [activeSection, setActiveSection] = useState('account');
  const [notifs, setNotifs] = useState({
    email: true,
    browser: true,
    mobile: false,
    payroll: true
  });

  const toggleNotif = (key) => setNotifs({...notifs, [key]: !notifs[key]});

  const sections = [
    { id: 'account', label: 'Account Info', icon: <User size={18} /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell size={18} /> },
    { id: 'security', label: 'Security & Privacy', icon: <Shield size={18} /> },
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
          <button className="ne-btn-primary"><Save size={16} /> Save Changes</button>
        </div>
      </div>

      <div className="settings-layout" style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '30px', marginTop: '24px' }}>
        <aside className="settings-nav card" style={{ padding: '12px', alignSelf: 'start' }}>
          {sections.map(s => (
            <div 
              key={s.id}
              className={`notif-item ${activeSection === s.id ? 'unread' : ''}`}
              style={{ borderBottom: 'none', borderRadius: '8px', padding: '14px' }}
              onClick={() => setActiveSection(s.id)}
            >
              <div className="notif-icon-circle" style={{ background: 'transparent', color: activeSection === s.id ? 'var(--primary)' : 'var(--text-light)' }}>
                {s.icon}
              </div>
              <div className="notif-body">
                <div className="notif-item-title" style={{ fontSize: '14px', fontWeight: activeSection === s.id ? '700' : '500' }}>{s.label}</div>
              </div>
            </div>
          ))}
        </aside>

        <main className="settings-content">
          <div className="card" style={{ padding: '30px' }}>
            {activeSection === 'account' && (
              <div className="settings-pane">
                <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '24px' }}>Account Information</h2>
                <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="ne-field">
                    <label className="ne-label">Full Name</label>
                    <input className="ne-input" defaultValue="Alex Morrison" />
                  </div>
                  <div className="ne-field">
                    <label className="ne-label">Email Address</label>
                    <input className="ne-input" defaultValue="alex.m@tesco.com" />
                  </div>
                  <div className="ne-field">
                    <label className="ne-label">Job Title</label>
                    <input className="ne-input" defaultValue="HR Administrator" readOnly />
                  </div>
                  <div className="ne-field">
                    <label className="ne-label">Language</label>
                    <select className="ne-input"><option>English (US)</option><option>Spanish</option><option>French</option></select>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'notifications' && (
              <div className="settings-pane">
                <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '24px' }}>Notification Preferences</h2>
                <div className="reminder-list">
                  {[
                    { key: 'email', title: 'Email Notifications', desc: 'Receive daily digests and priority alerts via email.' },
                    { key: 'browser', title: 'Push Notifications', desc: 'Desktop alerts for real-time leave requests and messages.' },
                    { key: 'mobile', title: 'SMS Alerts', desc: 'Emergency notifications sent to your registered phone number.' },
                    { key: 'payroll', title: 'Payroll Updates', desc: 'Receive alerts when payroll processing is completed.' },
                  ].map(item => (
                    <div className="reminder-item" key={item.key} style={{ padding: '20px 0' }}>
                      <div style={{ flex: 1 }}>
                        <div className="reminder-text" style={{ fontSize: '15px' }}>{item.title}</div>
                        <div className="reminder-due">{item.desc}</div>
                      </div>
                      <div 
                        className={`perm-check ${notifs[item.key] ? 'checked' : ''}`}
                        onClick={() => toggleNotif(item.key)}
                        style={{ width: '44px', height: '24px', borderRadius: '12px', position: 'relative', cursor: 'pointer', background: notifs[item.key] ? 'var(--primary)' : '#CBD5E0' }}
                      >
                        <div style={{ position: 'absolute', top: '2px', left: notifs[item.key] ? '22px' : '2px', width: '20px', height: '20px', background: 'white', borderRadius: '50%', transition: 'all 0.2s' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeSection === 'security' && (
              <div className="settings-pane">
                <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '24px' }}>Security Settings</h2>
                <div className="ne-field" style={{ maxWidth: '400px' }}>
                  <label className="ne-label">Current Password</label>
                  <input className="ne-input" type="password" placeholder="••••••••" />
                </div>
                <div className="ne-field" style={{ maxWidth: '400px' }}>
                  <label className="ne-label">New Password</label>
                  <input className="ne-input" type="password" placeholder="Enter new password" />
                </div>
                <button className="ne-btn-primary" style={{ marginTop: '10px' }}>Update Password</button>
                
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
