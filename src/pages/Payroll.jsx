import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronRight, DollarSign, CreditCard, TrendingUp, Zap,
  Download, Printer, Send, Search, Filter, X, FileText, Upload, Trash2
} from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../components/ConfirmDialog';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import { API } from '../config/api';

export default function Payroll({ onBack, employees = [], updateEmployeeSalary }) {
  const { showNotification } = useNotification();
  const { user, isAdmin } = useAuth();
  const confirm = useConfirm();
  // Only HR / Admin may delete an uploaded report.
  const canManageReports = isAdmin || ['admin', 'hr'].includes(String(user?.role || '').toLowerCase());

  // #498 — Preload the Tesco HRM logo as a PNG data-URL so the synchronous
  // payslip PDF builder can embed it via doc.addImage without an async load.
  const logoDataUrlRef = useRef('');
  // Refs for the Edit Payslip panel's persisted fields (PF / Professional Tax
  // amounts + PF A/C Number + UAN).
  const editPfRef   = useRef(null);
  const editPtRef   = useRef(null);
  const editPfAcRef = useRef(null);
  const editUanRef  = useRef(null);
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width  = img.naturalWidth  || img.width;
        c.height = img.naturalHeight || img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        // The logo is dark-on-white but the payslip header is BLACK, so recolour
        // it to a WHITE lockup on a transparent background (keeping the green
        // arrow). Lets it sit directly on the black band like the official
        // payslip — no white card needed.
        //   near-white background → transparent
        //   green pixels (arrow)  → kept
        //   everything else (text) → white
        try {
          const im = ctx.getImageData(0, 0, c.width, c.height);
          const d = im.data;
          for (let i = 0; i < d.length; i += 4) {
            const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
            if (a < 8) continue;
            const isGreen   = g > 110 && g - r > 25 && g - b > 25;
            const isWhiteBg = r > 232 && g > 232 && b > 232;
            if (isWhiteBg)      { d[i + 3] = 0; }                     // drop background
            else if (!isGreen)  { d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; } // text → white
          }
          ctx.putImageData(im, 0, 0);
        } catch { /* same-origin only — fall back to the raw logo if blocked */ }
        logoDataUrlRef.current = c.toDataURL('image/png');
      } catch { /* canvas unsupported — payslip simply omits the logo */ }
    };
    // Official Tesco Structures logo for the payslip header (public/tescologo.png).
    img.src = '/tescologo.png';
  }, []);
  const [showSlip, setShowSlip] = useState(null);
  const [showEditSlip, setShowEditSlip] = useState(null);
  // Imported-report review state. `importReview` holds the parsed preview plus
  // a Set of included row indexes; HR confirms before anything is pushed.
  const [importReview, setImportReview] = useState(null); // { ...preview, fileName }
  const [importInclude, setImportInclude] = useState(() => new Set());
  const [importBusy, setImportBusy] = useState(false);
  const pendingFileRef = useRef(null); // retained file for manual-type retry
  const [searchQuery, setSearchQuery] = useState('');
  const [showProcessPanel, setShowProcessPanel] = useState(false);
  const [createEmpId, setCreateEmpId] = useState('');
  const [generatedPayrolls, setGeneratedPayrolls] = useState([]);
  const today = new Date();
  // Default to the PREVIOUS month — payroll is only generated after a
  // month is fully over. If today is June, default to May.
  const _prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const [payMonth, setPayMonth] = useState(_prevMonth.getMonth() + 1); // 1-12
  const [payYear,  setPayYear]  = useState(_prevMonth.getFullYear());
  // Pending payslip requests filed from ERM Mobile / ERM Web. Refreshed
  // every 30 s so HR sees them as soon as the employee taps "Request".
  const [pendingRequests, setPendingRequests] = useState([]);
  // Upload gate: payslips can't be generated / downloaded for a month until the
  // attendance/payroll report for that month has been uploaded. A month counts
  // as "reported" if HR uploaded a report this session OR the mobile DB already
  // holds generated (non-pending) payslips for it.
  const [uploadedMonths, setUploadedMonths] = useState(() => new Set());
  const [monthHasReport, setMonthHasReport] = useState(false);
  // Generated payslips for the selected month (source for the "Payable Amount"
  // column — the salary calculated from the HR-uploaded report).
  const [monthPayslips, setMonthPayslips] = useState([]);
  const monthKey = `${payYear}-${String(payMonth).padStart(2, '0')}`;
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`${API}/payroll/list?month=${payMonth}&year=${payYear}`);
        const d = await r.json().catch(() => ({}));
        if (cancelled || !d?.success) return;
        const items = Array.isArray(d.items) ? d.items : [];
        // Only the rows that are still awaiting HR action. Once HR uploads
        // the actual payslip via "Upload Report" or "Send to Employee",
        // the row flips to `processed` and disappears from this list.
        setPendingRequests(items.filter(p => String(p.status || '').toLowerCase() === 'pending'));
        // Any generated (non-pending) payslip means a report was already
        // processed for this month → unlock. Pending = a mere request, which
        // does NOT count as an upload.
        const hasProcessed = items.some(p => String(p.status || '').toLowerCase() !== 'pending');
        setMonthHasReport(hasProcessed || uploadedMonths.has(`${payYear}-${String(payMonth).padStart(2, '0')}`));
        // Keep only GENERATED payslips (not bare pending requests) for the
        // Payable Amount lookup.
        setMonthPayslips(items.filter(p => String(p.status || '').toLowerCase() !== 'pending'));
      } catch { /* network / cold-start — non-fatal */ }
    };
    load();
    const t = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [payMonth, payYear]);
  // Reflect a fresh upload immediately (the list poll may lag behind).
  useEffect(() => {
    if (uploadedMonths.has(monthKey)) setMonthHasReport(true);
  }, [uploadedMonths, monthKey]);
  const monthLabel = new Date(payYear, payMonth - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });

  // Gate: payslip generation / download is blocked until the month's report is
  // uploaded. Returns true when allowed; otherwise shows the restricted dialog.
  const requireReport = async () => {
    if (monthHasReport) return true;
    await confirm({
      title: 'Payslip Generation Restricted',
      message: `Please upload the attendance/payroll report for ${monthLabel} before generating or downloading payslips.`,
      confirmLabel: 'Upload report',
      cancelLabel: 'Close',
    });
    return false;
  };

  // Upload an attendance report → backend pulls actual attendance for the
  // chosen month/year and pushes a payslip per employee into the mobile DB.
  // Upload → PARSE (no push). The backend auto-detects Employee vs Labour from
  // the header row, matches each line to an employee, computes the per-type
  // payslip numbers, and returns a preview. HR reviews it in a modal and only
  // then commits. `forceType` lets HR override detection on an unknown layout.
  const parseReportFile = async (file, forceType) => {
    setImportBusy(true);
    showNotification(`Reading ${file.name} for ${monthLabel}…`, 'info');
    try {
      const fd = new FormData();
      fd.append('file',  file);
      fd.append('month', String(payMonth));
      fd.append('year',  String(payYear));
      if (forceType) fd.append('type', forceType);
      const r = await fetch(
        `${API}/payroll/parse-report?month=${payMonth}&year=${payYear}${forceType ? `&type=${forceType}` : ''}`,
        { method: 'POST', body: fd }
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.success) {
        if (data?.unknownFormat) {
          // Offer a manual type choice, then retry with the same file.
          pendingFileRef.current = file;
          const pick = await confirm({
            title: 'Could not recognise this report',
            message: (data.message || '') + '\n\nIs this an Employee report or a Labour report?',
            confirmLabel: 'Employee report',
            cancelLabel:  'Labour report',
          });
          const chosen = pick ? 'employee' : 'labour';
          return parseReportFile(file, chosen);
        }
        showNotification(data?.message || 'Could not read the report', 'error');
        return;
      }
      // A successful read unlocks payslip generation / download for this month.
      setUploadedMonths(prev => new Set(prev).add(monthKey));
      setMonthHasReport(true);
      // Pre-select every matched row for pushing (unmatched can't be pushed).
      const include = new Set();
      (data.rows || []).forEach((row, i) => { if (row.status === 'matched') include.add(i); });
      setImportInclude(include);
      setImportReview({ ...data, fileName: file.name });
    } catch (err) {
      showNotification('Upload failed: ' + (err?.message || 'network error'), 'error');
    } finally {
      setImportBusy(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await parseReportFile(file);
    e.target.value = ''; // allow re-uploading the same file
  };

  // Commit the reviewed rows — push the selected payslips to the ERM apps.
  const commitImport = async () => {
    if (!importReview) return;
    const rowsToPush = (importReview.rows || [])
      .map((row, i) => ({ row, i }))
      .filter(({ row, i }) => row.status === 'matched' && importInclude.has(i))
      .map(({ row }) => ({ ...row.push, name: row.name }));
    if (!rowsToPush.length) {
      showNotification('No matched rows are selected to push.', 'error');
      return;
    }
    setImportBusy(true);
    showNotification(`Pushing ${rowsToPush.length} payslip(s) for ${monthLabel}…`, 'info');
    try {
      const r = await fetch(`${API}/payroll/commit-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: payMonth, year: payYear, reportType: importReview.reportType, rows: rowsToPush }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.success) {
        showNotification(data?.message || 'Could not push payslips', 'error');
        return;
      }
      // Flip matching local rows to "Generated".
      const okNames = (data.results || []).filter(x => x.ok).map(x => String(x.name || '').toLowerCase());
      const okEmpIds = (data.results || []).filter(x => x.ok).map(x => String(x.employeeId || ''));
      const localIds = employees
        .filter(e => okEmpIds.includes(String(e.employeeId || '')) || okNames.includes(String(e.name || '').toLowerCase()))
        .map(e => e.id);
      if (localIds.length) setGeneratedPayrolls(prev => Array.from(new Set([...prev, ...localIds])));
      showNotification(`Pushed ${data.generated}/${data.total} payslip(s) to the ERM apps.`, 'success');
      setImportReview(null);
      setImportInclude(new Set());
    } catch (err) {
      showNotification('Push failed: ' + (err?.message || 'network error'), 'error');
    } finally {
      setImportBusy(false);
    }
  };

  // Push a single payslip to the mobile backend so the employee can see it.
  const sendPayslipToEmployee = async (emp, payload) => {
    try {
      const r = await fetch(`${API}/payroll/push`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          employeeId: emp.employeeId,
          email:      emp.email,
          month:      payMonth,
          year:       payYear,
          monthLabel,
          ...payload,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.success) {
        showNotification(data?.message || 'Could not send payslip', 'error');
        return false;
      }
      showNotification(`Payslip sent to ${emp.name} for ${monthLabel}.`, 'success');
      return true;
    } catch (err) {
      showNotification('Send failed: ' + (err?.message || 'network error'), 'error');
      return false;
    }
  };

  // 3-Month Salary Increment Eligibility logic
  const checkEligibility = (emp) => {
    if (emp.salaryIncrementApplied) return false;
    if (!emp.joiningDate) return false;
    const joinDate = new Date(emp.joiningDate);
    const currentDate = new Date('2026-05-19'); // match system default current date
    const diffTime = Math.abs(currentDate - joinDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 90; // 3 months is roughly 90 days
  };

  /**
   * Official Tesco Structures salary breakdown for one employee.
   *
   * Earnings  = Basic + DA (50% of gross) + HRA (the remaining 50%)
   * Deductions = PF + Professional Tax (read from the employee record; 0 if unset)
   * Net Pay   = Total Earnings - Total Deductions
   *
   * NO Conveyance / Special / Performance Incentive / TDS — the payslip mirrors
   * the original ERM payslip exactly. Values are fetched dynamically from the
   * employee's salary; nothing is hardcoded.
   */
  const computePayslip = (emp) => {
    const gross   = Number(emp.salary) || 0;
    const basic   = Math.round(gross / 2);        // Basic + DA
    const hra     = gross - basic;                // HRA (keeps basic + hra === gross)
    const pf      = Number(emp.pf ?? emp.providentFund ?? emp.epf ?? 0) || 0;
    const pt      = Number(emp.professionalTax ?? emp.profTax ?? emp.pt ?? 0) || 0;
    const totalDed = pf + pt;
    const net      = gross - totalDed;
    // `basic` is Basic + DA; `pt` is Professional Tax. `ctc`/`gross` are Total
    // Earnings. No other components exist on the payslip.
    return { ctc: gross, gross, basic, hra, pf, pt, totalDed, net };
  };

  // ₹ amount → Indian-system words (e.g. 32400 → "Thirty Two Thousand Four
  // Hundred"). Used for the "In Words" line on the payslip.
  const amountToWords = (value) => {
    let num = Math.round(Number(value) || 0);
    if (num === 0) return 'Zero';
    const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
      'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const two = (n) => (n < 20 ? a[n] : (b[Math.floor(n / 10)] + (n % 10 ? ' ' + a[n % 10] : '')));
    const three = (n) => {
      const h = Math.floor(n / 100), r = n % 100;
      return (h ? a[h] + ' Hundred' + (r ? ' ' : '') : '') + (r ? two(r) : '');
    };
    let words = '';
    const crore = Math.floor(num / 10000000); num %= 10000000;
    const lakh = Math.floor(num / 100000); num %= 100000;
    const thou = Math.floor(num / 1000); num %= 1000;
    if (crore) words += three(crore) + ' Crore ';
    if (lakh)  words += two(lakh) + ' Lakh ';
    if (thou)  words += two(thou) + ' Thousand ';
    if (num)   words += three(num);
    return words.trim();
  };

  /**
   * Build a one-page Tesco Structures LLP payslip PDF for one employee — an
   * exact replica of the official ERM payslip: black header band with the
   * Tesco Structures logo + green chevron, company name + address, green
   * PAY SLIP band, bordered info grid, Earnings (Basic + DA, HRA) / Rate /
   * Amount + Deductions (PF, Professional Tax) table, green NET PAY band,
   * amount in words, and a green footer band. Caller decides whether to
   * .save() (download) or .output('blob') (preview).
   */
  /**
   * Low-level payslip renderer — draws the exact Tesco Structures layout from
   * EXPLICIT values so both the per-employee flow (buildPayslipPdf) and the
   * imported-report review produce byte-identical PDFs. `earningsRows` /
   * `deductionsRows` are arrays of [label, amount]; `gross` is Total Earnings,
   * `totalDed` is Total Deductions, `net` is the Net Pay.
   */
  const renderPayslip = ({
    employeeId, name, designation, department,
    paidDays, balAdvance,
    earningsRows, deductionsRows, gross, totalDed, net,
  }) => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const M = 40;
    const contentW = pageW - 2 * M;

    const GREEN = [122, 192, 67];   // Tesco Structures lime green (payslip bands)
    const BLACK = [17, 17, 17];
    const INK   = [30, 41, 59];
    const BORDER = [0, 0, 0];   // black box/table borders
    // No thousands separators — matches the official payslip exactly (16200.00).
    const inr = (n) => (Number(n) || 0).toFixed(2);

    // ── Header: FULL-BLEED black banner (no padding, no rounded corners) with
    //    the Tesco Structures logo on the left and the green angular shapes on
    //    the right — a medium-green block with a diagonal seam plus a brighter
    //    green triangular connector, matching the official banner exactly. ──
    const GREEN_BRIGHT = [143, 208, 74];   // connector wedge (lighter)
    const HH = 100;                        // banner height
    doc.setFillColor(0, 0, 0);
    doc.rect(0, 0, pageW, HH, 'F');        // full-width black, flush to the edges

    // Main medium-green block (right), left edge slanted (wider at the top).
    const medTopX = pageW - 223, medBotX = pageW - 143;
    doc.setFillColor(GREEN[0], GREEN[1], GREEN[2]);
    doc.triangle(medTopX, 0, pageW, 0, pageW, HH, 'F');
    doc.triangle(medTopX, 0, pageW, HH, medBotX, HH, 'F');
    // Bright green triangular connector at the seam (pokes left into the black).
    const brightLeftX = pageW - 257;
    doc.setFillColor(GREEN_BRIGHT[0], GREEN_BRIGHT[1], GREEN_BRIGHT[2]);
    doc.triangle(brightLeftX, 0, medBotX, 0, medBotX, HH, 'F');

    // Tesco Structures logo (recoloured white-on-transparent, green arrow kept),
    // left, at its original proportions, vertically centred in the banner.
    const lg = logoDataUrlRef.current;
    if (lg) {
      try {
        const pr = doc.getImageProperties(lg);
        const lh = 58;                                   // logo height
        const lw = pr?.width ? (pr.width / pr.height) * lh : 216;
        doc.addImage(lg, 'PNG', 34, (HH - lh) / 2, lw, lh);
      } catch { /* logo omitted if it fails to load */ }
    }

    // ── Company name + address (centred) ──
    let y = HH + 24;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(INK[0], INK[1], INK[2]);
    doc.text('TESCO STRUCTURES LLP', pageW / 2, y, { align: 'center' });
    y += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);   // black address line
    doc.text('37, 15th St, Gandhi Nagar, Ashok Nagar, Chennai - 600 083', pageW / 2, y, { align: 'center' });

    // ── PAY SLIP band (green) ──
    y += 16;
    doc.setFillColor(GREEN[0], GREEN[1], GREEN[2]);
    doc.rect(M, y, contentW, 22, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text(`PAY SLIP - ${String(monthLabel).toUpperCase()}`, pageW / 2, y + 15, { align: 'center' });
    y += 22;

    // ── Employee info grid (4 cols x 3 rows, bordered) ──
    const balAdv = balAdvance;
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      theme: 'grid',
      styles: { fontSize: 9.5, cellPadding: 6, lineColor: BORDER, lineWidth: 0.5, textColor: INK },
      columnStyles: {
        0: { cellWidth: contentW * 0.19, fontStyle: 'bold', fillColor: [237, 245, 233] },
        1: { cellWidth: contentW * 0.31 },
        2: { cellWidth: contentW * 0.19, fontStyle: 'bold', fillColor: [237, 245, 233] },
        3: { cellWidth: contentW * 0.31 },
      },
      body: [
        ['Employee ID', employeeId || '-', 'Employee Name', name || '-'],
        ['Designation', designation || '-', 'Department', department || '-'],
        ['Paid Days', String(paidDays ?? '-'), 'Bal. Advance', balAdv == null || balAdv === '' ? '0.00' : inr(balAdv)],
      ],
    });
    y = doc.lastAutoTable.finalY + 12;

    // ── Earnings / Deductions table (ONLY the official line items) ──
    const earnings   = earningsRows;
    const deductions = deductionsRows;
    const rows = [];
    const nRows = Math.max(earnings.length, deductions.length);
    for (let i = 0; i < nRows; i++) {
      const e = earnings[i], d = deductions[i];
      rows.push([
        e ? e[0] : '', e ? inr(e[1]) : '', e ? inr(e[1]) : '',
        d ? d[0] : '', d ? inr(d[1]) : '',
      ]);
    }
    // Airy fixed-height earnings block (empty rows, like the official payslip).
    for (let i = 0; i < 3; i++) rows.push(['', '', '', '', '']);
    rows.push([
      { content: 'Total', styles: { fontStyle: 'bold' } },
      { content: inr(gross), styles: { fontStyle: 'bold' } },
      { content: inr(gross), styles: { fontStyle: 'bold' } },
      { content: 'Total', styles: { fontStyle: 'bold' } },
      { content: inr(totalDed), styles: { fontStyle: 'bold' } },
    ]);
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      theme: 'grid',
      head: [['Earnings', 'Rate (Rs.)', 'Amount (Rs.)', 'Deductions', 'Amount (Rs.)']],
      body: rows,
      styles: { fontSize: 9.5, cellPadding: 6, lineColor: BORDER, lineWidth: 0.5, textColor: INK },
      headStyles: { fillColor: BLACK, textColor: 255, fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 4: { halign: 'right' } },
    });
    y = doc.lastAutoTable.finalY;

    // ── NET PAY band (green) ──
    doc.setFillColor(GREEN[0], GREEN[1], GREEN[2]);
    doc.rect(M, y, contentW, 26, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.text('NET PAY', M + 10, y + 17);
    doc.text(`Rs. ${inr(net)}`, pageW - M - 10, y + 17, { align: 'right' });
    y += 26;

    // ── Amount in words (bordered) ──
    doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    doc.setLineWidth(0.5);
    doc.rect(M, y, contentW, 24);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(INK[0], INK[1], INK[2]);
    doc.text('In Words:', M + 10, y + 15);
    doc.setFont('helvetica', 'normal');
    doc.text(`Rupees ${amountToWords(net)} Only`, M + 62, y + 15);
    y += 24 + 18;

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(120, 130, 145);
    doc.text('This is a computer-generated payslip; no signature is required.', pageW / 2, y, { align: 'center' });

    // ── Footer: full-width BLACK band with a green top rule (like the official
    //    payslip), two lines each side, vertically centred. ──
    const fbH = 46;
    const fTop = pageH - fbH;
    const l1 = fTop + fbH / 2 - 4;   // first line baseline
    const l2 = fTop + fbH / 2 + 9;   // second line baseline
    doc.setFillColor(GREEN[0], GREEN[1], GREEN[2]);
    doc.rect(0, fTop - 3, pageW, 3, 'F');   // green accent rule on top
    doc.setFillColor(0, 0, 0);
    doc.rect(0, fTop, pageW, fbH, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text('www.tescostructures.com   |   tescostructures@gmail.com', M, l1);
    doc.text('+91 90033 28225   |   +91 90033 28229', M, l2);
    doc.text('37, 15th St, Gandhi Nagar, Ashok Nagar,', pageW - M, l1, { align: 'right' });
    doc.text('Chennai, Tamil Nadu - 600 083', pageW - M, l2, { align: 'right' });

    return doc;
  };

  /**
   * Per-employee payslip (table "Payslip" button). Uses the employee's salary
   * structure: Basic + DA (50%), HRA (rest), PF + Professional Tax.
   */
  const buildPayslipPdf = (emp) => {
    const p = computePayslip(emp);          // kept for the mobile-push payload
    // No attendance is attached to this per-employee flow, so default Paid Days
    // to the number of calendar days in the selected pay month.
    const daysInPayMonth = new Date(payYear, payMonth, 0).getDate();
    const doc = renderPayslip({
      employeeId:  emp.employeeId,
      name:        emp.name,
      designation: emp.designation || emp.role,
      department:  emp.department || emp.dept,
      paidDays:    emp.paidDays ?? emp.paid_days ?? daysInPayMonth,
      balAdvance:  emp.balanceAdvance ?? emp.balAdvance ?? emp.advanceBalance,
      earningsRows:   [['Basic + DA', p.basic], ['HRA', p.hra]],
      deductionsRows: [['PF', p.pf], ['Professional Tax', p.pt]],
      gross: p.gross, totalDed: p.totalDed, net: p.net,
    });
    return { doc, computed: p };
  };

  /**
   * Payslip for a parsed import row (Employee OR Labour). The row already
   * carries the exact earnings/deductions that get pushed, so the PDF, the
   * review table and the stored record all agree. For labour, `earnings.basicDA`
   * holds the wages and `earnings.hra` holds the OT amount (same table labels).
   */
  const buildImportPayslipPdf = (row) => {
    const gross = (Number(row.earnings?.basicDA) || 0) + (Number(row.earnings?.hra) || 0);
    const totalDed = (Number(row.deductions?.pf) || 0) + (Number(row.deductions?.pt) || 0);
    return renderPayslip({
      employeeId:  row.employeeId,
      name:        row.name,
      designation: row.designation,
      department:  row.department,
      paidDays:    row.paidDays,
      balAdvance:  row.balAdvance,
      earningsRows:   [['Basic + DA', row.earnings?.basicDA || 0], ['HRA', row.earnings?.hra || 0]],
      deductionsRows: [['PF', row.deductions?.pf || 0], ['Professional Tax', row.deductions?.pt || 0]],
      gross, totalDed, net: Number(row.net) || (gross - totalDed),
    });
  };

  /**
   * Click handler for the "Payslip" table button — saves a PDF for this
   * employee AND pushes the same numbers to mobile so the employee can
   * also download it from the app.
   */
  const downloadPayslip = async (emp) => {
    // Gate: no payslip unless the month's report is uploaded AND this employee
    // is in it.
    if (!(await canIssuePayslip(emp))) return;
    let computed;
    // Build + save the PDF first — local action, never blocked by network.
    try {
      const built = buildPayslipPdf(emp);
      computed = built.computed;
      const safeName = String(emp.name || 'employee').replace(/[^\w]+/g, '_');
      built.doc.save(`Payslip_${safeName}_${monthLabel.replace(/\s+/g, '_')}.pdf`);
      // Mark Generated immediately so HR sees status flip even if the
      // mobile push fails (e.g., backend offline).
      if (!generatedPayrolls.includes(emp.id)) {
        setGeneratedPayrolls(prev => [...prev, emp.id]);
      }
    } catch (err) {
      showNotification('Could not build payslip PDF: ' + (err?.message || 'unknown error'), 'error');
      return;
    }

    // Then fire-and-forget push to mobile so the employee sees it in the app.
    try {
      await sendPayslipToEmployee(emp, {
        earnings: {
          basicSalary:      computed.basic,   // Basic + DA
          hraAllowance:     computed.hra,
          performanceBonus: 0,
          otherEarnings:    0,
        },
        deductions: {
          incomeTax:       0,                 // no TDS on this payslip
          providentFund:   computed.pf,       // PF
          healthInsurance: 0,
          lopDeduction:    0,
          otherDeductions: computed.pt,       // Professional Tax
        },
      });
    } catch {
      /* sendPayslipToEmployee already toasts on failure */
    }
  };

  // Manually map an unmatched import row to an HRMS employee. Recomputes the
  // row's payslip numbers (mirrors the backend's per-type logic) and flips it
  // to matched so it can be pushed. Passing an empty id reverts to unmatched.
  const assignEmployee = (rowIndex, empIdStr) => {
    if (!importReview) return;
    const rows = importReview.rows.slice();
    const row = { ...rows[rowIndex] };
    const emp = employees.find(e => String(e.id) === String(empIdStr));
    if (!emp) {
      row.status = 'unmatched';
      row.employeeId = '';
      delete row.push; delete row.earnings; delete row.deductions; delete row.net;
      row.flags = [];
      rows[rowIndex] = row;
      setImportReview({ ...importReview, rows });
      setImportInclude(prev => { const n = new Set(prev); n.delete(rowIndex); return n; });
      return;
    }
    const pf = Number(emp.pf ?? emp.providentFund ?? 0) || 0;
    const pt = Number(emp.professionalTax ?? emp.profTax ?? 0) || 0;
    const raw = row.raw || {};
    const inr = (n) => (Number(n) || 0).toLocaleString('en-IN');
    let earnings, net, flags = [];
    if (row.reportType === 'labour') {
      const wages = Math.round((Number(raw.workingDays) || 0) * (Number(raw.perDay) || 0));
      const ot = Number(raw.otAmount) || 0;
      net = wages + ot - pf - pt;
      earnings = { basicDA: wages, hra: ot };
      const reportTotal = Number(raw.totalAmount) || 0;
      if (Number(raw.perDay) <= 0) flags.push('Per Day Salary is 0 in the report — wages compute to 0.');
      if (reportTotal > 0 && Math.abs(reportTotal - (wages + ot)) > 1)
        flags.push(`Report Total ₹${inr(reportTotal)} ≠ (days×rate + OT) ₹${inr(wages + ot)} — review.`);
    } else {
      const gross = Number(emp.salary) || 0;
      const basic = Math.round(gross / 2);
      const hra = gross - basic;
      net = gross - pf - pt;
      earnings = { basicDA: basic, hra };
      const reportSalary = Number(raw.salaryAmount) || 0;
      if (gross <= 0) flags.push('No salary on employee record — earnings are 0.');
      if (reportSalary > 0 && Math.abs(reportSalary - net) > 1)
        flags.push(`Report Salary Amount ₹${inr(reportSalary)} ≠ structure net ₹${inr(net)} — review.`);
    }
    row.status = 'matched';
    row.assignedManually = true;
    row.employeeId = emp.employeeId || '';
    row.department = emp.department || emp.dept || '';
    row.designation = row.designation || emp.designation || emp.role || '';
    row.earnings = earnings;
    row.deductions = { pf, pt };
    row.net = net;
    row.flags = flags;
    row.push = {
      employeeId: emp.employeeId || undefined,
      userId: String(emp.id || '') || undefined,
      email: emp.email || undefined,
      earnings:   { basicSalary: earnings.basicDA, hraAllowance: earnings.hra, performanceBonus: 0, otherEarnings: 0 },
      deductions: { incomeTax: 0, providentFund: pf, healthInsurance: 0, lopDeduction: 0, otherDeductions: pt },
    };
    rows[rowIndex] = row;
    setImportReview({ ...importReview, rows });
    setImportInclude(prev => { const n = new Set(prev); n.add(rowIndex); return n; });
  };

  const eligibleEmployees = employees.filter(checkEligibility);

  // Payable Amount lookup — net pay from the generated payslip for the selected
  // month, keyed by every identifier we might match an employee on.
  const sumVals = (o) => (o ? Object.values(o).reduce((a, b) => a + (Number(b) || 0), 0) : 0);
  const payableIndex = (() => {
    const byId = {}, byEmpId = {}, byEmail = {}, byName = {};
    (monthPayslips || []).forEach(p => {
      const net = p.netPay != null ? Number(p.netPay) : (sumVals(p.earnings) - sumVals(p.deductions));
      const u = p.user || {};
      const uid = String(u._id || p.userId || '');
      const eid = String(u.employeeId || p.employeeId || '').toLowerCase();
      const em  = String(u.email || p.email || '').toLowerCase();
      const nm  = String(u.name || [u.firstName, u.lastName].filter(Boolean).join(' ') || p.name || '').toLowerCase().trim();
      if (uid) byId[uid] = net;
      if (eid) byEmpId[eid] = net;
      if (em)  byEmail[em] = net;
      if (nm)  byName[nm] = net;
    });
    return { byId, byEmpId, byEmail, byName };
  })();
  const payableFor = (emp) => {
    const i = payableIndex;
    const uid = String(emp.id || '');
    const eid = String(emp.employeeId || '').toLowerCase();
    const em  = String(emp.email || '').toLowerCase();
    const nm  = String(emp.name || '').toLowerCase().trim();
    if (uid && i.byId[uid] != null) return i.byId[uid];
    if (eid && i.byEmpId[eid] != null) return i.byEmpId[eid];
    if (em && i.byEmail[em] != null) return i.byEmail[em];
    if (nm && i.byName[nm] != null) return i.byName[nm];
    return null;
  };

  // Guard for issuing a payslip to one employee. Requires (1) the month's
  // report to be uploaded AND (2) this employee to actually be present in that
  // report (has a payable). Employees shown as "Not in report" are blocked.
  const canIssuePayslip = async (emp) => {
    if (!(await requireReport())) return false;
    if (payableFor(emp) == null) {
      await confirm({
        title: 'Employee not in the uploaded report',
        message: `${emp.name} is not included in the attendance/payroll report for ${monthLabel}, so a payslip can't be generated or downloaded for them. Upload a report that includes ${emp.name} first.`,
        confirmLabel: 'OK',
        cancelLabel: 'Close',
      });
      return false;
    }
    return true;
  };

  // Delete the uploaded report for the selected month (HR/Admin only). Removes
  // the month's generated payslips and re-locks the month until a new upload.
  const deleteReport = async () => {
    if (!canManageReports) return;
    const ok = await confirm({
      title: 'Delete report for this month?',
      message:
        `Month: ${monthLabel}\n\n` +
        `This removes the uploaded report and the payslips generated from it for ` +
        `${monthLabel}, and locks the month until a new report is uploaded. ` +
        `Employee records and other months' payslip history are NOT affected.`,
      confirmLabel: 'Delete report',
      cancelLabel: 'Cancel',
      destructive: true,
    });
    if (!ok) return;
    setImportBusy(true);
    try {
      const r = await fetch(`${API}/payroll/delete-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: payMonth, year: payYear }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.success) {
        showNotification(data?.message || 'Could not delete the report', 'error');
        return;
      }
      // Re-lock the month locally and refresh.
      setUploadedMonths(prev => { const n = new Set(prev); n.delete(monthKey); return n; });
      setMonthHasReport(false);
      setMonthPayslips([]);
      setGeneratedPayrolls([]);
      showNotification(`Report for ${monthLabel} deleted (${data.deleted || 0} payslip${data.deleted === 1 ? '' : 's'} removed). Month is locked until a new report is uploaded.`, 'success');
    } catch (err) {
      showNotification('Delete failed: ' + (err?.message || 'network error'), 'error');
    } finally {
      setImportBusy(false);
    }
  };

  // Search filter
  // An employee is terminated when their employment status says so (or the
  // record is explicitly inactive with a Terminated status). Terminated staff
  // are still shown — so their payroll history/payslips are preserved — but
  // flagged clearly and never treated as active for new payroll.
  const isTerminated = (emp) =>
    String(emp.status || '').toLowerCase() === 'terminated' ||
    (emp.isActive === false && String(emp.status || '').toLowerCase().includes('terminat'));

  const filteredEmployees = employees
    .filter(emp =>
      emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (emp.employeeId || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (emp.dept || '').toLowerCase().includes(searchQuery.toLowerCase())
    )
    // Active first, terminated pushed to the bottom (order otherwise preserved).
    .sort((a, b) => (isTerminated(a) ? 1 : 0) - (isTerminated(b) ? 1 : 0));


  return (
    <div className="emp-list-page">
      <div className="emp-list-header">
        <div className="ne-breadcrumb">
          <span className="ne-breadcrumb-link" onClick={onBack}>Dashboard</span>
          <ChevronRight size={13} />
          <span>Payroll</span>
        </div>
        <div className="emp-list-title-row">
          <div>
            <h1 className="ne-page-title">Payroll Management</h1>
            <p className="ne-page-sub">Manage Indian salaries, PF, TDS, and financial distribution.</p>
          </div>
        </div>
      </div>




      {/* Pending Payslip Requests — what employees have asked for via ERM. */}
      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>
          <div>
            <div className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              Payslip Requests
              <span style={{
                fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999,
                background: pendingRequests.length ? '#FEF3C7' : '#F1F5F9',
                color:      pendingRequests.length ? '#92400E' : '#64748B',
              }}>{pendingRequests.length} pending</span>
            </div>
            <div className="card-subtitle">Filed by employees on ERM Mobile / ERM Web for {monthLabel}.</div>
          </div>
        </div>
        {pendingRequests.length === 0 ? (
          <div style={{ padding: '18px 24px', fontSize: 12.5, color: 'var(--text-light)' }}>
            No payslip requests for {monthLabel}. Employees will appear here the moment they tap “Request payslip”.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="emp-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Emp ID</th>
                  <th>Requested for</th>
                  <th>Requested at</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pendingRequests.map((p) => {
                  const u = p.user || {};
                  const name = u.name || ((u.firstName || '') + ' ' + (u.lastName || '')).trim() || '—';
                  const eid  = u.employeeId || '—';
                  const requestedAt = p.createdAt || p.requestedAt || p.updatedAt;
                  const fmt = (iso) => {
                    if (!iso) return '—';
                    const d = new Date(iso);
                    if (isNaN(d.getTime())) return '—';
                    return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
                  };
                  return (
                    <tr key={p._id || (eid + '-' + p.month + '-' + p.year)}>
                      <td><div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)' }}>{name}</div></td>
                      <td><div style={{ fontSize: 12, color: 'var(--text-light)' }}>{eid}</div></td>
                      <td><div style={{ fontSize: 12 }}>{p.monthLabel || `${p.month}/${p.year}`}</div></td>
                      <td><div style={{ fontSize: 12 }}>{fmt(requestedAt)}</div></td>
                      <td>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
                          background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A',
                        }}>Pending HR</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="announcement-filters" style={{ marginTop: '30px' }}>
        <div className="topbar-search" style={{ flex: 1, maxWidth: '400px' }}>
          <Search size={15} />
          <input 
            placeholder="Search payroll records..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="emp-list-actions" style={{ display: 'flex', gap: '12px' }}>
          <label className="ne-btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '600' }}>
            <Upload size={14} /> Upload Report
            <input type="file" style={{ display: 'none' }} accept=".csv,.xlsx" onChange={handleFileUpload} />
          </label>
          {canManageReports && monthHasReport && (
            <button
              onClick={deleteReport}
              disabled={importBusy}
              title={`Delete the uploaded report for ${monthLabel}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: importBusy ? 'not-allowed' : 'pointer', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', opacity: importBusy ? 0.6 : 1 }}
            >
              <Trash2 size={14} /> Delete Report
            </button>
          )}
          <select
            className="ne-btn-secondary"
            value={`${payYear}-${String(payMonth).padStart(2,'0')}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split('-').map(Number);
              setPayYear(y);
              setPayMonth(m);
            }}
            style={{ padding: '8px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: 600 }}
          >
            {(() => {
              // Company started in April 2025 — months before that don't
              // exist on the payroll side, so we don't list them. CEILING
              // is the PREVIOUS calendar month: payroll is only generated
              // after the month is fully over, so an in-progress month
              // (e.g. June while today is June 18) is never offered.
              const FLOOR = new Date(2025, 3, 1);   // April 2025
              const now   = new Date();
              const CEIL  = new Date(now.getFullYear(), now.getMonth() - 1, 1);
              const opts  = [];
              for (let d = new Date(FLOOR); d <= CEIL; d.setMonth(d.getMonth() + 1)) {
                const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`;
                const lbl = d.toLocaleString('default', { month: 'long', year: 'numeric' });
                opts.push(<option key={val} value={val}>{lbl}</option>);
              }
              // Most-recent month first.
              return opts.reverse();
            })()}
          </select>
        </div>
      </div>

      <div className="emp-table-card" style={{ marginTop: '20px', overflow: 'visible', maxHeight: 'none', flex: 'none' }}>
        <table className="emp-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Pay Period</th>
              <th>Monthly Salary</th>
              <th>Payable Amount</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.map(emp => {
              // Monthly Salary = the employee's original saved salary (master
              // record), shown as-is. Payable Amount = net pay from the HR-
              // uploaded report for this month; "Report Not Uploaded" until then.
              const monthlySalary = Number(emp.salary) || 0;
              const payable = payableFor(emp);
              const terminated = isTerminated(emp);

              return (
                <tr key={emp.id} style={terminated ? { background: '#fef2f2', opacity: 0.85 } : undefined}>
                  <td>
                    <div className="emp-table-user">
                      <div className="emp-table-avatar" style={{ background: (terminated ? '#9ca3af' : emp.color) + '20', color: terminated ? '#6b7280' : emp.color }}>{emp.initials}</div>
                      <div>
                        <div className="emp-table-name">{emp.name}</div>
                        {terminated && (
                          <div style={{ fontSize: 10.5, fontWeight: 700, color: '#b91c1c', letterSpacing: 0.3 }}>Terminated employee</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td><div className="emp-table-dept">{monthLabel}</div></td>
                  <td><div className="emp-table-dept">₹{monthlySalary.toLocaleString()}.00</div></td>
                  <td>
                    {payable != null ? (
                      <div className="emp-table-dept" style={{ fontWeight: 700, color: '#166534' }}>₹{Number(payable).toLocaleString()}.00</div>
                    ) : (
                      <div className="emp-table-dept" style={{ fontSize: 11.5, fontWeight: 600, color: monthHasReport ? '#64748b' : '#9a3412' }}>
                        {monthHasReport ? 'Not in report' : 'Report Not Uploaded'}
                      </div>
                    )}
                  </td>
                  <td>
                    {terminated ? (
                      <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 800, letterSpacing: 0.4, color: '#fff', background: '#dc2626', padding: '3px 10px', borderRadius: 999 }}>TERMINATED</span>
                    ) : generatedPayrolls.includes(emp.id) ? (
                      <span className="dash-emp-status present">Generated</span>
                    ) : (
                      <span className="dash-emp-status absent">Pending</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="emp-table-btn" onClick={() => setShowEditSlip(emp)}>
                        Edit
                      </button>
                      <button
                        className="emp-table-btn"
                        title="Download payslip PDF and send to employee's mobile ERM"
                        onClick={() => downloadPayslip(emp)}
                      >
                        <Download size={14} /> Payslip
                      </button>
                      <button
                        className="emp-table-btn"
                        title="Preview payslip"
                        onClick={async () => { if (await canIssuePayslip(emp)) setShowSlip(emp); }}
                      >
                        <FileText size={14} />
                      </button>
                      <button
                        className="ne-btn-primary"
                        disabled={terminated}
                        title={terminated ? 'Employee is terminated — new payroll is disabled. History is preserved.' : 'Create payroll'}
                        style={{ padding: '4px 10px', height: '28px', fontSize: '12px', opacity: terminated ? 0.45 : 1, cursor: terminated ? 'not-allowed' : 'pointer' }}
                        onClick={async () => {
                          if (terminated) return;
                          if (!(await requireReport())) return;
                          setCreateEmpId(emp.employeeId || 'EMP-10' + emp.id);
                          setShowProcessPanel(true);
                        }}
                      >
                        <DollarSign size={14} /> Create Payroll
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Imported-report review modal ─────────────────────────────────
          HR reviews matched / unmatched / flagged rows parsed from the
          uploaded Employee or Labour report before any payslip is pushed. */}
      {importReview && (() => {
        const rev = importReview;
        const isLabour = rev.reportType === 'labour';
        const money = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN');
        const selectedCount = (rev.rows || []).filter((row, i) => row.status === 'matched' && importInclude.has(i)).length;
        // Live counts (recomputed after manual assignments, not the static server summary).
        const liveMatched   = (rev.rows || []).filter(r => r.status === 'matched').length;
        const liveUnmatched = (rev.rows || []).filter(r => r.status === 'unmatched').length;
        const liveFlagged   = (rev.rows || []).filter(r => r.status === 'matched' && r.flags && r.flags.length).length;
        // Employees offered in the "assign" picker, sorted by name.
        const empOptions = [...employees].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
        const toggle = (i) => {
          setImportInclude(prev => {
            const next = new Set(prev);
            next.has(i) ? next.delete(i) : next.add(i);
            return next;
          });
        };
        const allMatchedIdx = (rev.rows || []).map((r, i) => (r.status === 'matched' ? i : -1)).filter(i => i >= 0);
        const allSelected = allMatchedIdx.length > 0 && allMatchedIdx.every(i => importInclude.has(i));
        const toggleAll = () => setImportInclude(allSelected ? new Set() : new Set(allMatchedIdx));
        return (
          <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
               onClick={(e) => { if (e.target === e.currentTarget && !importBusy) setImportReview(null); }}>
            <div style={{ background: '#fff', borderRadius: 14, width: 'min(1040px, 96vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
              {/* header */}
              <div style={{ padding: '18px 22px', borderBottom: '1px solid #eef0f3', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0f172a' }}>Review payroll import</h2>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: .4, padding: '3px 10px', borderRadius: 999, color: '#fff', background: isLabour ? '#0ea5e9' : '#7ac043' }}>
                      {isLabour ? 'LABOUR REPORT' : 'EMPLOYEE REPORT'}
                    </span>
                  </div>
                  <div style={{ marginTop: 5, fontSize: 12, color: '#64748b' }}>
                    {rev.fileName} · {monthLabel}
                  </div>
                </div>
                <button onClick={() => !importBusy && setImportReview(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={20} /></button>
              </div>

              {/* summary chips */}
              <div style={{ display: 'flex', gap: 10, padding: '12px 22px', flexWrap: 'wrap', borderBottom: '1px solid #f1f5f9' }}>
                {[
                  ['Rows', rev.rows.length, '#334155', '#f1f5f9'],
                  ['Matched', liveMatched, '#166534', '#dcfce7'],
                  ['Unmatched', liveUnmatched, '#9a3412', '#ffedd5'],
                  ['Flagged', liveFlagged, '#92400e', '#fef3c7'],
                ].map(([label, val, fg, bg]) => (
                  <div key={label} style={{ padding: '6px 12px', borderRadius: 8, background: bg, color: fg, fontSize: 12, fontWeight: 600 }}>
                    {label}: {val}
                  </div>
                ))}
              </div>

              {/* table */}
              <div style={{ overflow: 'auto', padding: '0 22px', flex: 1 }}>
                <table className="emp-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: '#475569' }}>
                      <th style={{ padding: '10px 6px' }}><input type="checkbox" checked={allSelected} onChange={toggleAll} title="Select all matched" /></th>
                      <th style={{ padding: '10px 6px' }}>Name</th>
                      <th style={{ padding: '10px 6px' }}>Emp ID</th>
                      <th style={{ padding: '10px 6px' }}>Designation</th>
                      <th style={{ padding: '10px 6px' }}>Paid Days</th>
                      {isLabour ? (
                        <>
                          <th style={{ padding: '10px 6px', textAlign: 'right' }}>Wages</th>
                          <th style={{ padding: '10px 6px', textAlign: 'right' }}>OT</th>
                        </>
                      ) : (
                        <>
                          <th style={{ padding: '10px 6px', textAlign: 'right' }}>Basic+DA</th>
                          <th style={{ padding: '10px 6px', textAlign: 'right' }}>HRA</th>
                        </>
                      )}
                      <th style={{ padding: '10px 6px', textAlign: 'right' }}>Deductions</th>
                      <th style={{ padding: '10px 6px', textAlign: 'right' }}>Net Pay</th>
                      <th style={{ padding: '10px 6px' }}>Status</th>
                      <th style={{ padding: '10px 6px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(rev.rows || []).map((row, i) => {
                      const matched = row.status === 'matched';
                      const flagged = matched && row.flags && row.flags.length;
                      const bg = !matched ? '#fff7ed' : flagged ? '#fffbeb' : 'transparent';
                      return (
                        <tr key={i} style={{ background: bg, borderTop: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '9px 6px' }}>
                            <input type="checkbox" disabled={!matched} checked={matched && importInclude.has(i)} onChange={() => toggle(i)} />
                          </td>
                          <td style={{ padding: '9px 6px', fontWeight: 600, color: '#0f172a' }}>{row.name || '—'}</td>
                          <td style={{ padding: '9px 6px', color: '#475569' }}>{row.employeeId || '—'}</td>
                          <td style={{ padding: '9px 6px', color: '#475569' }}>{row.designation || '—'}</td>
                          <td style={{ padding: '9px 6px' }}>{row.paidDays ?? '—'}</td>
                          <td style={{ padding: '9px 6px', textAlign: 'right' }}>{matched ? money(row.earnings?.basicDA) : '—'}</td>
                          <td style={{ padding: '9px 6px', textAlign: 'right' }}>{matched ? money(row.earnings?.hra) : '—'}</td>
                          <td style={{ padding: '9px 6px', textAlign: 'right' }}>{matched ? money((row.deductions?.pf || 0) + (row.deductions?.pt || 0)) : '—'}</td>
                          <td style={{ padding: '9px 6px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{matched ? money(row.net) : '—'}</td>
                          <td style={{ padding: '9px 6px' }}>
                            {!matched ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <span title="No matching employee in HRMS — pick one to include" style={{ fontSize: 10, fontWeight: 700, color: '#9a3412' }}>UNMATCHED</span>
                                <select
                                  defaultValue=""
                                  onChange={(e) => assignEmployee(i, e.target.value)}
                                  style={{ fontSize: 11, padding: '3px 4px', borderRadius: 6, border: '1px solid #fdba74', maxWidth: 150 }}
                                  title="Assign this row to an employee"
                                >
                                  <option value="">Assign employee…</option>
                                  {empOptions.map(e => (
                                    <option key={e.id} value={e.id}>{e.name}{e.employeeId ? ` (${e.employeeId})` : ''}</option>
                                  ))}
                                </select>
                              </div>
                            ) : flagged ? (
                              <span title={row.flags.join('\n')} style={{ fontSize: 11, fontWeight: 700, color: '#b45309', cursor: 'help' }}>⚠ FLAGGED{row.assignedManually ? ' ·assigned' : ''}</span>
                            ) : (
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#166534' }}>OK{row.assignedManually ? ' ·assigned' : ''}</span>
                            )}
                          </td>
                          <td style={{ padding: '9px 6px' }}>
                            {matched && (
                              <button className="emp-table-btn" title="Preview / download this payslip" onClick={() => { try { buildImportPayslipPdf(row).save(`Payslip_${String(row.name || 'employee').replace(/[^\w]+/g, '_')}_${monthLabel.replace(/\s+/g, '_')}.pdf`); } catch (err) { showNotification('PDF failed: ' + err.message, 'error'); } }}>
                                <Download size={13} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {liveFlagged > 0 && (
                  <div style={{ margin: '12px 0 16px', padding: '10px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 6 }}>⚠ Flags for HR review</div>
                    {(rev.rows || []).filter(r => r.status === 'matched' && r.flags && r.flags.length).map((r, k) => (
                      <div key={k} style={{ fontSize: 11.5, color: '#78350f', marginBottom: 3 }}>
                        <b>{r.name}:</b> {r.flags.join(' ')}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* footer */}
              <div style={{ padding: '14px 22px', borderTop: '1px solid #eef0f3', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  {selectedCount} selected · unmatched rows are skipped. Flagged rows push with the salary-structure values; adjust the master record if the report is correct.
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="ne-btn-secondary" disabled={importBusy} onClick={() => setImportReview(null)} style={{ padding: '9px 16px', borderRadius: 8, fontWeight: 600, fontSize: 13 }}>Cancel</button>
                  <button className="ne-btn-primary" disabled={importBusy || selectedCount === 0} onClick={commitImport} style={{ padding: '9px 18px', borderRadius: 8, fontWeight: 700, fontSize: 13, opacity: (importBusy || selectedCount === 0) ? .6 : 1 }}>
                    {importBusy ? 'Pushing…' : `Confirm & push ${selectedCount} payslip${selectedCount === 1 ? '' : 's'}`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {showSlip && (() => {
        // Official model: Earnings = Basic + DA (50%) + HRA (50%); Deductions =
        // PF + Professional Tax. No Conveyance / Special / Incentive / TDS.
        const s = computePayslip(showSlip);
        const basicSalary = s.basic;          // Basic + DA
        const hra = s.hra;
        const grossEarnings = s.gross;
        const epf = s.pf;                      // PF
        const pt = s.pt;                       // Professional Tax
        const totalDeductions = s.totalDed;
        const netPayable = s.net;

        return (
          <div className="ne-modal-overlay" style={{ justifyContent: 'flex-end', alignItems: 'stretch' }}>
            <div className="ne-modal-card" style={{ 
              height: '100%', 
              width: '800px', 
              maxWidth: '100%', 
              margin: 0, 
              borderRadius: '16px 0 0 16px',
              animation: 'slideInRight 0.3s ease',
              display: 'flex',
              flexDirection: 'column',
              padding: '0'
            }}>
              <div className="ne-modal-header" style={{ borderBottom: '1px solid #E2E8F0', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 className="ne-modal-title" style={{ margin: 0, fontSize: '16px' }}>Employee Payslip</h2>
                <button className="ne-btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => setShowSlip(null)}><X size={14} style={{ marginRight: '4px' }} /> Close</button>
              </div>
              <div className="ne-modal-body" style={{ flex: 1, overflowY: 'auto', padding: '24px', background: '#F8FAFC' }}>
                <div className="payslip-wrapper" style={{ border: '1px solid #E2E8F0', padding: '24px', borderRadius: '8px', background: '#FFF', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                  
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #E2E8F0', paddingBottom: '16px', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <img src="/tescologo.png" alt="Tesco Structures" style={{ height: '46px', maxWidth: '260px', objectFit: 'contain' }} />
                      <p style={{ margin: 0, fontSize: '12px', color: '#64748B' }}>Chennai, Tamilnadu</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ margin: 0, fontSize: '12px', color: '#64748B' }}>Payslip For the Month</p>
                      <h2 style={{ margin: 0, fontSize: '16px', color: '#1E293B', fontWeight: 800 }}>{monthLabel}</h2>
                    </div>
                  </div>

                  {/* Summary Section */}
                  <div style={{ display: 'flex', gap: '32px', marginBottom: '24px', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1', minWidth: '300px' }}>
                      <h3 style={{ fontSize: '14px', color: '#64748B', fontWeight: 700, margin: '0 0 16px 0', letterSpacing: '0.5px' }}>EMPLOYEE SUMMARY</h3>
                      <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '12px', fontSize: '14px', color: '#334155' }}>
                        <div>Employee Name</div><div>: <strong>{showSlip.name}</strong></div>
                        <div>Designation</div><div>: {showSlip.designation || 'Associate Editor'}</div>
                        <div>Employee ID</div><div>: {showSlip.employeeId || 'EMP-10' + showSlip.id}</div>
                        <div>Date of Joining</div><div>: {showSlip.joiningDate || '30/06/2020'}</div>
                        <div>Pay Period</div><div>: {monthLabel}</div>
                        <div>Pay Date</div><div>: {new Date(payYear, payMonth - 1, 28).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')}</div>
                      </div>
                    </div>
                    
                    <div style={{ width: '320px', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
                      <div style={{ background: '#F0FDF4', padding: '24px' }}>
                        <div style={{ fontSize: '28px', fontWeight: 800, color: '#166534', marginBottom: '4px' }}>₹{netPayable.toLocaleString()}.00</div>
                        <div style={{ fontSize: '14px', color: '#15803D' }}>Employee Net Pay</div>
                      </div>
                      <div style={{ padding: '16px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '14px', color: '#475569', background: '#FFF' }}>
                        <div>Paid Days <span style={{ float: 'right' }}>:</span></div><div><strong>30</strong></div>
                        <div>LOP Days <span style={{ float: 'right' }}>:</span></div><div><strong>0</strong></div>
                      </div>
                    </div>
                  </div>

                  {/* PF/UAN Row */}
                  <div style={{ borderTop: '1px dashed #CBD5E1', borderBottom: '1px dashed #CBD5E1', padding: '16px 0', marginBottom: '24px', display: 'flex', gap: '48px', fontSize: '14px', color: '#475569', flexWrap: 'wrap' }}>
                    <div>PF A/C Number <span style={{ margin: '0 16px' }}>:</span> <strong>{showSlip.pfAccountNumber || showSlip.pfNumber || '—'}</strong></div>
                    <div>UAN <span style={{ margin: '0 16px' }}>:</span> <strong>{showSlip.uan || '—'}</strong></div>
                  </div>

                  {/* Salary Table */}
                  <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
                      
                      {/* Earnings Column */}
                      <div style={{ borderRight: '1px solid #E2E8F0' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr 2fr', padding: '12px 16px', borderBottom: '1px dashed #CBD5E1', fontWeight: 700, fontSize: '12px', color: '#1E293B' }}>
                          <div>EARNINGS</div><div style={{ textAlign: 'right' }}>AMOUNT</div><div style={{ textAlign: 'right' }}>YTD</div>
                        </div>
                        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '13px', color: '#334155' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr 2fr' }}>
                            <div>Basic + DA</div><div style={{ textAlign: 'right', fontWeight: 600 }}>₹{basicSalary.toLocaleString()}.00</div><div style={{ textAlign: 'right' }}>₹{(basicSalary*12).toLocaleString()}.00</div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr 2fr' }}>
                            <div>HRA</div><div style={{ textAlign: 'right', fontWeight: 600 }}>₹{hra.toLocaleString()}.00</div><div style={{ textAlign: 'right' }}>₹{(hra*12).toLocaleString()}.00</div>
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr 2fr', padding: '16px', background: '#F8FAFC', fontWeight: 700, fontSize: '14px', color: '#1E293B', borderTop: '1px solid #E2E8F0', marginTop: 'auto' }}>
                          <div>Gross Earnings</div><div style={{ textAlign: 'right' }}>₹{grossEarnings.toLocaleString()}.00</div><div style={{ textAlign: 'right' }}></div>
                        </div>
                      </div>

                      {/* Deductions Column */}
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr 2fr', padding: '12px 16px', borderBottom: '1px dashed #CBD5E1', fontWeight: 700, fontSize: '12px', color: '#1E293B' }}>
                          <div>DEDUCTIONS</div><div style={{ textAlign: 'right' }}>AMOUNT</div><div style={{ textAlign: 'right' }}>YTD</div>
                        </div>
                        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '13px', color: '#334155' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr 2fr' }}>
                            <div>PF</div><div style={{ textAlign: 'right', fontWeight: 600 }}>₹{epf.toLocaleString()}.00</div><div style={{ textAlign: 'right' }}>₹{(epf*12).toLocaleString()}.00</div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr 2fr' }}>
                            <div>Professional Tax</div><div style={{ textAlign: 'right', fontWeight: 600 }}>₹{pt.toLocaleString()}.00</div><div style={{ textAlign: 'right' }}>₹{(pt*12).toLocaleString()}.00</div>
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr 2fr', padding: '16px', background: '#F8FAFC', fontWeight: 700, fontSize: '14px', color: '#1E293B', borderTop: '1px solid #E2E8F0', marginTop: 'auto' }}>
                          <div>Total Deductions</div><div style={{ textAlign: 'right' }}>₹{totalDeductions.toLocaleString()}.00</div><div style={{ textAlign: 'right' }}></div>
                        </div>
                      </div>

                    </div>
                  </div>

                  {/* Footer Net Payable */}
                  <div style={{ marginTop: '24px', border: '1px solid #E2E8F0', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC', overflow: 'hidden' }}>
                    <div style={{ padding: '16px 24px' }}>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: '#1E293B' }}>TOTAL NET PAYABLE</div>
                      <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>Gross Earnings - Total Deductions</div>
                    </div>
                    <div style={{ padding: '16px 32px', background: '#F0FDF4', fontSize: '20px', fontWeight: 800, color: '#166534', height: '100%', display: 'flex', alignItems: 'center' }}>
                      ₹{netPayable.toLocaleString()}.00
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', marginTop: '16px', fontSize: '12px', color: '#475569' }}>
                    Amount In Words : <strong>Indian Rupee (Calculated dynamically) Only</strong>
                  </div>

                </div>
              </div>
              <div className="ne-modal-footer" style={{ borderTop: '1px solid #E2E8F0', padding: '16px 24px', background: '#FFF', display: 'flex', gap: '12px' }}>
                <button className="ne-btn-secondary" style={{ marginRight: 'auto' }} onClick={() => setShowSlip(null)}>Close</button>
                <button className="ne-btn-secondary" onClick={() => window.print()}><Printer size={16} /> Print</button>
                <button className="ne-btn-secondary" onClick={() => {
                  try {
                    const { doc } = buildPayslipPdf(showSlip);
                    const safeName = String(showSlip.name || 'employee').replace(/[^\w]+/g, '_');
                    doc.save(`Payslip_${safeName}_${monthLabel.replace(/\s+/g, '_')}.pdf`);
                    showNotification('Payslip downloaded.', 'success');
                  } catch (err) {
                    showNotification('Could not build PDF: ' + (err?.message || 'unknown error'), 'error');
                  }
                }}><Download size={16} /> Download PDF</button>
                <button className="ne-btn-primary" onClick={async () => {
                  const ok = await sendPayslipToEmployee(showSlip, {
                    earnings: {
                      basicSalary:      basicSalary,   // Basic + DA
                      hraAllowance:     hra,
                      performanceBonus: 0,
                      otherEarnings:    0,
                    },
                    deductions: {
                      incomeTax:       0,              // no TDS
                      providentFund:   epf,            // PF
                      healthInsurance: 0,
                      lopDeduction:    0,
                      otherDeductions: pt,             // Professional Tax
                    },
                  });
                  if (ok && !generatedPayrolls.includes(showSlip.id)) {
                    setGeneratedPayrolls([...generatedPayrolls, showSlip.id]);
                  }
                }}><Send size={16} /> Send to Employee</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Edit Payslip Slide-over Panel ── */}
      {showEditSlip && (() => {
        const emp = showEditSlip;
        // Official model: Basic + DA = 50% of salary, HRA = the other 50%.
        const s = computePayslip(emp);
        const basicSalary = s.basic;   // Basic + DA
        const hra = s.hra;
        const epf = s.pf;              // PF amount (0 until PF is enabled)
        const pt = s.pt;               // Professional Tax
        const totalDeductions = s.totalDed;
        const netPayable = s.net;

        return (
          <div className="ne-modal-overlay" style={{ justifyContent: 'flex-end', alignItems: 'stretch' }}>
            <div className="ne-modal-card" style={{ 
              height: '100%', 
              width: '650px', 
              maxWidth: '100%', 
              margin: 0, 
              borderRadius: '16px 0 0 16px',
              animation: 'slideInRight 0.3s ease',
              display: 'flex',
              flexDirection: 'column'
            }}>
              <div className="ne-modal-header">
                <div>
                  <h2 className="ne-modal-title">Edit Payslip</h2>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>Modify salary details for {emp.name}</p>
                </div>
                <button className="ne-modal-close" onClick={() => setShowEditSlip(null)}><X size={20} /></button>
              </div>
              
              <div className="ne-modal-body" style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                <div style={{ animation: 'fadeIn 0.3s ease' }}>
                  <div style={{ background: '#FFF', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div className="ne-field">
                        <label className="ne-label">Employee ID</label>
                        <input className="ne-input" type="text" defaultValue={emp.employeeId || 'EMP-10' + emp.id} />
                      </div>
                      <div className="ne-field">
                        <label className="ne-label">Employee Name</label>
                        <input className="ne-input" type="text" defaultValue={emp.name} />
                      </div>
                      <div className="ne-field">
                        <label className="ne-label">Department</label>
                        <input className="ne-input" type="text" defaultValue={emp.dept} />
                      </div>
                      <div className="ne-field">
                        <label className="ne-label">Pay Period</label>
                        <input className="ne-input" type="text" value={monthLabel} readOnly title="Pay period follows the month selected on the Payroll page" />
                      </div>
                    </div>
                  </div>

                  <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 12px 0' }}>Earnings</h3>
                  <div style={{ background: '#FFF', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div className="ne-field">
                        <label className="ne-label">Basic + DA</label>
                        <input className="ne-input" type="number" defaultValue={basicSalary} />
                      </div>
                      <div className="ne-field">
                        <label className="ne-label">HRA</label>
                        <input className="ne-input" type="number" defaultValue={hra} />
                      </div>
                    </div>
                  </div>

                  <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 12px 0' }}>Deductions</h3>
                  <div style={{ background: '#FFF', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div className="ne-field">
                        <label className="ne-label">PF</label>
                        <input ref={editPfRef} className="ne-input" type="number" defaultValue={epf} />
                      </div>
                      <div className="ne-field">
                        <label className="ne-label">Professional Tax</label>
                        <input ref={editPtRef} className="ne-input" type="number" defaultValue={pt} />
                      </div>
                    </div>
                  </div>

                  <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 12px 0' }}>PF / UAN Details</h3>
                  <div style={{ background: '#FFF', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '20px' }}>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 12px 0' }}>
                      PF is not in use yet — leave blank. When PF is enabled, enter the employee's PF account number and UAN here and they'll appear on the payslip.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div className="ne-field">
                        <label className="ne-label">PF A/C Number</label>
                        <input ref={editPfAcRef} className="ne-input" type="text" defaultValue={emp.pfAccountNumber || emp.pfNumber || ''} placeholder="e.g. KA/BNG/0000000/000/0000000" />
                      </div>
                      <div className="ne-field">
                        <label className="ne-label">UAN</label>
                        <input ref={editUanRef} className="ne-input" type="text" defaultValue={emp.uan || ''} placeholder="12-digit UAN" />
                      </div>
                    </div>
                  </div>

                  <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '14px', fontWeight: 600 }}>Net Pay</span>
                    <div style={{ width: '200px' }}>
                      <input className="ne-input" type="number" defaultValue={netPayable} readOnly style={{ fontWeight: 800, color: 'var(--primary)', textAlign: 'right' }} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="ne-modal-footer">
                <button className="ne-btn-secondary" onClick={() => setShowEditSlip(null)}>Cancel</button>
                <button className="ne-btn-primary" onClick={async () => {
                  const body = {
                    pf:              Number(editPfRef.current?.value) || 0,
                    professionalTax: Number(editPtRef.current?.value) || 0,
                    pfAccountNumber: (editPfAcRef.current?.value || '').trim(),
                    uan:             (editUanRef.current?.value || '').trim(),
                  };
                  try {
                    const res = await fetch(`${API}/employees/${emp.id}`, {
                      method:  'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body:    JSON.stringify(body),
                    });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    // Reflect immediately so the payslip picks up the new values.
                    Object.assign(emp, body);
                    showNotification(`Payslip details for ${emp.name} saved.`, 'success');
                  } catch (err) {
                    showNotification('Could not save: ' + (err?.message || 'server error'), 'error');
                    return;
                  }
                  setShowEditSlip(null);
                }}>
                  <FileText size={16} /> Save Changes
                </button>
              </div>
            </div>
          </div>
        );
      })()}


      {/* Create Payroll Slide-over Panel — temporarily stubbed.
          The full builder is restored in a follow-up; until then HR can
          still use Upload Report and Send to Employee on the table rows. */}
      {showProcessPanel && (
        <div
          onClick={() => setShowProcessPanel(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 12, padding: 24, width: 'min(420px,100%)' }}
          >
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>Create Payroll</div>
            <div style={{ fontSize: 12, color: '#64748B', marginBottom: 14 }}>
              Use Upload Report on the Payroll page header to generate payslips
              for every employee for the selected month. The advanced manual
              builder is being rebuilt and will return shortly.
            </div>
            <button
              onClick={() => setShowProcessPanel(false)}
              style={{ padding: '8px 16px', borderRadius: 8, background: '#0F172A', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700 }}
            >Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
