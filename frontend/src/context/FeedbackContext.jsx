import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const FeedbackContext = createContext(null);

const TYPE_TO_CLASS = {
  success: 'success',
  error: 'danger',
  warning: 'warning',
  info: 'info',
};

export const FeedbackProvider = ({ children }) => {
  const [messages, setMessages] = useState([]);

  const removeMessage = useCallback((id) => {
    setMessages((prev) => prev.filter((message) => message.id !== id));
  }, []);

  const showMessage = useCallback(
    ({ type = 'info', text, duration = 5000 } = {}) => {
      if (!text) {
        return;
      }
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setMessages((prev) => [...prev, { id, type, text }]);

      if (duration) {
        window.setTimeout(() => {
          removeMessage(id);
        }, duration);
      }
    },
    [removeMessage],
  );

  const helpers = useMemo(
    () => ({
      showMessage,
      showSuccess: (text, duration) => showMessage({ type: 'success', text, duration }),
      showError: (text, duration) => showMessage({ type: 'error', text, duration }),
      showWarning: (text, duration) => showMessage({ type: 'warning', text, duration }),
      showInfo: (text, duration) => showMessage({ type: 'info', text, duration }),
      dismiss: removeMessage,
    }),
    [removeMessage, showMessage],
  );

  return (
    <FeedbackContext.Provider value={helpers}>
      {children}
      <div className="position-fixed top-0 end-0 p-3" style={{ zIndex: 1100, minWidth: '280px' }}>
        {messages.map((message) => (
          <div
            key={message.id}
            className={`alert alert-${TYPE_TO_CLASS[message.type] || 'info'} shadow d-flex align-items-start justify-content-between gap-3 mb-2`}
            role="alert"
          >
            <div className="flex-grow-1">{message.text}</div>
            <button
              type="button"
              className="btn-close"
              aria-label="Cerrar"
              onClick={() => removeMessage(message.id)}
            ></button>
          </div>
        ))}
      </div>
    </FeedbackContext.Provider>
  );
};

export const useFeedback = () => {
  const context = useContext(FeedbackContext);
  if (!context) {
    throw new Error('useFeedback debe utilizarse dentro de un FeedbackProvider');
  }
  return context;
};

export default FeedbackContext;
