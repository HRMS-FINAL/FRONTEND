import React, { useState, useEffect } from 'react';
import { Search, Filter, MessageSquare, AlertCircle, X } from 'lucide-react';

// Mobile-app complaints arrive via HRMS backend proxy at /api/complaints
// (server-side proxies to https://backend-emqy.onrender.com using
// MOBILE_ADMIN_SECRET). UI layout below is unchanged — only the data
// source is now real instead of hardcoded.
import { API } from '../config/api';
const LS_KEY = 'tesco_hrms_complaints_cache';

const priorityColors = {
  'Low': { bg: '#22c55e15', text: '#22c55e', dot: '#22c55e' },
  'Medium': { bg: '#eab30815', text: '#ca8a04', dot: '#eab308' },
  'High': { bg: '#f9731615', text: '#ea580c', dot: '#f97316' },
  'Critical': { bg: '#ef444415', text: '#dc2626', dot: '#ef4444' },
};

/** Read cached complaints from previous session so the table appears
 *  INSTANTLY on page load — no 30-second blank-state while the mobile
 *  backend cold-starts on Render free tier. The fresh data overwrites
 *  this once the network call returns (~2 s warm, ~30 s cold). */
function readCache() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export default function ComplainRegister() {
  const [search, setSearch] = useState('');
  const [selectedComplaint, setSelectedComplaint] = useState(null);

  // Seed from localStorage cache so the table is never empty on first
  // render after refresh.
  const [complaints, setComplaints] = useState(() => readCache());
  // Distinguish "first fetch in flight" from "got fresh data" so we can
  // show a tiny "Refreshing…" hint when the cache is being updated.
  const [loading, setLoading]       = useState(true);

  // Fetch complaints from the HRMS backend proxy, which transparently pulls
  // them from the mobile backend. We poll every 30s so newly-filed mobile
  // complaints show up without a page refresh.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res  = await fetch(`${API}/complaints?limit=200`);
        const data = await res.json();
        if (!cancelled && data && Array.isArray(data.items)) {
          setComplaints(data.items);
          // Persist to localStorage so the NEXT mount of this page already
          // has data to show (avoiding the cold-start blank state again).
          try { localStorage.setItem(LS_KEY, JSON.stringify(data.items)); } catch {}
        }
      } catch {
        // network error — leave cached data on screen
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const t = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  // Search matches the subject, the employee ID, OR the employee name —
  // so HR can find a complaint by who raised it as well as by topic.
  const filtered = complaints.filter(c => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      (c.subject      || '').toLowerCase().includes(q) ||
      (c.employeeId   || '').toLowerCase().includes(q) ||
      (c.employeeName || c.name || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="emp-list-page">
      <div className="emp-list-header">
        <div className="emp-list-title-row">
          <div>
            <h1 className="ne-page-title">Employee Feedback & Complaints</h1>
            <p className="ne-page-sub">Review and manage issues raised by the team.</p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-main)', width: '250px' }}>
              <Search size={16} color="#94a3b8" style={{ flexShrink: 0 }} />
              <input
                type="text"
                placeholder="Search feedback..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '13px', color: 'var(--text-main)' }}
              />
            </div>
            <button className="ne-btn-secondary"><Filter size={16} /> Filter</button>
          </div>
        </div>
      </div>

      <div style={{ padding: '24px' }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="emp-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ padding: '16px', textAlign: 'left', borderBottom: '1px solid var(--border-color)', fontSize: '12px', color: 'var(--text-light)', textTransform: 'uppercase' }}>Emp ID</th>
                <th style={{ padding: '16px', textAlign: 'left', borderBottom: '1px solid var(--border-color)', fontSize: '12px', color: 'var(--text-light)', textTransform: 'uppercase' }}>Employee</th>
                <th style={{ padding: '16px', textAlign: 'left', borderBottom: '1px solid var(--border-color)', fontSize: '12px', color: 'var(--text-light)', textTransform: 'uppercase' }}>Subject</th>
                <th style={{ padding: '16px', textAlign: 'left', borderBottom: '1px solid var(--border-color)', fontSize: '12px', color: 'var(--text-light)', textTransform: 'uppercase' }}>Priority</th>
                <th style={{ padding: '16px', textAlign: 'left', borderBottom: '1px solid var(--border-color)', fontSize: '12px', color: 'var(--text-light)', textTransform: 'uppercase' }}>Date</th>
                <th style={{ padding: '16px', textAlign: 'right', borderBottom: '1px solid var(--border-color)' }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr key={item._id || item.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  {/* Emp ID — the company's actual employee code (TES047) —
                      shown alongside the employee name. Replaces the
                      meaningless task-id (FB-XXXXXX) that used to leak
                      through. */}
                  <td style={{ padding: '16px', fontWeight: 700, color: 'var(--text-main)', fontSize: '13px' }}>
                    {item.employeeId || item.empId || '—'}
                  </td>
                  <td style={{ padding: '16px', fontSize: '13px', color: 'var(--text-main)', fontWeight: 600 }}>
                    {item.employeeName || item.name || item.employee?.name || '—'}
                  </td>
                  <td style={{ padding: '16px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '14px', marginBottom: '4px' }}>{item.subject}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-light)', maxWidth: '400px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.description}
                    </div>
                  </td>
                  <td style={{ padding: '16px' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 700,
                      background: priorityColors[item.priority].bg,
                      color: priorityColors[item.priority].text
                    }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: priorityColors[item.priority].dot }} />
                      {item.priority}
                    </span>
                  </td>
                  <td style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)' }}>{item.date}</td>
                  <td style={{ padding: '16px', textAlign: 'right' }}>
                    <button className="ne-btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => setSelectedComplaint(item)}>
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-light)' }}>
              <AlertCircle size={32} style={{ opacity: 0.5, margin: '0 auto 12px' }} />
              <div style={{ fontWeight: 600 }}>
                {loading
                  ? 'Loading complaints from server… first load can take ~30s if the mobile backend is waking up.'
                  : 'No feedback records found.'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Side Feedback Details Drawer */}
      {selectedComplaint && (
        <>
          <div
            onClick={() => setSelectedComplaint(null)}
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(2px)', zIndex: 999 }}
          />
          <div
            style={{
              position: 'fixed', top: 0, right: 0, width: '450px', height: '100vh',
              background: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.1)', zIndex: 1000,
              display: 'flex', flexDirection: 'column',
              animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid var(--border-color)' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-main)' }}>Feedback Details</h3>
                <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-light)', fontWeight: 600 }}>{selectedComplaint.id}</p>
              </div>
              <button
                onClick={() => setSelectedComplaint(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-light)', transition: 'background-color 0.2s' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-main)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <X size={20} />
              </button>
            </div>

            <div className="edit-panel-body" style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Subject</label>
                <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-main)' }}>{selectedComplaint.subject}</div>
              </div>

              <div style={{ display: 'flex', gap: '40px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Date Submitted</label>
                  <div style={{ fontSize: '14px', color: 'var(--text-main)' }}>{selectedComplaint.date}</div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Priority</label>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 700,
                    background: priorityColors[selectedComplaint.priority].bg,
                    color: priorityColors[selectedComplaint.priority].text
                  }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: priorityColors[selectedComplaint.priority].dot }} />
                    {selectedComplaint.priority}
                  </span>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Detailed Description</label>
                <div style={{ fontSize: '14px', color: 'var(--text-main)', lineHeight: '1.6', background: 'var(--bg-main)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  {selectedComplaint.description}
                </div>
              </div>
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: '#fafafa' }}>
              <button type="button" onClick={() => setSelectedComplaint(null)} className="ne-btn-secondary" style={{ padding: '8px 16px', fontSize: '13px' }}>Close</button>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
