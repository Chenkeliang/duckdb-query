/**
 * 数据粘贴卡片组件
 * 
 * 功能：
 * - 粘贴/输入数据
 * - 智能格式检测
 * - 格式切换
 * - 数据预览
 * - 自定义分隔符
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Clipboard, RefreshCw, Trash2, FileSpreadsheet } from 'lucide-react';
import { useSmartParse, type ParseConfig } from './hooks';
import { FormatSwitcher, SmartPreview } from './components';

interface DataPasteCardProps {
  onDataParsed?: (data: string[][], hasHeader: boolean) => void;
  className?: string;
}

export const DataPasteCard: React.FC<DataPasteCardProps> = ({
  onDataParsed,
  className = '',
}) => {
  const [inputText, setInputText] = useState('');
  const [hasHeader, setHasHeader] = useState(true);
  
  const {
    results,
    selectedIndex,
    currentResult,
    parse,
    selectResult,
    isLoading,
    error,
  } = useSmartParse();

  // 解析输入文本
  const handleParse = useCallback(() => {
    if (inputText.trim()) {
      parse(inputText);
    }
  }, [inputText, parse]);

  // 输入变化时自动解析（防抖）
  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputText.trim()) {
        parse(inputText);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [inputText, parse]);

  // 选择格式变化时通知父组件
  useEffect(() => {
    if (currentResult && onDataParsed) {
      const effectiveHasHeader = currentResult.hasHeader || hasHeader;
      onDataParsed(currentResult.rows, effectiveHasHeader);
    }
  }, [currentResult, hasHeader, onDataParsed]);

  // 处理自定义分隔符
  const handleCustomDelimiter = useCallback((delimiter: string) => {
    const config: Partial<ParseConfig> = {
      format: 'custom',
      delimiter,
    };
    parse(inputText, config);
  }, [inputText, parse]);

  // 从剪贴板粘贴
  const handlePasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInputText(text);
      }
    } catch (err) {
      console.error('无法读取剪贴板:', err);
    }
  }, []);

  // 清空
  const handleClear = useCallback(() => {
    setInputText('');
  }, []);

  return (
    <div className={`bg-surface border border-border rounded-xl p-6 space-y-4 shadow-sm ${className}`}>
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">粘贴数据</h3>
        </div>
        
        {/* 操作按钮 */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePasteFromClipboard}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-border bg-surface text-foreground hover:bg-surface-hover transition-colors duration-fast"
          >
            <Clipboard className="w-4 h-4" />
            粘贴
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={!inputText}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-border bg-surface text-foreground hover:bg-surface-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-fast"
          >
            <Trash2 className="w-4 h-4" />
            清空
          </button>
        </div>
      </div>

      {/* 输入区域 */}
      <div className="space-y-2">
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="在此粘贴数据，支持 CSV、TSV、JSON、键值对等格式..."
          className="w-full h-32 px-3 py-2 text-sm font-mono rounded-md border border-border bg-input text-foreground placeholder:text-muted-foreground resize-y focus:outline-none focus:ring-2 focus:ring-primary"
        />
        
        {/* 错误提示 */}
        {error && (
          <div className="flex items-center gap-2 px-3 py-2 text-sm text-error bg-error-bg border border-error-border rounded-md">
            {error}
          </div>
        )}
      </div>

      {/* 解析结果区域 */}
      {currentResult && (
        <div className="space-y-4 pt-4 border-t border-border">
          {/* 格式选择和选项 */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              {/* 格式切换 */}
              <FormatSwitcher
                results={results}
                selectedIndex={selectedIndex}
                onSelect={selectResult}
                onCustomDelimiter={handleCustomDelimiter}
              />
              
              {/* 重新解析按钮 */}
              <button
                type="button"
                onClick={handleParse}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors duration-fast"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                重新解析
              </button>
            </div>

            {/* 表头选项 */}
            {!currentResult.hasHeader && (
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasHeader}
                  onChange={(e) => setHasHeader(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary focus:ring-offset-background"
                />
                首行作为表头
              </label>
            )}
          </div>

          {/* 数据预览 */}
          <SmartPreview
            data={currentResult.rows}
            hasHeader={currentResult.hasHeader || hasHeader}
            maxHeight="300px"
            defaultRows={10}
          />
        </div>
      )}

      {/* 加载状态 */}
      {isLoading && !currentResult && (
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="w-6 h-6 text-primary animate-spin" />
          <span className="ml-2 text-muted-foreground">解析中...</span>
        </div>
      )}
    </div>
  );
};

export default DataPasteCard;
