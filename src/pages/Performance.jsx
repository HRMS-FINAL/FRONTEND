import React, { useState } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar, Cell
} from 'recharts';
import { 
  ChevronRight, FileBarChart, Star, Target, 
  Award, TrendingUp, AlertCircle, Plus, Download, Search,
  ArrowLeft, User, CheckCircle
} from 'lucide-react';
import { allEmployees } from '../data/mockData';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useNotification } from '../context/NotificationContext';

export default function Performance({ onBack }) {
  const { showNotification } = useNotification();
  const [activeMetric, setActiveMetric] = useState('Productivity');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPerf, setSelectedPerf] = useState(null);
  const [timePeriod, setTimePeriod] = useState('Weekly');

  // Mock performance data for all employees
  const employeePerformances = allEmployees.map(emp => ({
    ...emp,
    managerScore: Math.floor(Math.random() * 20) + 75,
    hrScore: Math.floor(Math.random() * 25) + 70,
    lastReview: 'May 01, 2024',
    reviewer: emp.manager || 'Alex Morrison',
    education: {
      degree: 'B.Tech in Computer Science',
      university: 'Oxford University',
      year: '2018'
    }
  }));

  const getAvgScore = (p) => Math.round((p.managerScore + p.hrScore) / 2);
  const getRating = (score) => Math.floor(score / 20);

  const filteredPerformances = employeePerformances.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.dept.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const downloadPDF = () => {
    showNotification("Generating performance report...", "info");
    const doc = new jsPDF();
    const tableColumn = ["Name", "Department", "Role", "Manager (%)", "HR (%)", "Avg Score", "Reviewer"];
    const tableRows = filteredPerformances.map(p => {
      const avg = getAvgScore(p);
      return [
        p.name, p.dept, p.role, `${p.managerScore}%`, `${p.hrScore}%`, `${avg}%`, p.reviewer
      ];
    });

    doc.autoTable({
      head: [tableColumn],
      body: tableRows,
      startY: 25,
      theme: 'grid',
      headStyles: { fillColor: '#4CAA17' }
    });
    
    doc.setFontSize(18);
    doc.text("Company-wide Performance Report", 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')}`, 14, 20);
    
    doc.save(`Performance_Report_${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')}.pdf`);
    showNotification("Performance PDF downloaded!", "success");
  };

  const getIndividualData = () => {
    if (timePeriod === 'Daily') {
      return [
        { name: 'Mon', score: 85 }, { name: 'Tue', score: 88 }, { name: 'Wed', score: 75 }, 
        { name: 'Thu', score: 92 }, { name: 'Fri', score: 95 }, { name: 'Sat', score: 80 }, { name: 'Sun', score: 82 }
      ];
    } else if (timePeriod === 'Monthly') {
      return [
        { name: 'Jan', score: 70 }, { name: 'Feb', score: 75 }, { name: 'Mar', score: 85 }, 
        { name: 'Apr', score: 80 }, { name: 'May', score: 90 }, { name: 'Jun', score: 88 }
      ];
    } else if (timePeriod === 'Yearly') {
      return [
        { name: '2020', score: 65 }, { name: '2021', score: 72 }, { name: '2022', score: 85 }, 
        { name: '2023', score: 88 }, { name: '2024', score: 92 }
      ];
    }
    return [
      { name: 'Week 1', score: 82 }, { name: 'Week 2', score: 85 }, { name: 'Week 3', score: 78 }, 
      { name: 'Week 4', score: 92 }, { name: 'Week 5', score: 88 }
    ];
  };

  const downloadIndividualPDF = (p) => {
    showNotification(`Generating full report for ${p.name}...`, "info");
    const doc = new jsPDF();
    
    doc.setFontSize(22);
    doc.setTextColor('#4CAA17');
    doc.text("EMPLOYEE FULL PERFORMANCE REPORT", 14, 20);
    
    doc.setFontSize(12);
    doc.setTextColor('#333');
    doc.text(`Employee Name: ${p.name}`, 14, 35);
    doc.text(`Role: ${p.role}`, 14, 42);
    doc.text(`Department: ${p.dept}`, 14, 49);
    doc.text(`Manager: ${p.reviewer}`, 14, 56);
    
    doc.setDrawColor('#4CAA17');
    doc.line(14, 62, 196, 62);
    
    doc.setFontSize(14);
    doc.text("Performance Scores", 14, 75);
    doc.autoTable({
      head: [['Metric', 'Score']],
      body: [
        ['Manager Rating', `${p.managerScore}%`],
        ['HR Rating', `${p.hrScore}%`],
        ['Aggregated Average', `${getAvgScore(p)}%`],
        ['Overall Star Rating', `${getRating(getAvgScore(p))}/5`]
      ],
      startY: 80,
      theme: 'striped',
      headStyles: { fillColor: '#4CAA17' }
    });
    
    doc.text("Education Background", 14, doc.autoTable.previous.finalY + 15);
    doc.autoTable({
      body: [
        ['Degree', p.education.degree],
        ['University', p.education.university],
        ['Graduation Year', p.education.year]
      ],
      startY: doc.autoTable.previous.finalY + 20,
      theme: 'plain'
    });

    doc.save(`${p.name.replace(' ', '_')}_Full_Report.pdf`);
    showNotification("Full report downloaded!", "success");
  };

  if (selectedPerf) {
    return (
      <div className="emp-list-page">
        <div className="emp-list-header">
          <div className="ne-breadcrumb">
            <span className="ne-breadcrumb-link" onClick={() => setSelectedPerf(null)}>Performance</span>
            <ChevronRight size={13} />
            <span>{selectedPerf.name}</span>
          </div>
          <div className="emp-list-title-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div className="emp-table-avatar" style={{ width: '44px', height: '44px', fontSize: '16px', background: selectedPerf.color + '20', color: selectedPerf.color }}>
                {selectedPerf.initials}
              </div>
              <div>
                <h1 className="ne-page-title" style={{ fontSize: '18px' }}>{selectedPerf.name}'s Performance</h1>
                <p className="ne-page-sub" style={{ fontSize: '11px' }}>{selectedPerf.role} • {selectedPerf.dept}</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="ne-btn-secondary" onClick={() => setSelectedPerf(null)}><ArrowLeft size={16} /> Back to List</button>
              <button className="ne-btn-primary" onClick={() => downloadIndividualPDF(selectedPerf)}><Download size={16} /> Download Full Report</button>
            </div>
          </div>
        </div>

        <div className="stats-row" style={{ marginTop: '16px', gap: '12px' }}>
          {[
            { label: 'Manager Score', value: `${selectedPerf.managerScore}%`, icon: <Star size={18} />, color: '#4CAA17' },
            { label: 'HR Score', value: `${selectedPerf.hrScore}%`, icon: <CheckCircle size={18} />, color: '#4299E1' },
            { label: 'Avg Rating', value: `${getRating(getAvgScore(selectedPerf))}/5`, icon: <Award size={18} />, color: '#ECC94B' },
            { label: 'Growth', value: '+12%', icon: <TrendingUp size={18} />, color: '#48BB78' },
          ].map((s, i) => (
            <div className="stat-card" key={i} style={{ padding: '12px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="stat-icon-wrap" style={{ width: '32px', height: '32px', background: s.color + '15', color: s.color }}>{s.icon}</div>
                <div>
                  <div className="stat-value" style={{ fontSize: '18px' }}>{s.value}</div>
                  <div className="stat-label" style={{ fontSize: '11px' }}>{s.label}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="card" style={{ marginTop: '16px', padding: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '30px' }}>
            <div>
              <h3 style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>General Information</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '12px', color: 'var(--text-light)' }}>Employee ID</span><span style={{ fontSize: '12px', fontWeight: 600 }}>#00{selectedPerf.id}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '12px', color: 'var(--text-light)' }}>Email</span><span style={{ fontSize: '12px', fontWeight: 600 }}>{selectedPerf.email}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '12px', color: 'var(--text-light)' }}>Manager</span><span style={{ fontSize: '12px', fontWeight: 600 }}>{selectedPerf.reviewer}</span></div>
              </div>
            </div>
            <div>
              <h3 style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Education Background</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '12px', color: 'var(--text-light)' }}>Degree</span><span style={{ fontSize: '12px', fontWeight: 600 }}>{selectedPerf.education.degree}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '12px', color: 'var(--text-light)' }}>University</span><span style={{ fontSize: '12px', fontWeight: 600 }}>{selectedPerf.education.university}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '12px', color: 'var(--text-light)' }}>Year</span><span style={{ fontSize: '12px', fontWeight: 600 }}>{selectedPerf.education.year}</span></div>
              </div>
            </div>
            <div>
              <h3 style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Performance Status</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '12px', color: 'var(--text-light)' }}>Status</span><span className="dash-emp-status present" style={{ padding: '1px 8px', fontSize: '10px' }}>Excellent</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '12px', color: 'var(--text-light)' }}>Last Reviewed</span><span style={{ fontSize: '12px', fontWeight: 600 }}>{selectedPerf.lastReview}</span></div>
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: '16px', padding: '16px' }}>
          <div className="card-header" style={{ marginBottom: '12px' }}>
            <div className="card-title" style={{ fontSize: '14px' }}>Performance Breakdown</div>
            <div className="time-filter-tabs">
              {['Daily', 'Weekly', 'Monthly', 'Yearly'].map(period => (
                <button 
                  key={period} 
                  className={`period-tab ${timePeriod === period ? 'active' : ''}`}
                  onClick={() => setTimePeriod(period)}
                  style={{ padding: '4px 12px', fontSize: '11px' }}
                >
                  {period}
                </button>
              ))}
            </div>
          </div>
          <div style={{ height: '280px', padding: '0 10px 10px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={getIndividualData()}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-light)' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-light)' }} domain={[0, 100]} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-md)' }} />
                <Line 
                  type="monotone" dataKey="score" stroke="var(--primary)" strokeWidth={4} 
                  dot={{ r: 6, fill: 'var(--primary)', strokeWidth: 2, stroke: '#fff' }} 
                  activeDot={{ r: 8, strokeWidth: 0 }} 
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  }

  const perfData = [
    { name: 'Week 1', score: 82 },
    { name: 'Week 2', score: 85 },
    { name: 'Week 3', score: 78 },
    { name: 'Week 4', score: 92 },
    { name: 'Week 5', score: 88 },
  ];

  const skillData = [
    { name: 'Technical', value: 85, color: '#4299E1' },
    { name: 'Soft Skills', value: 70, color: '#9F7AEA' },
    { name: 'Leadership', value: 65, color: '#4CAA17' },
    { name: 'Efficiency', value: 90, color: '#ECC94B' },
  ];

  return (
    <div className="emp-list-page">
      <div className="emp-list-header">
        <div className="ne-breadcrumb">
          <span className="ne-breadcrumb-link" onClick={onBack}>Dashboard</span>
          <ChevronRight size={13} />
          <span>Performance</span>
        </div>
        <div className="emp-list-title-row">
          <div>
            <h1 className="ne-page-title">Performance Analytics</h1>
            <p className="ne-page-sub">Comprehensive overview of workforce productivity and skill distribution.</p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <div className="dept-search" style={{ width: '240px', height: '40px' }}>
              <Search size={16} />
              <input 
                type="text" placeholder="Search employee..." 
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <button className="ne-btn-secondary" onClick={downloadPDF}><Download size={16} /> Download PDF</button>
            <button className="ne-btn-primary"><Plus size={16} /> New Review</button>
          </div>
        </div>
      </div>

      <div className="stats-row" style={{ marginTop: '20px' }}>
        {[
          { label: 'Avg Productivity', value: '88.5%', icon: <TrendingUp size={20} />, color: '#4CAA17' },
          { label: 'Reviews Pending', value: '12', icon: <AlertCircle size={20} />, color: '#ECC94B' },
          { label: 'Goals Achieved', value: '42', icon: <Target size={20} />, color: '#4299E1' },
          { label: 'Best Dept', value: 'Design', icon: <Star size={20} />, color: '#9F7AEA' },
        ].map((s, i) => (
          <div className="stat-card" key={i}>
            <div className="stat-card-top">
              <div className="stat-icon-wrap" style={{ background: s.color + '15', color: s.color }}>{s.icon}</div>
            </div>
            <div>
              <div className="stat-value">{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="middle-row" style={{ marginTop: '24px' }}>
        <div className="card" style={{ flex: '2' }}>
          <div className="card-header">
            <div className="card-title">Productivity Trend</div>
            <div className="card-actions">
              <button className="ne-btn-secondary" style={{ padding: '4px 12px', fontSize: '12px' }}>Last 30 Days</button>
            </div>
          </div>
          <div style={{ height: '300px', padding: '20px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={perfData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-light)' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-light)' }} domain={[0, 100]} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '12px' }} />
                <Line type="monotone" dataKey="score" stroke="var(--primary)" strokeWidth={3} dot={{ r: 4, fill: 'var(--primary)' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card" style={{ flex: '1' }}>
          <div className="card-header">
            <div className="card-title">Skill Distribution</div>
          </div>
          <div style={{ height: '300px', padding: '20px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={skillData} layout="vertical">
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-main)', fontWeight: 600 }} width={80} />
                <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '8px' }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                  {skillData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="emp-table-card" style={{ marginTop: '24px' }}>
        <div className="card-header" style={{ padding: '20px' }}>
          <div className="card-title">Recent Performance Reviews</div>
        </div>
        <table className="emp-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Reviewer</th>
              <th>Manager Rating</th>
              <th>HR Rating</th>
              <th>Avg Score</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredPerformances.map((p, i) => (
              <tr key={i}>
                <td>
                  <div className="emp-table-user">
                    <div className="emp-table-avatar" style={{ background: p.color + '20', color: p.color }}>{p.initials}</div>
                    <div>
                      <div className="emp-table-name">{p.name}</div>
                      <div className="emp-table-role" style={{ fontSize: '11px', color: 'var(--text-light)' }}>{p.role}</div>
                    </div>
                  </div>
                </td>
                <td><div className="emp-table-dept">{p.reviewer}</div></td>
                 <td>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                     <div style={{ flex: 1, height: '6px', background: '#EDF2F7', borderRadius: '3px', overflow: 'hidden' }}>
                       <div style={{ width: `${p.managerScore}%`, height: '100%', background: '#4CAA17' }}></div>
                     </div>
                     <span style={{ fontSize: '11px', fontWeight: 600 }}>{p.managerScore}%</span>
                   </div>
                 </td>
                 <td>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                     <div style={{ flex: 1, height: '6px', background: '#EDF2F7', borderRadius: '3px', overflow: 'hidden' }}>
                       <div style={{ width: `${p.hrScore}%`, height: '100%', background: '#4299E1' }}></div>
                     </div>
                     <span style={{ fontSize: '11px', fontWeight: 600 }}>{p.hrScore}%</span>
                   </div>
                 </td>
                 <td>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                     <div style={{ display: 'flex', gap: '1px', color: '#ECC94B' }}>
                       {[...Array(5)].map((_, i) => (
                         <Star key={i} size={11} fill={i < getRating(getAvgScore(p)) ? "#ECC94B" : "none"} stroke={i < getRating(getAvgScore(p)) ? "#ECC94B" : "#CBD5E0"} />
                       ))}
                     </div>
                     <span style={{ fontSize: '12px', fontWeight: 700 }}>{getAvgScore(p)}%</span>
                   </div>
                 </td>
                 <td><span className={`dash-emp-status ${getAvgScore(p) >= 90 ? 'present' : getAvgScore(p) >= 80 ? 'active' : 'late'}`}>{getAvgScore(p) >= 85 ? 'Excellent' : 'Good'}</span></td>
                <td><button className="emp-table-btn" onClick={() => setSelectedPerf(p)}>Full Report</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
