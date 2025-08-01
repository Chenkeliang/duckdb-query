import React, { useState, useEffect } from 'react';
import { Button, Box, Typography, Paper, Alert } from '@mui/material';
import { useToast } from '../contexts/ToastContext';

const ToastDiagnostic = () => {
  const { showSuccess, showError, showWarning, showInfo } = useToast();
  const [diagnosticInfo, setDiagnosticInfo] = useState({});

  const runDiagnostic = () => {
    console.log('🔍 开始Toast诊断...');
    
    const info = {
      timestamp: new Date().toISOString(),
      rootElement: null,
      modals: [],
      snackbars: [],
      zIndexIssues: [],
      ariaHiddenElements: [],
      cssIssues: []
    };

    // 检查root元素
    const rootElement = document.getElementById('root');
    if (rootElement) {
      info.rootElement = {
        ariaHidden: rootElement.getAttribute('aria-hidden'),
        style: rootElement.style.cssText,
        className: rootElement.className,
        computedStyle: {
          overflow: window.getComputedStyle(rootElement).overflow,
          position: window.getComputedStyle(rootElement).position,
          zIndex: window.getComputedStyle(rootElement).zIndex
        }
      };
    }

    // 检查Modal和Dialog
    const modals = document.querySelectorAll('[role="dialog"], .MuiModal-root, .MuiDialog-root, .MuiDrawer-root');
    info.modals = Array.from(modals).map(modal => ({
      tagName: modal.tagName,
      className: modal.className,
      ariaHidden: modal.getAttribute('aria-hidden'),
      style: modal.style.cssText,
      zIndex: window.getComputedStyle(modal).zIndex
    }));

    // 检查现有的Snackbar
    const snackbars = document.querySelectorAll('.MuiSnackbar-root');
    info.snackbars = Array.from(snackbars).map(snackbar => ({
      className: snackbar.className,
      style: snackbar.style.cssText,
      zIndex: window.getComputedStyle(snackbar).zIndex,
      position: window.getComputedStyle(snackbar).position,
      top: window.getComputedStyle(snackbar).top,
      left: window.getComputedStyle(snackbar).left,
      visibility: window.getComputedStyle(snackbar).visibility,
      display: window.getComputedStyle(snackbar).display
    }));

    // 检查所有aria-hidden元素
    const ariaHiddenElements = document.querySelectorAll('[aria-hidden="true"]');
    info.ariaHiddenElements = Array.from(ariaHiddenElements).map(el => ({
      tagName: el.tagName,
      id: el.id,
      className: el.className,
      ariaHidden: el.getAttribute('aria-hidden')
    }));

    // 检查可能的z-index问题
    const highZIndexElements = Array.from(document.querySelectorAll('*')).filter(el => {
      const zIndex = parseInt(window.getComputedStyle(el).zIndex);
      return zIndex > 9000;
    });
    info.zIndexIssues = highZIndexElements.map(el => ({
      tagName: el.tagName,
      className: el.className,
      zIndex: window.getComputedStyle(el).zIndex
    }));

    setDiagnosticInfo(info);
    console.log('📊 诊断结果:', info);
  };

  const testToast = (type) => {
    console.log(`🧪 测试${type}Toast`);
    const message = `这是一个${type}Toast测试 - ${new Date().toLocaleTimeString()}`;
    
    switch(type) {
      case '成功':
        showSuccess(message);
        break;
      case '错误':
        showError(message);
        break;
      case '警告':
        showWarning(message);
        break;
      case '信息':
        showInfo(message);
        break;
    }
  };

  const fixAriaHidden = () => {
    const rootElement = document.getElementById('root');
    if (rootElement && rootElement.getAttribute('aria-hidden') === 'true') {
      rootElement.removeAttribute('aria-hidden');
      console.log('✅ 已移除root元素的aria-hidden属性');
      runDiagnostic();
    }
  };

  useEffect(() => {
    runDiagnostic();
  }, []);

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" gutterBottom>
        🔍 Toast诊断工具
      </Typography>
      
      <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Button variant="contained" onClick={runDiagnostic}>
          重新诊断
        </Button>
        <Button variant="contained" color="success" onClick={() => testToast('成功')}>
          测试成功Toast
        </Button>
        <Button variant="contained" color="error" onClick={() => testToast('错误')}>
          测试错误Toast
        </Button>
        <Button variant="contained" color="warning" onClick={() => testToast('警告')}>
          测试警告Toast
        </Button>
        <Button variant="contained" color="info" onClick={() => testToast('信息')}>
          测试信息Toast
        </Button>
        <Button variant="outlined" color="secondary" onClick={fixAriaHidden}>
          修复aria-hidden
        </Button>
      </Box>

      {diagnosticInfo.rootElement && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="h6" gutterBottom>
            📋 Root元素状态
          </Typography>
          {diagnosticInfo.rootElement.ariaHidden === 'true' && (
            <Alert severity="error" sx={{ mb: 2 }}>
              ⚠️ Root元素被设置了aria-hidden="true"，这会阻止Toast显示！
            </Alert>
          )}
          <pre style={{ fontSize: '12px', overflow: 'auto' }}>
            {JSON.stringify(diagnosticInfo.rootElement, null, 2)}
          </pre>
        </Paper>
      )}

      {diagnosticInfo.modals && diagnosticInfo.modals.length > 0 && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="h6" gutterBottom>
            🔍 发现的Modal/Dialog ({diagnosticInfo.modals.length}个)
          </Typography>
          <Alert severity="warning" sx={{ mb: 2 }}>
            这些Modal/Dialog可能会影响Toast显示
          </Alert>
          <pre style={{ fontSize: '12px', overflow: 'auto' }}>
            {JSON.stringify(diagnosticInfo.modals, null, 2)}
          </pre>
        </Paper>
      )}

      {diagnosticInfo.snackbars && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="h6" gutterBottom>
            🎨 Snackbar状态 ({diagnosticInfo.snackbars.length}个)
          </Typography>
          {diagnosticInfo.snackbars.length === 0 ? (
            <Alert severity="info">
              没有发现Snackbar元素，可能Toast没有被创建
            </Alert>
          ) : (
            <pre style={{ fontSize: '12px', overflow: 'auto' }}>
              {JSON.stringify(diagnosticInfo.snackbars, null, 2)}
            </pre>
          )}
        </Paper>
      )}

      {diagnosticInfo.ariaHiddenElements && diagnosticInfo.ariaHiddenElements.length > 0 && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="h6" gutterBottom>
            🚫 aria-hidden元素 ({diagnosticInfo.ariaHiddenElements.length}个)
          </Typography>
          <pre style={{ fontSize: '12px', overflow: 'auto' }}>
            {JSON.stringify(diagnosticInfo.ariaHiddenElements, null, 2)}
          </pre>
        </Paper>
      )}

      {diagnosticInfo.zIndexIssues && diagnosticInfo.zIndexIssues.length > 0 && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="h6" gutterBottom>
            📏 高z-index元素 ({diagnosticInfo.zIndexIssues.length}个)
          </Typography>
          <Alert severity="info" sx={{ mb: 2 }}>
            这些元素可能会覆盖Toast
          </Alert>
          <pre style={{ fontSize: '12px', overflow: 'auto' }}>
            {JSON.stringify(diagnosticInfo.zIndexIssues, null, 2)}
          </pre>
        </Paper>
      )}

      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          💡 解决建议
        </Typography>
        <ul>
          <li>如果Root元素有aria-hidden="true"，点击"修复aria-hidden"按钮</li>
          <li>如果有多个Modal打开，尝试关闭它们</li>
          <li>检查浏览器控制台是否有JavaScript错误</li>
          <li>确认Toast的z-index足够高（应该>9999）</li>
          <li>检查是否有CSS规则隐藏了Snackbar</li>
        </ul>
      </Paper>
    </Box>
  );
};

export default ToastDiagnostic;
