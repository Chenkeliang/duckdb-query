import { sql } from '@codemirror/lang-sql';
import { EditorState } from '@codemirror/state';
import { Box, Typography } from '@mui/material';
import { minimalSetup } from 'codemirror';
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  lineNumbers
} from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import React, { useEffect, useMemo, useRef, useState } from 'react';

const detectDarkMode = () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

/**
 * SQLPreview - 只读SQL预览组件，使用CodeMirror显示格式化的SQL
 */
const SQLPreview = ({
  sql: sqlContent = '',
  title = '生成的SQL查询',
  height = 150
}) => {
  const editorRef = useRef(null);
  const viewRef = useRef(null);
  const [isDarkMode, setIsDarkMode] = useState(detectDarkMode);

  const resolvedHeight = useMemo(
    () => (typeof height === 'number' ? `${height}px` : `${height}`),
    [height]
  );

  const previewAppearance = useMemo(
    () =>
      EditorView.theme(
        {
          '&': {
            fontFamily: '"Monaco", "Menlo", "Ubuntu Mono", monospace',
            fontSize: '13px'
          },
          '.cm-content': {
            padding: '12px'
          },
          '.cm-scroller': {
            fontFamily: '"Monaco", "Menlo", "Ubuntu Mono", monospace',
            minHeight: resolvedHeight
          },
          '.cm-gutters': {
            padding: '0 8px'
          }
        },
        { dark: isDarkMode }
      ),
    [isDarkMode, resolvedHeight]
  );

  // 复制SQL到剪贴板
  const handleCopySQL = async () => {
    if (sqlContent) {
      try {
        await navigator.clipboard.writeText(sqlContent);
        // 可以添加成功提示
      } catch (err) {
      }
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const sync = () => setIsDarkMode(detectDarkMode());
    const handleThemeChange = (event) => {
      if (event?.detail && typeof event.detail.isDark === 'boolean') {
        setIsDarkMode(event.detail.isDark);
      } else {
        sync();
      }
    };

    window.addEventListener('duckquery-theme-change', handleThemeChange);
    let observer;
    if (typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(sync);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    }
    sync();

    return () => {
      window.removeEventListener('duckquery-theme-change', handleThemeChange);
      if (observer) {
        observer.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    if (!editorRef.current) return;

    if (viewRef.current) {
      viewRef.current.destroy();
    }

    const baseExtensions = [
      minimalSetup,
      lineNumbers(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      sql(),
      EditorView.lineWrapping,
      EditorState.readOnly.of(true),
      previewAppearance
    ];

    const themeExtensions = isDarkMode ? [oneDark] : [];

    const state = EditorState.create({
      doc: sqlContent || '-- 配置分析条件后将显示生成的SQL',
      extensions: [...baseExtensions, ...themeExtensions]
    });

    viewRef.current = new EditorView({
      state,
      parent: editorRef.current
    });

    return () => {
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, [sqlContent, isDarkMode, previewAppearance]);

  return (
    <Box sx={{ width: '100%' }}>
      {/* 标题和复制按钮 - 统一蓝色风格 */}
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        mb: 1.5,
        px: 0.5
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 8, height: 8, bgcolor: isDarkMode ? 'var(--dq-accent-100)' : 'var(--dq-accent-primary)', borderRadius: '50%' }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: isDarkMode ? 'var(--dq-text-primary)' : 'var(--dq-text-primary)' }}>
            {title}
          </Typography>
        </Box>
        {sqlContent && (
          <Typography
            variant="caption"
            onClick={handleCopySQL}
            sx={{
              color: isDarkMode ? 'var(--dq-accent-100)' : 'var(--dq-accent-primary)',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              '&:hover': {
                color: isDarkMode ? 'var(--dq-accent-200)' : 'var(--dq-accent-primary)'
              }
            }}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: 14, height: 14 }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
            </svg>
            复制
          </Typography>
        )}
      </Box>

      {/* CodeMirror编辑器容器 - 柔和圆润风格 */}
      <Box
        ref={editorRef}
        sx={{
          width: '100%',
          borderRadius: '12px',
          overflow: 'hidden',
          border: isDarkMode ? '1px solid var(--dq-border-card)' : '1px solid var(--dq-border-subtle)',
          boxShadow: isDarkMode ? 'var(--dq-accent-shadow)' : 'var(--dq-shadow-soft)'
        }}
      />
    </Box>
  );
};

export default SQLPreview;
