import React, { useState } from 'react';
import { 
  Megaphone, Plus, Search, Filter, MoreVertical, 
  Calendar, User, Tag, ChevronRight, Send, X, AlertCircle
} from 'lucide-react';

export default function Announcements({ onBack }) {
  const [showPostModal, setShowPostModal] = useState(false);
  const [announcements, setAnnouncements] = useState([
    {
      id: 1,
      title: 'Company Picnic 2024!',
      content: 'We are excited to announce our annual company picnic will be held at Central Park on June 15th. Family and friends are welcome!',
      category: 'Event',
      author: 'HR Department',
      date: 'May 02, 2024',
      isNew: true,
      priority: 'Low'
    },
    {
      id: 2,
      title: 'New Health Insurance Policy',
      content: 'Please review the updated health insurance benefits for the upcoming fiscal year. Documentation is available in the portal.',
      category: 'Benefits',
      author: 'Finance Team',
      date: 'May 01, 2024',
      isNew: false,
      priority: 'High'
    },
    {
      id: 3,
      title: 'Office Upgrade: New Coffee Machines',
      content: 'By popular demand, we have installed high-end espresso machines in every pantry. Enjoy!',
      category: 'Office',
      author: 'Facility Management',
      date: 'Apr 28, 2024',
      isNew: false,
      priority: 'Medium'
    }
  ]);

  const [newPost, setNewPost] = useState({ title: '', content: '', category: 'General', priority: 'Low' });
  const [postErrors, setPostErrors] = useState({});

  const handlePost = (e) => {
    e.preventDefault();
    let errors = {};
    if (!newPost.title.trim()) errors.title = 'Title is required';
    if (!newPost.content.trim()) errors.content = 'Content cannot be empty';
    
    if (Object.keys(errors).length > 0) {
      setPostErrors(errors);
      return;
    }

    const post = {
      id: Date.now(),
      ...newPost,
      author: 'Alex Morrison',
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
      isNew: true
    };
    setAnnouncements([post, ...announcements]);
    setShowPostModal(false);
    setNewPost({ title: '', content: '', category: 'General', priority: 'Low' });
    setPostErrors({});
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

        <div className="announcement-grid">
          {announcements.map(item => (
            <div className={`announcement-card ${item.priority.toLowerCase()}`} key={item.id}>
              <div className="a-card-header">
                <div className="a-category-tag">
                  <Tag size={12} />
                  {item.category}
                </div>
                {item.isNew && <span className="a-new-badge">New</span>}
                <button className="a-more-btn"><MoreVertical size={16} /></button>
              </div>
              <h3 className="a-title">{item.title}</h3>
              <p className="a-content">{item.content}</p>
              <div className="a-footer">
                <div className="a-meta">
                  <div className="a-meta-item"><User size={13} /> {item.author}</div>
                  <div className="a-meta-item"><Calendar size={13} /> {item.date}</div>
                </div>
                <div className={`a-priority ${item.priority.toLowerCase()}`}>
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
                    setNewPost({...newPost, title: e.target.value});
                    if (postErrors.title) setPostErrors(p => { const n = {...p}; delete n.title; return n; });
                  }}
                />
                {postErrors.title && <span className="error-text" style={{ color: '#E53E3E', fontSize: '11px', marginTop: '4px' }}>{postErrors.title}</span>}
              </div>
              <div className="ne-field">
                <label className="ne-label">Category</label>
                <select 
                  className="ne-input" value={newPost.category} 
                  onChange={e => setNewPost({...newPost, category: e.target.value})}
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
                      onClick={() => setNewPost({...newPost, priority: p})}
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
                    setNewPost({...newPost, content: e.target.value});
                    if (postErrors.content) setPostErrors(p => { const n = {...p}; delete n.title; return n; });
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
