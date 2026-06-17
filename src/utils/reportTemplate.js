/**
 * reportTemplate.js — single source of truth for every PDF and Excel
 * the HRMS produces. Imports the Tesco Structures logo from the assets
 * folder and applies a consistent branded layout so HR can share any
 * download with management or clients without re-formatting.
 *
 * Public API:
 *   buildBrandedPdf({ title, subtitle, meta, head, body, totals })
 *       → returns a `doc` with the header + autoTable already drawn.
 *         The caller then runs `doc.save(filename)`.
 *
 *   buildBrandedExcel({ title, subtitle, meta, head, body, totals })
 *       → returns a workbook with two sheets: "Summary" + "Data",
 *         both styled with column widths and the same metadata block.
 *
 *   pdfDateLabel()  → "17-Jun-2026"
 *   pdfTimeLabel()  → "05:42 PM"
 *
 * Design decisions:
 *   • Logo + brand band sit on top of every PDF page (didDrawPage
 *     callback) so a multi-page report still looks branded.
 *   • The accent green (#4CAA17) matches the HRMS sidebar so the report
 *     reads as a Tesco document, not a generic export.
 *   • Page footer carries "Tesco Structures · HRMS · page N of M"
 *     plus the generated timestamp on the left, so anyone scanning a
 *     printed copy knows it's authentic.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// Bundler resolves this to a base64 data URL at build time, so we can
// embed the logo into the PDF without any runtime fetch.
import logoSrc from '../assets/logo.png';

const BRAND = {
  green:      '#4CAA17',
  greenDark:  '#3A8714',
  text:       '#0F172A',
  textMute:   '#64748B',
  border:     '#E2E8F0',
  rowAlt:     [248, 250, 252],
  headerText: '#FFFFFF',
};

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function pdfDateLabel(d = new Date()) {
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${dd}-${MONTHS_SHORT[dt.getMonth()]}-${dt.getFullYear()}`;
}

export function pdfTimeLabel(d = new Date()) {
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  let h = dt.getHours();
  const m = String(dt.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 === 0 ? 12 : h % 12;
  return `${String(h).padStart(2, '0')}:${m} ${ampm}`;
}

/**
 * Load the imported logo as a data URL ready for `doc.addImage`. jsPDF
 * accepts the raw imported URL on most bundlers, but on a few Vite
 * configs the URL is a hash-prefixed path that needs to be re-fetched
 * and converted. We cache the result on `window` so the conversion
 * only happens once per session.
 */
async function getLogoDataUrl() {
  if (typeof window === 'undefined') return null;
  if (window.__tescoLogoDataUrl) return window.__tescoLogoDataUrl;
  try {
    if (typeof logoSrc === 'string' && logoSrc.startsWith('data:')) {
      window.__tescoLogoDataUrl = logoSrc;
      return logoSrc;
    }
    const res = await fetch(logoSrc);
    const blob = await res.blob();
    const reader = new FileReader();
    const dataUrl = await new Promise((resolve, reject) => {
      reader.onload  = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    window.__tescoLogoDataUrl = dataUrl;
    return dataUrl;
  } catch (e) {
    console.warn('[reportTemplate] could not load logo:', e?.message || e);
    return null;
  }
}

/**
 * Hex string ("#RRGGBB") → [r,g,b] for jsPDF's setFillColor.
 */
function hex(h) {
  const s = h.replace('#', '');
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Draw the branded header band at the top of the CURRENT PDF page.
 *
 * Layout (a4 portrait, 595 pt wide):
 *   ┌─────────────────────────────────────────────────────────┐
 *   │ ◯ LOGO                          [TESCO STRUCTURES]      │   ← green band
 *   │                                 HR Management System    │
 *   ├─────────────────────────────────────────────────────────┤
 *   │  REPORT TITLE                                           │   ← title
 *   │  Subtitle line — short context                          │   ← subtitle
 *   │                                                         │
 *   │  Period: 01-Jun-2026 → 17-Jun-2026   ·   Generated: …   │   ← meta strip
 *   └─────────────────────────────────────────────────────────┘
 */
function drawHeader(doc, opts) {
  const { title, subtitle, meta, logo } = opts;
  const pageW = doc.internal.pageSize.getWidth();
  const M = 40;

  // Brand band — solid green strip across the top.
  doc.setFillColor(...hex(BRAND.green));
  doc.rect(0, 0, pageW, 64, 'F');

  // Logo on the left of the band. Drawn at fixed height 36 pt and the
  // width is auto from jsPDF's image aspect-ratio handling. If the
  // logo failed to load we still keep the band — just no image.
  if (logo) {
    try { doc.addImage(logo, 'PNG', M, 14, 36, 36); } catch {/* logo render failed — band remains */}
  }

  // Right-aligned brand wordmark.
  doc.setTextColor(...hex(BRAND.headerText));
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  const wordmark = 'TESCO STRUCTURES';
  doc.text(wordmark, pageW - M - doc.getTextWidth(wordmark), 32);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const tag = 'HR Management System';
  doc.text(tag, pageW - M - doc.getTextWidth(tag), 48);

  // Title block beneath the band.
  doc.setTextColor(...hex(BRAND.text));
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(title || 'Report', M, 100);

  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(...hex(BRAND.textMute));
    doc.text(subtitle, M, 118);
  }

  // Meta strip — period, generated timestamp, generated-by user. We
  // build a single dot-separated line so it always fits on one row.
  const parts = [];
  if (meta?.periodFrom || meta?.periodTo) {
    const from = meta.periodFrom ? pdfDateLabel(meta.periodFrom) : '';
    const to   = meta.periodTo   ? pdfDateLabel(meta.periodTo)   : '';
    if (from && to)      parts.push(`Period: ${from} → ${to}`);
    else if (from)       parts.push(`Date: ${from}`);
    else if (to)         parts.push(`Date: ${to}`);
  } else if (meta?.date) {
    parts.push(`Date: ${pdfDateLabel(meta.date)}`);
  }
  if (meta?.employeeName) parts.push(`Employee: ${meta.employeeName}`);
  if (meta?.employeeId)   parts.push(`ID: ${meta.employeeId}`);
  if (meta?.department)   parts.push(`Department: ${meta.department}`);
  parts.push(`Generated: ${pdfDateLabel(new Date())} at ${pdfTimeLabel(new Date())}`);
  if (meta?.generatedBy)  parts.push(`By: ${meta.generatedBy}`);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...hex(BRAND.textMute));
  doc.text(parts.join('   ·   '), M, subtitle ? 138 : 122);

  // Thin underline divider beneath the meta strip.
  doc.setDrawColor(...hex(BRAND.border));
  doc.setLineWidth(0.6);
  doc.line(M, (subtitle ? 148 : 132), pageW - M, (subtitle ? 148 : 132));
}

/**
 * Footer drawn on EVERY page via autoTable's didDrawPage callback.
 * Carries:
 *   • Generated timestamp (left)
 *   • "Tesco Structures · HRMS" wordmark (center)
 *   • Page N of M (right)
 */
function drawFooter(doc) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 40;
  const y = pageH - 24;

  // Top-of-footer hairline.
  doc.setDrawColor(...hex(BRAND.border));
  doc.setLineWidth(0.5);
  doc.line(M, y - 10, pageW - M, y - 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...hex(BRAND.textMute));

  const left = `Generated ${pdfDateLabel(new Date())} ${pdfTimeLabel(new Date())}`;
  doc.text(left, M, y);

  const center = 'Tesco Structures  ·  HRMS';
  doc.text(center, (pageW - doc.getTextWidth(center)) / 2, y);

  const page = doc.internal.getCurrentPageInfo().pageNumber;
  const total = doc.internal.getNumberOfPages();
  const right = `Page ${page} of ${total}`;
  doc.text(right, pageW - M - doc.getTextWidth(right), y);
}

/**
 * Build a fully-branded PDF with a single table. Caller saves it.
 *
 * @param {object}   opts
 * @param {string}   opts.title       e.g. "Attendance Log"
 * @param {string}   [opts.subtitle]  e.g. "Daily logs · June 2026"
 * @param {object}   [opts.meta]      { periodFrom, periodTo, date, employeeName, employeeId, department, generatedBy }
 * @param {string[]} opts.head        column headers, e.g. ['Date', 'Status', ...]
 * @param {array[]}  opts.body        rows, each an array of cell values
 * @param {array[]}  [opts.totals]    optional footer rows (rendered in autoTable's `foot`)
 * @param {object}   [opts.columnStyles] optional jspdf-autotable column-style override
 */
export async function buildBrandedPdf(opts) {
  const {
    title,
    subtitle,
    meta = {},
    head,
    body,
    totals,
    columnStyles,
    orientation = 'portrait',
  } = opts;

  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation });
  const logo = await getLogoDataUrl();

  // First-page header (autoTable's didDrawPage handles subsequent pages
  // but only AFTER the table starts — we still need to draw page 1's
  // header explicitly so the title appears even when the table is empty).
  drawHeader(doc, { title, subtitle, meta, logo });
  const startY = subtitle ? 160 : 144;

  autoTable(doc, {
    startY,
    head:   [head],
    body,
    foot:   totals && totals.length ? totals : undefined,
    theme:  'striped',
    styles: {
      font: 'helvetica',
      fontSize: 10,
      cellPadding: 7,
      textColor: hex(BRAND.text),
      lineColor: hex(BRAND.border),
      lineWidth: 0.4,
    },
    headStyles: {
      fillColor:  hex(BRAND.green),
      textColor:  hex(BRAND.headerText),
      fontStyle:  'bold',
      halign:     'left',
    },
    footStyles: {
      fillColor:  [241, 245, 249],
      textColor:  hex(BRAND.text),
      fontStyle:  'bold',
    },
    alternateRowStyles: { fillColor: BRAND.rowAlt },
    columnStyles: columnStyles || {},
    margin: { left: 40, right: 40, top: 160, bottom: 50 },
    didDrawPage: (data) => {
      // Skip drawing the header again on page 1 — already drawn above.
      if (data.pageNumber > 1) {
        drawHeader(doc, { title, subtitle, meta, logo });
      }
      drawFooter(doc);
    },
  });

  return doc;
}

/**
 * Build a fully-branded Excel workbook. Returns the wb so the caller
 * can XLSX.writeFile(wb, filename) it.
 *
 * Sheet 1 "Summary" — title, subtitle, meta key/value rows.
 * Sheet 2 "Data"    — head row in bold, body rows, optional totals.
 */
export function buildBrandedExcel(opts) {
  const { title, subtitle, meta = {}, head, body, totals } = opts;

  const summaryAoa = [
    ['Tesco Structures'],
    ['HR Management System'],
    [],
    [title || 'Report'],
  ];
  if (subtitle) summaryAoa.push([subtitle]);
  summaryAoa.push([]);
  if (meta.employeeName) summaryAoa.push(['Employee',         meta.employeeName]);
  if (meta.employeeId)   summaryAoa.push(['Employee ID',      meta.employeeId]);
  if (meta.department)   summaryAoa.push(['Department',       meta.department]);
  if (meta.periodFrom)   summaryAoa.push(['Period From',      pdfDateLabel(meta.periodFrom)]);
  if (meta.periodTo)     summaryAoa.push(['Period To',        pdfDateLabel(meta.periodTo)]);
  if (meta.date)         summaryAoa.push(['Date',             pdfDateLabel(meta.date)]);
  summaryAoa.push(       ['Generated On',                     `${pdfDateLabel(new Date())} ${pdfTimeLabel(new Date())}`]);
  if (meta.generatedBy)  summaryAoa.push(['Generated By',     meta.generatedBy]);
  summaryAoa.push(       ['Total Rows',                       Array.isArray(body) ? body.length : 0]);

  const dataAoa = [head, ...body];
  if (Array.isArray(totals)) {
    for (const t of totals) dataAoa.push(t);
  }

  const wb = XLSX.utils.book_new();
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoa);
  const wsData    = XLSX.utils.aoa_to_sheet(dataAoa);

  // Column widths sized for readability.
  wsSummary['!cols'] = [{ wch: 22 }, { wch: 40 }];
  wsData['!cols']    = head.map(() => ({ wch: 18 }));

  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');
  XLSX.utils.book_append_sheet(wb, wsData,    'Data');
  return wb;
}

export const REPORT_BRAND = BRAND;
