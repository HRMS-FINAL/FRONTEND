/**
 * Login.jsx — three-screen auth flow that matches the Vercel deploy.
 *
 *   signin → default. Email + password. "Forgot?" link goes to `forgot`,
 *            "Sign Up" link goes to `signup`.
 *
 *   signup → Full name + email + password. "Back to Sign In" returns.
 *            On success the AuthContext signs the new account in.
 *
 *   forgot → Email + "Send Reset Link". POST /auth/send-otp dispatches
 *            an OTP, then we transition through the OTP entry screen
 *            (`otp`) and the new-password screen (`reset`). Behind the
 *            visible "Forgot Password" page the rest of the flow keeps
 *            the same OTP-based security the mobile app uses.
 *
 *   otp    → six-digit code with live validity timer + resend cooldown.
 *
 *   reset  → set a new password; backend auto-issues a fresh JWT and
 *            the AuthContext signs the user in immediately.
 *
 *   success → confirmation card with "Back to Sign In".
 */

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import {
  Mail, Lock, Eye, EyeOff, User, ArrowLeft, ShieldCheck, CheckCircle, RefreshCw,
} from 'lucide-react';
import logo from '../assets/logo-hrm.png';

const OTP_LENGTH         = 6;
const OTP_VALIDITY_SEC   = 10 * 60;
const RESEND_COOLDOWN_SEC = 55;

function maskEmail(e) {
  if (!e || !e.includes('@')) return e || '';
  const [local, domain] = e.split('@');
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local.slice(0, 2)}${'*'.repeat(Math.max(1, local.length - 4))}${local.slice(-2)}@${domain}`;
}
function fmtTime(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
function isValidEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim());
}

export default function Login() {
  const { login, signup, sendOtp, verifyOtp, resetPassword } = useAuth();
  const { showNotification } = useNotification();

  // Default to the Sign In screen — matches the Vercel deploy.
  const [mode, setMode] = useState('signin'); // signin | signup | forgot | otp | reset | success
  const [email, setEmail]       = useState('admin@tesco.com');
  const [password, setPassword] = useState('password123');
  const [name, setName]         = useState('');
  const [showPass, setShowPass] = useState(false);

  // OTP / reset state — only used by the forgot-password sub-flow.
  const [otpDigits, setOtpDigits] = useState(Array(OTP_LENGTH).fill(''));
  const otpRefs = useRef([]);
  const [validitySec, setValiditySec] = useState(OTP_VALIDITY_SEC);
  const [resendIn,    setResendIn]    = useState(RESEND_COOLDOWN_SEC);
  const [resending,   setResending]   = useState(false);
  const [resetToken,  setResetToken]  = useState('');

  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { setError(''); }, [mode]);

  // OTP countdowns
  useEffect(() => {
    if (mode !== 'otp' || validitySec <= 0) return;
    const t = setInterval(() => setValiditySec(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [mode, validitySec]);
  useEffect(() => {
    if (mode !== 'otp' || resendIn <= 0) return;
    const t = setInterval(() => setResendIn(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [mode, resendIn]);

  /* ─── Handlers ───────────────────────────────────────────────── */

  const handleSignIn = async (e) => {
    e?.preventDefault?.();
    setError('');
    if (!isValidEmail(email))   { setError('Please enter a valid email address.'); return; }
    if (!password)              { setError('Please enter your password.'); return; }
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result.ok) {
        showNotification('Welcome back!', 'success');
      } else {
        setError(result.message || 'Invalid email or password');
        showNotification(result.message || 'Login failed.', 'error');
      }
    } finally { setLoading(false); }
  };

  const handleSignUp = async (e) => {
    e?.preventDefault?.();
    setError('');
    if (!name.trim())                                { setError('Please enter your full name.');                 return; }
    if (!isValidEmail(email))                        { setError('Please enter a valid email address.');          return; }
    if (!password || password.length < 6)            { setError('Password must be at least 6 characters.');     return; }
    setLoading(true);
    try {
      const result = await signup(name, email, password);
      if (result.ok) {
        showNotification('Account created — welcome!', 'success');
      } else {
        setError(result.message || 'Could not create account.');
        showNotification(result.message || 'Signup failed.', 'error');
      }
    } finally { setLoading(false); }
  };

  const handleSendReset = async (e) => {
    e?.preventDefault?.();
    setError('');
    if (!isValidEmail(email)) { setError('Please enter a valid registered email.'); return; }
    setLoading(true);
    try {
      const data = await sendOtp(email);
      if (data?.success) {
        setOtpDigits(Array(OTP_LENGTH).fill(''));
        setValiditySec(OTP_VALIDITY_SEC);
        setResendIn(RESEND_COOLDOWN_SEC);
        setMode('otp');
        showNotification(data.message || `OTP sent to ${email}.`, 'success');
      } else {
        setError(data?.message || 'Could not send OTP.');
        showNotification(data?.message || 'Could not send OTP.', 'error');
      }
    } finally { setLoading(false); }
  };

  const handleOtpDigit = (text, idx) => {
    if (text.length > 1) {
      const chars = text.replace(/\D/g, '').slice(0, OTP_LENGTH).split('');
      const next  = [...otpDigits];
      chars.forEach((c, i) => { if (idx + i < OTP_LENGTH) next[idx + i] = c; });
      setOtpDigits(next);
      const lastIdx = Math.min(idx + chars.length, OTP_LENGTH - 1);
      otpRefs.current[lastIdx]?.focus();
      return;
    }
    const ch = text.replace(/\D/g, '');
    const next = [...otpDigits];
    next[idx] = ch;
    setOtpDigits(next);
    if (ch && idx < OTP_LENGTH - 1) otpRefs.current[idx + 1]?.focus();
  };
  const handleOtpKeyDown = (e, idx) => {
    if (e.key === 'Backspace' && !otpDigits[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus();
      const next = [...otpDigits];
      next[idx - 1] = '';
      setOtpDigits(next);
    }
  };
  const handleVerifyOtp = async (e) => {
    e?.preventDefault?.();
    setError('');
    const code = otpDigits.join('');
    if (code.length !== OTP_LENGTH) { setError(`Please enter all ${OTP_LENGTH} digits.`); return; }
    if (validitySec <= 0)           { setError('OTP expired. Please resend and try again.'); return; }
    setLoading(true);
    try {
      const data = await verifyOtp(email, code);
      if (data?.success && data.resetToken) {
        setResetToken(data.resetToken);
        setPassword('');
        setMode('reset');
        showNotification('OTP verified. Set a new password.', 'success');
      } else {
        setError(data?.message || 'Incorrect OTP.');
      }
    } finally { setLoading(false); }
  };
  const handleResendOtp = async () => {
    if (resendIn > 0) return;
    setResending(true);
    try {
      const data = await sendOtp(email);
      if (data?.success) {
        setValiditySec(OTP_VALIDITY_SEC);
        setResendIn(RESEND_COOLDOWN_SEC);
        setOtpDigits(Array(OTP_LENGTH).fill(''));
        otpRefs.current[0]?.focus();
        showNotification('A new OTP was sent.', 'success');
      } else {
        showNotification(data?.message || 'Could not resend OTP.', 'error');
      }
    } finally { setResending(false); }
  };
  const handleResetPassword = async (e) => {
    e?.preventDefault?.();
    setError('');
    if (!password || password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    try {
      const data = await resetPassword(resetToken, password);
      if (data?.success) {
        showNotification('Password updated. You can sign in now.', 'success');
        // Don't auto-login — the user asked for the flow:
        // "user has to reset password and then the user need to login
        // with that password". Land them on the success screen, then
        // back to Sign In with the email pre-filled.
        setMode('success');
      } else {
        setError(data?.message || 'Could not reset password.');
        showNotification(data?.message || 'Reset failed.', 'error');
      }
    } finally { setLoading(false); }
  };

  /* ─── Visual building blocks ─────────────────────────────────── */

  const Header = ({ title, subtitle }) => (
    <div className="login-header">
      <img
        src={logo}
        alt="TESCO Structures"
        style={{ width: '220px', height: 'auto', margin: '0 auto 24px', display: 'block' }}
      />
      <h1 className="login-title">{title}</h1>
      <p className="login-subtitle">{subtitle}</p>
    </div>
  );

  /* ─── Renderers ──────────────────────────────────────────────── */

  const renderSignIn = () => (
    <>
      <Header title="Welcome Back" subtitle="Sign in to your HRM dashboard" />
      <form onSubmit={handleSignIn} className="login-form">
        <div className="ne-field">
          <label className="ne-label">Email Address</label>
          <div className="ne-input-wrap">
            <Mail size={18} className="ne-input-icon" />
            <input
              type="email"
              className="ne-input has-icon"
              placeholder="name@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoFocus
              required
            />
          </div>
        </div>

        <div className="ne-field">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label className="ne-label">Password</label>
            <button type="button" className="text-btn-sm" onClick={() => setMode('forgot')}>
              Forgot?
            </button>
          </div>
          <div className="ne-input-wrap">
            <Lock size={18} className="ne-input-icon" />
            <input
              type={showPass ? 'text' : 'password'}
              className="ne-input has-icon"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
            <button type="button" className="pass-toggle-btn" onClick={() => setShowPass(!showPass)}>
              {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {error && <div className="login-error">{error}</div>}

        <button
          type="submit"
          className={`ne-btn-primary ${loading ? 'loading' : ''}`}
          style={{ width: '100%', justifyContent: 'center', height: 48, fontSize: 16, marginTop: '8px' }}
          disabled={loading}
        >
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </form>

      <div className="login-footer">
        Don't have an account?{' '}
        <button className="text-btn" onClick={() => { setMode('signup'); setPassword(''); setName(''); }}>
          Sign Up
        </button>
      </div>
    </>
  );

  const renderSignUp = () => (
    <>
      <Header title="Create Account" subtitle="Join TESCO Structures workforce" />
      <form onSubmit={handleSignUp} className="login-form">
        <div className="ne-field">
          <label className="ne-label">Full Name</label>
          <div className="ne-input-wrap">
            <User size={18} className="ne-input-icon" />
            <input
              type="text"
              className="ne-input has-icon"
              placeholder="John Doe"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              required
            />
          </div>
        </div>

        <div className="ne-field">
          <label className="ne-label">Email Address</label>
          <div className="ne-input-wrap">
            <Mail size={18} className="ne-input-icon" />
            <input
              type="email"
              className="ne-input has-icon"
              placeholder="name@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="ne-field">
          <label className="ne-label">Password</label>
          <div className="ne-input-wrap">
            <Lock size={18} className="ne-input-icon" />
            <input
              type={showPass ? 'text' : 'password'}
              className="ne-input has-icon"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
            <button type="button" className="pass-toggle-btn" onClick={() => setShowPass(!showPass)}>
              {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {error && <div className="login-error">{error}</div>}

        <button
          type="submit"
          className={`ne-btn-primary ${loading ? 'loading' : ''}`}
          style={{ width: '100%', justifyContent: 'center', height: 48, fontSize: 16, marginTop: '8px' }}
          disabled={loading}
        >
          {loading ? 'Creating account…' : 'Create Account'}
        </button>
      </form>

      <div className="login-footer">
        <button className="text-btn-with-icon" onClick={() => setMode('signin')}>
          <ArrowLeft size={16} /> Back to Sign In
        </button>
      </div>
    </>
  );

  const renderForgot = () => (
    <>
      <Header title="Forgot Password" subtitle="Enter your email to receive a reset link" />
      <form onSubmit={handleSendReset} className="login-form">
        <div className="ne-field">
          <label className="ne-label">Email Address</label>
          <div className="ne-input-wrap">
            <Mail size={18} className="ne-input-icon" />
            <input
              type="email"
              className="ne-input has-icon"
              placeholder="name@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoFocus
              required
            />
          </div>
        </div>

        {error && <div className="login-error">{error}</div>}

        <button
          type="submit"
          className={`ne-btn-primary ${loading ? 'loading' : ''}`}
          style={{ width: '100%', justifyContent: 'center', height: 48, fontSize: 16, marginTop: '8px' }}
          disabled={loading}
        >
          {loading ? 'Sending…' : 'Send Reset Link'}
        </button>
      </form>

      <div className="login-footer">
        <button className="text-btn-with-icon" onClick={() => setMode('signin')}>
          <ArrowLeft size={16} /> Back to Sign In
        </button>
      </div>
    </>
  );

  const renderOtp = () => {
    const canSubmit = otpDigits.every(d => d.length === 1) && validitySec > 0 && !loading;
    return (
      <>
        <div className="login-header" style={{ marginBottom: 24 }}>
          <img
            src={logo}
            alt="TESCO Structures"
            style={{ width: '200px', height: 'auto', margin: '0 auto 18px', display: 'block' }}
          />
          <div
            style={{
              width: 56, height: 56, borderRadius: 28,
              background: '#E8F5E5',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 14px',
            }}
          >
            <ShieldCheck size={26} color="#4CAA17" />
          </div>
          <h1 className="login-title" style={{ fontSize: 24 }}>Enter OTP</h1>
          <p className="login-subtitle">Sent to {maskEmail(email)}</p>
        </div>

        <form onSubmit={handleVerifyOtp} className="login-form">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            {otpDigits.map((d, i) => (
              <input
                key={i}
                ref={el => (otpRefs.current[i] = el)}
                type="text"
                inputMode="numeric"
                maxLength={i === 0 ? OTP_LENGTH : 1}
                value={d}
                onChange={e => handleOtpDigit(e.target.value, i)}
                onKeyDown={e => handleOtpKeyDown(e, i)}
                style={{
                  width: 46, height: 52,
                  textAlign: 'center',
                  fontSize: 20, fontWeight: 700,
                  borderRadius: 8,
                  border: `1.4px solid ${d ? '#4CAA17' : '#E5E5E5'}`,
                  background: d ? '#F4FBF3' : '#FAFAFA',
                  color: '#1A1A1A',
                  outline: 'none',
                  transition: 'all .15s',
                }}
              />
            ))}
          </div>

          <p style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>
            OTP valid for <span style={{ color: '#4CAA17', fontWeight: 700 }}>{fmtTime(validitySec)}</span>
          </p>

          {error && <div className="login-error">{error}</div>}

          <button
            type="submit"
            className={`ne-btn-primary ${loading ? 'loading' : ''}`}
            style={{ width: '100%', justifyContent: 'center', height: 48, fontSize: 16 }}
            disabled={!canSubmit}
          >
            {loading ? 'Verifying…' : 'Verify OTP'}
          </button>
        </form>

        <div className="login-footer" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            type="button"
            className="text-btn-with-icon"
            onClick={handleResendOtp}
            disabled={resendIn > 0 || resending}
            style={{ opacity: resendIn > 0 ? 0.55 : 1 }}
          >
            <RefreshCw size={14} />
            {resending ? 'Resending…' : resendIn > 0 ? `Resend OTP (${fmtTime(resendIn)})` : 'Resend OTP'}
          </button>
          <button className="text-btn-with-icon" onClick={() => setMode('forgot')}>
            <ArrowLeft size={16} /> Change email
          </button>
        </div>
      </>
    );
  };

  const renderReset = () => (
    <>
      <Header title="Reset Password" subtitle="Set a new password for your account" />
      <form onSubmit={handleResetPassword} className="login-form">
        <div className="ne-field">
          <label className="ne-label">New Password</label>
          <div className="ne-input-wrap">
            <Lock size={18} className="ne-input-icon" />
            <input
              type={showPass ? 'text' : 'password'}
              className="ne-input has-icon"
              placeholder="At least 6 characters"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
              required
            />
            <button type="button" className="pass-toggle-btn" onClick={() => setShowPass(!showPass)}>
              {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {error && <div className="login-error">{error}</div>}

        <button
          type="submit"
          className={`ne-btn-primary ${loading ? 'loading' : ''}`}
          style={{ width: '100%', justifyContent: 'center', height: 48, fontSize: 16, marginTop: '8px' }}
          disabled={loading}
        >
          {loading ? 'Updating…' : 'Update Password'}
        </button>
      </form>
    </>
  );

  const renderSuccess = () => (
    <div className="auth-success-state">
      <div className="success-icon-wrap">
        <CheckCircle size={48} color="#4CAA17" />
      </div>
      <h2 className="login-title">Password Updated</h2>
      <p className="login-subtitle">
        Your password was reset successfully. Sign in with your new password to continue.
      </p>
      <button
        className="ne-btn-primary"
        style={{ width: '100%', marginTop: '24px', justifyContent: 'center', height: 48, fontSize: 16 }}
        onClick={() => { setMode('signin'); setPassword(''); }}
      >
        Back to Sign In
      </button>
    </div>
  );

  const renderContent = () => {
    switch (mode) {
      case 'signin':  return renderSignIn();
      case 'signup':  return renderSignUp();
      case 'forgot':  return renderForgot();
      case 'otp':     return renderOtp();
      case 'reset':   return renderReset();
      case 'success': return renderSuccess();
      default:        return renderSignIn();
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        {renderContent()}
      </div>

      <div className="auth-features">
        <div className="auth-feature-item">
          <ShieldCheck size={20} />
          <span>Secure AES-256 Encryption</span>
        </div>
        <div className="auth-feature-item">
          <ShieldCheck size={20} />
          <span>Multi-factor Authentication Ready</span>
        </div>
      </div>
    </div>
  );
}
