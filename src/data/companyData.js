/**
 * Tesco Structures company catalogue — used as a fallback in dropdowns
 * before the API has loaded (and as the canonical list of managers, which
 * isn't a separate collection in the DB).
 *
 * Order matches the way HR reads them out.
 */

// Canonical Manager dropdown — locked to these 7. HR can still create
// employees under any of them, but no other "Head / Manager / Lead"
// auto-promoted via the live employee list. Anish Kumar's title was
// updated from BD Head → CEO and the legacy list pared down per the
// 28-May-26 product brief.
export const MANAGERS = [
  { name: 'Vimal Kumar',  title: 'Managing Director' },
  { name: 'Saleem',       title: 'Sales Head' },
  { name: 'Vishnu',       title: 'Execution Head' },
  { name: 'Sathish',      title: 'Project Manager' },
  { name: 'Karthick',     title: 'Structural Engineer' },
  { name: 'Anish Kumar',  title: 'CEO' },
  { name: 'Vivek',        title: 'Techno Lead Consultant' },
];

// Designation list — used as a static fallback if the /api/designations
// call hasn't completed yet (or fails). Mirrors the seed list on the
// backend so the dropdown looks the same either way.
export const DESIGNATIONS = [
  'Managing Director',
  'Sales head',
  'Execution Head',
  'Business Development Head',
  'Business Development manager',
  'Business Development Associate',
  'Design Head',
  'Design Manager',
  'Design Engineer',
  'Designer Engineer',
  'Senior Engineer',
  'Site Engineer',
  'Structural Engineer',
  'Technical Lead',
  'Technical Lead Consultant',
  'Project Engineer',
  'Web Developer',
  'UI/UX Developer',
  'Sales Coordinator',
  'Sales Executive',
  'Techno Commercial Coordinator',
  'Digital Marketing Manager',
  'SEO',
  'Video editor',
  'HR',
  'Accountant',
];

export const DEPARTMENTS = [
  'Management',
  'Sales',
  'Execution',
  'Business Development',
  'Design',
  'Engineering',
  'Marketing',
  'HR',
  'Project Management',
  'Development',
  'Accounts',
];
