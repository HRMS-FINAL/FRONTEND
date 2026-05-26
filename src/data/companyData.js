/**
 * Tesco Structures company catalogue — used as a fallback in dropdowns
 * before the API has loaded (and as the canonical list of managers, which
 * isn't a separate collection in the DB).
 *
 * The MANAGERS list mirrors HR's printed roster + 'Vivek - Technical Lead'
 * who joined later. Order matches the way HR reads them out.
 */

export const MANAGERS = [
  { name: 'Vimal Kumar',      title: 'Managing Director' },
  { name: 'Saleem Khan',      title: 'Sales head' },
  { name: 'Vishnu K',         title: 'Execution Head' },
  { name: 'Anish Kumar',      title: 'Business Development Head' },
  { name: 'Gopinath',         title: 'Design Head' },
  { name: 'Shanmuga Raja',    title: 'Design Manager' },
  { name: 'Durga Devi',       title: 'Digital Marketing Manager' },
  { name: 'Suriya',           title: 'Business Development manager' },
  { name: 'Surendar',         title: 'Business Development manager' },
  { name: 'Prabakaran R',     title: 'Business Development manager' },
  { name: 'Shamma',           title: 'Business Development manager' },
  { name: 'Praveenraja',      title: 'Business Development manager' },
  { name: 'Sinduja',          title: 'Technical Lead Consultant' },
  { name: 'Vivek',            title: 'Technical Lead' },
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
