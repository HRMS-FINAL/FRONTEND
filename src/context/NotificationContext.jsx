import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, AlertCircle, XCircle, Info, X } from 'lucide-react';

const NotificationContext = createContext(null);

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);

  const showNotification = useCallback((message, type = 'success', duration = 4000) => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, message, type }]);

    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, duration);
  }, []);

  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  return (
    <NotificationContext.Provider value={{ showNotification }}>
      {children}
      <div className="notification-container">
        {notifications.map(n => (
          <div key={n.id} className={`notification-toast ${n.type}`}>
            <div className="notif-icon">
              {n.type === 'success' && <CheckCircle size={18} />}
              {n.type === 'error' && <XCircle size={18} />}
              {n.type === 'warning' && <AlertCircle size={18} />}
              {n.type === 'info' && <Info size={18} />}
            </div>
            <div className="notif-message">{n.message}</div>
            <button className="notif-close" onClick={() => removeNotification(n.id)}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
};

export const useNotification = () => useContext(NotificationContext);
