import React, { useState, useEffect, useMemo } from 'react';
import {
  Laptop, Monitor, Mouse, Keyboard, CreditCard,
  Search, Filter, Plus, Edit2, Trash2, Cpu, X,
  ChevronRight, Package, CheckCircle2, AlertCircle, User, Hash, Smartphone
} from 'lucide-react';
import { allEmployees } from '../data/mockData';

import { API } from '../config/api';

// Map API record into UI shape
const mapApiAsset = (a) => ({
  _id:        a._id,
  id:         a.assetId || a._id,
  assetName:  a.assetName || '',
  type:       a.type      || 'Laptop',
  employeeId: a.employeeId || '',
  serialNo:   a.serialNo  || '',
  issuedDate: a.issuedDate ? a.issuedDate.slice(0, 10) : '',
  condition:  a.condition || 'Good',
  status:     a.status    || 'Assigned',
});

// Helpers
const ASSET_TYPES = ['Laptop', 'Monitor', 'Mouse', 'Keyboard', 'ID Card', 'PC', 'Mobile with SIM'];

const typeIcon = (type, size = 16) => {
  switch (type) {
    case 'Laptop':          return <Laptop     size={size} />;
    case 'Monitor':         return <Monitor    size={size} />;
    case 'Mouse':           return <Mouse      size={size} />;
    case 'Keyboard':        return <Keyboard   size={size} />;
    case 'ID Card':         return <CreditCard size={size} />;
    case 'PC':              return <Cpu        size={size} />;
    case 'Mobile with SIM': return <Smartphone size={size} />;
    default:                return <Package    size={size} />;
  }
};

const typeColor = (type) => {
  switch (type) {
    case 'Laptop':          return { bg: '#EBF4FD', color: '#4299E1' };
    case 'Monitor':         return { bg: '#EDE9FE', color: '#9F7AEA' };
    case 'Mouse':           return { bg: '#FEF3C7', color: '#D97706' };
    case 'Keyboard':        return { bg: '#FCE7F3', color: '#ED64A6' };
    case 'ID Card':         return { bg: '#F1F9EE', color: '#4CAA17' };
    case 'PC':              return { bg: '#E0F2FE', color: '#0284C7' };
    case 'Mobile with SIM': return { bg: '#E6FFFA', color: '#319795' };
    default:                return { bg: '#F1F5F9', color: '#64748B' };
  }
};

const conditionStyle = (c) => {
  switch (c) {
    case 'New':  return { color: '#4CAA17', bg: '#F1F9EE' };
    case 'Good': return { color: '#4299E1', bg: '#EBF4FD' };
    case 'Fair': return { color: '#D97706', bg: '#FEF3C7' };
    case 'Poor': return { color: '#FC8181', bg: '#FFF5F5' };
    default:     return { color: '#94A3B8', bg: '#F1F5F9' };
  }
};

const drawerStyles = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 1000,
    background: 'rgba(15,23,42,0.35)', backdropFilter: 'blur(3px)',
    animation: 'fadeInOverlay .2s ease',
  },
  panel: {
    position: 'absolute', top: 0, right: 0, width: 440, height: '100%',
    background: 'var(--bg-card)', display: 'flex', flexDirection: 'column',
    boxShadow: '-6px 0 32px rgba(0,0,0,0.12)', borderLeft: '1px solid var(--border-mid)',
    animation: 'slideInRight .25s cubic-bezier(.4,0,.2,1)',
  },
  header: {
    padding: '20px 24px', borderBottom: '1px solid var(--border-color)',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    flexShrink: 0, background: 'var(--bg-card)',
  },
  headerIconWrap: {
    width: 38, height: 38, borderRadius: 10,
    background: 'var(--primary-light)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', flexShrink: 0,
  },
  headerTitle: { fontWeight: 700, fontSize: 15, color: 'var(--text-main)', lineHeight: 1.2 },
  headerSub:   { fontSize: 12, color: 'var(--text-muted)', marginTop: 2 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border-mid)',
    background: 'var(--bg-main)', cursor: 'pointer', color: 'var(--text-muted)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, transition: 'all .15s',
  },
  body: {
    flex: 1, padding: '20px 24px', overflowY: 'auto',
    display: 'flex', flexDirection: 'column', gap: 0,
  },
  section: { marginBottom: 0 },
  sectionTitle: {
    display: 'flex', alignItems: 'center', gap: 8,
    fontSize: 12, fontWeight: 700, color: 'var(--text-main)',
    textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 14,
  },
  stepDot: {
    width: 20, height: 20, borderRadius: '50%', background: 'var(--primary)',
    color: '#fff', fontSize: 10, fontWeight: 700,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  input: {
    width: '100%', padding: '9px 12px', borderRadius: 8,
    border: '1px solid var(--border-mid)', fontSize: 13,
    background: 'var(--bg-card)', color: 'var(--text-main)',
    outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
    transition: 'border-color .15s, box-shadow .15s',
  },
  inputIcon: {
    position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
    color: 'var(--text-muted)', pointerEvents: 'none',
  },
  inputErr: { borderColor: 'var(--red)', boxShadow: '0 0 0 3px rgba(239,68,68,.1)' },
  findBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px',
    background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8,
    fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
    transition: 'background .15s', flexShrink: 0,
  },
  empCard: {
    marginTop: 12, padding: '12px', borderRadius: 10,
    background: 'var(--primary-light)', border: '1.5px solid var(--primary)',
    display: 'flex', alignItems: 'center', gap: 12,
  },
  empIdBadge: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    fontSize: 11, fontWeight: 700, color: 'var(--primary-dark)',
    background: 'var(--bg-card)', padding: '3px 9px', borderRadius: 20,
    border: '1px solid var(--primary)', whiteSpace: 'nowrap', flexShrink: 0,
  },
  errBox: {
    marginTop: 10, display: 'flex', alignItems: 'center', gap: 6,
    fontSize: 12, color: 'var(--red)', background: '#FEF2F2',
    padding: '8px 12px', borderRadius: 8, border: '1px solid #FECACA',
  },
  fieldErr: { fontSize: 11, color: 'var(--red)', marginTop: 4 },
  divider:  { height: 1, background: 'var(--border-color)', margin: '4px 0 16px' },
  fieldGroup: { marginBottom: 14 },
  label: {
    display: 'block', fontSize: 12, fontWeight: 600,
    color: 'var(--text-main)', marginBottom: 6,
  },
  footer: {
    padding: '16px 24px', borderTop: '1px solid var(--border-color)',
    display: 'flex', justifyContent: 'flex-end', gap: 10,
    flexShrink: 0, background: 'var(--bg-card)',
  },
  cancelBtn: {
    padding: '9px 20px', borderRadius: 8, border: '1px solid var(--border-mid)',
    background: 'transparent', color: 'var(--text-muted)', fontWeight: 600,
    fontSize: 13, cursor: 'pointer', transition: 'all .15s',
  },
  saveBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '9px 22px', background: 'var(--primary)', color: '#fff',
    border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13,
    cursor: 'pointer', boxShadow: '0 4px 12px rgba(67,160,71,0.3)',
    transition: 'background .15s',
  },
};

// Add / Edit Asset Drawer
function AssetModal({ onClose, onSave, mode = 'add', initialAsset = null, employees = [] }) {
  const isEdit = mode === 'edit';

  // Choose between live `employees` (prop) and the mock fallback so the
  // dropdown always has something to show, even before the parent's API
  // call resolves.
  const empSource = (employees && employees.length > 0) ? employees : allEmployees;

  const [empIdInput, setEmpIdInput] = useState(initialAsset?.employeeId || '');
  const [foundEmp, setFoundEmp] = useState(null);
  const [empError, setEmpError] = useState('');
  const [searched, setSearched] = useState(false);

  const [form, setForm] = useState({
    assetName:  initialAsset?.assetName  || '',
    // Asset types is a SET — when adding, HR can tick multiple
    // checkboxes and we'll create one asset row per ticked type
    // sharing the same serial root + issue date. When editing,
    // only the asset's original type is selected (we update in place).
    types:      isEdit
                  ? [initialAsset?.type || 'Laptop']
                  : ['Laptop'],
    serialNo:   initialAsset?.serialNo   || '',
    issuedDate: initialAsset?.issuedDate || new Date().toISOString().split('T')[0],
    condition:  initialAsset?.condition  || 'Good',
    status:     initialAsset?.status     || 'Assigned',
  });
  // Local save-error string — replaces the undefined `showNotification`
  // call that used to crash this modal whenever the API rejected a save.
  const [saveError, setSaveError] = useState('');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // When editing, pre-resolve the employee from existing employeeId
  useEffect(() => {
    if (isEdit && initialAsset?.employeeId) {
      const emp = empSource.find(
        (e) => e.employeeId?.toUpperCase() === initialAsset.employeeId.toUpperCase()
            || `EMP-${e.id}` === initialAsset.employeeId.toUpperCase()
      );
      if (emp) { setFoundEmp(emp); setSearched(true); }
    }
  }, [isEdit, initialAsset, empSource]);

  // Picking from the dropdown auto-resolves and skips the "Find" step.
  const handlePickEmployee = (value) => {
    setEmpIdInput(value);
    setSearched(true);
    if (!value) { setFoundEmp(null); setEmpError(''); return; }
    const emp = empSource.find(
      (e) => e.employeeId === value || `EMP-${e.id}` === value
    );
    if (emp) { setFoundEmp(emp); setEmpError(''); }
    else      { setFoundEmp(null); setEmpError('No employee found with this ID.'); }
  };

  const handleSearch = () => {
    const trimmed = empIdInput.trim().toUpperCase();
    setSearched(true);
    const emp = empSource.find(
      (e) => e.employeeId?.toUpperCase() === trimmed || `EMP-${e.id}` === trimmed
    );
    if (emp) { setFoundEmp(emp); setEmpError(''); }
    else { setFoundEmp(null); setEmpError('No employee found with this ID.'); }
  };

  const handleChange = (field, val) => {
    setForm((f) => ({ ...f, [field]: val }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: '' }));
  };

  const validate = () => {
    const e = {};
    if (!foundEmp)                            e.emp        = 'Please look up a valid employee first.';
    if (!form.assetName.trim())               e.assetName  = 'Asset name is required.';
    if (!form.serialNo.trim())                e.serialNo   = 'Serial / Asset number is required.';
    if (!form.issuedDate)                     e.issuedDate = 'Issue date is required.';
    if (!form.types || form.types.length === 0) e.types    = 'Pick at least one asset type.';
    return e;
  };

  /**
   * Toggle a single asset-type checkbox. Multi-select in BOTH Add and Edit:
   *   • Add  → POST one row per ticked type.
   *   • Edit → keep the original row pointed at the first ticked type and
   *            POST new rows for any extra ticked types. Untoggling a type
   *            that the original row used reassigns the row to one of the
   *            other ticked types so the row never gets orphaned.
   */
  const toggleType = (t) => {
    setErrors((cur) => ({ ...cur, types: '' }));
    setForm((f) => {
      const has = f.types.includes(t);
      const next = has ? f.types.filter((x) => x !== t) : [...f.types, t];

      // Convenience: when the user ticks "ID Card" and they haven't typed
      // a custom name yet, auto-fill the Asset Name to "ID Card" — saves
      // HR a typing step since the name + type are effectively the same
      // for ID cards. Doesn't clobber a name the user already typed.
      let assetName = f.assetName;
      const newlyAddedIdCard = !has && /id ?card/i.test(t);
      if (newlyAddedIdCard) {
        const empty = !assetName || !assetName.trim();
        // Also overwrite when the existing name was previously set by us
        // (matches the literal "ID Card") — keeps the UX consistent even
        // if the user is toggling ID Card on/off.
        const previouslyAuto = String(assetName).trim().toLowerCase() === 'id card';
        if (empty || previouslyAuto) assetName = 'ID Card';
      }
      return { ...f, types: next, assetName };
    });
  };

  const handleSubmit = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaveError('');

    setSubmitting(true);
    try {
      if (isEdit) {
        // Multi-select edit:
        //   • Update the original row to point at form.types[0].
        //   • For every other ticked type, POST a new row with a
        //     type-suffixed serial (matches Add-mode behaviour so the
        //     unique-serial DB constraint can't reject the second row).
        const baseSerial = form.serialNo.trim();
        const editTypes  = form.types.slice();
        const primaryType = editTypes[0];

        const primaryPayload = {
          assetName:    form.assetName.trim(),
          type:         primaryType,
          employeeId:   foundEmp.employeeId,
          employeeName: foundEmp.name || '',
          serialNo:     baseSerial,
          issuedDate:   form.issuedDate,
          condition:    form.condition,
          status:       form.status,
        };
        const res = await fetch(`${API}/assets/${initialAsset._id || initialAsset.id}`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(primaryPayload),
        });
        const data = await res.json();
        if (!data?.success || !data?.data) throw new Error(data?.message || 'Failed to save asset');
        onSave(mapApiAsset(data.data), 'edit');

        // POST extra rows for the additional ticked types.
        const extras = editTypes.slice(1);
        for (const t of extras) {
          const suffix = '-' + t.replace(/[^A-Z0-9]+/gi, '').slice(0, 4).toUpperCase();
          const extraPayload = {
            assetName:    form.assetName.trim(),
            type:         t,
            employeeId:   foundEmp.employeeId,
            employeeName: foundEmp.name || '',
            serialNo:     baseSerial + suffix,
            issuedDate:   form.issuedDate,
            condition:    form.condition,
            status:       form.status,
          };
          const r2 = await fetch(`${API}/assets`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(extraPayload),
          });
          const d2 = await r2.json();
          if (!d2?.success || !d2?.data) throw new Error(d2?.message || `Failed to save ${t}`);
          onSave(mapApiAsset(d2.data), 'add');
        }

        onClose();
        return;
      }

      // ADD mode — create one asset per ticked type. Serial number gets
      // a type suffix when more than one row shares a base serial, so the
      // unique-serial constraint can't trip the second POST.
      const baseSerial = form.serialNo.trim();
      const created = [];
      for (const t of form.types) {
        const suffix = form.types.length > 1
          ? '-' + t.replace(/[^A-Z0-9]+/gi, '').slice(0, 4).toUpperCase()
          : '';
        const payload = {
          assetName:    form.assetName.trim(),
          type:         t,
          employeeId:   foundEmp.employeeId,
          employeeName: foundEmp.name || '',
          serialNo:     baseSerial + suffix,
          issuedDate:   form.issuedDate,
          condition:    form.condition,
          status:       form.status,
        };
        const res  = await fetch(`${API}/assets`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload),
        });
        const data = await res.json();
        if (!data?.success || !data?.data) throw new Error(data?.message || `Failed to save ${t}`);
        created.push(mapApiAsset(data.data));
      }
      created.forEach((row) => onSave(row, 'add'));
      onClose();
    } catch (err) {
      console.error('Save asset failed:', err);
      // Surface the failure inline instead of crashing the modal with
      // the old `showNotification is not defined` ReferenceError.
      setSaveError(err?.message || 'Network error while saving asset');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={drawerStyles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={drawerStyles.panel}>

        {/* Header */}
        <div style={drawerStyles.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={drawerStyles.headerIconWrap}>
              <Package size={18} />
            </div>
            <div>
              <div style={drawerStyles.headerTitle}>{isEdit ? 'Edit Asset' : 'Add New Asset'}</div>
              <div style={drawerStyles.headerSub}>{isEdit ? 'Update equipment details' : 'Assign equipment to an employee'}</div>
            </div>
          </div>
          <button onClick={onClose} style={drawerStyles.closeBtn} title="Close">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={drawerStyles.body}>

          {/* Step 1: Employee Lookup */}
          <section style={drawerStyles.section}>
            <div style={drawerStyles.sectionTitle}>
              <span style={drawerStyles.stepDot}>1</span>
              <User size={13} /> Employee Lookup
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <Hash size={14} style={drawerStyles.inputIcon} />
                <select
                  style={{
                    ...drawerStyles.input,
                    paddingTop: 9, paddingBottom: 9, paddingRight: 12, paddingLeft: 34,
                    appearance: 'auto',
                    ...(errors.emp && !foundEmp ? drawerStyles.inputErr : {}),
                  }}
                  value={empIdInput}
                  onChange={(e) => handlePickEmployee(e.target.value)}
                >
                  <option value="">— Select Employee ID —</option>
                  {empSource.map((e) => {
                    const id   = e.employeeId || ('EMP-' + e.id);
                    const name = e.name || `${e.firstName || ''} ${e.lastName || ''}`.trim();
                    return (
                      <option key={id} value={id}>
                        {id}{name ? ' — ' + name : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {searched && foundEmp && (
              <div style={drawerStyles.empCard}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  background: (foundEmp.color || '#A0AEC0') + '22', color: foundEmp.color || '#4A5568',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: 14,
                }}>
                  {foundEmp.initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-main)' }}>{foundEmp.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                    {foundEmp.role} · {foundEmp.dept}
                  </div>
                </div>
                <div style={drawerStyles.empIdBadge}>
                  <CheckCircle2 size={11} /> {foundEmp.employeeId}
                </div>
              </div>
            )}

            {searched && empError && (
              <div style={drawerStyles.errBox}>
                <AlertCircle size={13} /> {empError}
              </div>
            )}
            {errors.emp && !foundEmp && !searched && (
              <div style={drawerStyles.fieldErr}>{errors.emp}</div>
            )}
          </section>

          <div style={drawerStyles.divider} />

          {/* Step 2: Asset Details */}
          <section style={drawerStyles.section}>
            <div style={drawerStyles.sectionTitle}>
              <span style={{
                ...drawerStyles.stepDot,
                background: foundEmp ? 'var(--primary)' : 'var(--border-mid)',
                color: foundEmp ? '#fff' : 'var(--text-light)',
              }}>2</span>
              <Package size={13} style={{ color: foundEmp ? 'var(--primary)' : 'var(--text-light)' }} />
              <span style={{ color: foundEmp ? 'var(--text-main)' : 'var(--text-light)' }}>Asset Details</span>
            </div>

            {/* Asset Type checkboxes — HR can tick more than one and we
                POST one asset row per ticked type in handleSubmit, so a
                full kit (Laptop + Mouse + Keyboard + ID Card) can be
                handed out in a single Save click. Edit mode falls back
                to single-select since we update one row in place. */}
            <div style={drawerStyles.fieldGroup}>
              <label style={drawerStyles.label}>
                Asset Type {isEdit ? '' : '(tick all that apply)'}
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {ASSET_TYPES.map((t) => {
                  const active = form.types.includes(t);
                  return (
                    <label
                      key={t}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '6px 11px', borderRadius: 8, fontSize: 12,
                        cursor: 'pointer', transition: 'all .15s',
                        border: `1.5px solid ${active ? 'var(--primary)' : 'var(--border-mid)'}`,
                        background: active ? 'var(--primary-light)' : 'var(--bg-main)',
                        color: active ? 'var(--primary-dark)' : 'var(--text-muted)',
                        fontWeight: active ? 700 : 500,
                        boxShadow: active ? '0 0 0 3px rgba(67,160,71,0.1)' : 'none',
                        userSelect: 'none',
                      }}
                    >
                      <input
                        type="checkbox"
                        name="asset-type"
                        checked={active}
                        onChange={() => toggleType(t)}
                        style={{ accentColor: 'var(--primary)', margin: 0 }}
                      />
                      {typeIcon(t, 12)} {t}
                    </label>
                  );
                })}
              </div>
              {errors.types && <div style={drawerStyles.fieldErr}>{errors.types}</div>}
            </div>

            {/* Asset Name */}
            <div style={drawerStyles.fieldGroup}>
              <label style={drawerStyles.label}>
                Asset Name / Model <span style={{ color: 'var(--red)' }}>*</span>
              </label>
              <input
                style={{ ...drawerStyles.input, ...(errors.assetName ? drawerStyles.inputErr : {}) }}
                placeholder='e.g. MacBook Pro M2 14"'
                value={form.assetName}
                onChange={(e) => handleChange('assetName', e.target.value)}
              />
              {errors.assetName && <div style={drawerStyles.fieldErr}>{errors.assetName}</div>}
            </div>

            {/* Serial No */}
            <div style={drawerStyles.fieldGroup}>
              <label style={drawerStyles.label}>
                Serial / Asset No. <span style={{ color: 'var(--red)' }}>*</span>
              </label>
              <input
                style={{ ...drawerStyles.input, fontFamily: 'monospace', ...(errors.serialNo ? drawerStyles.inputErr : {}) }}
                placeholder="e.g. MBP-2024-001"
                value={form.serialNo}
                onChange={(e) => handleChange('serialNo', e.target.value)}
              />
              {errors.serialNo && <div style={drawerStyles.fieldErr}>{errors.serialNo}</div>}
            </div>

            {/* Issue Date + Condition */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={drawerStyles.fieldGroup}>
                <label style={drawerStyles.label}>
                  Issue Date <span style={{ color: 'var(--red)' }}>*</span>
                </label>
                <input
                  type="date"
                  style={{ ...drawerStyles.input, ...(errors.issuedDate ? drawerStyles.inputErr : {}) }}
                  value={form.issuedDate}
                  onChange={(e) => handleChange('issuedDate', e.target.value)}
                />
                {errors.issuedDate && <div style={drawerStyles.fieldErr}>{errors.issuedDate}</div>}
              </div>
              <div style={drawerStyles.fieldGroup}>
                <label style={drawerStyles.label}>Condition</label>
                <select
                  style={drawerStyles.input}
                  value={form.condition}
                  onChange={(e) => handleChange('condition', e.target.value)}
                >
                  {['New', 'Good', 'Fair', 'Poor'].map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* Status */}
            <div style={drawerStyles.fieldGroup}>
              <label style={drawerStyles.label}>Status</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {['Assigned', 'Available', 'Under Repair'].map((s) => {
                  const active = form.status === s;
                  return (
                    <button key={s} onClick={() => handleChange('status', s)} style={{
                      flex: 1, padding: '7px 4px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                      cursor: 'pointer', transition: 'all .15s',
                      border: `1.5px solid ${active ? 'var(--primary)' : 'var(--border-mid)'}`,
                      background: active ? 'var(--primary-light)' : 'var(--bg-main)',
                      color: active ? 'var(--primary-dark)' : 'var(--text-muted)',
                      boxShadow: active ? '0 0 0 3px rgba(67,160,71,0.1)' : 'none',
                    }}>
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        </div>

        {/* Save-error banner — shows the API's message inline when the
            POST/PUT fails, instead of crashing the modal silently. */}
        {saveError && (
          <div style={{
            background: '#FEF2F2', color: '#B91C1C',
            border: '1px solid #FCA5A5',
            borderRadius: 8, padding: '8px 12px',
            margin: '0 20px 8px', fontSize: 12, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <AlertCircle size={14} /> {saveError}
          </div>
        )}

        {/* Footer */}
        <div style={drawerStyles.footer}>
          <button onClick={onClose} style={drawerStyles.cancelBtn} disabled={submitting}>Cancel</button>
          <button onClick={handleSubmit} style={drawerStyles.saveBtn} disabled={submitting}>
            {submitting
              ? 'Saving…'
              : isEdit
                ? <><CheckCircle2 size={15} /> Save Changes</>
                : <><Plus size={15} /> Add {form.types.length > 1 ? `${form.types.length} Assets` : 'Asset'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// Main Assets Page
export default function Assets({ employees = [] }) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [showModal, setShowModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);

  // Load assets from API on mount
  const loadAssets = async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API}/assets`);
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setAssets(data.data.map(mapApiAsset));
      } else {
        setAssets([]);
      }
    } catch (err) {
      console.error('Failed to load assets:', err);
      setAssets([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { loadAssets(); }, []);

  // Build employee lookup map
  const empMap = useMemo(() => {
    const m = {};
    allEmployees.forEach((e) => { m[e.employeeId] = e; });
    return m;
  }, []);

  // Filter
  const filtered = useMemo(() => {
    return assets.filter((a) => {
      const emp = empMap[a.employeeId];
      const empName = emp?.name?.toLowerCase() || '';
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        (a.assetName || '').toLowerCase().includes(q) ||
        (a.id || '').toLowerCase().includes(q) ||
        (a.employeeId || '').toLowerCase().includes(q) ||
        (a.serialNo || '').toLowerCase().includes(q) ||
        empName.includes(q);
      const matchesType = filterType === 'All' || a.type === filterType;
      return matchesSearch && matchesType;
    });
  }, [assets, searchTerm, filterType, empMap]);

  // Group by employee
  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach((a) => {
      const key = a.employeeId || 'Unassigned';
      if (!map[key]) map[key] = [];
      map[key].push(a);
    });
    return Object.entries(map);
  }, [filtered]);

  // Stats
  const stats = useMemo(() => {
    const total = assets.length;
    const byType = {};
    ASSET_TYPES.forEach((t) => { byType[t] = assets.filter((a) => a.type === t).length; });
    const empCount = new Set(assets.map((a) => a.employeeId).filter(Boolean)).size;
    return { total, byType, empCount };
  }, [assets]);

  // Delete via API
  const handleDelete = async (asset) => {
    if (!(await confirmDialog({ title: "Confirm", message: `Delete asset "${asset.assetName}"? This cannot be undone.`, confirmText: "Delete", tone: "danger" }))) return;
    const prev = assets;
    setAssets(prev.filter((a) => (a._id || a.id) !== (asset._id || asset.id)));
    try {
      const res  = await fetch(`${API}/assets/${asset._id || asset.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) {
        setAssets(prev);
        showNotification(data.message || 'Failed to delete asset', "error");
      }
    } catch (err) {
      setAssets(prev);
      console.error('Failed to delete asset:', err);
      showNotification('Network error while deleting asset', "error");
    }
  };

  // Handle save from modal (add or edit)
  const handleSave = (savedAsset, mode) => {
    if (mode === 'edit') {
      setAssets((prev) => prev.map((a) =>
        (a._id || a.id) === (savedAsset._id || savedAsset.id) ? savedAsset : a
      ));
    } else {
      setAssets((prev) => [savedAsset, ...prev]);
    }
  };

  const openAddModal  = () => { setEditingAsset(null);   setShowModal(true); };
  const openEditModal = (a) => { setEditingAsset(a);     setShowModal(true); };
  const closeModal    = () => { setShowModal(false);     setEditingAsset(null); };

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const topTypes = [
    { type: 'Laptop',          icon: <Laptop     size={20} /> },
    { type: 'Monitor',         icon: <Monitor    size={20} /> },
    { type: 'PC',              icon: <Cpu        size={20} /> },
    { type: 'Mouse',           icon: <Mouse      size={20} /> },
    { type: 'Keyboard',        icon: <Keyboard   size={20} /> },
    { type: 'Mobile with SIM', icon: <Smartphone size={20} /> },
    { type: 'ID Card',         icon: <CreditCard size={20} /> },
  ];

  return (
    <div className="emp-list-page">
      {/* Header */}
      <div className="emp-list-header">
        <div className="ne-breadcrumb">
          <span className="ne-breadcrumb-link">Dashboard</span>
          <ChevronRight size={13} />
          <span>Assets Management</span>
        </div>
        <div className="emp-list-title-row">
          <div>
            <h1 className="ne-page-title">Company Assets</h1>
            <p className="ne-page-sub">Track IT equipment and ID cards assigned to employees.</p>
          </div>
          <button className="ne-btn-primary" onClick={openAddModal}>
            <Plus size={16} /> Add Asset
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div style={styles.statsRow}>
        <div style={styles.statCard}>
          <div style={{ ...styles.statIcon, background: '#EBF4FD', color: '#4299E1' }}><Package size={20} /></div>
          <div>
            <div style={styles.statNum}>{stats.total}</div>
            <div style={styles.statLbl}>Total Assets</div>
          </div>
        </div>
        <div style={styles.statCard}>
          <div style={{ ...styles.statIcon, background: '#F1F9EE', color: '#4CAA17' }}><User size={20} /></div>
          <div>
            <div style={styles.statNum}>{stats.empCount}</div>
            <div style={styles.statLbl}>Employees with Assets</div>
          </div>
        </div>
        {topTypes.map(({ type, icon }) => {
          const tc = typeColor(type);
          return (
            <div key={type} style={styles.statCard}>
              <div style={{ ...styles.statIcon, background: tc.bg, color: tc.color }}>{icon}</div>
              <div>
                <div style={styles.statNum}>{stats.byType[type] || 0}</div>
                <div style={styles.statLbl}>{type}s</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Table Card */}
      <div className="card" style={{ marginTop: 24 }}>
        {/* Toolbar */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="panel-search" style={{ flex: 1, minWidth: 200 }}>
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder="Search by name, asset ID, employee ID, serial no..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="panel-filters" style={{ margin: 0, padding: 0, border: 'none', background: 'transparent' }}>
            <div className="filter-group">
              <Filter size={14} className="filter-icon" />
              <select className="filter-select" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                <option value="All">All Types</option>
                {ASSET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-light)', fontWeight: 500 }}>
            {filtered.length} asset{filtered.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Rows */}
        <div style={{ overflowX: 'auto' }}>
          {loading && assets.length === 0 ? (
            <div style={{ padding: '60px 24px', textAlign: 'center', color: 'var(--text-light)' }}>
              <Package size={32} style={{ marginBottom: 12, opacity: .3 }} />
              <div style={{ fontSize: 14 }}>Loading assets...</div>
            </div>
          ) : grouped.length === 0 ? (
            <div style={{ padding: '60px 24px', textAlign: 'center', color: 'var(--text-light)' }}>
              <Package size={40} style={{ marginBottom: 12, opacity: .3 }} />
              <div style={{ fontSize: 15, fontWeight: 600 }}>No assets found</div>
              <div style={{ fontSize: 13 }}>Try adjusting your search or click <strong>Add Asset</strong>.</div>
            </div>
          ) : (
            grouped.map(([empId, empAssets]) => {
              const emp = empMap[empId] || { name: empId, role: '—', dept: '—', initials: (empId || 'NA').slice(0, 2), color: '#A0AEC0' };
              return (
                <div key={empId} style={styles.empGroup}>
                  {/* Employee header row */}
                  <div style={styles.empGroupHeader}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 12, background: (emp.color || '#A0AEC0') + '22', color: emp.color || '#4A5568', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                        {emp.initials}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-main)' }}>{emp.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-light)' }}>{emp.role} · {emp.dept}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: '#4299E1', background: '#EBF4FD', padding: '3px 10px', borderRadius: 20 }}>{empId}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-light)', fontWeight: 500 }}>{empAssets.length} asset{empAssets.length !== 1 ? 's' : ''}</div>
                    </div>
                  </div>

                  {/* Asset rows — Emp ID + Employee Name now repeat on
                      every row so the table reads as a flat asset list
                      (HR's preference) rather than relying on the group
                      header alone. */}
                  <table className="emp-table" style={{ marginBottom: 0 }}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Emp ID</th>
                        <th style={styles.th}>Employee</th>
                        <th style={styles.th}>Asset</th>
                        <th style={styles.th}>Type</th>
                        <th style={styles.th}>Serial No.</th>
                        <th style={styles.th}>Issued Date</th>
                        <th style={styles.th}>Condition</th>
                        <th style={styles.th}>Status</th>
                        <th style={{ ...styles.th, textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {empAssets.map((asset) => {
                        const tc = typeColor(asset.type);
                        const cs = conditionStyle(asset.condition);
                        // Prefer the asset row's own employeeId/Name (always
                        // present on a saved Asset), fall back to whatever
                        // the empMap lookup gave us at the group level.
                        const rowEmpId   = asset.employeeId   || empId;
                        const rowEmpName = asset.employeeName || emp.name;
                        return (
                          <tr key={asset._id || asset.id}>
                            <td>
                              <span style={{
                                fontFamily: 'monospace', fontSize: 12, fontWeight: 700,
                                color: '#4299E1', background: '#EBF4FD',
                                padding: '3px 8px', borderRadius: 6,
                              }}>{rowEmpId || '—'}</span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{
                                  width: 26, height: 26, borderRadius: 6,
                                  background: (emp.color || '#A0AEC0') + '22',
                                  color: emp.color || '#4A5568',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontWeight: 700, fontSize: 10, flexShrink: 0,
                                }}>{emp.initials}</div>
                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-main)' }}>
                                  {rowEmpName || '—'}
                                </span>
                              </div>
                            </td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ width: 34, height: 34, borderRadius: 8, background: tc.bg, color: tc.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  {typeIcon(asset.type)}
                                </div>
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-main)' }}>{asset.assetName}</div>
                                  <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-light)' }}>{asset.id}</div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: tc.color, background: tc.bg, padding: '3px 8px', borderRadius: 6 }}>
                                {typeIcon(asset.type, 12)} {asset.type}
                              </span>
                            </td>
                            <td>
                              <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-main)' }}>{asset.serialNo}</span>
                            </td>
                            <td>
                              <span style={{ fontSize: 12, color: 'var(--text-light)' }}>{formatDate(asset.issuedDate)}</span>
                            </td>
                            <td>
                              <span style={{ fontSize: 11, fontWeight: 700, color: cs.color, background: cs.bg, padding: '3px 8px', borderRadius: 6 }}>
                                {asset.condition}
                              </span>
                            </td>
                            <td>
                              <span style={{
                                fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                                background: asset.status === 'Assigned' ? '#EBF4FD' : asset.status === 'Available' ? '#F1F9EE' : '#FFF5F5',
                                color: asset.status === 'Assigned' ? '#4299E1' : asset.status === 'Available' ? '#4CAA17' : '#FC8181',
                              }}>
                                {asset.status}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                <button
                                  className="emp-table-btn"
                                  style={{ padding: 6 }}
                                  title="Edit"
                                  onClick={() => openEditModal(asset)}
                                >
                                  <Edit2 size={13} />
                                </button>
                                <button
                                  className="emp-table-btn"
                                  style={{ padding: 6, color: '#FC8181' }}
                                  title="Delete"
                                  onClick={() => handleDelete(asset)}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Modal (add or edit) */}
      {showModal && (
        <AssetModal
          onClose={closeModal}
          onSave={handleSave}
          mode={editingAsset ? 'edit' : 'add'}
          initialAsset={editingAsset}
          employees={employees}
        />
      )}
    </div>
  );
}


// Inline styles
const styles = {
  statsRow: { display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 24 },
  // Equal-size cards in a flex row. Each card uses its own flex layout so
  // the coloured icon tile + number + label all sit on one line with
  // consistent spacing — the previous version was missing statIcon /
  // statNum / statLbl entirely, which is why ID Card's green tile was a
  // different size to the other types' tiles.
  statCard: {
    flex: '1 1 130px',
    background: 'var(--card-bg)',
    border: '1px solid var(--border-color)',
    borderRadius: 12,
    padding: '16px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    minHeight: 76,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  statNum: {
    fontSize: 22,
    fontWeight: 800,
    color: 'var(--text-main)',
    lineHeight: 1.1,
  },
  statLbl: {
    fontSize: 12,
    color: 'var(--text-light)',
    fontWeight: 600,
    marginTop: 2,
  },

  // ── Per-employee asset grouping ─────────────────────────────────────
  empGroup: {
    borderTop: '1px solid var(--border-color)',
  },
  empGroupHeader: {
    padding: '12px 24px',
    background: '#F8FAFC',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderBottom: '1px solid var(--border-color)',
  },

  // Table headers inside the per-employee accordion.
  th: {
    position: 'sticky',
    top: 0,
    background: '#f8fafc',
    zIndex: 5,
    textAlign: 'left',
    fontSize: 10,
    fontWeight: 800,
    color: 'var(--text-light)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    padding: '10px 14px',
    boxShadow: 'inset 0 -1px 0 var(--border-color)',
  },
};
