/**
 * 智能预览组件
 * 
 * 功能：
 * - 小数据量（≤20行）: 直接显示，可折叠
 * - 中等数据量（21-100行）: 固定高度 + 滚动
 * - 大数据量（>100行）: 固定高度 + 滚动 + 提示
 */

import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, Table2, AlertCircle } from 'lucide-react';

interface SmartPreviewProps {
  data: string[][];
  hasHeader?: boolean;
  maxHeight?: string;
  defaultRows?: number;
  className?: string;
}

export const SmartPreview: React.FC<SmartPreviewProps> = ({
  data,
  hasHeader = false,
  maxHeight = '300px',
  defaultRows = 10,
  className = '',
}) => {
  const [expanded, setExpanded] = useState(false);

  const totalRows = data.length;
  const dataRows = hasHeader ? totalRows - 1 : totalRows;
  
  // 根据数据量决定显示模式
  const displayMode = useMemo(() => {
    if (dataRows <= 20) return 'collapsible';
    return 'scroll';
  }, [dataRows]);

  // 计算显示的数据
  const displayData = useMemo(() => {
    if (displayMode === 'collapsible' && !expanded) {
      const limit = hasHeader ? defaultRows + 1 : defaultRows;
      return data.slice(0, limit);
    }
    return data;
  }, [data, displayMode, expanded, hasHeader, defaultRows]);

  const headerRow = hasHeader ? data[0] : null;
  const bodyData = hasHeader ? displayData.slice(1) : displayData;
  const actualBodyData = hasHeader ? data.slice(1) : data;
  const hiddenRows = actualBodyData.length - bodyData.length;

  if (data.length === 0) {
    return (
      <div className={`flex items-center justify-center py-8 text-muted-foreground ${className}`}>
        <AlertCircle className="w-5 h-5 mr-2" />
        <span>暂无数据</span>
      </div>
    );
  }

  const columns = data[0]?.length || 0;

  return (
    <div className={`space-y-2 ${className}`}>
      {/* 统计信息 */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Table2 className="w-4 h-4" />
          <span>
            {dataRows} 行 × {columns} 列
            {hasHeader && <span className="text-primary ml-1">(含表头)</span>}
          </span>
        </div>
        {displayMode === 'scroll' && (
          <span className="text-warning">数据较多，已启用滚动</span>
        )}
      </div>

      {/* 表格容器 */}
      <div 
        className={`border border-border rounded-lg overflow-hidden ${
          displayMode === 'scroll' ? 'overflow-y-auto' : ''
        }`}
        style={displayMode === 'scroll' ? { maxHeight } : undefined}
      >
        <table className="w-full text-sm">
          {/* 表头 */}
          {headerRow && (
            <thead className="sticky top-0 z-sticky">
              <tr className="bg-muted">
                {headerRow.map((cell, i) => (
                  <th 
                    key={i}
                    className="px-3 py-2 text-left font-medium text-foreground border-b border-border whitespace-nowrap"
                  >
                    {cell || <span className="text-muted-foreground italic">空</span>}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          
          {/* 数据行 */}
          <tbody>
            {bodyData.map((row, rowIndex) => (
              <tr 
                key={rowIndex}
                className={`${
                  rowIndex % 2 === 0 ? 'bg-surface' : 'bg-muted/30'
                } hover:bg-surface-hover transition-colors duration-fast`}
              >
                {row.map((cell, cellIndex) => (
                  <td 
                    key={cellIndex}
                    className="px-3 py-1.5 text-foreground border-b border-border-subtle whitespace-nowrap max-w-[200px] truncate"
                    title={cell}
                  >
                    {cell || <span className="text-muted-foreground italic">空</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 折叠/展开按钮（仅 collapsible 模式） */}
      {displayMode === 'collapsible' && hiddenRows > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-surface-hover rounded-md transition-colors duration-fast"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-4 h-4" />
              收起 (隐藏 {hiddenRows} 行)
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" />
              展开查看全部 {actualBodyData.length} 行
            </>
          )}
        </button>
      )}

      {/* 大数据量提示 */}
      {displayMode === 'scroll' && dataRows > 100 && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-warning bg-warning-bg border border-warning-border rounded-md">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>
            数据量较大 ({dataRows} 行)，建议在导入后使用 SQL 查询进行筛选
          </span>
        </div>
      )}
    </div>
  );
};

export default SmartPreview;
