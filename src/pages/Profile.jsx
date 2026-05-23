import React, { useState } from 'react';
import { 
  ChevronRight, Users, Briefcase, Zap, MapPin, 
  Calendar, Mail, Phone, Edit, Camera, Globe
} from 'lucide-react';

export default function Profile({ onBack }) {
  const [isEditing, setIsEditing] = useState(false);
  const [userData, setUserData] = useState({
    name: 'Alex Morrison',
    role: 'HR Manager',
    email: 'alex.morrison@tesco.com',
    phone: '+1 (555) 000-1234',
    location: 'London, UK',
    joined: 'Jan 2022',
    bio: 'Experienced HR professional with a passion for building great team cultures and optimizing organizational performance. Specialized in recruitment and performance management.',
  });

  const stats = [
    { label: 'Employees Managed', value: '48', icon: <Users size={16} />, color: '#4299E1' },
    { label: 'Active Projects', value: '12', icon: <Briefcase size={16} />, color: '#9F7AEA' },
    { label: 'Peer Rating', value: '4.9', icon: <Zap size={16} />, color: '#4CAA17' },
  ];

  return (
    <div className="profile-page">
      <div className="profile-header">
        <div className="ne-breadcrumb">
          <span className="ne-breadcrumb-link" onClick={onBack}>Dashboard</span>
          <ChevronRight size={13} />
          <span>My Profile</span>
        </div>
      </div>

      <div className="profile-content">
        <div className="profile-card-main">
          <div className="profile-cover" style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)', height: '160px' }} />
          <div className="profile-info-wrap" style={{ padding: '0 40px 30px' }}>
            <div className="profile-avatar-xl" style={{ marginTop: '-60px', border: '6px solid white', boxShadow: 'var(--shadow-lg)', position: 'relative' }}>
              AM
              <button className="avatar-edit-btn" style={{ position: 'absolute', bottom: '5px', right: '5px', padding: '6px', borderRadius: '50%', background: 'white', border: '1px solid var(--border-color)', cursor: 'pointer' }}>
                <Camera size={14} color="var(--text-main)" />
              </button>
            </div>
            <div className="profile-main-meta" style={{ marginTop: '20px' }}>
              <h1 className="profile-user-name" style={{ fontSize: '28px' }}>{userData.name}</h1>
              <p className="profile-user-role" style={{ color: 'var(--primary)', fontWeight: '600' }}>{userData.role}</p>
              <div className="profile-user-badges" style={{ marginTop: '12px' }}>
                <span className="p-badge" style={{ background: '#F1F5F9' }}><MapPin size={12} /> {userData.location}</span>
                <span className="p-badge" style={{ background: '#F1F5F9' }}><Calendar size={12} /> Joined {userData.joined}</span>
              </div>
            </div>
            <button className="ne-btn-primary" style={{ marginTop: '20px' }} onClick={() => setIsEditing(!isEditing)}>
              <Edit size={16} /> {isEditing ? 'Save Profile' : 'Edit Profile'}
            </button>
          </div>

          <div className="profile-stats-row" style={{ borderTop: '1px solid var(--border-color)', padding: '30px 40px' }}>
            {stats.map((stat, idx) => (
              <div key={idx} className="p-stat-item" style={{ flex: 1, borderRight: idx < 2 ? '1px solid var(--border-color)' : 'none' }}>
                <div className="p-stat-icon" style={{ background: stat.color + '15', color: stat.color }}>{stat.icon}</div>
                <div>
                  <div className="p-stat-val" style={{ fontSize: '20px', fontWeight: 800 }}>{stat.value}</div>
                  <div className="p-stat-lbl" style={{ fontSize: '12px', color: 'var(--text-light)', fontWeight: 600 }}>{stat.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="profile-grid" style={{ marginTop: '30px', display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '30px' }}>
          <div className="profile-main-cols" style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            <div className="profile-card-sec card" style={{ padding: '30px' }}>
              <h3 className="p-card-title" style={{ fontSize: '18px', marginBottom: '20px' }}>Professional Biography</h3>
              {isEditing ? (
                <textarea 
                  className="ne-input" 
                  style={{ height: '120px', resize: 'none' }}
                  value={userData.bio}
                  onChange={e => setUserData({...userData, bio: e.target.value})}
                />
              ) : (
                <p className="p-card-text" style={{ lineHeight: '1.8', color: 'var(--text-muted)' }}>{userData.bio}</p>
              )}
            </div>

            <div className="profile-card-sec card" style={{ padding: '30px' }}>
              <h3 className="p-card-title" style={{ fontSize: '18px', marginBottom: '20px' }}>Contact Information</h3>
              <div className="p-contact-list" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div className="p-contact-item">
                  <div className="p-contact-icon" style={{ padding: '10px', background: 'var(--bg-main)', borderRadius: '8px' }}><Mail size={18} color="var(--primary)" /></div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-light)', fontWeight: 700 }}>EMAIL ADDRESS</label>
                    <span style={{ fontSize: '14px', fontWeight: 600 }}>{userData.email}</span>
                  </div>
                </div>
                <div className="p-contact-item">
                  <div className="p-contact-icon" style={{ padding: '10px', background: 'var(--bg-main)', borderRadius: '8px' }}><Phone size={18} color="var(--primary)" /></div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-light)', fontWeight: 700 }}>PHONE NUMBER</label>
                    <span style={{ fontSize: '14px', fontWeight: 600 }}>{userData.phone}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="profile-side-cols" style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            <div className="profile-card-sec card" style={{ padding: '30px' }}>
              <h3 className="p-card-title" style={{ fontSize: '18px', marginBottom: '20px' }}>Social Presence</h3>
              <div className="p-social-list" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {[
                  { icon: <Globe size={18} />, label: 'Portfolio', link: 'alexm.dev' },
                ].map(social => (
                  <div key={social.label} style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                    <div style={{ color: 'var(--text-light)' }}>{social.icon}</div>
                    <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-main)' }}>{social.link}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="profile-card-sec card" style={{ padding: '30px' }}>
              <h3 className="p-card-title" style={{ fontSize: '18px', marginBottom: '20px' }}>Recent Activity</h3>
              <div className="p-activity-list" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {[
                  { text: 'Updated Payroll for April 2024', time: '1h ago' },
                  { text: 'Approved 3 leave requests', time: '4h ago' },
                  { text: 'Added Liam Foster to Engineering', time: 'Yesterday' },
                ].map((act, i) => (
                  <div key={i} className="p-activity-item" style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary)', marginTop: '6px' }} />
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-main)' }}>{act.text}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-light)' }}>{act.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
