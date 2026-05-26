import React, { useState, useEffect } from 'react';
import { 
  User, Briefcase, BookOpen, Mail, Check, Eye, EyeOff, 
  Plus, RotateCcw, ArrowLeft, ChevronRight, AlertCircle, Users
} from 'lucide-react';
import { allEmployees } from '../data/mockData';
import { MANAGERS, DESIGNATIONS, DEPARTMENTS } from '../data/companyData';

const API = 'http://localhost:8001/api';

export default function NewEmployeeForm({ onBack, onSubmit, setActiveView, employees }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    firstName: '', lastName: '', username: '', password: '',
    email: '', phone: '', street: '', city: '', state: '',
    zipCode: '', country: '',
    // Personal info — required by HR
    dob: '', gender: '', bloodGroup: '',
    // HR types in the company's actual Emp ID (e.g. TSL-024). No auto-prefix.
    employeeId: '', department: '', role: '', designation: '', employmentType: '',
    joiningDate: '', salary: '', assignedTo: '',
    degree: '', university: '', fieldOfStudy: '', graduationYear: ''
  });

  const steps = [
    { id: 1, title: 'User Information', icon: <User size={20} /> },
    { id: 2, title: 'Employment Information', icon: <Briefcase size={20} /> },
    { id: 3, title: 'Education Information', icon: <BookOpen size={20} /> },
    { id: 4, title: 'Submit', icon: <Mail size={20} /> },
  ];

  const [errors, setErrors] = useState({});

  // API-loaded dropdown options. Defaults come from the company catalogue
  // so the form is usable even before the API call completes (e.g. during
  // backend cold-start).
  const [deptOptions, setDeptOptions] = useState(DEPARTMENTS);
  const [desgOptions, setDesgOptions] = useState(DESIGNATIONS);

  useEffect(() => {
    fetch(`${API}/departments`)
      .then(r => r.json())
      .then(d => { if (d.success && d.data.length > 0) setDeptOptions(d.data.map(x => x.name)); })
      .catch(() => {});
    fetch(`${API}/designations`)
      .then(r => r.json())
      .then(d => { if (d.success && d.data.length > 0) setDesgOptions(d.data.map(x => x.title)); })
      .catch(() => {});
  }, []);

  // Managers shown in the "Assigned to" dropdown = the fixed HR roster
  // PLUS anyone in the live employees list whose designation looks
  // managerial (Head / Manager / Director / Lead). Deduped by name.
  const managerOptions = React.useMemo(() => {
    const liveManagers = (employees || [])
      .map(e => {
        const name = e.name || `${e.firstName || ''} ${e.lastName || ''}`.trim();
        const title = typeof e.designation === 'object'
          ? (e.designation?.title || '')
          : (e.designation || '');
        return { name, title };
      })
      .filter(m => m.name && /head|manager|director|lead/i.test(m.title || ''));
    const seen = new Set();
    const merged = [];
    [...MANAGERS, ...liveManagers].forEach(m => {
      const key = m.name.toLowerCase().trim();
      if (key && !seen.has(key)) { seen.add(key); merged.push(m); }
    });
    return merged;
  }, [employees]);

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
      if (!form.joiningDate) newErrors.joiningDate = 'Joining date is required';
      if (!form.department) newErrors.department = 'Department is required';
      if (!form.employeeId) newErrors.employeeId = 'Employee ID is required';
      if (!form.designation) newErrors.designation = 'Designation is required';
      if (!form.salary) newErrors.salary = 'Salary amount is required';
      if (!form.assignedTo) newErrors.assignedTo = 'Manager assignment is required';
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

  const nextStep = () => {
    if (validateStep()) {
      setCurrentStep(prev => Math.min(prev + 1, 4));
    }
  };
  const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));

  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!validateStep()) return false;

    // POST to backend. IMPORTANT: include the password the user typed —
    // it was being dropped from the body before, which made every save
    // either use the default 'password123' (best case) or fail validation
    // (worst case) without the UI knowing. We now also check res.ok and
    // surface server-side validation errors via alert so the user can fix
    // them. Visual flow / success screen stays identical.
    try {
      const res = await fetch(`${API}/employees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
          joiningDate:    form.joiningDate,
          salary:         form.salary,
          assignedTo:     form.assignedTo,
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
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Validation or duplicate error — tell the user instead of pretending
        // the save worked. Keeps the existing UI; just adds a single alert.
        alert('Could not create employee:\n\n' + (data?.message || `HTTP ${res.status}`));
        return false;       // don't flip to success screen, don't re-fetch
      }
      // The HRMS save worked, but the mobile sync may have failed silently
      // (wrong / missing MOBILE_ADMIN_SECRET, mobile backend down, etc.).
      // Tell the admin if so — otherwise the employee tries to log in on the
      // mobile app, sees "Invalid credentials", and we're left guessing.
      if (data?.mobileSync && data.mobileSync.ok === false) {
        alert(
          'Heads up — employee saved in HRMS, but the mobile sync failed:\n\n' +
          (data.mobileSync.message || 'Unknown error') +
          '\n\nThe employee will NOT be able to log into the mobile ERM app ' +
          'until this is resolved. Open ' +
          'http://localhost:8001/api/employees/mobile-sync-status ' +
          'in your browser to diagnose.'
        );
        // Still flip to success — the HRMS row exists. Admin can re-edit
        // later to retrigger the mirror once they fix the sync config.
      }
    } catch (err) {
      alert('Network error creating employee: ' + (err?.message || 'unknown'));
      return false;
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
                    <label className="form-label" htmlFor="joiningDate"><span className="required">*</span> Joining Date</label>
                    <input type="date" id="joiningDate" className={`form-input ${errors.joiningDate ? 'error' : ''}`} value={form.joiningDate} onChange={handleInputChange} />
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
                    <label className="form-label" htmlFor="salary"><span className="required">*</span> Salary</label>
                    <input type="number" id="salary" className={`form-input ${errors.salary ? 'error' : ''}`} placeholder="Enter salary" value={form.salary} onChange={handleInputChange} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="assignedTo"><span className="required">*</span> Assigned to (Manager)</label>
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

                <div className="review-secondary-actions" style={{ maxWidth: '600px', margin: '12px auto 0', display: 'flex', justifyContent: 'center' }}>
                  <button
                    className="btn-next"
                    style={{ justifyContent: 'center', height: '44px', minWidth: '240px' }}
                    onClick={async () => {
                      // Save first; only navigate if the save actually succeeded.
                      const ok = await handleSubmit();
                      if (ok) setActiveView('employee-list');
                    }}
                  >
                    <Users size={18} /> Go to Employee List
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
