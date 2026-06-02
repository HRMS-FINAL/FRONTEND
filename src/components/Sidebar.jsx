import React from 'react';
import {
  LayoutDashboard, Users, ChevronRight, TrendingUp, DollarSign,
  CalendarCheck, BarChart2, Settings as SettingsIcon, ChevronDown, Megaphone, User, MapPin, ClipboardList, Monitor, CreditCard
} from 'lucide-react';
import logo from '../assets/logo-hrm.png';
import logo2 from '../assets/logo-hrm.png';

export default function Sidebar({ 
  sidebarOpen, 
  setSidebarOpen,
  activeView, 
  setActiveView, 
  hrOpen, 
  setHrOpen 
}) {
  const [attOpen, setAttOpen] = React.useState(() => 
    ['attendance', 'leave-permission', 'leave-permission-request'].includes(activeView)
  );

  const handleNavClick = (view, isDropdown = false, dropdownType = '') => {
    if (!sidebarOpen) {
      setSidebarOpen(true);
      if (dropdownType === 'hr') setHrOpen(true);
      if (dropdownType === 'att') setAttOpen(true);
      if (!isDropdown) setActiveView(view);
    } else if (isDropdown) {
      if (dropdownType === 'hr') setHrOpen(!hrOpen);
      if (dropdownType === 'att') setAttOpen(!attOpen);
    } else {
      setActiveView(view);
    }
  };

  return (
    <aside className={`sidebar ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
      <div className="sidebar-brand" style={{ 
        padding: sidebarOpen ? '24px 20px' : '20px 0', 
        height: 'auto', 
        minHeight: '80px',
        display: 'flex',
        justifyContent: sidebarOpen ? 'flex-start' : 'center',
        alignItems: 'center'
      }}>
        <img 
          src={sidebarOpen ? logo : logo2} 
          alt="TESCO Structures" 
          style={{ 
            width: sidebarOpen ? '160px' : '32px', 
            height: 'auto',
            transition: 'all 0.3s ease'
          }} 
        />
      </div>

      <nav className="sidebar-nav">
        <span className="nav-section-label">Main</span>
        <div className={`nav-item ${activeView === 'dashboard' ? 'active' : ''}`} onClick={() => handleNavClick('dashboard')}>
          <LayoutDashboard className="nav-icon" size={18} />
          <span className="nav-text">Dashboard</span>
        </div>

        <div 
          className={`nav-item nav-dropdown-trigger ${['new-employee','employee-list','roles','department','designation'].includes(activeView) ? 'active' : ''}`} 
          onClick={() => handleNavClick('employee-list', true, 'hr')}
        >
          <div className="trigger-left">
            <Users className="nav-icon" size={18} />
            <span className="nav-text">Employees</span>
          </div>
          <ChevronRight className={`nav-chevron ${hrOpen ? 'open' : ''}`} size={16} color="var(--primary)" />
        </div>
        <div className={`nav-submenu ${hrOpen && sidebarOpen ? 'open' : ''}`}>
          {['new-employee', 'employee-list', 'roles', 'department', 'designation'].map(v => {
            let label = v.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            if (v === 'roles') label = 'Access management';
            
            return (
              <div key={v} className={`nav-subitem ${activeView === v ? 'active' : ''}`} onClick={() => setActiveView(v)}>
                {label}
              </div>
            );
          })}
        </div>


        <div className={`nav-item ${activeView === 'payroll' ? 'active' : ''}`} onClick={() => handleNavClick('payroll')}>
          <DollarSign className="nav-icon" size={18} />
          <span className="nav-text">Payroll</span>
        </div>
        <div className={`nav-item ${activeView === 'allowance' ? 'active' : ''}`} onClick={() => handleNavClick('allowance')}>
          <CreditCard className="nav-icon" size={18} />
          <span className="nav-text">Allowance</span>
        </div>
        <div 
          className={`nav-item nav-dropdown-trigger ${['attendance','leave-permission','leave-permission-request'].includes(activeView) ? 'active' : ''}`} 
          onClick={() => handleNavClick('attendance', true, 'att')}
        >
          <div className="trigger-left">
            <CalendarCheck className="nav-icon" size={18} />
            <span className="nav-text">Attendance</span>
          </div>
          <ChevronRight className={`nav-chevron ${attOpen ? 'open' : ''}`} size={16} color="var(--primary)" />
        </div>
        <div className={`nav-submenu ${attOpen && sidebarOpen ? 'open' : ''}`}>
          <div className={`nav-subitem ${activeView === 'attendance' ? 'active' : ''}`} onClick={() => setActiveView('attendance')}>
            Attendance Logs
          </div>
          <div className={`nav-subitem ${activeView === 'leave-permission' ? 'active' : ''}`} onClick={() => setActiveView('leave-permission')}>
            Leave & Permission
          </div>
          <div className={`nav-subitem ${activeView === 'leave-permission-request' ? 'active' : ''}`} onClick={() => setActiveView('leave-permission-request')}>
            Approvals
          </div>
          {/* Regularisation requests filed from ERM Mobile show up here. */}
          <div className={`nav-subitem ${activeView === 'attendance-requests' ? 'active' : ''}`} onClick={() => setActiveView('attendance-requests')}>
            Attendance Requests
          </div>
        </div>
        <div className={`nav-item ${activeView === 'reports' ? 'active' : ''}`} onClick={() => handleNavClick('reports')}>
          <BarChart2 className="nav-icon" size={18} />
          <span className="nav-text">Reports</span>
        </div>
        <div className={`nav-item ${activeView === 'live-tracking' ? 'active' : ''}`} onClick={() => handleNavClick('live-tracking')}>
          <MapPin className="nav-icon" size={18} />
          <span className="nav-text">Live Tracking</span>
          <div className="nav-live-dot" />
        </div>
        <div className={`nav-item ${activeView === 'daily-routes' ? 'active' : ''}`} onClick={() => handleNavClick('daily-routes')}>
          <MapPin className="nav-icon" size={18} />
          <span className="nav-text">Daily Routes</span>
        </div>
        <div className={`nav-item ${activeView === 'announcements' ? 'active' : ''}`} onClick={() => handleNavClick('announcements')}>
          <Megaphone className="nav-icon" size={18} />
          <span className="nav-text">Announcements</span>
          <span className="nav-badge" style={{ marginLeft: 'auto', background: '#FC8181' }}>New</span>
        </div>

      </nav>

      <div style={{ marginTop: 'auto', paddingBottom: '120px' }}>
        <nav className="sidebar-nav" style={{ paddingBottom: 0 }}>
          <span className="nav-section-label">Support</span>
          <div className={`nav-item ${activeView === 'complain-register' ? 'active' : ''}`} onClick={() => handleNavClick('complain-register')}>
            <ClipboardList className="nav-icon" size={18} />
            <span className="nav-text">Complaint Register</span>
          </div>
          <div className={`nav-item ${activeView === 'assets' ? 'active' : ''}`} onClick={() => handleNavClick('assets')}>
            <Monitor className="nav-icon" size={18} />
            <span className="nav-text">Assets</span>
          </div>
          <div className={`nav-item ${activeView === 'settings' ? 'active' : ''}`} onClick={() => handleNavClick('settings')}>
            <SettingsIcon className="nav-icon" size={18} />
            <span className="nav-text">Settings</span>
          </div>
        </nav>
      </div>
    </aside>
  );
}
