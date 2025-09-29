import React, { useEffect, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { sql } from '@codemirror/lang-sql';
import { EditorState } from '@codemirror/state';
import { Box, Typography, IconButton, Tooltip } from '@mui/material';
import { ContentCopy as CopyIcon } from '@mui/icons-material';

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
      {/* 标题和复制按钮 */}
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        mb: 1
      }}>
        <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>
          {title}
        </Typography>
        {sqlContent && (
          <Tooltip title="复制SQL">
            <IconButton
              size="small"
              onClick={handleCopySQL}
              sx={{ 
                color: 'text.secondary',
                '&:hover': { 
                  color: 'primary.main',
                  backgroundColor: 'action.hover'
                }
              }}
            >
              <CopyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* CodeMirror编辑器容器 */}
      <Box
        ref={editorRef}
        sx={{
          '& .cm-editor': {
            backgroundColor: '#fafafa',
            border: '1px solid #e2e8f0',
            borderRadius: 1
          },
          '& .cm-content': {
            color: '#374151'
          },
          '& .cm-gutters': {
            backgroundColor: '#f3f4f6',
            borderRight: '1px solid #e5e7eb'
          }
        }}
      />
    </Box>
  );
};

export default SQLPreview;