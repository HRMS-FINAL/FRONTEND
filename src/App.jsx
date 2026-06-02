import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';

// Pages
import Dashboard from './pages/Dashboard';
import NewEmployeeForm from './pages/NewEmployeeForm';
import EmployeeList from './pages/EmployeeList';
import RolePermissions from './pages/RolePermissions';
import Department from './pages/Department';
import Designation from './pages/Designation';
import Performance from './pages/Performance';
import Payroll from './pages/Payroll';
import Attendance from './pages/Attendance';
import LeavePermission from './pages/LeavePermission';
import LeavePermissionRequest from './pages/LeavePermissionRequest';
import AttendanceRequests       from './pages/AttendanceRequests';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Profile from './pages/Profile';
import Announcements from './pages/Announcements';
import EmployeeDetails from './pages/EmployeeDetails';
import LiveTracking from './pages/LiveTracking';
import DailyRoutes from './pages/DailyRoutes';
import Login from './pages/Login';
import ComingSoon from './pages/ComingSoon';
import Assets from './pages/Assets';
import Allowance from './pages/Allowance';
import ComplainRegister from './pages/ComplainRegister';

import { reminders, calendarData } from './data/mockData';
import { pickTitle } from './utils/labels';
import './App.css';

/**
 * Yellow strip beneath the Topbar that says "View only". Rendered for
 * every non-admin sign-in so the user sees why Save / Delete buttons
 * don't react when they click them. Disappears for the three admin
 * emails (the people who can actually edit).
 */
function ReadOnlyBanner() {
  const { user, isAdmin } = useAuth();
  if (!user || isAdmin) return null;
  return (
    <div
      style={{
        background: '#FEF3C7',
        color: '#92400E',
        borderBottom: '1px solid #FCD34D',
        padding: '8px 24px',
        fontSize: 12.5,
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <span style={{ fontSize: 14 }}>👁️</span>
      You're in view-only mode. Only the HR admin accounts can create or edit records.
    </div>
  );
}
import './form.css';
import './tracking.css';
// Base URL of the HRMS backend. Normalised in src/config/api.js so the
// env var (VITE_API_URL) can be written with or without the `/api` suffix.
import { API } from './config/api';

// localStorage keys used to remember which screen the user was on across
// browser refreshes. (HRMS currently doesn't use a router, so without
// these the page state resets to "dashboard" on every reload.)
const LS_ACTIVE_VIEW = 'tesco_hrms_activeView';
const LS_SELECTED_EMP = 'tesco_hrms_selectedEmployee';

/** Read a JSON value from localStorage with a fallback. Safe on SSR / errors. */
function readLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch { return fallback; }
}

function MainApp() {
  // activeView is now persisted to localStorage so refresh keeps the user
  // on the same page (Allowance / Employee List / etc.). Default is
  // 'dashboard' on a brand-new browser.
  const [activeView, setActiveView] = useState(() => readLS(LS_ACTIVE_VIEW, 'dashboard'));
  useEffect(() => {
    try { localStorage.setItem(LS_ACTIVE_VIEW, JSON.stringify(activeView)); } catch {}
  }, [activeView]);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [hrOpen, setHrOpen]           = useState(false);
  const [doneReminders, setDoneReminders] = useState([3]);

  // selectedEmployee also persists so the Employee Details page works
  // after refresh (otherwise the refresh would land on an empty profile).
  const [selectedEmployee, setSelectedEmployee] = useState(() => readLS(LS_SELECTED_EMP, null));
  useEffect(() => {
    try { localStorage.setItem(LS_SELECTED_EMP, JSON.stringify(selectedEmployee)); } catch {}
  }, [selectedEmployee]);

  // ── Employees — loaded from API ─────────────────────────────────
  const [employees, setEmployees] = useState([]);

  /**
   * fetch() with a long timeout (90s). When the backend is sleeping on
   * Render free tier, the first request takes 20–60s to wake — the
   * default fetch (no timeout) was just hanging and leaving the
   * employee list empty.
   */
  const fetchWithTimeout = async (url, ms = 90_000) => {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetch(url, { signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
  };

  const fetchEmployees = async (attempt = 0) => {
    try {
      const res  = await fetchWithTimeout(`${API}/employees?limit=200`);
      const data = await res.json();
      if (data && data.success && Array.isArray(data.employees)) {
        // Resolved labels come from utils/labels.js — pickTitle() rejects
        // any 24-char hex ObjectId, prefers the populated doc's title /
        // name, and falls through to the denormalised
        // departmentName / designationTitle sidecars stamped on every
        // Employee row. Also overwrite the raw `designation` /
        // `department` fields on the normalised object so any consumer
        // that reads them directly (Payroll, EmployeeDetails, PDFs)
        // gets the resolved label too.
        const cleanDept  = (e) => pickTitle(e.department,  e.departmentName,   '');
        const cleanDesig = (e) => pickTitle(e.designation, e.designationTitle, '');
        const normalised = data.employees.map(e => ({
          ...e,
          id:          e._id,
          name:        e.name || `${e.firstName || ''} ${e.lastName || ''}`.trim(),
          role:        cleanDesig(e),
          dept:        cleanDept(e),
          // Overwrite the originals so any code path that doesn't use the
          // `role`/`dept` aliases (Payroll PDF, EmployeeDetails CV) still
          // ends up with a human label.
          designation: cleanDesig(e),
          department:  cleanDept(e),
          manager:  e.assignedTo || '',
          status:   e.status || 'Active',
          isActive: e.isActive !== false,
          initials: ((e.firstName?.[0] || '') + (e.lastName?.[0] || '')).toUpperCase() ||
                    (e.name?.split(' ').map(n => n[0]).join('') || '??').toUpperCase(),
          color:    e.color || '#4299E1',
          salary:   e.salary || 0,
          joiningDate: e.joiningDate ? new Date(e.joiningDate).toISOString().split('T')[0] : '',
        }));
        setEmployees(normalised);
        console.log(`[App] Loaded ${normalised.length} employees`);
      } else {
        console.warn('[App] Unexpected /employees response:', data);
      }
    } catch (err) {
      console.warn(`[App] employee fetch failed (attempt ${attempt + 1}): ${err.message}`);
      // Cold-start may have aborted attempt 0 — retry once after 2s.
      if (attempt === 0) {
        setTimeout(() => fetchEmployees(1), 2_000);
      }
    }
  };

  // Initial load + refresh every 60s so newly-added employees show up
  // without manual reload.
  useEffect(() => {
    fetchEmployees();
    const t = setInterval(() => fetchEmployees(), 60_000);
    return () => clearInterval(t);
  }, []);

  // Called after NewEmployeeForm saves to DB — just re-fetch to stay in sync
  const addEmployee = () => { fetchEmployees(); };

  const updateEmployeeSalary = (empId, newSalary) => {
    setEmployees(prev => prev.map(emp =>
      (emp.id === empId || emp.employeeId === empId)
        ? { ...emp, salary: newSalary, salaryIncrementApplied: true }
        : emp
    ));
  };

  // 3-Month Salary Increment Eligibility (90 days)
  const eligibleEmployees = React.useMemo(() => {
    return employees.filter(emp => {
      if (emp.salaryIncrementApplied) return false;
      if (!emp.joiningDate) return false;
      const diffDays = Math.ceil(Math.abs(new Date() - new Date(emp.joiningDate)) / 86400000);
      return diffDays >= 90;
    });
  }, [employees]);

  const dynamicReminders = React.useMemo(() => {
    const list = [...reminders];
    if (eligibleEmployees.length > 0) {
      list.unshift({
        id: 999,
        text: `Review Salary Increments (${eligibleEmployees.length} employees completed 3 months)`,
        due: 'Due today', done: false, isIncrementReview: true,
      });
    }
    return list;
  }, [eligibleEmployees]);

  const toggleReminder = (id) => {
    if (id === 999) { setActiveView('payroll'); return; }
    setDoneReminders(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]);
  };

  const renderView = () => {
    const props = { onBack: () => setActiveView('dashboard'), setActiveView };

    switch (activeView) {
      case 'dashboard':
        return (
          <Dashboard
            sidebarOpen={sidebarOpen}
            calGrid={calendarData.grid}
            days={calendarData.days}
            calStats={calendarData.stats}
            reminders={dynamicReminders}
            doneReminders={doneReminders}
            toggleReminder={toggleReminder}
            setActiveView={setActiveView}
            employees={employees}
          />
        );
      case 'new-employee':     return <NewEmployeeForm {...props} employees={employees} onSubmit={addEmployee} />;
      case 'employee-list':    return <EmployeeList {...props} employees={employees} setEmployees={setEmployees} setSelectedEmployee={setSelectedEmployee} />;
      case 'employee-details': return <EmployeeDetails {...props} employee={selectedEmployee} employees={employees} setEmployees={setEmployees} setSelectedEmployee={setSelectedEmployee} onBack={() => setActiveView('employee-list')} />;
      case 'roles':            return <RolePermissions {...props} />;
      case 'department':       return <Department {...props} />;
      case 'designation':      return <Designation {...props} />;
      case 'performance':      return <Performance {...props} />;
      case 'payroll':          return <Payroll {...props} employees={employees} updateEmployeeSalary={updateEmployeeSalary} />;
      case 'allowance':        return <Allowance {...props} employees={employees} />;
      case 'attendance':       return <Attendance {...props} employees={employees} defaultTab="logs" />;
      case 'leave-permission': return <LeavePermission {...props} />;
      case 'leave-permission-request': return <LeavePermissionRequest {...props} />;
      case 'attendance-requests':      return <AttendanceRequests {...props} />;
      case 'reports':          return <Reports {...props} />;
      case 'live-tracking':    return <LiveTracking {...props} />;
      case 'daily-routes':     return <DailyRoutes {...props} />;
      case 'assets':           return <Assets {...props} employees={employees} />;
      case 'complain-register': return <ComplainRegister {...props} />;
      case 'settings':         return <Settings {...props} />;
      case 'profile':          return <Profile {...props} />;
      case 'announcements':    return <Announcements {...props} />;
      default:                 return <ComingSoon activeView={activeView} setActiveView={setActiveView} />;
    }
  };

  return (
    <div className="app-container">
      <Sidebar
        sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}
        activeView={activeView}   setActiveView={setActiveView}
        hrOpen={hrOpen}           setHrOpen={setHrOpen}
      />
      <main className="main-content">
        <Topbar
          sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}
          activeView={activeView}   setActiveView={setActiveView}
          eligibleCount={eligibleEmployees.length}
        />
        {/* View-only banner — shown for any user whose email is not on
            the HRMS admin allowlist. Tells them up-front why their Save
            buttons aren't working, instead of letting them discover it
            via a generic 403 toast on click. */}
        <ReadOnlyBanner />
        {renderView()}
      </main>
    </div>
  );
}

function AppContent() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user)   return <Login />;
  return <MainApp />;
}

export default function App() {
  return (
    <NotificationProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </NotificationProvider>
  );
}
