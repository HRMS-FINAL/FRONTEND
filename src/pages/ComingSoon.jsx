import React from 'react';
import { LayoutDashboard } from 'lucide-react';

export default function ComingSoon({ activeView, setActiveView, icon: Icon }) {
  return (
    <div className="coming-soon-wrap">
      <div className="coming-soon-icon">
        {Icon ? <Icon size={40} /> : <LayoutDashboard size={40} />}
      </div>
      <h2 className="coming-soon-title">Coming Soon</h2>
      <p className="coming-soon-sub">The {activeView} section is under construction. Check back soon!</p>
      <button className="ne-btn-primary" onClick={() => setActiveView('dashboard')}>
        <LayoutDashboard size={16} /> Back to Dashboard
      </button>
    </div>
  );
}
