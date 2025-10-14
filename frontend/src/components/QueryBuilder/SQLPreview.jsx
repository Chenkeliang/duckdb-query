import { sql } from '@codemirror/lang-sql';
import { EditorState } from '@codemirror/state';
import { Box, Typography } from '@mui/material';
import { EditorView, basicSetup } from 'codemirror';
import React, { useEffect, useRef } from 'react';

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
    if (!editorRef.current) return;

    // 清理之前的编辑器
    if (viewRef.current) {
      viewRef.current.destroy();
    }

    // 创建只读的CodeMirror编辑器
    const state = EditorState.create({
      doc: sqlContent || '-- 配置分析条件后将显示生成的SQL',
      extensions: [
        basicSetup,
        sql(),
        EditorView.theme({
          '&': {
            fontSize: '13px',
            fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace'
          },
          '.cm-content': {
            padding: '12px',
            minHeight: `${height}px`
          },
          '.cm-focused': {
            outline: 'none'
          },
          '.cm-editor': {
            borderRadius: '6px',
            border: '1px solid #e2e8f0'
          },
          '.cm-scroller': {
            fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace'
          }
        }),
        EditorView.lineWrapping,
        EditorState.readOnly.of(true) // 设置为只读
      ]
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
  }, [sqlContent, height]);

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
          <Box sx={{ width: 8, height: 8, bgcolor: '#3b82f6', borderRadius: '50%' }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary' }}>
            {title}
          </Typography>
        </Box>
        {sqlContent && (
          <Typography
            variant="caption"
            onClick={handleCopySQL}
            sx={{
              color: '#3b82f6',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              '&:hover': {
                color: '#2563eb'
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
          '& .cm-editor': {
            backgroundColor: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 4
          },
          '& .cm-content': {
            color: '#e2e8f0'
          },
          '& .cm-gutters': {
            backgroundColor: '#0f172a',
            borderRight: '1px solid #334155'
          }
        }}
      />
    </Box>
  );
};

export default SQLPreview;