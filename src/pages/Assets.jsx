import React, { useState, useMemo } from 'react';
import {
  Laptop, Monitor, Mouse, Keyboard, CreditCard,
  Search, Filter, Plus, Edit2, Trash2, Cpu, X,
  ChevronRight, Package, CheckCircle2, AlertCircle, User, Hash, Smartphone
} from 'lucide-react';
import { allEmployees } from '../data/mockData';

// ─── Initial asset data (employee-centric) ───────────────────────────────────
const initialAssets = [
  { id: 'AST-001', assetName: 'MacBook Pro M2 14"',     type: 'Laptop',   employeeId: 'EMP-1001', serialNo: 'MBP-2023-001', issuedDate: '2023-01-15', condition: 'Good',   status: 'Assigned' },
  { id: 'AST-002', assetName: 'Dell UltraSharp 27"',    type: 'Monitor',  employeeId: 'EMP-1001', serialNo: 'DEL-MON-027',  issuedDate: '2023-01-15', condition: 'Good',   status: 'Assigned' },
  { id: 'AST-003', assetName: 'Logitech MX Master 3',   type: 'Mouse',    employeeId: 'EMP-1001', serialNo: 'LGT-MX3-003',  issuedDate: '2023-01-15', condition: 'Good',   status: 'Assigned' },
  { id: 'AST-004', assetName: 'Keychron K2',             type: 'Keyboard', employeeId: 'EMP-1001', serialNo: 'KEY-K2-004',   issuedDate: '2023-01-15', condition: 'Good',   status: 'Assigned' },
  { id: 'AST-005', assetName: 'Employee ID Card',        type: 'ID Card',  employeeId: 'EMP-1001', serialNo: 'IDC-1001',     issuedDate: '2023-01-12', condition: 'Good',   status: 'Assigned' },

  { id: 'AST-006', assetName: 'MacBook Air M1',          type: 'Laptop',   employeeId: 'EMP-1002', serialNo: 'MBA-2023-006', issuedDate: '2023-02-10', condition: 'Fair',   status: 'Assigned' },
  { id: 'AST-007', assetName: 'Magic Mouse',             type: 'Mouse',    employeeId: 'EMP-1002', serialNo: 'APL-MM-007',   issuedDate: '2023-02-10', condition: 'Good',   status: 'Assigned' },
  { id: 'AST-008', assetName: 'Employee ID Card',        type: 'ID Card',  employeeId: 'EMP-1002', serialNo: 'IDC-1002',     issuedDate: '2023-02-05', condition: 'Good',   status: 'Assigned' },

  { id: 'AST-009', assetName: 'Lenovo ThinkPad X1',      type: 'Laptop',   employeeId: 'EMP-1003', serialNo: 'LNV-X1-009',   issuedDate: '2023-03-20', condition: 'Good',   status: 'Assigned' },
  { id: 'AST-010', assetName: 'Employee ID Card',        type: 'ID Card',  employeeId: 'EMP-1003', serialNo: 'IDC-1003',     issuedDate: '2023-03-15', condition: 'Poor',   status: 'Assigned' },

  { id: 'AST-011', assetName: 'HP EliteBook 840',        type: 'Laptop',   employeeId: 'EMP-1004', serialNo: 'HP-840-011',   issuedDate: '2023-04-01', condition: 'Good',   status: 'Assigned' },
  { id: 'AST-012', assetName: 'Logitech G502',           type: 'Mouse',    employeeId: 'EMP-1004', serialNo: 'LGT-G502-012', issuedDate: '2023-04-01', condition: 'Good',   status: 'Assigned' },
  { id: 'AST-013', assetName: 'Employee ID Card',        type: 'ID Card',  employeeId: 'EMP-1004', serialNo: 'IDC-1004',     issuedDate: '2023-03-30', condition: 'Good',   status: 'Assigned' },

  { id: 'AST-014', assetName: 'Dell XPS 15',             type: 'Laptop',   employeeId: 'EMP-1005', serialNo: 'DLL-XPS-014',  issuedDate: '2023-05-10', condition: 'Good',   status: 'Assigned' },
  { id: 'AST-015', assetName: 'LG 32" 4K Monitor',      type: 'Monitor',  employeeId: 'EMP-1005', serialNo: 'LG-4K-015',    issuedDate: '2023-05-10', condition: 'New',    status: 'Assigned' },
  { id: 'AST-016', assetName: 'Anne Pro 2',              type: 'Keyboard', employeeId: 'EMP-1005', serialNo: 'ANP-2-016',    issuedDate: '2023-05-10', condition: 'Good',   status: 'Assigned' },
  { id: 'AST-017', assetName: 'Employee ID Card',        type: 'ID Card',  employeeId: 'EMP-1005', serialNo: 'IDC-1005',     issuedDate: '2023-05-08', condition: 'Good',   status: 'Assigned' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
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
  headerSub: { fontSize: 12, color: 'var(--text-muted)', marginTop: 2 },
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
  stepCard: {
    background: 'var(--bg-main)', border: '1px solid var(--border-color)',
    borderRadius: 12, padding: '16px', marginBottom: 16,
  },
  stepHeader: {
    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
  },
  stepTitle: {
    display: 'flex', alignItems: 'center', gap: 6,
    fontSize: 12, fontWeight: 700, color: 'var(--text-main)',
    textTransform: 'uppercase', letterSpacing: '.06em',
  },
  stepBadge: {
    width: 20, height: 20, borderRadius: '50%', fontSize: 10, fontWeight: 700,
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
  divider: { height: 1, background: 'var(--border-color)', margin: '4px 0 16px' },
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

const genAssetId = (list) => {
  const max = list.reduce((m, a) => {
    const n = parseInt(a.id.replace('AST-', ''), 10);
    return n > m ? n : m;
  }, 0);
  return `AST-${String(max + 1).padStart(3, '0')}`;
};

// ─── Add-Asset Drawer ─────────────────────────────────────────────────────────
function AddAssetModal({ onClose, onSave, existingAssets }) {
  const [empIdInput, setEmpIdInput] = useState('');
  const [foundEmp, setFoundEmp] = useState(null);
  const [empError, setEmpError] = useState('');
  const [searched, setSearched] = useState(false);
  const [form, setForm] = useState({
    assetName: '',
    type: 'Laptop',
    serialNo: '',
    issuedDate: new Date().toISOString().split('T')[0],
    condition: 'Good',
    status: 'Assigned',
  });
  const [errors, setErrors] = useState({});

  const handleSearch = () => {
    const trimmed = empIdInput.trim().toUpperCase();
    setSearched(true);
    const emp = allEmployees.find(
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
    if (!foundEmp) e.emp = 'Please look up a valid employee first.';
    if (!form.assetName.trim()) e.assetName = 'Asset name is required.';
    if (!form.serialNo.trim()) e.serialNo = 'Serial / Asset number is required.';
    if (!form.issuedDate) e.issuedDate = 'Issue date is required.';
    return e;
  };

  const handleSubmit = () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    onSave({ id: genAssetId(existingAssets), employeeId: foundEmp.employeeId, ...form });
    onClose();
  };

  return (
    /* Backdrop — click outside to close */
    <div style={drawerStyles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={drawerStyles.panel}>

        {/* ── Header ── */}
        <div style={drawerStyles.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={drawerStyles.headerIconWrap}>
              <Package size={18} />
            </div>
            <div>
              <div style={drawerStyles.headerTitle}>Add New Asset</div>
              <div style={drawerStyles.headerSub}>Assign equipment to an employee</div>
            </div>
          </div>
          <button onClick={onClose} style={drawerStyles.closeBtn} title="Close">
            <X size={16} />
          </button>
        </div>

        {/* ── Scrollable Body ── */}
        <div style={drawerStyles.body}>

          {/* ── Step 1: Employee Lookup ── */}
          <section style={drawerStyles.section}>
            <div style={drawerStyles.sectionTitle}>
              <span style={drawerStyles.stepDot}>1</span>
              <User size={13} /> Employee Lookup
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <Hash size={14} style={drawerStyles.inputIcon} />
                <input
                  style={{
                    ...drawerStyles.input,
                    paddingTop: 9, paddingBottom: 9, paddingRight: 12, paddingLeft: 34,
                    ...(errors.emp && !foundEmp ? drawerStyles.inputErr : {}),
                  }}
                  placeholder="e.g. EMP-1001"
                  value={empIdInput}
                  onChange={(e) => {
                    setEmpIdInput(e.target.value);
                    setSearched(false);
                    setFoundEmp(null);
                    setEmpError('');
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
              </div>
              <button onClick={handleSearch} style={drawerStyles.findBtn}>
                <Search size={14} /> Find
              </button>
            </div>

            {/* Found employee card */}
            {searched && foundEmp && (
              <div style={drawerStyles.empCard}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  background: foundEmp.color + '22', color: foundEmp.color,
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

            {/* Error */}
            {searched && empError && (
              <div style={drawerStyles.errBox}>
                <AlertCircle size={13} /> {empError}
              </div>
            )}
            {errors.emp && !foundEmp && !searched && (
              <div style={drawerStyles.fieldErr}>{errors.emp}</div>
            )}
          </section>

          {/* ── Divider ── */}
          <div style={drawerStyles.divider} />

          {/* ── Step 2: Asset Details ── */}
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

            {/* Asset Type chips */}
            <div style={drawerStyles.fieldGroup}>
              <label style={drawerStyles.label}>Asset Type</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {ASSET_TYPES.map((t) => {
                  const active = form.type === t;
                  return (
                    <button
                      key={t}
                      onClick={() => handleChange('type', t)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '5px 11px', borderRadius: 8, fontSize: 12,
                        cursor: 'pointer', transition: 'all .15s',
                        border: `1.5px solid ${active ? 'var(--primary)' : 'var(--border-mid)'}`,
                        background: active ? 'var(--primary-light)' : 'var(--bg-main)',
                        color: active ? 'var(--primary-dark)' : 'var(--text-muted)',
                        fontWeight: active ? 700 : 500,
                        boxShadow: active ? '0 0 0 3px rgba(67,160,71,0.1)' : 'none',
                      }}
                    >
                      {typeIcon(t, 12)} {t}
                    </button>
                  );
                })}
              </div>
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

        {/* ── Footer ── */}
        <div style={drawerStyles.footer}>
          <button onClick={onClose} style={drawerStyles.cancelBtn}>Cancel</button>
          <button onClick={handleSubmit} style={drawerStyles.saveBtn}>
            <Plus size={15} /> Add Asset
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Assets Page ─────────────────────────────────────────────────────────
export default function Assets() {
  const [assets, setAssets] = useState(initialAssets);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [showModal, setShowModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);

  // Build employee map
  const empMap = useMemo(() => {
    const m = {};
    allEmployees.forEach((e) => { m[e.employeeId] = e; });
    return m;
  }, []);

  // Filter assets
  const filtered = useMemo(() => {
    return assets.filter((a) => {
      const emp = empMap[a.employeeId];
      const empName = emp?.name?.toLowerCase() || '';
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        a.assetName.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        a.employeeId.toLowerCase().includes(q) ||
        a.serialNo.toLowerCase().includes(q) ||
        empName.includes(q);
      const matchesType = filterType === 'All' || a.type === filterType;
      return matchesSearch && matchesType;
    });
  }, [assets, searchTerm, filterType, empMap]);

  // Group by employee
  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach((a) => {
      if (!map[a.employeeId]) map[a.employeeId] = [];
      map[a.employeeId].push(a);
    });
    return Object.entries(map);
  }, [filtered]);

  // Stats
  const stats = useMemo(() => {
    const total = assets.length;
    const byType = {};
    ASSET_TYPES.forEach((t) => { byType[t] = assets.filter((a) => a.type === t).length; });
    const empCount = new Set(assets.map((a) => a.employeeId)).size;
    return { total, byType, empCount };
  }, [assets]);

  const handleDelete = (id) => setAssets((prev) => prev.filter((a) => a.id !== id));
  const handleSave = (asset) => setAssets((prev) => [...prev, asset]);

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
      {/* ── Header ── */}
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
          <button className="ne-btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={16} /> Add Asset
          </button>
        </div>
      </div>

      {/* ── Stat Cards ── */}
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

      {/* ── Table Card ── */}
      <div className="card" style={{ marginTop: 24 }}>
        {/* Toolbar */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="panel-search" style={{ flex: 1, minWidth: 200 }}>
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder="Search by name, asset ID, employee ID, serial no…"
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

        {/* Employee-grouped rows */}
        <div style={{ overflowX: 'auto' }}>
          {grouped.length === 0 ? (
            <div style={{ padding: '60px 24px', textAlign: 'center', color: 'var(--text-light)' }}>
              <Package size={40} style={{ marginBottom: 12, opacity: .3 }} />
              <div style={{ fontSize: 15, fontWeight: 600 }}>No assets found</div>
              <div style={{ fontSize: 13 }}>Try adjusting your search or filters.</div>
            </div>
          ) : (
            grouped.map(([empId, empAssets]) => {
              const emp = empMap[empId] || { name: empId, role: '—', dept: '—', initials: empId.slice(0, 2), color: '#A0AEC0' };
              return (
                <div key={empId} style={styles.empGroup}>
                  {/* Employee header row */}
                  <div style={styles.empGroupHeader}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 12, background: emp.color + '22', color: emp.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
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

                  {/* Asset rows for this employee */}
                  <table className="emp-table" style={{ marginBottom: 0 }}>
                    <thead>
                      <tr>
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
                        return (
                          <tr key={asset.id}>
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
                                <button className="emp-table-btn" style={{ padding: 6 }} title="Edit"><Edit2 size={13} /></button>
                                <button className="emp-table-btn" style={{ padding: 6, color: '#FC8181' }} title="Delete" onClick={() => handleDelete(asset.id)}><Trash2 size={13} /></button>
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

      {/* ── Modal ── */}
      {showModal && (
        <AddAssetModal
          onClose={() => setShowModal(false)}
          onSave={handleSave}
          existingAssets={assets}
        />
      )}
    </div>
  );
}

// ─── Inline styles ────────────────────────────────────────────────────────────
const styles = {
  statsRow: {
    display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 24,
  },
  statCard: {
    flex: '1 1 130px', background: 'var(--card-bg)', border: '1px solid var(--border-color)',
    borderRadius: 14, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14,
    boxShadow: '0 1px 4px rgba(0,0,0,.04)',
  },
  statIcon: {
    width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  statNum: { fontWeight: 800, fontSize: 22, color: 'var(--text-main)', lineHeight: 1.1 },
  statLbl: { fontSize: 11, color: 'var(--text-light)', fontWeight: 500, marginTop: 2 },

  empGroup: {
    borderBottom: '1px solid var(--border-color)',
  },
  empGroupHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
    padding: '14px 20px', background: 'linear-gradient(90deg, #F8FAFC 0%, #FFFFFF 100%)',
    borderBottom: '1px solid var(--border-color)',
  },
  th: {
    position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5, fontSize: 12, fontWeight: 600,
  },
};

