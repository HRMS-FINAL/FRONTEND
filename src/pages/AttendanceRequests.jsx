/**
 * AttendanceRequests — HR view of every regularisation request filed
 * from the ERM Mobile app (Attendance tab → Request).
 *
 * Mounted at activeView === 'attendance-requests' and reachable via
 * Sidebar → Attendance → "Attendance Requests".
 *
 * Data flow
 * ─────────
 *   ERM Mobile → POST /api/attendance/request (mobile backend)
 *      ↓ AttendanceRequest collection
 *   HRMS    → GET  /api/attendance-requests        (proxy → mobile admin)
 *   HRMS    → PATCH /api/attendance-requests/:id   (proxy → mobile admin)
 *
 * The mobile backend's adminUpdateRequest fires an in-app notification
 * to the employee, so the bell badge updates as soon as HR clicks
 * Approve / Reject here.
 */
import React, { useEffect, useState, useMemo } from 'react';
import { Check, X, Clock, Search, Inbox } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { API } from '../config/api';
import { useConfirm } from '../components/ConfirmDialog';

const TABS = [
  { key: 'pending',  label: 'Pending'  },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

function fmtDDMMYYYY(iso) {
  if (!iso) return '—';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(iso);
}

export default function AttendanceRequests({ onBack }) {
  const { showNotification } = useNotification();
  const confirm = useConfirm();
  const [items, setItems]     = useState([]);
  const [tab,    setTab]      = useState('pending');
  const [search, setSearch]   = useState('');
  const [loading, setLoading] = useState(true);
  const [acting, setActing]   = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/attendance-requests?status=${tab}`);
      const j = await r.json().catch(() => ({}));
      setItems(Array.isArray(j?.items) ? j.items : []);
    } catch (err) {
      showNotification(err?.message || 'Could not load requests', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) =>
      [it.employeeName, it.employeeId, it.email, it.department, it.designation, it.reason]
        .filter(Boolean).join(' ').toLowerCase().includes(q)
    );
  }, [items, search]);

  const act = async (row, status) => {
    const ok = await confirm({
      title: `${status === 'approved' ? 'Approve' : 'Reject'} attendance request?`,
      message: `${row.employeeName || row.employeeId} — ${fmtDDMMYYYY(row.date)}\n\n${row.reason || 'No reason given'}`,
      confirmLabel: status === 'approved' ? 'Approve' : 'Reject',
      destructive: status === 'rejected',
    });
    if (!ok) return;
    setActing(row._id);
    try {
      const r = await fetch(`${API}/attendance-requests/${row._id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status, reviewedBy: 'HR' }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.message || `HTTP ${r.status}`);
      showNotification(`Request ${status}`, 'success');
      load();
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="emp-list-page" style={{ flex: 'unset', minHeight: 'auto', height: 'auto', overflow: 'visible' }}>
      <div className="emp-list-header">
        <div className="emp-list-title-row">
          <div>
            <h1 className="ne-page-title">Attendance Requests</h1>
            <p className="ne-page-sub">Regularisation requests from ERM Mobile employees.</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, padding: '14px 0' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700,
              border: '1px solid ' + (tab === t.key ? 'var(--primary)' : '#E2E8F0'),
              background: tab === t.key ? 'var(--primary)' : '#fff',
              color: tab === t.key ? '#fff' : '#475569', cursor: 'pointer',
            }}
          >{t.label}</button>
        ))}
        <div style={{ flex: 1 }} />
        <div className="topbar-search" style={{ maxWidth: 300 }}>
          <Search size={14} />
          <input
            placeholder="Search name / id / reason…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="emp-table-card" style={{ marginTop: 8 }}>
        <table className="emp-table" style={{ tableLayout: 'fixed', width: '100%' }}>
          <colgroup>
            <col style={{ width: '20%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '34%' }} />
            <col style={{ width: '23%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Date</th>
              <th>Filed</th>
              <th>Reason</th>
              <th style={{ textAlign: 'center' }}>{tab === 'pending' ? 'Action' : 'Status'}</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--text-light)' }}>Loading…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--text-light)' }}>
                <Inbox size={32} style={{ display: 'block', margin: '0 auto 8px', opacity: 0.5 }} />
                No {tab} requests.
              </td></tr>
            )}
            {!loading && filtered.map((row) => (
              <tr key={row._id}>
                <td>
                  <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{row.employeeName || '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-light)' }}>{row.employeeId} · {row.department || '—'}</div>
                </td>
                <td>{fmtDDMMYYYY(row.date)}</td>
                <td>{fmtDDMMYYYY(row.createdAt)}</td>
                <td style={{ fontSize: 12, color: 'var(--text-main)' }}>{row.reason || '—'}</td>
                <td style={{ textAlign: 'center' }}>
                  {tab === 'pending' ? (
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      <button
                        disabled={acting === row._id}
                        onClick={() => act(row, 'approved')}
                        style={{
                          padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                          background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0', cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}
                      ><Check size={12} /> Approve</button>
                      <button
                        disabled={acting === row._id}
                        onClick={() => act(row, 'rejected')}
                        style={{
                          padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                          background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA', cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}
                      ><X size={12} /> Reject</button>
                    </div>
                  ) : (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                      background: row.status === 'approved' ? '#F0FDF4'
                                : row.status === 'rejected' ? '#FEF2F2' : '#FFFBEB',
                      color:      row.status === 'approved' ? '#16A34A'
                                : row.status === 'rejected' ? '#DC2626' : '#D97706',
                    }}>
                      {row.status === 'approved' ? <Check size={12} /> :
                       row.status === 'rejected' ? <X size={12} /> : <Clock size={12} />}
                      {row.status[0].toUpperCase() + row.status.slice(1)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
