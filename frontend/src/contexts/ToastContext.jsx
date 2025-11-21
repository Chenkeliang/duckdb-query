import { Alert, Slide, Snackbar } from '@mui/material';
import React, { createContext, useCallback, useContext, useState } from 'react';

// Toast类型定义
export const TOAST_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info'
};

// 创建Toast Context
const ToastContext = createContext();

// Slide过渡组件
function SlideTransition(props) {
  return <Slide {...props} direction="down" />;
}

// Toast Provider组件
export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  // 显示Toast的函数
  const showToast = useCallback((message, type = 'info', duration = 4000) => {

    // 检查DOM状态
    const rootElement = document.getElementById('root');

    // 检查是否有其他Modal打开
    const modals = document.querySelectorAll('[role="dialog"], .MuiModal-root, .MuiDialog-root');

    const id = Date.now() + Math.random();
    const newToast = {
      id,
      message,
      type,
      duration,
      open: true
    };

    setToasts(prev => {
      const newToasts = [...prev, newToast];
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
    return showToast(message, 'success', duration);
  }, [showToast]);

  const showError = useCallback((message, duration) => {
    return showToast(message, 'error', duration);
  }, [showToast]);

  const showWarning = useCallback((message, duration) => {
    return showToast(message, 'warning', duration);
  }, [showToast]);

  const showInfo = useCallback((message, duration) => {
    return showToast(message, 'info', duration);
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
      {toasts.map((toast, index) => {
        return (
          <Snackbar
            key={toast.id}
            open={toast.open}
            onClose={() => hideToast(toast.id)}
            TransitionComponent={SlideTransition}
            autoHideDuration={toast.duration || 4000}
            anchorOrigin={{
              vertical: 'top',
              horizontal: 'center'
            }}
            style={{
              top: `${80 + index * 70}px`,
              zIndex: 9999 + index,
              position: 'fixed'
            }}
            // 添加调试属性
            data-toast-id={toast.id}
            data-toast-index={index}
          >
            <Alert
              onClose={() => hideToast(toast.id)}
              severity={toast.type}
              variant="filled"
              sx={{
                minWidth: '300px',
                maxWidth: '600px',
                fontSize: '0.95rem',
                fontWeight: 500,
                boxShadow: 'var(--dq-shadow-soft)',
                '& .MuiAlert-message': {
                  wordBreak: 'break-word'
                }
              }}
            >
              {toast.message}
            </Alert>
          </Snackbar>
        );
      })}
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
