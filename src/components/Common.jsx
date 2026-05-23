import React from 'react';
import { ChevronDown } from 'lucide-react';

export const Field = ({ label, icon: Icon, id, type = 'text', placeholder, value, onChange, required, error }) => (
  <div className="ne-field">
    <label className="ne-label" htmlFor={id}>{label}{required && <span className="ne-required">*</span>}</label>
    <div className="ne-input-wrap">
      {Icon && <Icon size={15} className="ne-input-icon" />}
      <input
        id={id}
        type={type}
        className={`ne-input ${Icon ? 'has-icon' : ''} ${error ? 'error' : ''}`}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        required={required}
      />
    </div>
    {error && <span className="error-text" style={{ color: '#ef4444', fontSize: '11px', marginTop: '4px' }}>{error}</span>}
  </div>
);

export const Select = ({ label, id, value, onChange, children, required, error }) => (
  <div className="ne-field">
    <label className="ne-label" htmlFor={id}>{label}{required && <span className="ne-required">*</span>}</label>
    <div className="ne-input-wrap">
      <select id={id} className={`ne-select ${error ? 'error' : ''}`} value={value} onChange={onChange} required={required}>
        {children}
      </select>
      <ChevronDown size={14} className="ne-select-icon" />
    </div>
    {error && <span className="error-text" style={{ color: '#ef4444', fontSize: '11px', marginTop: '4px' }}>{error}</span>}
  </div>
);

export const Breadcrumb = ({ items, onBack }) => (
  <div className="ne-breadcrumb">
    <span className="ne-breadcrumb-link" onClick={onBack}>Dashboard</span>
    {items.map((item, idx) => (
      <React.Fragment key={idx}>
        <ChevronDown size={13} style={{ transform: 'rotate(-90deg)', margin: '0 4px' }} />
        <span>{item}</span>
      </React.Fragment>
    ))}
  </div>
);
