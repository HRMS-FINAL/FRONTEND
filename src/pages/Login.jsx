import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { Mail, Lock, Eye, EyeOff, User, ArrowLeft, ShieldCheck, CheckCircle } from 'lucide-react';
import logo from '../assets/logo.png';

export default function Login() {
  const { login, signup } = useAuth();
  const { showNotification } = useNotification();
  const [mode, setMode] = useState('login'); // login, signup, forgot, reset, success
  const [email, setEmail] = useState('admin@tesco.com');
  const [password, setPassword] = useState('password123');
  const [name, setName] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [successType, setSuccessType] = useState('reset');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        const result = await login(email, password);
        if (result.ok) {
          showNotification('Welcome back!', 'success');
        } else {
          setError(result.message || 'Invalid email or password');
          showNotification('Login failed. Please check your credentials.', 'error');
        }
      } else if (mode === 'signup') {
        const result = await signup(name, email, password);
        if (result.ok) {
          showNotification('Account created successfully!', 'success');
        } else {
          setError(result.message || 'Failed to create account');
          showNotification(result.message || 'Signup failed. Please try again.', 'error');
        }
      } else if (mode === 'forgot') {
        const res  = await fetch('http://localhost:8001/api/auth/forgot-password', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (data.success) {
          setResetToken(data.resetToken);
          showNotification('Email verified! Set your new password.', 'success');
          setMode('reset');
        } else {
          setError(data.message || 'Email not found');
          showNotification(data.message || 'Email not found', 'error');
        }
      } else if (mode === 'reset') {
        const res  = await fetch('http://localhost:8001/api/auth/reset-password', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resetToken, password }),
        });
        const data = await res.json();
        if (data.success) {
          showNotification('Password set successfully! Logging you in...', 'success');
          // Auto-login with the token returned from reset
          if (data.token && data.user) {
            const userData = {
              name:   data.user.name  || email,
              email:  data.user.email || email,
              role:   data.user.role  || 'employee',
              avatar: (data.user.name || email).split(' ').map(n => n[0]).join('').toUpperCase(),
              token:  data.token,
            };
            localStorage.setItem('hrm_user', JSON.stringify(userData));
            window.location.reload();
          } else {
            setSuccessType('reset');
            setMode('success');
          }
        } else {
          setError(data.message || 'Reset failed');
          showNotification(data.message || 'Reset failed', 'error');
        }
      }
    } catch (err) {
      setError('An unexpected error occurred');
      showNotification('Something went wrong.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const renderContent = () => {
    if (mode === 'success') {
      return (
        <div className="auth-success-state">
          <div className="success-icon-wrap">
            <CheckCircle size={48} color="#4CAA17" />
          </div>
          <h2 className="login-title">Success!</h2>
          <p className="login-subtitle">
            {successType === 'forgot'
              ? "We've sent a password reset link to your email."
              : "Your password has been reset successfully. You can now sign in."}
          </p>
          <button 
            className="ne-btn-primary" 
            style={{ width: '100%', marginTop: '24px' }}
            onClick={() => setMode('login')}
          >
            Back to Sign In
          </button>
        </div>
      );
    }

    return (
      <>
        <div className="login-header">
          <img 
            src={logo} 
            alt="TESCO Structures" 
            style={{ width: '220px', height: 'auto', marginBottom: '24px', display: 'block', margin: '0 auto 24px' }} 
          />
          <h1 className="login-title">
            {mode === 'login' && 'Welcome Back'}
            {mode === 'signup' && 'Create Account'}
            {mode === 'forgot' && 'Forgot Password'}
            {mode === 'reset' && 'Reset Password'}
          </h1>
          <p className="login-subtitle">
            {mode === 'login' && 'Sign in to your HRM dashboard'}
            {mode === 'signup' && 'Join TESCO Structures workforce'}
            {mode === 'forgot' && "Enter your email to receive a reset link"}
            {mode === 'reset' && 'Set a new secure password'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {mode === 'signup' && (
            <div className="ne-field">
              <label className="ne-label">Full Name</label>
              <div className="ne-input-wrap">
                <User size={18} className="ne-input-icon" />
                <input 
                  type="text" className="ne-input has-icon" 
                  placeholder="John Doe" value={name} 
                  onChange={e => setName(e.target.value)} required 
                />
              </div>
            </div>
          )}

          <div className="ne-field">
            <label className="ne-label">Email Address</label>
            <div className="ne-input-wrap">
              <Mail size={18} className="ne-input-icon" />
              <input 
                type="email" className="ne-input has-icon" 
                placeholder="name@company.com" value={email} 
                onChange={e => setEmail(e.target.value)} required 
              />
            </div>
          </div>

          {(mode === 'login' || mode === 'signup' || mode === 'reset') && (
            <div className="ne-field">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="ne-label">{mode === 'reset' ? 'New Password' : 'Password'}</label>
                {mode === 'login' && (
                  <button type="button" className="text-btn-sm" onClick={() => setMode('forgot')}>Forgot?</button>
                )}
              </div>
              <div className="ne-input-wrap">
                <Lock size={18} className="ne-input-icon" />
                <input 
                  type={showPass ? 'text' : 'password'} className="ne-input has-icon" 
                  placeholder="••••••••" value={password} 
                  onChange={e => setPassword(e.target.value)} required 
                />
                <button 
                  type="button" className="pass-toggle-btn" 
                  onClick={() => setShowPass(!showPass)}
                >
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          )}

          {error && <div className="login-error">{error}</div>}

          <button 
            type="submit" 
            className={`ne-btn-primary ${loading ? 'loading' : ''}`} 
            style={{ width: '100%', justifyContent: 'center', height: 48, fontSize: 16, marginTop: '8px' }}
            disabled={loading}
          >
            {loading ? 'Processing...' : (
              <>
                {mode === 'login' && 'Sign In'}
                {mode === 'signup' && 'Create Account'}
                {mode === 'forgot' && 'Send Reset Link'}
                {mode === 'reset' && 'Update Password'}
              </>
            )}
          </button>
        </form>

        <div className="login-footer">
          {mode === 'login' ? (
            <>Don't have an account? <button className="text-btn" onClick={() => setMode('signup')}>Sign Up</button></>
          ) : (
            <button className="text-btn-with-icon" onClick={() => setMode('login')}>
              <ArrowLeft size={16} /> Back to Sign In
            </button>
          )}
        </div>
      </>
    );
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
