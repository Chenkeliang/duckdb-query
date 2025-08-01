import React, { createContext, useContext, useState, useCallback } from 'react';
import { Snackbar, Alert, Slide } from '@mui/material';

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
  const showToast = useCallback((message, type = TOAST_TYPES.INFO, duration = 4000) => {
    console.log('🔔 showToast调用:', { message, type, duration });

    // 检查DOM状态
    const rootElement = document.getElementById('root');
    if (rootElement) {
      console.log('📋 Root元素状态:', {
        ariaHidden: rootElement.getAttribute('aria-hidden'),
        style: rootElement.style.cssText,
        className: rootElement.className
      });
    }

    // 检查是否有其他Modal打开
    const modals = document.querySelectorAll('[role="dialog"], .MuiModal-root, .MuiDialog-root');
    console.log('🔍 发现的Modal/Dialog元素:', modals.length, modals);

    const id = Date.now() + Math.random();
    const newToast = {
      id,
      message,
      type,
      duration,
      open: true
    };

    console.log('✨ 创建新Toast:', newToast);
    setToasts(prev => {
      const newToasts = [...prev, newToast];
      console.log('📝 更新Toast列表:', newToasts);
      return newToasts;
    });

    // 自动隐藏
    if (duration > 0) {
      setTimeout(() => {
        console.log('⏰ 自动隐藏Toast:', id);
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
      {toasts.map((toast, index) => {
        console.log('🎨 渲染Toast:', toast, '索引:', index);
        return (
          <Snackbar
            key={toast.id}
            open={toast.open}
            onClose={() => hideToast(toast.id)}
            TransitionComponent={SlideTransition}
            anchorOrigin={{
              vertical: 'top',
              horizontal: 'center'
            }}
            sx={{
              // 多个Toast时的垂直偏移
              top: `${80 + index * 70}px !important`,
              zIndex: `${9999 + index} !important`,
              position: 'fixed !important'
            }}
            // 强制显示，忽略aria-hidden
            disablePortal={false}
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
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
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
