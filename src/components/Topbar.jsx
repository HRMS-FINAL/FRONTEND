import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import {
  PanelLeftClose, PanelLeftOpen, Search, Bell,
  ChevronDown, Megaphone, DollarSign, CalendarCheck, Clock,
  Settings as SettingsIcon, LogOut, AlertCircle, Wallet,
} from 'lucide-react';

import { API } from '../config/api';
// Stored as ISO. Every item with timestamp <= this is treated as read.
const READ_CURSOR_KEY = 'hrms_notif_read_cursor';

export default function Topbar({
  sidebarOpen,
  setSidebarOpen,
  activeView,
  setActiveView,
  eligibleCount,
}) {
  const { user, logout } = useAuth();
  const { showNotification } = useNotification();
  const [showNotif, setShowNotif] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const notifRef = useRef(null);
  const profileRef = useRef(null);

  /* ─── Live notifications from the backend ─────────────────────── */
  const [items, setItems]   = useState([]);
  const [unread, setUnread] = useState(0);
  const [, forceTick]       = useState(0);

  const fetchNotifs = useCallback(async () => {
    try {
      const cursor = localStorage.getItem(READ_CURSOR_KEY) || '';
      const qs = cursor ? `?since=${encodeURIComponent(cursor)}` : '';
      const r  = await fetch(`${API}/notifications${qs}`);
      const d  = await r.json().catch(() => ({}));
      if (!d?.success) return;
      setItems(Array.isArray(d.items) ? d.items : []);
      setUnread(typeof d.unread === 'number' ? d.unread : 0);
    } catch {
      // soft-fail — leave whatever we already had
    }
  }, []);

  // Initial load + periodic refresh so newly-submitted requests
  // surface in the bell within ~30s.
  useEffect(() => {
    fetchNotifs();
    const t = setInterval(fetchNotifs, 30_000);
    return () => clearInterval(t);
  }, [fetchNotifs]);

  // Refresh again whenever the user opens the bell — they're actively
  // looking at it, so be aggressive.
  useEffect(() => {
    if (showNotif) fetchNotifs();
  }, [showNotif, fetchNotifs]);

  // The salary-eligibility item is locally derived (no backend), so we
  // mix it in at render time. If there's nothing eligible, it's omitted.
  const displayed = React.useMemo(() => {
    const list = [...items];
    if (eligibleCount > 0) {
      list.unshift({
        id:        'inc-notif',
        type:      'payroll',
        title:     `Salary increment alert: ${eligibleCount} employee${eligibleCount === 1 ? '' : 's'} eligible (3+ months)`,
        time:      'Just now',
        timestamp: new Date().toISOString(),
        read:      false,
        nav:       'payroll',
      });
    }
    return list;
  }, [items, eligibleCount]);

  const totalUnread = unread + (eligibleCount > 0 ? 1 : 0);

  /* ─── Mark all read ───────────────────────────────────────────── */
  const markAllRead = () => {
    const now = new Date().toISOString();
    localStorage.setItem(READ_CURSOR_KEY, now);
    // Optimistic: flip every item to read in the local copy.
    setItems((cur) => cur.map((n) => ({ ...n, read: true })));
    setUnread(0);
    forceTick((t) => t + 1);
  };

  /* ─── Click-outside ───────────────────────────────────────────── */
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifRef.current   && !notifRef.current.contains(e.target))   setShowNotif(false);
      if (profileRef.current && !profileRef.current.contains(e.target)) setShowProfileDropdown(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    showNotification('Logging out...', 'info');
    setTimeout(() => {
      logout();
      showNotification('Logged out successfully', 'success');
    }, 800);
  };

  const getIcon = (type) => {
    switch (type) {
      case 'announcement': return <Megaphone size={14} />;
      case 'payroll':      return <DollarSign size={14} />;
      case 'leave':        return <CalendarCheck size={14} />;
      case 'permission':   return <Clock size={14} />;
      case 'complaint':    return <AlertCircle size={14} />;
      case 'allowance':    return <Wallet size={14} />;
      default:             return <Bell size={14} />;
    }
  };

  const handleNotifClick = (n) => {
    if (n.nav) setActiveView(n.nav);
    setShowNotif(false);
  };

  const titles = {
    'dashboard':     'HR Dashboard',
    'new-employee':  'Add New Employee',
    'employee-list': 'Employee List',
    'roles':         'Role & Permissions',
    'department':    'Department',
    'designation':   'Designation',
    'performance':   'Performance',
    'payroll':       'Payroll',
    'attendance':    'Attendance Logs',
    'leave-permission': 'Leave & Permission',
    'leave-permission-request': 'Leave & Permission Requests',
    'reports':       'Reports',
    'settings':      'Settings',
    'profile':       'My Profile',
    'announcements': 'Announcements',
    'complain-register': 'Complaint Register',
    'allowance':     'Allowance',
    'assets':        'Assets',
    'live-tracking': 'Live Tracking',
  };

  return (
    <header className="topbar">
      <button className="sidebar-toggle-btn" onClick={() => setSidebarOpen(o => !o)}>
        {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
      </button>

      <div className="topbar-title-block">
        <div className="topbar-title">{titles[activeView] || 'HR Dashboard'}</div>
        <div className="topbar-subtitle">
          {activeView === 'dashboard'
            ? `Welcome back, ${user?.name || 'User'} 👋`
            : 'Employees → ' + (titles[activeView] || activeView)}
        </div>
      </div>

      <div className="topbar-search">
        <Search size={15} style={{ flexShrink: 0 }} />
        <input placeholder="Search employees, reports..." />
      </div>

      <div className="topbar-actions">
        <div className="topbar-btn-wrap" ref={notifRef}>
          <div
            className={`topbar-btn ${showNotif ? 'active' : ''}`}
            onClick={() => setShowNotif(!showNotif)}
            title="Notifications"
            style={{ cursor: 'pointer' }}
          >
            <Bell size={16} />
            {totalUnread > 0 && <div className="notif-dot" />}
          </div>

          {showNotif && (
            <div className="notif-dropdown">
              <div className="notif-header">
                <h3>Notifications {totalUnread > 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>({totalUnread} new)</span>}</h3>
                {totalUnread > 0 && (
                  <span className="notif-mark-read" onClick={markAllRead} style={{ cursor: 'pointer' }}>
                    Mark all as read
                  </span>
                )}
              </div>
              <div className="notif-list">
                {displayed.length === 0 ? (
                  <div
                    style={{
                      padding: '24px 20px',
                      textAlign: 'center',
                      fontSize: 12.5,
                      color: 'var(--text-muted)',
                    }}
                  >
                    No notifications yet. Employee requests and announcements will show up here.
                  </div>
                ) : (
                  displayed.map((n) => (
                    <div
                      className={`notif-item ${n.read ? '' : 'unread'}`}
                      key={n.id}
                      onClick={() => handleNotifClick(n)}
                    >
                      <div className={`notif-icon-circle ${n.type}`}>
                        {getIcon(n.type)}
                      </div>
                      <div className="notif-body">
                        <div className="notif-item-title">{n.title}</div>
                        <div className="notif-item-time">{n.time}</div>
                      </div>
                      {!n.read && <div className="notif-unread-dot" />}
                    </div>
                  ))
                )}
              </div>
              <div
                className="notif-footer"
                onClick={() => { setActiveView('announcements'); setShowNotif(false); }}
              >
                View all announcements
              </div>
            </div>
          )}
        </div>

        <div className="topbar-btn-wrap" ref={profileRef}>
          <div
            className="topbar-user"
            onClick={() => setShowProfileDropdown(!showProfileDropdown)}
            style={{ cursor: 'pointer' }}
          >
            <div
              className="profile-card"
              style={{ border: 'none', background: 'transparent', padding: 0, boxShadow: 'none' }}
            >
              <div
                className="profile-avatar"
                style={{ width: '32px', height: '32px', fontSize: '12px' }}
              >
                {user?.avatar || 'U'}
              </div>
              <div className="profile-info" style={{ marginLeft: '10px' }}>
                <div
                  className="profile-name"
                  style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)', lineHeight: 1.2 }}
                >
                  {user?.name || 'User'}
                </div>
                <div className="profile-role" style={{ fontSize: '10px', color: 'var(--text-light)', fontWeight: 600 }}>
                  {user?.role || 'Employee'}
                </div>
              </div>
              <ChevronDown
                size={14}
                style={{
                  color: 'var(--text-light)',
                  marginLeft: '8px',
                  transform: showProfileDropdown ? 'rotate(180deg)' : 'none',
                  transition: 'all 0.2s',
                }}
              />
            </div>
          </div>

          {showProfileDropdown && (
            <div className="profile-dropdown">
              <div className="p-drop-header">
                <div className="profile-avatar" style={{ width: '40px', height: '40px', fontSize: '14px' }}>
                  {user?.avatar || 'U'}
                </div>
                <div className="profile-info" style={{ marginLeft: '12px' }}>
                  <div className="profile-name" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>
                    {user?.name || 'User'}
                  </div>
                  <div className="profile-email" style={{ fontSize: '11px', color: 'var(--text-light)' }}>
                    {user?.email || ''}
                  </div>
                </div>
              </div>
              <div className="p-drop-list">
                <div
                  className="p-drop-item"
                  style={{ cursor: 'pointer' }}
                  onClick={() => { setActiveView('settings'); setShowProfileDropdown(false); }}
                >
                  <SettingsIcon size={16} />
                  <span>Account Settings</span>
                </div>
              </div>
              <div className="p-drop-footer">
                <div className="p-drop-item logout" onClick={handleLogout}>
                  <LogOut size={16} />
                  <span>Log Out</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
