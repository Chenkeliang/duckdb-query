import React, { createContext, useContext, useState, useCallback } from 'react';

// Toast类型定义
export const TOAST_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info'
};

// 创建Toast Context
const SimpleToastContext = createContext();

// 简单的Toast组件
const SimpleToast = ({ toast, onClose, index }) => {
  const getToastStyles = (type) => {
    const baseStyles = {
      position: 'fixed',
      top: `${80 + index * 70}px`,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9999 + index,
      minWidth: '300px',
      maxWidth: '600px',
      padding: '12px 16px',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      fontSize: '0.95rem',
      fontWeight: 500,
      color: 'white',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    };

    const typeStyles = {
      success: { backgroundColor: '#4caf50' },
      error: { backgroundColor: '#f44336' },
      warning: { backgroundColor: '#ff9800' },
      info: { backgroundColor: '#2196f3' }
    };

    return { ...baseStyles, ...typeStyles[type] };
  };

  return (
    <div style={getToastStyles(toast.type)}>
      <span style={{ flex: 1, marginRight: '12px' }}>
        {toast.message}
      </span>
      <button
        onClick={onClose}
        style={{
          background: 'none',
          border: 'none',
          color: 'white',
          cursor: 'pointer',
          fontSize: '18px',
          padding: '0',
          width: '20px',
          height: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',
          opacity: 0.8,
        }}
        onMouseEnter={(e) => e.target.style.opacity = 1}
        onMouseLeave={(e) => e.target.style.opacity = 0.8}
      >
        ×
      </button>
    </div>
  );
};

// Toast Provider组件
export const SimpleToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  // 显示Toast的函数
  const showToast = useCallback((message, type = TOAST_TYPES.INFO, duration = 4000) => {
    console.log('SimpleToast showToast调用:', { message, type, duration });
    const id = Date.now() + Math.random();
    const newToast = {
      id,
      message,
      type,
      duration,
    };

    console.log('创建新SimpleToast:', newToast);
    setToasts(prev => {
      const newToasts = [...prev, newToast];
      console.log('更新SimpleToast列表:', newToasts);
      return newToasts;
    });

    // 自动隐藏
    if (duration > 0) {
      setTimeout(() => {
        hideToast(id);
      }, duration);
    }

    return id;
  }, []);

  // 隐藏Toast的函数
  const hideToast = useCallback((id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  // 清除所有Toast
  const clearAllToasts = useCallback(() => {
    setToasts([]);
  }, []);

  // 便捷方法
  const showSuccess = useCallback((message, duration) => {
    return showToast(message, TOAST_TYPES.SUCCESS, duration);
  }, [showToast]);

  const showError = useCallback((message, duration) => {
    return showToast(message, TOAST_TYPES.ERROR, duration);
  }, [showToast]);

  const showWarning = useCallback((message, duration) => {
    return showToast(message, TOAST_TYPES.WARNING, duration);
  }, [showToast]);

  const showInfo = useCallback((message, duration) => {
    return showToast(message, TOAST_TYPES.INFO, duration);
  }, [showToast]);

  const contextValue = {
    showToast,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    hideToast,
    clearAllToasts
  };

  return (
    <SimpleToastContext.Provider value={contextValue}>
      {children}
      
      {/* 渲染所有Toast */}
      {toasts.map((toast, index) => (
        <SimpleToast
          key={toast.id}
          toast={toast}
          index={index}
          onClose={() => hideToast(toast.id)}
        />
      ))}
    </SimpleToastContext.Provider>
  );
};

// 使用Toast的Hook
export const useSimpleToast = () => {
  const context = useContext(SimpleToastContext);
  if (!context) {
    throw new Error('useSimpleToast must be used within a SimpleToastProvider');
  }
  return context;
};

// 默认导出
export default SimpleToastContext;
