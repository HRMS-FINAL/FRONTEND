export const deptData = [
  { name: 'Engineering', value: 485, color: '#4299E1' },
  { name: 'Design',      value: 342, color: '#9F7AEA' },
  { name: 'Sales',       value: 289, color: '#4CAA17' },
  { name: 'Operations',  value: 168, color: '#ECC94B' },
];

export const analyticsData = [
  { month: 'Jan', Engineering: 78, Design: 65, Sales: 82 },
  { month: 'Feb', Engineering: 82, Design: 70, Sales: 75 },
  { month: 'Mar', Engineering: 75, Design: 80, Sales: 88 },
  { month: 'Apr', Engineering: 90, Design: 72, Sales: 79 },
  { month: 'May', Engineering: 85, Design: 85, Sales: 92 },
  { month: 'Jun', Engineering: 88, Design: 78, Sales: 86 },
];

export const recentJoiners = [
  { name: 'Liam Foster',    role: 'Frontend Developer',  initials: 'LF', color: '#4299E1', daysAgo: 2  },
  { name: 'Zoe Martinez',   role: 'UX Designer',         initials: 'ZM', color: '#9F7AEA', daysAgo: 5  },
  { name: 'Ryan Patel',     role: 'Product Manager',     initials: 'RP', color: '#4CAA17', daysAgo: 7  },
  { name: 'Alex Thompson',  role: 'Data Analyst',        initials: 'AT', color: '#ECC94B', daysAgo: 10 },
  { name: 'Ethan Brown',    role: 'DevOps Engineer',     initials: 'EB', color: '#FC8181', daysAgo: 12 },
];

export const reminders = [
  { id: 1, text: 'Review Q2 performance reports',   due: 'Due today',     done: false },
  { id: 2, text: 'Approve leave requests (3 pending)', due: 'Due today',  done: false },
  { id: 3, text: 'Submit payroll for April',          due: 'Due tomorrow', done: true  },
  { id: 4, text: 'Schedule onboarding for new hires', due: 'Due Apr 30', done: false  },
  { id: 5, text: 'Review new employee announcements', due: 'Due tomorrow', done: false },
];

// Hardcoded employee fallback removed. Pages that imported `allEmployees`
// must use the real `employees` prop (fetched live from /api/employees).
// Kept as an empty array export so existing imports don't crash.
export const allEmployees = [];

export const calendarData = {
  year: 2024, month: 3, // 0-indexed (April)
  days: {
    1:'present',2:'present',3:'present',4:'permission',5:'present',
    6:'on-leave',7:'on-leave',
    8:'present',9:'present',10:'late',11:'present',12:'present',
    13:'on-leave',14:'on-leave',
    15:'present',16:'present',17:'present',18:'present',19:'present',
    20:'on-leave',21:'on-leave',
    22:'present',23:'present',24:'late',25:'permission',26:'present',
    27:'on-leave',28:'on-leave',
    29:'present',30:'present',
  },
  grid: [
    null, null, null, null, null, 1, 2,
    3, 4, 5, 6, 7, 8, 9,
    10, 11, 12, 13, 14, 15, 16,
    17, 18, 19, 20, 21, 22, 23,
    24, 25, 26, 27, 28, 29, 30
  ],
  stats: [
    { num: 15, lbl: 'Present', color: '#4CAA17', bg: '#F1F9EE' },
    { num: 2,  lbl: 'Late',    color: '#ECC94B', bg: '#FEF3C7' },
    { num: 3,  lbl: 'Leave',   color: '#A0AEC0', bg: '#EDF2F7' },
    { num: 2,  lbl: 'Perm (2h)', color: '#9F7AEA', bg: '#E9D8FD' },
  ]
};

// Notifications are now sourced live from /api/notifications in Topbar.jsx.
// This export is intentionally empty so any legacy importer fails fast
// rather than rendering stale fake data.
export const notifications = [];
