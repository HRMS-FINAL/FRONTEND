import React, { useState, useEffect, useRef } from 'react';
import {
  Megaphone, Plus, Search, Filter, MoreVertical,
  Calendar, User, Tag, ChevronRight, Send, X, AlertCircle, Trash2,
  Paperclip, Download, FileText,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';

import { API } from '../config/api';
import { useConfirm } from '../components/ConfirmDialog';
const LS_KEY = 'tesco_hrms_announcements_cache';

/** Read last-fetched announcements from localStorage so the list shows
 *  instantly on refresh instead of being blank for the ~30 s mobile-
 *  backend cold-start. */
function readCache() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

// Map any API record into the shape this UI uses
const mapApi = (a) => ({
  id:        a._id || a.id,
  title:     a.title,
  content:   a.description || a.content || a.body || '',
  category:  a.category  || 'General',
  priority:  a.priority  || 'Low',
  author:    a.createdByName || a.author || 'HR',
  date: a.publishDate
    ? (() => { const __d = new Date(a.publishDate); if (!__d || isNaN(__d.getTime?.() ?? new Date(__d).getTime())) return '—'; const __dd = (__d instanceof Date) ? __d : new Date(__d); const __day = String(__dd.getDate()).padStart(2,'0'); const __mo  = String(__dd.getMonth()+1).padStart(2,'0'); const __yr  = __dd.getFullYear(); return __day + '-' + __mo + '-' + __yr; })()
    : (a.createdAt
        ? (() => { const __d = new Date(a.createdAt); if (!__d || isNaN(__d.getTime?.() ?? new Date(__d).getTime())) return '—'; const __dd = (__d instanceof Date) ? __d : new Date(__d); const __day = String(__dd.getDate()).padStart(2,'0'); const __mo  = String(__dd.getMonth()+1).padStart(2,'0'); const __yr  = __dd.getFullYear(); return __day + '-' + __mo + '-' + __yr; })()
        : ''),
  isNew: a.createdAt ? (Date.now() - new Date(a.createdAt).getTime()) < 1000 * 60 * 60 * 24 * 3 : false,
  // Attachments — keep the same shape backend stores so the card can render
  // download links straight from `dataBase64` (inline) or `url` (external).
  attachments: Array.isArray(a.attachments) ? a.attachments : [],
});

// Pretty-print bytes for the attachment chip ("184 KB", "2.3 MB").
function fmtBytes(n) {
  const x = Number(n) || 0;
  if (x < 1024) return `${x} B`;
  if (x < 1024 * 1024) return `${(x / 1024).toFixed(1)} KB`;
  return `${(x / 1024 / 1024).toFixed(1)} MB`;
}
// Trigger a download from inline base64 OR an external URL.
function downloadAttachment(att) {
  if (att.dataBase64) {
    const a = document.createElement('a');
    a.href = `data:${att.mimeType || 'application/octet-stream'};base64,${att.dataBase64}`;
    a.download = att.name || 'attachment';
    document.body.appendChild(a); a.click(); a.remove();
  } else if (att.url) {
    window.open(att.url, '_blank', 'noopener');
  }
}

export default function Announcements({ onBack }) {
  const { user } = useAuth() || {};
  // Pull the toast + confirm-dialog helpers from the NotificationContext.
  // Without these, the Delete button silently no-op'd because confirmDialog
  // was undefined and `await undefined` resolved to undefined → !undefined
  // === true → the handleDelete function returned before hitting the API.
  const { showNotification, confirmDialog } = useNotification();
  const [showPostModal, setShowPostModal] = useState(false);
  // Seed announcements from cache so the list paints immediately on refresh
  // instead of being blank during the mobile-backend cold-start.
  const [announcements, setAnnouncements] = useState(() => readCache());
  const [loading, setLoading]   = useState(false);
  const [openMenuId, setOpenMenuId] = useState(null);
  const menuRef = useRef(null);

  const [newPost, setNewPost] = useState({ title: '', content: '', category: 'General', priority: 'Low', attachments: [] });
  // Search + category filter — both wired below so they actually narrow
  // the visible list. The filter button opens a small dropdown of the
  // categories present in the loaded announcements.
  const [searchQuery,    setSearchQuery]    = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterOpen,     setFilterOpen]     = useState(false);
  const [postErrors, setPostErrors] = useState({});
  const [uploadingFile, setUploadingFile] = useState(false);
  const confirm = useConfirm();
  // Cap one file at 5 MB before base64 inflation. The express.json limit
  // on the server is 12 MB which leaves headroom for a few attachments.
  const MAX_FILE_BYTES = 5 * 1024 * 1024;

  // File picker → base64 in memory → push onto newPost.attachments.
  const handlePickFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    setUploadingFile(true);
    try {
      const next = [];
      for (const f of files) {
        if (f.size > MAX_FILE_BYTES) {
          showNotification(`"${f.name}" is over the 5 MB limit and was skipped.`, 'error');
          continue;
        }
        // Read as data URL and split off the base64 payload.
        const dataUrl = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload  = () => resolve(r.result);
          r.onerror = () => reject(r.error);
          r.readAsDataURL(f);
        });
        const base64 = String(dataUrl).split(',')[1] || '';
        next.push({ name: f.name, mimeType: f.type || 'application/octet-stream', size: f.size, dataBase64: base64 });
      }
      if (next.length) {
        setNewPost(prev => ({ ...prev, attachments: [...prev.attachments, ...next] }));
      }
    } catch (err) {
      showNotification(`Could not read file: ${err?.message || 'unknown'}`, 'error');
    } finally {
      setUploadingFile(false);
    }
  };
  const removePickedFile = (idx) => {
    setNewPost(prev => ({ ...prev, attachments: prev.attachments.filter((_, i) => i !== idx) }));
  };

  // Load announcements from API on mount. Cache the result to localStorage
  // so subsequent refreshes pick up where the user left off.
  const loadAnnouncements = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/announcements`);
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        const mapped = data.data.map(mapApi);
        setAnnouncements(mapped);
        try { localStorage.setItem(LS_KEY, JSON.stringify(mapped)); } catch {}
      }
    } catch (err) {
      console.error('Failed to load announcements:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAnnouncements(); }, []);

  // Close three-dot menu on outside click
  useEffect(() => {
    const onDocClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpenMenuId(null);
    };
    if (openMenuId !== null) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [openMenuId]);

  // Create
  const handlePost = async (e) => {
    e.preventDefault();
    let errors = {};
    if (!newPost.title.trim())   errors.title   = 'Title is required';
    if (!newPost.content.trim()) errors.content = 'Content cannot be empty';
    if (Object.keys(errors).length > 0) { setPostErrors(errors); return; }
    // Confirm before broadcasting — announcements push to every
    // employee's ERM Mobile + Web feed instantly, so the prompt is
    // a safety gate against accidental sends.
    const ok = await confirm({
      title: 'Post this announcement?',
      message: `Title: "${newPost.title.trim()}"\n\nIt will appear in every employee's ERM app immediately.`,
      confirmLabel: 'Post',
    });
    if (!ok) return;

    // Send the create request and check the response BEFORE closing the
    // modal. The previous code closed the modal in the finally branch
    // even when the POST failed (write-gate denial, attachment-too-big,
    // network blip), which made HR think the announcement was posted —
    // it then disappeared on the next list refresh because it was never
    // actually saved.
    let res;
    try {
      res = await fetch(`${API}/announcements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:    newPost.title.trim(),
          content:  newPost.content.trim(),
          category: newPost.category,
          priority: newPost.priority,
          author:   user?.name || 'HR',
          createdByRole: user?.role || '',
          attachments: newPost.attachments,
        }),
      });
    } catch (err) {
      showNotification(`Could not post: ${err?.message || 'network error'}`, 'error');
      return;
    }

    let data = {};
    try { data = await res.json(); } catch { /* non-JSON */ }
    if (!res.ok || !data?.success) {
      if (data?.code === 'READ_ONLY') {
        showNotification('You are signed in as a view-only user. Only HR admins can post announcements.', 'error');
      } else if (res.status === 413) {
        showNotification('One of your attachments is too large. Keep each file under 5 MB.', 'error');
      } else {
        showNotification(data?.message || `Post failed (HTTP ${res.status})`, 'error');
      }
      return;
    }

    // Server confirmed → insert into the list, close modal, reset form.
    if (data.data) {
      setAnnouncements(prev => [mapApi(data.data), ...prev]);
      try { localStorage.setItem(LS_KEY, JSON.stringify([mapApi(data.data), ...JSON.parse(localStorage.getItem(LS_KEY) || '[]')])); } catch {}
    } else {
      loadAnnouncements();
    }
    showNotification('Announcement posted.', 'success');
    setShowPostModal(false);
    setNewPost({ title: '', content: '', category: 'General', priority: 'Low', attachments: [] });
    setPostErrors({});
  };

  // Delete
  const handleDelete = async (id) => {
    setOpenMenuId(null);
    if (!(await confirmDialog({ title: "Confirm", message: 'Delete this announcement? This cannot be undone.', confirmText: "Delete", tone: "danger" }))) return;
    const prev = announcements;
    setAnnouncements(prev.filter(a => a.id !== id));
    try {
      const res  = await fetch(`${API}/announcements/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) {
        setAnnouncements(prev);
        showNotification(data.message || 'Failed to delete announcement', "error");
      }
    } catch (err) {
      setAnnouncements(prev);
      console.error('Failed to delete announcement:', err);
    }
  };

  return (
    <div className="emp-list-page">
      <div className="emp-list-header">
        <div className="ne-breadcrumb">
          <span className="ne-breadcrumb-link" onClick={onBack}>Dashboard</span>
          <ChevronRight size={13} />
          <span>Announcements</span>
        </div>
        <div className="emp-list-title-row">
          <div>
            <h1 className="ne-page-title">Company Announcements</h1>
            <p className="ne-page-sub">Stay updated with the latest news and updates across the organization.</p>
          </div>
          <button className="ne-btn-primary" onClick={() => setShowPostModal(true)}>
            <Plus size={16} /> Post Announcement
          </button>
        </div>
      </div>

      <div className="announcement-content">
        <div className="announcement-filters">
          <div className="topbar-search" style={{ flex: 1, maxWidth: '400px' }}>
            <Search size={15} />
            <input
              placeholder="Search announcements..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="emp-list-actions" style={{ position: 'relative' }}>
            <button
              type="button"
              className="ne-btn-secondary"
              onClick={() => setFilterOpen(v => !v)}
            >
              <Filter size={14} /> {filterCategory === 'All' ? 'Filter' : filterCategory}
            </button>
            {filterOpen && (
              <div
                onMouseLeave={() => setFilterOpen(false)}
                style={{
                  position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 30,
                  background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.08)', minWidth: 160, padding: 6,
                }}
              >
                {['All', ...Array.from(new Set(announcements.map(a => a.category).filter(Boolean)))].map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => { setFilterCategory(cat); setFilterOpen(false); }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '8px 12px', borderRadius: 6,
                      background: filterCategory === cat ? '#F1F9EE' : 'transparent',
                      color: filterCategory === cat ? '#15803D' : '#0F172A',
                      border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {loading && announcements.length === 0 && (
          <p style={{ color: '#718096', fontSize: '14px', padding: '20px 0' }}>Loading announcements...</p>
        )}

        {!loading && announcements.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#718096' }}>
            <Megaphone size={32} style={{ opacity: 0.4, marginBottom: 8 }} />
            <p style={{ fontSize: '14px' }}>No announcements yet. Click <strong>Post Announcement</strong> to create one.</p>
          </div>
        )}

        <div className="announcement-grid">
          {announcements
            .filter(item => {
              // Category gate first — cheap and exact match.
              if (filterCategory !== 'All' && String(item.category || '') !== filterCategory) return false;
              // Search — match title or content (case-insensitive).
              const q = searchQuery.trim().toLowerCase();
              if (!q) return true;
              return (
                String(item.title   || '').toLowerCase().includes(q) ||
                String(item.content || '').toLowerCase().includes(q)
              );
            })
            .map(item => (
            <div className={`announcement-card ${(item.priority || 'low').toLowerCase()}`} key={item.id}>
              <div className="a-card-header">
                <div className="a-category-tag">
                  <Tag size={12} />
                  {item.category}
                </div>
                {item.isNew && <span className="a-new-badge">New</span>}

                <div style={{ position: 'relative', marginLeft: 'auto' }} ref={openMenuId === item.id ? menuRef : null}>
                  <button
                    className="a-more-btn"
                    onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === item.id ? null : item.id); }}
                    aria-label="More options"
                  >
                    <MoreVertical size={16} />
                  </button>

                  {openMenuId === item.id && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '110%',
                        right: 0,
                        background: '#fff',
                        border: '1px solid #E2E8F0',
                        borderRadius: '8px',
                        boxShadow: '0 6px 20px rgba(0,0,0,0.08)',
                        minWidth: '140px',
                        zIndex: 20,
                        overflow: 'hidden',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          width: '100%',
                          padding: '10px 12px',
                          background: 'transparent',
                          border: 'none',
                          color: '#E53E3E',
                          fontSize: '13px',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#FFF5F5')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <h3 className="a-title">{item.title}</h3>
              <p className="a-content">{item.content}</p>

              {/* Attachments — each chip is a button that pulls the file
                  out of `dataBase64` (or follows `url` for legacy rows)
                  and triggers a download. */}
              {Array.isArray(item.attachments) && item.attachments.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                  {item.attachments.map((att, i) => (
                    <button
                      key={`${item.id}-att-${i}`}
                      type="button"
                      onClick={() => downloadAttachment(att)}
                      title={`Download ${att.name}`}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '6px 10px', borderRadius: 6,
                        background: '#F1F9EE', color: '#15803D',
                        border: '1px solid #BBF7D0', cursor: 'pointer',
                        fontSize: 11, fontWeight: 600,
                      }}
                    >
                      <FileText size={12} />
                      <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name || 'file'}</span>
                      {att.size ? <span style={{ color: '#64748B', fontWeight: 500 }}>· {fmtBytes(att.size)}</span> : null}
                      <Download size={12} />
                    </button>
                  ))}
                </div>
              )}

              <div className="a-footer">
                <div className="a-meta">
                  <div className="a-meta-item"><User size={13} /> {item.author}</div>
                  <div className="a-meta-item"><Calendar size={13} /> {item.date}</div>
                </div>
                <div className={`a-priority ${(item.priority || 'low').toLowerCase()}`}>
                  <AlertCircle size={12} /> {item.priority}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showPostModal && (
        <div className="ne-modal-overlay">
          <div className="ne-modal-card" style={{ maxWidth: '600px' }}>
            <div className="ne-modal-header">
              <h2 className="ne-modal-title">New Announcement</h2>
              <button className="ne-modal-close" onClick={() => setShowPostModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handlePost} className="ne-modal-body">
              <div className="ne-field">
                <label className="ne-label">Title</label>
                <input
                  className={`ne-input ${postErrors.title ? 'error' : ''}`} placeholder="e.g., Upcoming Holiday Schedule"
                  value={newPost.title} onChange={e => {
                    setNewPost({ ...newPost, title: e.target.value });
                    if (postErrors.title) setPostErrors(p => { const n = { ...p }; delete n.title; return n; });
                  }}
                />
                {postErrors.title && <span className="error-text" style={{ color: '#E53E3E', fontSize: '11px', marginTop: '4px' }}>{postErrors.title}</span>}
              </div>
              <div className="ne-field">
                <label className="ne-label">Category</label>
                <select
                  className="ne-input" value={newPost.category}
                  onChange={e => setNewPost({ ...newPost, category: e.target.value })}
                >
                  <option>General</option>
                  <option>Event</option>
                  <option>Benefits</option>
                  <option>Policy</option>
                  <option>Office</option>
                </select>
              </div>
              <div className="ne-field">
                <label className="ne-label">Priority</label>
                <div className="priority-toggle-group">
                  {['Low', 'Medium', 'High'].map(p => (
                    <button
                      key={p} type="button"
                      className={`p-toggle-btn ${newPost.priority === p ? 'active' : ''}`}
                      onClick={() => setNewPost({ ...newPost, priority: p })}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div className="ne-field">
                <label className="ne-label">Content</label>
                <textarea
                  className={`ne-input ${postErrors.content ? 'error' : ''}`} style={{ height: '120px', resize: 'none' }}
                  placeholder="Share details about the announcement..."
                  value={newPost.content} onChange={e => {
                    setNewPost({ ...newPost, content: e.target.value });
                    if (postErrors.content) setPostErrors(p => { const n = { ...p }; delete n.content; return n; });
                  }}
                ></textarea>
                {postErrors.content && <span className="error-text" style={{ color: '#E53E3E', fontSize: '11px', marginTop: '4px' }}>{postErrors.content}</span>}
              </div>
              {/* Attachment upload removed — announcements are text-only now. */}


              <div className="ne-modal-footer">
                <button type="button" className="ne-btn-secondary" onClick={() => setShowPostModal(false)}>Cancel</button>
                <button type="submit" className="ne-btn-primary" disabled={uploadingFile}>
                  <Send size={16} /> {uploadingFile ? 'Uploading…' : 'Post Now'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
