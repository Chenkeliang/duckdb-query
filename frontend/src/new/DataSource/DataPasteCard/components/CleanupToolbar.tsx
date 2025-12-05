/**
 * 数据清理工具栏组件
 * 
 * 功能：
 * - 清理按钮组（引号、空格、空值、数字）
 * - 全部清理按钮
 * - 撤销按钮
 * - 统计显示
 */

import React, { useMemo } from 'react';
import { 
  Quote, 
  Space, 
  CircleSlash, 
  Hash, 
  Sparkles, 
  Undo2, 
  CheckCircle,
  Info
} from 'lucide-react';
import type { CleanupAction, CleanupStats, CleanupResult } from '../hooks/useCleanup';

interface CleanupToolbarProps {
  stats: CleanupStats;
  canUndo: boolean;
  detectCleanable: () => {
    hasQuotes: boolean;
    hasSpaces: boolean;
    hasNulls: boolean;
    hasFormattedNumbers: boolean;
  };
  onCleanup: (action: CleanupAction) => CleanupResult;
  onUndo: () => boolean;
  onResult?: (result: CleanupResult) => void;
  className?: string;
}

interface CleanupButtonProps {
  icon: React.ReactNode;
  label: string;
  action: CleanupAction;
  disabled: boolean;
  count?: number;
  onClick: () => void;
}

const CleanupButton: React.FC<CleanupButtonProps> = ({
  icon,
  label,
  disabled,
  count,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border transition-colors duration-fast ${
      disabled
        ? 'border-border bg-muted text-muted-foreground cursor-not-allowed opacity-60'
        : 'border-border bg-surface text-foreground hover:bg-surface-hover hover:border-primary/50'
    }`}
    title={disabled ? '没有需要清理的内容' : `点击${label}`}
  >
    {icon}
    <span>{label}</span>
    {count !== undefined && count > 0 && (
      <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-primary/10 text-primary">
        {count}
      </span>
    )}
  </button>
);

export const CleanupToolbar: React.FC<CleanupToolbarProps> = ({
  stats,
  canUndo,
  detectCleanable,
  onCleanup,
  onUndo,
  onResult,
  className = '',
}) => {
  // 检测可清理内容
  const cleanable = useMemo(() => detectCleanable(), [detectCleanable]);

  const hasAnyCleanable = cleanable.hasQuotes || 
                          cleanable.hasSpaces || 
                          cleanable.hasNulls || 
                          cleanable.hasFormattedNumbers;

  const handleCleanup = (action: CleanupAction) => {
    const result = onCleanup(action);
    onResult?.(result);
  };

  const handleUndo = () => {
    onUndo();
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {/* 工具栏 */}
      <div className="flex items-center flex-wrap gap-2">
        {/* 单项清理按钮 */}
        <CleanupButton
          icon={<Quote className="w-3.5 h-3.5" />}
          label="去引号"
          action="quotes"
          disabled={!cleanable.hasQuotes}
          count={stats.quotes}
          onClick={() => handleCleanup('quotes')}
        />
        
        <CleanupButton
          icon={<Space className="w-3.5 h-3.5" />}
          label="去空格"
          action="spaces"
          disabled={!cleanable.hasSpaces}
          count={stats.spaces}
          onClick={() => handleCleanup('spaces')}
        />
        
        <CleanupButton
          icon={<CircleSlash className="w-3.5 h-3.5" />}
          label="清空值"
          action="nulls"
          disabled={!cleanable.hasNulls}
          count={stats.nulls}
          onClick={() => handleCleanup('nulls')}
        />
        
        <CleanupButton
          icon={<Hash className="w-3.5 h-3.5" />}
          label="格式化数字"
          action="numbers"
          disabled={!cleanable.hasFormattedNumbers}
          count={stats.numbers}
          onClick={() => handleCleanup('numbers')}
        />

        {/* 分隔线 */}
        <div className="w-px h-6 bg-border mx-1" />

        {/* 全部清理 */}
        <button
          type="button"
          onClick={() => handleCleanup('all')}
          disabled={!hasAnyCleanable}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors duration-fast ${
            hasAnyCleanable
              ? 'bg-primary text-primary-foreground hover:opacity-90'
              : 'bg-muted text-muted-foreground cursor-not-allowed opacity-60'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          全部清理
        </button>

        {/* 撤销 */}
        <button
          type="button"
          onClick={handleUndo}
          disabled={!canUndo}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border transition-colors duration-fast ${
            canUndo
              ? 'border-border bg-surface text-foreground hover:bg-surface-hover'
              : 'border-border bg-muted text-muted-foreground cursor-not-allowed opacity-60'
          }`}
        >
          <Undo2 className="w-3.5 h-3.5" />
          撤销
        </button>
      </div>

      {/* 统计信息 */}
      {stats.total > 0 ? (
        <div className="flex items-center gap-2 px-3 py-2 text-xs rounded-md bg-success-bg border border-success-border">
          <CheckCircle className="w-4 h-4 text-success flex-shrink-0" />
          <span className="text-foreground">
            已清理 <span className="font-medium text-success">{stats.total}</span> 个单元格
            {stats.quotes > 0 && <span className="text-muted-foreground ml-1">(引号: {stats.quotes})</span>}
            {stats.spaces > 0 && <span className="text-muted-foreground ml-1">(空格: {stats.spaces})</span>}
            {stats.nulls > 0 && <span className="text-muted-foreground ml-1">(空值: {stats.nulls})</span>}
            {stats.numbers > 0 && <span className="text-muted-foreground ml-1">(数字: {stats.numbers})</span>}
          </span>
        </div>
      ) : !hasAnyCleanable ? (
        <div className="flex items-center gap-2 px-3 py-2 text-xs rounded-md bg-info-bg border border-info-border">
          <Info className="w-4 h-4 text-info flex-shrink-0" />
          <span className="text-foreground">数据已经很干净，无需清理</span>
        </div>
      ) : null}
    </div>
  );
};

export default CleanupToolbar;
