/**
 * labels.js — tiny helpers shared by every page that renders an
 * employee's department or designation. Their job is to make sure a raw
 * Mongo ObjectId never makes it onto the screen.
 *
 * The HRMS DB stores `department` and `designation` as ObjectId references
 * into the `departments` / `designations` collections. Different code
 * paths receive different shapes for the same field:
 *
 *   • Populated docs   →  { _id, name } / { _id, title }
 *   • Raw refs         →  "6a1451093a089e639bbbf2de"     (24-char hex)
 *   • Already resolved →  "Software Engineer"            (plain string)
 *   • Denormalised     →  the sidecar `departmentName` / `designationTitle`
 *                         fields we now stamp onto every Employee row
 *
 * Always feed values through `pickTitle` before rendering so the screen
 * lands on the human label regardless of where the data came from.
 */

/** Reject 24-character hex strings — those are ObjectIds, not labels. */
export const isHexObjectId = (v) =>
  typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v.trim());

/**
 * Resolve a value that might be an ObjectId / populated doc / plain string
 * into a clean readable string.
 *
 *   pickTitle(emp.designation, emp.designationTitle)
 *   pickTitle(emp.department,  emp.departmentName)
 *
 * Falls through this order:
 *   1. populated doc.title / .name
 *   2. plain string (if not an ObjectId hex)
 *   3. the sidecar denormalised field
 *   4. `—`
 */
export function pickTitle(value, sidecar, fallback = '—') {
  if (value && typeof value === 'object') {
    const t = value.title || value.name || '';
    if (t && !isHexObjectId(t)) return t;
    if (sidecar && !isHexObjectId(sidecar)) return sidecar;
    return fallback;
  }
  if (typeof value === 'string' && value && !isHexObjectId(value)) {
    return value;
  }
  if (sidecar && !isHexObjectId(sidecar)) return sidecar;
  return fallback;
}

/**
 * Shorthand for a single value with no sidecar — useful when you only
 * have e.g. `emp.role` and want it scrubbed of ObjectIds.
 */
export const safeLabel = (value, fallback = '—') => pickTitle(value, '', fallback);
