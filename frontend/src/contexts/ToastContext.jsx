import React, { createContext, useContext, useState, useCallback } from 'react';
import { Alert } from '@mui/material';

// Toast类型定义
export const TOAST_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info'
};

// 创建Toast Context
const ToastContext = createContext();

// 自定义Toast组件
const CustomToast = ({ toast, onClose, index }) => {
  return (
    <div
      style={{
        position: 'fixed',
        top: `${80 + index * 70}px`,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999 + index,
        minWidth: '300px',
        maxWidth: '600px',
      }}
    >
      <Alert
        onClose={onClose}
        severity={toast.type}
        variant="filled"
        sx={{
          fontSize: '0.95rem',
          fontWeight: 500,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          '& .MuiAlert-message': {
            wordBreak: 'break-word'
          }
        }}
      >
        {toast.message}
      </Alert>
    </div>
  );
};

// Toast Provider组件
export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  // 显示Toast的函数
  const showToast = useCallback((message, type = TOAST_TYPES.INFO, duration = 4000) => {
    console.log('showToast调用:', { message, type, duration });
    const id = Date.now() + Math.random();
    const newToast = {
      id,
      message,
      type,
      duration,
      open: true
    };

    console.log('创建新Toast:', newToast);
    setToasts(prev => {
      const newToasts = [...prev, newToast];
      console.log('更新Toast列表:', newToasts);
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
    <ToastContext.Provider value={contextValue}>
      {children}

      {/* 渲染所有Toast */}
      {toasts.map((toast, index) => (
        <CustomToast
          key={toast.id}
          toast={toast}
          index={index}
          onClose={() => hideToast(toast.id)}
        />
      ))}
    </ToastContext.Provider>
  );
};

// 使用Toast的Hook
export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

// 默认导出
export default ToastContext;
