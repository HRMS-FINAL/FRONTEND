import React, { useState, useEffect, useRef } from 'react';
import {
  Megaphone, Plus, Search, Filter, MoreVertical,
  Calendar, User, Tag, ChevronRight, Send, X, AlertCircle, Trash2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const API    = 'http://localhost:8001/api';
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
    ? new Date(a.publishDate).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
    : (a.createdAt
        ? new Date(a.createdAt).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
        : ''),
  isNew: a.createdAt ? (Date.now() - new Date(a.createdAt).getTime()) < 1000 * 60 * 60 * 24 * 3 : false,
});

export default function Announcements({ onBack }) {
  const { user } = useAuth() || {};
  const [showPostModal, setShowPostModal] = useState(false);
  // Seed announcements from cache so the list paints immediately on refresh
  // instead of being blank during the mobile-backend cold-start.
  const [announcements, setAnnouncements] = useState(() => readCache());
  const [loading, setLoading]   = useState(false);
  const [openMenuId, setOpenMenuId] = useState(null);
  const menuRef = useRef(null);

  const [newPost, setNewPost] = useState({ title: '', content: '', category: 'General', priority: 'Low' });
  const [postErrors, setPostErrors] = useState({});

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

    try {
      const res = await fetch(`${API}/announcements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:    newPost.title.trim(),
          content:  newPost.content.trim(),
          category: newPost.category,
          priority: newPost.priority,
          author:   user?.name || 'HR',
          createdByRole: user?.role || '',
        }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setAnnouncements(prev => [mapApi(data.data), ...prev]);
      } else {
        loadAnnouncements();
      }
    } catch (err) {
      console.error('Failed to post announcement:', err);
    }

    setShowPostModal(false);
    setNewPost({ title: '', content: '', category: 'General', priority: 'Low' });
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
            <input placeholder="Search announcements..." />
          </div>
          <div className="emp-list-actions">
            <button className="ne-btn-secondary"><Filter size={14} /> Filter</button>
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
          {announcements.map(item => (
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
              <div className="ne-modal-footer">
                <button type="button" className="ne-btn-secondary" onClick={() => setShowPostModal(false)}>Cancel</button>
                <button type="submit" className="ne-btn-primary"><Send size={16} /> Post Now</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
