import React, { useState, useEffect } from 'react';
import {
  User, Briefcase, BookOpen, Mail, Check, Eye, EyeOff,
  Plus, RotateCcw, ArrowLeft, ChevronRight, AlertCircle, Users
} from 'lucide-react';
import { allEmployees } from '../data/mockData';
import { MANAGERS, DESIGNATIONS, DEPARTMENTS } from '../data/companyData';
import { useAuth } from '../context/AuthContext';

import { API } from '../config/api';

export default function NewEmployeeForm({ onBack, onSubmit, setActiveView, employees }) {
  const { user, isAdmin } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  // Inline error banner — surfaces backend rejection messages (duplicate
  // email, missing required field, view-only mode etc.) on the form
  // itself instead of inside a native alert(). The native alert was the
  // single biggest source of "I clicked save and nothing happened"
  // confusion — users dismissed it without reading the message.
  const [submitError, setSubmitError] = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [form, setForm] = useState({
    firstName: '', lastName: '', username: '', password: '',
    email: '', phone: '', street: '', city: '', state: '',
    zipCode: '', country: '',
    // Personal info — required by HR
    dob: '', gender: '', bloodGroup: '',
    // HR types in the company's actual Emp ID (e.g. TSL-024). No auto-prefix.
    employeeId: '', department: '', role: '', designation: '', employmentType: '',
    joiningDate: '', salary: '', assignedTo: '',
    // Petrol allowance eligibility flag (Jun 2026 HR brief). When true,
    // the petrol allowance for this employee is computed daily as
    //   GPS km (check-in → check-out polyline) × ₹3.50
    // and submitted automatically. When false, petrol claims for this
    // person are blocked at the API layer.
    petrolEligible: false,
    degree: '', university: '', fieldOfStudy: '', graduationYear: ''
  });

  const steps = [
    { id: 1, title: 'User Information', icon: <User size={20} /> },
    { id: 2, title: 'Employment Information', icon: <Briefcase size={20} /> },
    { id: 3, title: 'Education Information', icon: <BookOpen size={20} /> },
    { id: 4, title: 'Submit', icon: <Mail size={20} /> },
  ];

  const [errors, setErrors] = useState({});

  // Dropdown options come straight from the HRMS master lists the admin
  // manages in the Department + Designation pages. We seed with the
  // hardcoded company catalogue only as a fallback for the brief window
  // before the API call lands (cold-start); the API response always wins
  // — even if empty — so the user's live edits to the master lists are
  // reflected immediately in the New Employee form.
  const [deptOptions, setDeptOptions] = useState(DEPARTMENTS);
  const [desgOptions, setDesgOptions] = useState(DESIGNATIONS);

  useEffect(() => {
    fetch(`${API}/departments`)
      .then(r => r.json())
      .then(d => {
        if (d?.success && Array.isArray(d.data)) {
          // Replace unconditionally — empty list means "no departments
          // configured yet", and we should show that, not stale defaults.
          setDeptOptions(d.data.map(x => x.name).filter(Boolean));
        }
      })
      .catch(() => {});
    fetch(`${API}/designations`)
      .then(r => r.json())
      .then(d => {
        if (d?.success && Array.isArray(d.data)) {
          setDesgOptions(d.data.map(x => x.title).filter(Boolean));
        }
      })
      .catch(() => {});
  }, []);

  // Managers shown in the "Assigned to" dropdown = the fixed HR roster
  // PLUS anyone in the live employees list whose designation looks
  // managerial (Head / Manager / Director / Lead). Deduped by name.
  // The dropdown is locked to the canonical MANAGERS list — we no longer
  // auto-promote anyone in `employees` whose title happens to contain
  // Head / Manager / Director / Lead. HR explicitly asked for exactly
  // these 7 people, so a misnamed live employee can't widen the list.
  // Manager catalogue — fetched live from /api/managers so newly-added
  // managers (HRMS → Employees → Manager) appear automatically. Falls
  // back to the static MANAGERS array baked into companyData.js until
  // the API call resolves so the dropdown is never empty on first paint.
  const [managerOptions, setManagerOptions] = React.useState(MANAGERS.slice());
  React.useEffect(() => {
    fetch(`${API}/managers`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && Array.isArray(data.data) && data.data.length > 0) {
          setManagerOptions(data.data.map((m) => ({ name: m.name, title: m.title || '' })));
        }
      })
      .catch(() => {});
  }, []);

  const validateStep = () => {
    let newErrors = {};
    if (currentStep === 1) {
      if (!form.firstName) newErrors.firstName = 'First name is required';
      if (!form.lastName) newErrors.lastName = 'Last name is required';
      if (!form.username) newErrors.username = 'Username is required';
      if (!form.password) newErrors.password = 'Password is required';
      if (!form.email) {
        newErrors.email = 'Email is required';
      } else if (!/\S+@\S+\.\S+/.test(form.email)) {
        newErrors.email = 'Invalid email format';
      }
      if (!form.phone) {
        newErrors.phone = 'Phone number is required';
      } else if (!/^\d{10,}$/.test(form.phone.replace(/[- ]/g, ''))) {
        newErrors.phone = 'Invalid phone format (min 10 digits)';
      }
    } else if (currentStep === 2) {
      if (!form.joiningDate) {
        newErrors.joiningDate = 'Joining date is required';
      } else if (!/^\d{2}-\d{2}-\d{4}$/.test(form.joiningDate)) {
        newErrors.joiningDate = 'Use dd-mm-yyyy format';
      }
      if (!form.department) newErrors.department = 'Department is required';
      if (!form.employeeId) newErrors.employeeId = 'Employee ID is required';
      if (!form.designation) newErrors.designation = 'Designation is required';
      if (!form.salary) newErrors.salary = 'Salary amount is required';
      // assignedTo is optional — managers themselves (CEO, MD, Project
      // Manager etc.) have no manager above them. HR can leave this blank
      // and the row simply has no `assignedTo` in HRMS.
      // (No validation here.)
    } else if (currentStep === 3) {
      if (!form.degree) newErrors.degree = 'Degree is required';
      if (!form.university) newErrors.university = 'University is required';
      if (!form.fieldOfStudy) newErrors.fieldOfStudy = 'Field of study is required';
      if (!form.graduationYear) newErrors.graduationYear = 'Graduation year is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (e) => {
    const { id, value } = e.target;
    setForm(prev => ({ ...prev, [id]: value }));
    if (errors[id]) {
      setErrors(prev => {
        const n = { ...prev };
        delete n[id];
        return n;
      });
    }
  };

  /**
   * Joining-date input as dd-mm-yyyy.
   *
   * Internally we keep the value in dd-mm-yyyy (the format HR types and
   * sees on every screen). At submit time we convert to yyyy-mm-dd before
   * sending to the backend so Mongoose's Date cast still works.
   */
  const formatJoiningDateInput = (raw) => {
    const digits = String(raw || '').replace(/\D/g, '').slice(0, 8);
    const parts = [];
    if (digits.length > 0) parts.push(digits.slice(0, 2));
    if (digits.length > 2) parts.push(digits.slice(2, 4));
    if (digits.length > 4) parts.push(digits.slice(4, 8));
    return parts.join('-');
  };
  const handleJoiningDateChange = (e) => {
    // The input is now <input type="date">, so the browser hands us an
    // ISO yyyy-mm-dd string. We still store the user-facing dd-mm-yyyy
    // in form state because every downstream display + validation already
    // assumes that shape (and we convert it back to ISO at submit time).
    const raw = e.target.value || '';
    const ddmmyyyy = /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? raw.slice(8, 10) + '-' + raw.slice(5, 7) + '-' + raw.slice(0, 4)
      : formatJoiningDateInput(raw);
    setForm(prev => ({ ...prev, joiningDate: ddmmyyyy }));
    if (errors.joiningDate) {
      setErrors(prev => { const n = { ...prev }; delete n.joiningDate; return n; });
    }
  };
  // dd-mm-yyyy → yyyy-mm-dd  (returns '' if input is malformed)
  const ddmmyyyyToIso = (s) => {
    const m = String(s || '').match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (!m) return '';
    const [_, d, mo, y] = m;
    return `${y}-${mo}-${d}`;
  };

  const nextStep = () => {
    if (validateStep()) {
      setCurrentStep(prev => Math.min(prev + 1, 4));
    }
  };
  const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));

  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async () => {
    setSubmitError('');
    if (!validateStep()) {
      setSubmitError('Some required fields are missing or invalid — scroll up to see the red labels.');
      return false;
    }

    // Hard short-circuit: if the signed-in user isn't on the admin
    // allowlist, the backend write-gate will reject this POST with 403
    // before it even reaches the Employee model. Tell the user upfront
    // so they don't fill the form a second time hoping it'll work.
    if (!isAdmin) {
      setSubmitError(
        'You are signed in as a view-only user (' + (user?.email || 'no email') + '). ' +
        'Only HR admins can create employees. Sign out and sign back in with one of: ' +
        'tescodigitals26@gmail.com, tescostructures@gmail.com, hr@tescostructures.in.'
      );
      return false;
    }

    const body = {
      firstName:      form.firstName,
      lastName:       form.lastName,
      name:           `${form.firstName} ${form.lastName}`,
      username:       form.username,
      password:       form.password,
      email:          form.email,
      phone:          form.phone,
      employeeId:     form.employeeId,
      department:     form.department,
      designation:    form.designation,
      role:           form.role || form.designation || 'New Hire',
      employmentType: form.employmentType,
      // Backend stores joiningDate as a Date. Convert dd-mm-yyyy from the
      // form to yyyy-mm-dd so Mongoose's Date cast succeeds.
      joiningDate:    ddmmyyyyToIso(form.joiningDate) || form.joiningDate,
      salary:         form.salary,
      assignedTo:     form.assignedTo,
      // Backend reads this flag in the petrol-allowance auto-bill cron
      // (services/petrolDailyJob.js) — ineligible employees are simply
      // skipped, eligible ones get a row per workday at GPS km × 3.50.
      petrolEligible: !!form.petrolEligible,
      dob:            form.dob,
      gender:         form.gender,
      bloodGroup:     form.bloodGroup,
      address: {
        street:  form.street,
        city:    form.city,
        state:   form.state,
        zipCode: form.zipCode,
        country: form.country,
      },
      education: {
        degree:         form.degree,
        university:     form.university,
        fieldOfStudy:   form.fieldOfStudy,
        graduationYear: form.graduationYear,
      },
      status:   'Active',
      isActive: true,
    };

    setSubmitting(true);
    console.log('[NewEmployee] POST /api/employees body:', body);
    try {
      const res  = await fetch(`${API}/employees`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      console.log('[NewEmployee] response', res.status, data);

      if (!res.ok) {
        // Build a clear, actionable error message for the inline banner.
        let msg = data?.message || `HTTP ${res.status}`;
        if (res.status === 403 && data?.code === 'READ_ONLY') {
          msg = 'View-only mode — your account does not have permission to create employees. Sign out and sign back in with an admin account.';
        } else if (res.status === 400 && /already exists/i.test(msg)) {
          msg = `${msg} (pick a different email / username / employeeId).`;
        } else if (res.status === 400 && /Validation failed/i.test(msg)) {
          msg = `Backend rejected the form: ${msg}`;
        } else if (res.status >= 500) {
          msg = `Server error (${res.status}): ${msg}. Check the HRMS backend logs.`;
        }
        setSubmitError(msg);
        return false;
      }

      // Optional mobile-sync diagnostic stays on console only — it never
      // blocks the success path.
      if (data?.mobileSync && data.mobileSync.ok === false) {
        console.warn('[NewEmployee] mobile sync warning:', data.mobileSync.message);
      }
    } catch (err) {
      console.error('[NewEmployee] network error:', err);
      setSubmitError(
        'Could not reach the HRMS backend at ' + API + '. ' +
        'Is `npm start` running in the Backend folder? Error: ' + (err?.message || 'unknown')
      );
      return false;
    } finally {
      setSubmitting(false);
    }

    setIsSubmitted(true);
    // Re-fetch employee list in parent so the new row appears immediately.
    if (onSubmit) onSubmit();
    return true;
  };

  return (
    <div className="stepper-page">
      <div className="stepper-container">
        <aside className="stepper-sidebar">
          {steps.map((step) => (
            <div 
              key={step.id} 
              className={`step-item ${currentStep === step.id ? 'active' : ''} ${currentStep > step.id ? 'completed' : ''}`}
              onClick={() => {
                if (step.id < currentStep || validateStep()) {
                  setCurrentStep(step.id);
                }
              }}
            >
              <div className="step-icon">
                {currentStep > step.id ? <Check size={18} /> : step.icon}
              </div>
              <div className="step-info">
                <span className="step-number">Step {step.id}</span>
                <span className="step-title">{step.title}</span>
              </div>
            </div>
          ))}
        </aside>

        <main className="stepper-content-wrap">
          <div className="stepper-content-card">
            {currentStep === 1 && (
              <div className="step-content">
                <div className="form-header">
                  <h2 className="form-title">User Information</h2>
                  <p className="form-subtitle">Enter basic user details and credentials</p>
                </div>

                {Object.keys(errors).length > 0 && (
                  <div className="validation-alert">
                    <AlertCircle size={18} />
                    <span>Please correct the errors below to proceed.</span>
                  </div>
                )}

                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label" htmlFor="firstName"><span className="required">*</span> First Name</label>
                    <input 
                      type="text" id="firstName" className={`form-input ${errors.firstName ? 'error' : ''}`} 
                      placeholder="Enter first name" value={form.firstName} onChange={handleInputChange} 
                    />
                    {errors.firstName && <span className="error-text"><AlertCircle size={12} /> {errors.firstName}</span>}
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="lastName"><span className="required">*</span> Last Name</label>
                    <input 
                      type="text" id="lastName" className={`form-input ${errors.lastName ? 'error' : ''}`} 
                      placeholder="Enter last name" value={form.lastName} onChange={handleInputChange} 
                    />
                    {errors.lastName && <span className="error-text"><AlertCircle size={12} /> {errors.lastName}</span>}
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="username"><span className="required">*</span> Username</label>
                    <input 
                      type="text" id="username" className={`form-input ${errors.username ? 'error' : ''}`} 
                      placeholder="Enter username" value={form.username} onChange={handleInputChange} 
                    />
                    {errors.username && <span className="error-text"><AlertCircle size={12} /> {errors.username}</span>}
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="password"><span className="required">*</span> Password</label>
                    <div className="form-input-container">
                      <input 
                        type={showPassword ? "text" : "password"} id="password" className={`form-input ${errors.password ? 'error' : ''}`} 
                        placeholder="Enter password" value={form.password} onChange={handleInputChange} 
                      />
                      <div className="password-toggle" onClick={() => setShowPassword(!showPassword)}>
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </div>
                    </div>
                    {errors.password && <span className="error-text"><AlertCircle size={12} /> {errors.password}</span>}
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="email"><span className="required">*</span> Email</label>
                    <input 
                      type="email" id="email" className={`form-input ${errors.email ? 'error' : ''}`} 
                      placeholder="Enter email address" value={form.email} onChange={handleInputChange} 
                    />
                    {errors.email && <span className="error-text"><AlertCircle size={12} /> {errors.email}</span>}
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="phone"><span className="required">*</span> Phone</label>
                    <input 
                      type="tel" id="phone" className={`form-input ${errors.phone ? 'error' : ''}`} 
                      placeholder="Enter phone number" value={form.phone} onChange={handleInputChange} 
                    />
                    {errors.phone && <span className="error-text"><AlertCircle size={12} /> {errors.phone}</span>}
                  </div>

                  <div className="form-section-divider">
                    <h3 className="form-section-title">Personal Information</h3>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="dob">Date of Birth</label>
                    <input
                      type="date" id="dob" className="form-input"
                      value={form.dob} onChange={handleInputChange}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="gender">Gender</label>
                    <select
                      id="gender" className="form-input"
                      value={form.gender} onChange={handleInputChange}
                    >
                      <option value="">Select gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                      <option value="Prefer not to say">Prefer not to say</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="bloodGroup">Blood Group</label>
                    <select
                      id="bloodGroup" className="form-input"
                      value={form.bloodGroup} onChange={handleInputChange}
                    >
                      <option value="">Select blood group</option>
                      <option>A+</option><option>A-</option>
                      <option>A1+</option><option>A1-</option>
                      <option>B+</option><option>B-</option>
                      <option>AB+</option><option>AB-</option>
                      <option>O+</option><option>O-</option>
                    </select>
                  </div>

                  <div className="form-section-divider">
                    <h3 className="form-section-title">Address Information</h3>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="street">Street</label>
                    <input type="text" id="street" className="form-input" placeholder="Enter street address" value={form.street} onChange={handleInputChange} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="city">City</label>
                    <input type="text" id="city" className="form-input" placeholder="Enter city" value={form.city} onChange={handleInputChange} />
                  </div>
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="step-content">
                <div className="form-header">
                  <h2 className="form-title">Employment Information</h2>
                  <p className="form-subtitle">Configure employment details</p>
                </div>

                {Object.keys(errors).length > 0 && (
                  <div className="validation-alert">
                    <AlertCircle size={18} />
                    <span>Please correct the errors below to proceed.</span>
                  </div>
                )}
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label" htmlFor="joiningDate">
                      <span className="required">*</span> Joining Date
                      <span style={{ fontSize: 11, color: '#64748B', marginLeft: 6, fontWeight: 400 }}>(dd-mm-yyyy)</span>
                    </label>
                    {/* Calendar picker (Jun 2026 HR brief): HR was keying in
                        the date by hand and typos were common. The browser
                        date picker enforces a valid date and we keep the
                        existing dd-mm-yyyy form-state shape via the helper
                        in handleJoiningDateChange. */}
                    <input
                      type="date"
                      id="joiningDate"
                      className={`form-input ${errors.joiningDate ? 'error' : ''}`}
                      value={(() => {
                        const v = form.joiningDate || '';
                        // form state is dd-mm-yyyy; <input type="date"> needs yyyy-mm-dd.
                        return /^\d{2}-\d{2}-\d{4}$/.test(v)
                          ? v.slice(6, 10) + '-' + v.slice(3, 5) + '-' + v.slice(0, 2)
                          : '';
                      })()}
                      onChange={handleJoiningDateChange}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="department"><span className="required">*</span> Department</label>
                    <select
                      id="department"
                      className={`form-input ${errors.department ? 'error' : ''}`}
                      value={form.department}
                      onChange={handleInputChange}
                      onFocus={(e) => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' })}
                    >
                      <option value="">Select department</option>
                      {deptOptions.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="employeeId"><span className="required">*</span> Emp Id</label>
                    <input
                      type="text" id="employeeId" className={`form-input ${errors.employeeId ? 'error' : ''}`}
                      placeholder="e.g. TSL-024" value={form.employeeId} onChange={handleInputChange}
                    />
                    {errors.employeeId && <span className="error-text"><AlertCircle size={12} /> {errors.employeeId}</span>}
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="designation"><span className="required">*</span> Designation</label>
                    <select id="designation" className={`form-input ${errors.designation ? 'error' : ''}`} value={form.designation} onChange={handleInputChange}>
                      <option value="">Select designation</option>
                      {desgOptions.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    {errors.designation && <span className="error-text"><AlertCircle size={12} /> {errors.designation}</span>}
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="employmentType">Employee Type</label>
                    <select
                      id="employmentType"
                      className={`form-input ${errors.employmentType ? 'error' : ''}`}
                      value={form.employmentType}
                      onChange={handleInputChange}
                    >
                      <option value="">Select type</option>
                      <option value="Full-time">Full-time</option>
                      <option value="Part-time">Part-time</option>
                      <option value="Contract">Contract</option>
                      <option value="Intern">Intern</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="salary"><span className="required">*</span> Salary</label>
                    <input type="number" id="salary" className={`form-input ${errors.salary ? 'error' : ''}`} placeholder="Enter salary" value={form.salary} onChange={handleInputChange} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="assignedTo">
                      Assigned to (Manager)
                      <span style={{ fontSize: 11, color: '#64748B', marginLeft: 6, fontWeight: 400 }}>(optional — leave blank for top-level roles)</span>
                    </label>
                    <select
                      id="assignedTo"
                      className={`form-input ${errors.assignedTo ? 'error' : ''}`}
                      value={form.assignedTo}
                      onChange={handleInputChange}
                      onFocus={(e) => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' })}
                    >
                      <option value="">Select Manager</option>
                      {managerOptions.map(m => (
                        <option key={`${m.name}-${m.title}`} value={m.name}>
                          {m.name}{m.title ? ` — ${m.title}` : ''}
                        </option>
                      ))}
                    </select>
                    {errors.assignedTo && <span className="error-text"><AlertCircle size={12} /> {errors.assignedTo}</span>}
                  </div>

                  {/* Petrol-eligible toggle — added Jun 2026. Yes = the system
                      auto-calculates petrol allowance daily from the GPS
                      check-in→check-out polyline at ₹3.50/km. No = this
                      employee can't claim petrol (e.g. an office-only HR
                      role doesn't burn fuel for the company). */}
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', border: '1px solid var(--border-color)', borderRadius: 10, background: '#F9FAFB', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={!!form.petrolEligible}
                        onChange={(e) => setForm(prev => ({ ...prev, petrolEligible: e.target.checked }))}
                        style={{ width: 18, height: 18, cursor: 'pointer' }}
                      />
                      <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>Eligible for petrol allowance?</span>
                      <span style={{ fontSize: 11, color: 'var(--text-light)', fontWeight: 500, marginLeft: 'auto' }}>
                        If yes, we auto-bill daily GPS distance × ₹3.50/km from check-in to check-out.
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="step-content">
                <div className="form-header">
                  <h2 className="form-title">Education Information</h2>
                  <p className="form-subtitle">Enter your highest academic qualification</p>
                </div>

                {Object.keys(errors).length > 0 && (
                  <div className="validation-alert">
                    <AlertCircle size={18} />
                    <span>Please correct the errors below to proceed.</span>
                  </div>
                )}
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label" htmlFor="degree"><span className="required">*</span> Degree</label>
                    <select id="degree" className={`form-input ${errors.degree ? 'error' : ''}`} value={form.degree} onChange={handleInputChange}>
                      <option value="">Select degree</option>
                      <option>High School</option>
                      <option>Associate's Degree</option>
                      <option>Bachelor's Degree</option>
                      <option>Master's Degree</option>
                      <option>PhD / Doctorate</option>
                      <option>Other Professional Certificate</option>
                    </select>
                    {errors.degree && <span className="error-text"><AlertCircle size={12} /> {errors.degree}</span>}
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="university"><span className="required">*</span> University / College</label>
                    <input 
                      type="text" id="university" className={`form-input ${errors.university ? 'error' : ''}`} 
                      placeholder="Enter university name" value={form.university} onChange={handleInputChange} 
                    />
                    {errors.university && <span className="error-text"><AlertCircle size={12} /> {errors.university}</span>}
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="fieldOfStudy"><span className="required">*</span> Field of Study</label>
                    <input 
                      type="text" id="fieldOfStudy" className={`form-input ${errors.fieldOfStudy ? 'error' : ''}`} 
                      placeholder="e.g. Computer Science" value={form.fieldOfStudy} onChange={handleInputChange} 
                    />
                    {errors.fieldOfStudy && <span className="error-text"><AlertCircle size={12} /> {errors.fieldOfStudy}</span>}
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="graduationYear"><span className="required">*</span> Graduation Year</label>
                    <select 
                      id="graduationYear" className={`form-input ${errors.graduationYear ? 'error' : ''}`} 
                      value={form.graduationYear} onChange={handleInputChange}
                    >
                      <option value="">YYYY</option>
                      {Array.from({ length: 60 }, (_, i) => new Date().getFullYear() + 5 - i).map(year => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                    {errors.graduationYear && <span className="error-text"><AlertCircle size={12} /> {errors.graduationYear}</span>}
                  </div>
                </div>
              </div>
            )}

            {currentStep === 4 && !isSubmitted && (
              <div className="step-content" style={{ textAlign: 'center', padding: '20px 0' }}>
                <div className="submit-review-card" style={{ maxWidth: '600px', margin: '0 auto' }}>
                  <div className="success-icon-large">
                    <Check size={48} color="#4CAA17" />
                  </div>
                  <h2 className="form-title">Ready to Submit?</h2>
                  <p className="form-subtitle">Please review all information before finalizing the new employee record.</p>
                  
                  <div className="review-summary-grid" style={{ marginTop: '16px', gap: '16px' }}>
                    <div className="review-section">
                      <h4 className="review-section-title">Personal Details</h4>
                      <div className="review-row">
                        <span className="review-label">Full Name:</span>
                        <span className="review-value">{form.firstName} {form.lastName}</span>
                      </div>
                      <div className="review-row">
                        <span className="review-label">Email:</span>
                        <span className="review-value">{form.email}</span>
                      </div>
                      <div className="review-row">
                        <span className="review-label">Phone:</span>
                        <span className="review-value">{form.phone}</span>
                      </div>
                    </div>

                    <div className="review-section">
                      <h4 className="review-section-title">Employment</h4>
                      <div className="review-row">
                        <span className="review-label">Department:</span>
                        <span className="review-value">{form.department}</span>
                      </div>
                      <div className="review-row">
                        <span className="review-label">Emp Id:</span>
                        <span className="review-value">{form.employeeId}</span>
                      </div>
                      <div className="review-row">
                        <span className="review-label">Designation:</span>
                        <span className="review-value">{form.designation}</span>
                      </div>
                      <div className="review-row">
                        <span className="review-label">Manager:</span>
                        <span className="review-value">{form.assignedTo}</span>
                      </div>
                      <div className="review-row">
                        <span className="review-label">Joining Date:</span>
                        <span className="review-value">{form.joiningDate}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Inline error banner — sticks to the review screen until
                    the next attempt succeeds. Replaces the dismissable
                    native alert that users used to click through without
                    reading. */}
                {submitError && (
                  <div style={{
                    maxWidth: 600, margin: '12px auto 0', padding: '12px 16px',
                    background: '#FEF2F2', border: '1px solid #FECACA',
                    borderRadius: 8, color: '#991B1B', fontSize: 13,
                    display: 'flex', gap: 10, alignItems: 'flex-start',
                  }}>
                    <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <strong>Could not save:</strong> {submitError}
                    </div>
                  </div>
                )}

                {/* Show signed-in user + admin status so HR can see at a
                    glance whether the submit will be allowed. */}
                <div style={{
                  maxWidth: 600, margin: '8px auto 0',
                  fontSize: 11, color: isAdmin ? '#16A34A' : '#DC2626',
                  textAlign: 'center', fontWeight: 600,
                }}>
                  Signed in as <strong>{user?.email || '—'}</strong>
                  {isAdmin ? ' · Admin (can save)' : ' · View-only (cannot save)'}
                </div>

                <div className="review-secondary-actions" style={{ maxWidth: '600px', margin: '12px auto 0', display: 'flex', justifyContent: 'center' }}>
                  <button
                    className="btn-next"
                    disabled={submitting || !isAdmin}
                    style={{
                      justifyContent: 'center',
                      height: '44px',
                      minWidth: '240px',
                      opacity: (submitting || !isAdmin) ? 0.6 : 1,
                      cursor: (submitting || !isAdmin) ? 'not-allowed' : 'pointer',
                    }}
                    onClick={async () => {
                      // Save first; only navigate if the save actually succeeded.
                      const ok = await handleSubmit();
                      if (ok) setActiveView('employee-list');
                    }}
                  >
                    <Users size={18} /> {submitting ? 'Saving…' : 'Save & Go to Employee List'}
                  </button>
                </div>
              </div>
            )}

            {isSubmitted && (
              <div className="step-content success-view">
                <div className="success-lottie-placeholder">
                  <div className="success-checkmark">
                    <Check size={64} />
                  </div>
                </div>
                <h2 className="success-title">Employee Added Successfully!</h2>
                <p className="success-message">
                  <strong>{form.firstName} {form.lastName}</strong> has been added to the system. 
                  Their employee ID is <strong>EMP-{Math.floor(1000 + Math.random() * 9000)}</strong>.
                </p>
                <div className="success-actions">
                  <button className="btn-next" onClick={() => setActiveView('employee-list')}>
                    Go to Employee List
                  </button>
                  <button className="btn-reset" onClick={() => {
                    setForm({});
                    setCurrentStep(1);
                    setIsSubmitted(false);
                  }}>
                    Add Another Employee
                  </button>
                </div>
              </div>
            )}
          </div>

          {!isSubmitted && (
            <div className="stepper-footer-card">
              <button className="btn-reset" onClick={() => setForm({})}>
                <RotateCcw size={16} /> Reset
              </button>
              <div style={{ display: 'flex', gap: '12px' }}>
                {currentStep > 1 && (
                  <button className="btn-reset" onClick={prevStep}>
                    <ArrowLeft size={16} /> Previous
                  </button>
                )}
                {currentStep < 4 && (
                  <button className="btn-next" onClick={nextStep}>
                    Next <ChevronRight size={18} />
                  </button>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
