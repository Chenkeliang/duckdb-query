import React from 'react';
import { Button, Box } from '@mui/material';
import { useSimpleToast } from '../contexts/SimpleToastContext';

const ToastTest = () => {
  const { showSuccess, showError, showWarning, showInfo } = useSimpleToast();

  const handleTestSuccess = () => {
    console.log('测试成功Toast');
    showSuccess('这是一个成功消息测试');
  };

  const handleTestError = () => {
    console.log('测试错误Toast');
    showError('这是一个错误消息测试');
  };

  const handleTestWarning = () => {
    console.log('测试警告Toast');
    showWarning('这是一个警告消息测试');
  };

  const handleTestInfo = () => {
    console.log('测试信息Toast');
    showInfo('这是一个信息消息测试');
  };

  return (
    <Box sx={{ p: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
      <Button variant="contained" color="success" onClick={handleTestSuccess}>
        测试成功Toast
      </Button>
      <Button variant="contained" color="error" onClick={handleTestError}>
        测试错误Toast
      </Button>
      <Button variant="contained" color="warning" onClick={handleTestWarning}>
        测试警告Toast
      </Button>
      <Button variant="contained" color="info" onClick={handleTestInfo}>
        测试信息Toast
      </Button>
    </Box>
  );
};

export default ToastTest;
