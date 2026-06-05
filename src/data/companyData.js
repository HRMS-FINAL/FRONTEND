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
  { name: 'Vivek',        title: 'Technical Lead Consultant' },
  // Added Jun 2026 — Vimal M (Finance Head) is distinct from Vimal Kumar
  // (Managing Director); HR sees both in the Assigned To dropdown.
  { name: 'Vimal M',      title: 'Finance Head' },
];

// Designation + Department catalogues — emptied for go-live (Jun 2026).
// The HRMS Designation + Department pages are now the only source of
// truth; both are loaded live from /api/designations and /api/departments.
// Keeping these arrays as empty exports so existing imports across the
// codebase don't break — the dropdowns just start empty and populate
// once the API responds.
export const DESIGNATIONS = [];
export const DEPARTMENTS  = [];
