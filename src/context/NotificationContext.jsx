import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, AlertCircle, XCircle, Info, X } from 'lucide-react';

const NotificationContext = createContext(null);

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);
  const [dialog, setDialog] = useState(null);   // { kind, title, message, resolve, ... }

  const showNotification = useCallback((message, type = 'success', duration = 4000) => {
    const id = Date.now() + Math.random();
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, duration);
  }, []);

  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  // Promise-based confirm modal — drop-in for window.confirm().
  // Usage: const ok = await confirmDialog({ message: 'Delete X?' });
  const confirmDialog = useCallback((opts) => {
    const config = typeof opts === 'string' ? { message: opts } : (opts || {});
    return new Promise((resolve) => {
      setDialog({
        kind:        'confirm',
        title:       config.title       || 'Are you sure?',
        message:     config.message     || '',
        confirmText: config.confirmText || 'Confirm',
        cancelText:  config.cancelText  || 'Cancel',
        tone:        config.tone        || 'danger', // danger | primary
        resolve,
      });
    });
  }, []);

  // Promise-based alert modal — drop-in for window.alert(). Resolves when the
  // user dismisses it. Use this when the message is long enough that the
  // floating toast feels inadequate.
  const alertDialog = useCallback((opts) => {
    const config = typeof opts === 'string' ? { message: opts } : (opts || {});
    return new Promise((resolve) => {
      setDialog({
        kind:    'alert',
        title:   config.title || 'Notice',
        message: config.message || '',
        tone:    config.tone || 'info', // info | success | warning | error
        resolve,
      });
    });
  }, []);

  const closeDialog = (result) => {
    if (dialog?.resolve) dialog.resolve(result);
    setDialog(null);
  };

  return (
    <NotificationContext.Provider value={{ showNotification, confirmDialog, alertDialog }}>
      {children}

      {/* Toast container */}
      <div className="notification-container">
        {notifications.map(n => (
          <div key={n.id} className={`notification-toast ${n.type}`}>
            <div className="notif-icon">
              {n.type === 'success' && <CheckCircle size={18} />}
              {n.type === 'error'   && <XCircle     size={18} />}
              {n.type === 'warning' && <AlertCircle size={18} />}
              {n.type === 'info'    && <Info        size={18} />}
            </div>
            <div className="notif-message">{n.message}</div>
            <button className="notif-close" onClick={() => removeNotification(n.id)}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Confirm / Alert modal */}
      {dialog && (
        <div
          onClick={() => dialog.kind === 'alert' && closeDialog(true)}
          style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'tNotifFade 0.15s ease-out',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 14,
              boxShadow: '0 24px 60px rgba(0,0,0,0.18)',
              maxWidth: 440,
              width: 'calc(100% - 40px)',
              padding: 0,
              overflow: 'hidden',
              animation: 'tNotifPop 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <div style={{
              padding: '22px 26px 8px',
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background:
                  dialog.tone === 'danger'  ? '#FEF2F2'
                : dialog.tone === 'success' ? '#F1F9EE'
                : dialog.tone === 'warning' ? '#FFFBEB'
                : dialog.tone === 'error'   ? '#FEF2F2'
                                            : '#EBF4FD',
                color:
                  dialog.tone === 'danger'  ? '#dc2626'
                : dialog.tone === 'success' ? '#16a34a'
                : dialog.tone === 'warning' ? '#d97706'
                : dialog.tone === 'error'   ? '#dc2626'
                                            : '#2563eb',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {dialog.tone === 'success' ? <CheckCircle size={20} />
                  : dialog.tone === 'warning' ? <AlertCircle size={20} />
                  : dialog.tone === 'error' || dialog.tone === 'danger' ? <XCircle size={20} />
                  : <Info size={20} />}
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{
                  margin: 0,
                  fontSize: 16, fontWeight: 700,
                  color: '#1e293b',
                }}>{dialog.title}</h3>
              </div>
              <button
                onClick={() => closeDialog(false)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#94a3b8', padding: 4,
                }}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div style={{
              padding: '4px 26px 22px',
              fontSize: 14, color: '#475569', lineHeight: 1.55,
              whiteSpace: 'pre-line',
            }}>
              {dialog.message}
            </div>

            <div style={{
              padding: '14px 22px',
              borderTop: '1px solid #e2e8f0',
              background: '#f8fafc',
              display: 'flex', justifyContent: 'flex-end', gap: 10,
            }}>
              {dialog.kind === 'confirm' && (
                <button
                  onClick={() => closeDialog(false)}
                  style={{
                    padding: '8px 18px', borderRadius: 8,
                    background: '#fff', color: '#475569',
                    border: '1px solid #cbd5e1', cursor: 'pointer',
                    fontWeight: 600, fontSize: 13,
                  }}
                >{dialog.cancelText}</button>
              )}
              <button
                onClick={() => closeDialog(true)}
                style={{
                  padding: '8px 18px', borderRadius: 8,
                  background:
                    dialog.tone === 'danger' ? '#dc2626'
                  : dialog.tone === 'warning' ? '#d97706'
                  : '#4CAA17',
                  color: '#fff', border: 'none', cursor: 'pointer',
                  fontWeight: 700, fontSize: 13,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                }}
              >{dialog.kind === 'confirm' ? dialog.confirmText : 'OK'}</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes tNotifFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes tNotifPop  { from { opacity: 0; transform: translateY(-10px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>
    </NotificationContext.Provider>
  );
};

export const useNotification = () => useContext(NotificationContext);
