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
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Profile from './pages/Profile';
import Announcements from './pages/Announcements';
import EmployeeDetails from './pages/EmployeeDetails';
import LiveTracking from './pages/LiveTracking';
import Login from './pages/Login';
import ComingSoon from './pages/ComingSoon';
import Assets from './pages/Assets';
import Allowance from './pages/Allowance';
import ComplainRegister from './pages/ComplainRegister';

import { reminders, calendarData } from './data/mockData';
import './App.css';
import './form.css';
import './tracking.css';

const API = 'http://localhost:8001/api';

function MainApp() {
  const [activeView, setActiveView]   = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [hrOpen, setHrOpen]           = useState(false);
  const [doneReminders, setDoneReminders] = useState([3]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  // ── Employees — loaded from API ─────────────────────────────────
  const [employees, setEmployees] = useState([]);

  const fetchEmployees = async () => {
    try {
      const res  = await fetch(`${API}/employees?limit=200`);
      const data = await res.json();
      if (data.success) {
        // Normalise API shape → local shape used by existing UI
        const normalised = data.employees.map(e => ({
          ...e,
          id:       e._id,
          name:     e.name || `${e.firstName || ''} ${e.lastName || ''}`.trim(),
          role:     typeof e.designation === 'object' ? e.designation?.title  : e.designation  || '',
          dept:     typeof e.department  === 'object' ? e.department?.name    : e.department   || '',
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
      }
    } catch (err) {
      console.error('[App] Failed to load employees:', err.message);
    }
  };

  useEffect(() => { fetchEmployees(); }, []);

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
      case 'reports':          return <Reports {...props} />;
      case 'live-tracking':    return <LiveTracking {...props} />;
      case 'assets':           return <Assets {...props} />;
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
