/**
 * 格式切换组件
 * 
 * 功能：
 * - 下拉菜单显示所有解析方案
 * - 显示置信度
 * - 标记推荐方案
 * - 支持自定义分隔符
 */

import React, { useState } from 'react';
import { ChevronDown, Check, Sparkles, Settings } from 'lucide-react';
import type { ParseResult } from '../hooks/useSmartParse';

interface FormatSwitcherProps {
  results: ParseResult[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onCustomDelimiter?: (delimiter: string) => void;
  className?: string;
}

export const FormatSwitcher: React.FC<FormatSwitcherProps> = ({
  results,
  selectedIndex,
  onSelect,
  onCustomDelimiter,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customDelimiter, setCustomDelimiter] = useState('');

  const currentResult = results[selectedIndex];

  if (results.length === 0) {
    return null;
  }

  const handleSelect = (index: number) => {
    onSelect(index);
    setIsOpen(false);
  };

  const handleCustomSubmit = () => {
    if (customDelimiter && onCustomDelimiter) {
      onCustomDelimiter(customDelimiter);
      setShowCustomInput(false);
      setIsOpen(false);
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-success';
    if (confidence >= 50) return 'text-warning';
    return 'text-muted-foreground';
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 80) return '高';
    if (confidence >= 50) return '中';
    return '低';
  };

  return (
    <div className={`relative ${className}`}>
      {/* 触发按钮 */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-surface text-sm text-foreground hover:bg-surface-hover transition-colors duration-fast"
      >
        <span className="truncate max-w-[120px]">
          {currentResult?.strategy || '选择格式'}
        </span>
        {currentResult && (
          <span className={`text-xs ${getConfidenceColor(currentResult.confidence)}`}>
            {currentResult.confidence}%
          </span>
        )}
        <ChevronDown className={`w-4 h-4 transition-transform duration-fast ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* 下拉菜单 */}
      {isOpen && (
        <>
          {/* 背景遮罩 */}
          <div 
            className="fixed inset-0 z-dropdown" 
            onClick={() => setIsOpen(false)} 
          />
          
          {/* 菜单内容 */}
          <div className="absolute top-full left-0 mt-1 z-popover min-w-[240px] bg-surface-elevated border border-border rounded-lg shadow-lg overflow-hidden">
            {/* 解析方案列表 */}
            <div className="max-h-[240px] overflow-y-auto">
              {results.map((result, index) => (
                <button
                  key={`${result.strategy}-${index}`}
                  type="button"
                  onClick={() => handleSelect(index)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-sm text-left transition-colors duration-fast ${
                    index === selectedIndex 
                      ? 'bg-primary/10 text-primary' 
                      : 'text-foreground hover:bg-surface-hover'
                  }`}
                >
                  {/* 选中标记 */}
                  <div className="w-4 h-4 flex-shrink-0">
                    {index === selectedIndex && <Check className="w-4 h-4" />}
                  </div>
                  
                  {/* 策略名称 */}
                  <div className="flex-1 flex items-center gap-2">
                    <span>{result.strategy}</span>
                    {index === 0 && (
                      <span className="flex items-center gap-1 text-xs text-primary">
                        <Sparkles className="w-3 h-3" />
                        推荐
                      </span>
                    )}
                  </div>
                  
                  {/* 置信度 */}
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs ${getConfidenceColor(result.confidence)}`}>
                      {getConfidenceLabel(result.confidence)}
                    </span>
                    <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all ${
                          result.confidence >= 80 ? 'bg-success' :
                          result.confidence >= 50 ? 'bg-warning' : 'bg-muted-foreground'
                        }`}
                        style={{ width: `${result.confidence}%` }}
                      />
                    </div>
                  </div>
                  
                  {/* 列数 */}
                  <span className="text-xs text-muted-foreground">
                    {result.columns}列
                  </span>
                </button>
              ))}
            </div>

            {/* 分隔线 */}
            {onCustomDelimiter && (
              <>
                <div className="border-t border-border" />
                
                {/* 自定义分隔符 */}
                {showCustomInput ? (
                  <div className="p-3 space-y-2">
                    <div className="text-xs text-muted-foreground">输入自定义分隔符</div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customDelimiter}
                        onChange={(e) => setCustomDelimiter(e.target.value)}
                        placeholder="如: | 或 ;"
                        className="flex-1 h-8 px-2 text-sm rounded-md border border-border bg-input text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={handleCustomSubmit}
                        disabled={!customDelimiter}
                        className="px-3 h-8 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        应用
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowCustomInput(true)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground hover:bg-surface-hover transition-colors duration-fast"
                  >
                    <Settings className="w-4 h-4" />
                    <span>自定义分隔符...</span>
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default FormatSwitcher;
