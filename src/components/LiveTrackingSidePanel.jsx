import React, { useState, useEffect } from 'react';
import { Activity, MapPin, ChevronRight, User, Clock, Search } from 'lucide-react';

const RECENT_ACTIVITIES = [
  { id: 1, name: 'Liam Foster',   action: 'reached',  site: 'HQ – Nariman Point',      time: 'Just now',   initials: 'LF', color: '#4299E1' },
  { id: 2, name: 'Zoe Martinez',  action: 'moved to', site: 'Studio – Bandra',         time: '2 min ago',  initials: 'ZM', color: '#9F7AEA' },
  { id: 3, name: 'Ryan Patel',    action: 'reached',  site: 'Goregaon Tech Park',      time: '5 min ago',  initials: 'RP', color: '#4CAA17' },
  { id: 4, name: 'Alex Thompson', action: 'left',     site: 'Client Site – Worli',     time: '12 min ago', initials: 'AT', color: '#ECC94B' },
  { id: 5, name: 'Priya Sharma',  action: 'reached',  site: 'Client Meet – CST',       time: '15 min ago', initials: 'PS', color: '#38B2AC' },
];

export default function LiveTrackingSidePanel({ onOpenFullMap }) {
  const [search, setSearch] = useState('');
  
  return (
    <div className="card live-panel-card">
      <div className="card-header">
        <div>
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={18} className="text-primary" /> Live Activity Feed
          </div>
          <div className="card-subtitle">Real-time personnel movement</div>
        </div>
        <button className="icon-btn-small" onClick={onOpenFullMap} title="View Map">
          <MapPin size={16} />
        </button>
      </div>

      <div className="panel-search-mini">
        <Search size={14} />
        <input 
          placeholder="Filter personnel..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="activity-feed">
        {RECENT_ACTIVITIES.map((act) => (
          <div className="activity-item" key={act.id}>
            <div className="activity-avatar" style={{ background: act.color + '20', color: act.color }}>
              {act.initials}
            </div>
            <div className="activity-details">
              <div className="activity-text">
                <span className="name">{act.name}</span>
                <span className="action"> {act.action} </span>
                <span className="site">{act.site}</span>
              </div>
              <div className="activity-time">
                <Clock size={10} /> {act.time}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="panel-footer-btn" onClick={onOpenFullMap}>
        <span>Open Tracking Dashboard</span>
        <ChevronRight size={14} />
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .live-panel-card {
          display: flex;
          flex-direction: column;
          height: 100%;
        }
        .panel-search-mini {
          margin: 0 16px 12px;
          background: var(--bg-body);
          border: 1px solid var(--border-color);
          border-radius: 6px;
          display: flex;
          align-items: center;
          padding: 6px 10px;
          gap: 8px;
        }
        .panel-search-mini input {
          background: transparent;
          border: none;
          outline: none;
          font-size: 12px;
          color: var(--text-main);
          width: 100%;
        }
        .activity-feed {
          flex: 1;
          overflow-y: auto;
          padding: 0 16px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .activity-item {
          display: flex;
          gap: 12px;
          align-items: flex-start;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--border-color);
        }
        .activity-item:last-child {
          border-bottom: none;
        }
        .activity-avatar {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 600;
          flex-shrink: 0;
        }
        .activity-details {
          flex: 1;
        }
        .activity-text {
          font-size: 13px;
          line-height: 1.4;
          margin-bottom: 4px;
        }
        .activity-text .name {
          font-weight: 600;
          color: var(--text-main);
        }
        .activity-text .action {
          color: var(--text-light);
        }
        .activity-text .site {
          font-weight: 500;
          color: var(--primary);
        }
        .activity-time {
          font-size: 11px;
          color: var(--text-light);
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .panel-footer-btn {
          margin: 12px 16px 16px;
          padding: 10px;
          background: var(--primary-light);
          color: var(--primary);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .panel-footer-btn:hover {
          background: var(--primary);
          color: white;
        }
      `}} />
    </div>
  );
}
