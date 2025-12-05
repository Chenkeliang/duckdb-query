/**
 * 行列重组面板组件
 * 
 * 功能：
 * - 显示当前单元格数量
 * - 快捷选项（因数分解）
 * - 自定义行列输入
 * - 填充方向选择
 * - 实时预览
 */

import React, { useCallback } from 'react';
import { Grid3X3, ArrowRight, ArrowDown, Check, AlertTriangle, Info } from 'lucide-react';
import type { ReshapeConfig, ReshapeValidation, ReshapeCombination, FillDirection } from '../hooks/useReshape';

interface ReshapePanelProps {
  totalCells: number;
  config: ReshapeConfig;
  combinations: ReshapeCombination[];
  validation: ReshapeValidation;
  preview: string[][];
  onConfigChange: (config: Partial<ReshapeConfig>) => void;
  onApply: () => void;
  onCancel?: () => void;
  className?: string;
}

export const ReshapePanel: React.FC<ReshapePanelProps> = ({
  totalCells,
  config,
  combinations,
  validation,
  preview,
  onConfigChange,
  onApply,
  onCancel,
  className = '',
}) => {
  const handleRowsChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const rows = parseInt(e.target.value, 10);
    if (!isNaN(rows) && rows > 0) {
      onConfigChange({ rows });
    }
  }, [onConfigChange]);

  const handleColsChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const cols = parseInt(e.target.value, 10);
    if (!isNaN(cols) && cols > 0) {
      onConfigChange({ cols });
    }
  }, [onConfigChange]);

  const handleDirectionChange = useCallback((direction: FillDirection) => {
    onConfigChange({ direction });
  }, [onConfigChange]);

  const handleCombinationSelect = useCallback((combo: ReshapeCombination) => {
    onConfigChange({ rows: combo.rows, cols: combo.cols });
  }, [onConfigChange]);

  const getValidationIcon = () => {
    switch (validation.type) {
      case 'success':
        return <Check className="w-4 h-4 text-success" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-warning" />;
      case 'error':
        return <AlertTriangle className="w-4 h-4 text-error" />;
      default:
        return <Info className="w-4 h-4 text-info" />;
    }
  };

  const getValidationClass = () => {
    switch (validation.type) {
      case 'success':
        return 'bg-success-bg border-success-border text-success';
      case 'warning':
        return 'bg-warning-bg border-warning-border text-warning';
      case 'error':
        return 'bg-error-bg border-error-border text-error';
      default:
        return 'bg-info-bg border-info-border text-info';
    }
  };

  return (
    <div className={`bg-surface border border-border rounded-xl p-4 space-y-4 ${className}`}>
      {/* 标题 */}
      <div className="flex items-center gap-2">
        <Grid3X3 className="w-5 h-5 text-primary" />
        <h4 className="text-sm font-semibold text-foreground">行列重组</h4>
        <span className="text-xs text-muted-foreground">
          共 {totalCells} 个单元格
        </span>
      </div>

      {/* 快捷选项 */}
      {combinations.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">快捷选项</div>
          <div className="flex flex-wrap gap-2">
            {combinations.slice(0, 8).map((combo) => (
              <button
                key={`${combo.rows}x${combo.cols}`}
                type="button"
                onClick={() => handleCombinationSelect(combo)}
                className={`px-2 py-1 text-xs rounded-md border transition-colors duration-fast ${
                  config.rows === combo.rows && config.cols === combo.cols
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-surface border-border text-foreground hover:bg-surface-hover'
                }`}
              >
                {combo.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 自定义输入 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">行数</label>
          <input
            type="number"
            min="1"
            value={config.rows}
            onChange={handleRowsChange}
            className="w-full h-9 px-3 text-sm rounded-md border border-border bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">列数</label>
          <input
            type="number"
            min="1"
            value={config.cols}
            onChange={handleColsChange}
            className="w-full h-9 px-3 text-sm rounded-md border border-border bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {/* 填充方向 */}
      <div className="space-y-2">
        <div className="text-xs text-muted-foreground">填充方向</div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleDirectionChange('row')}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-md border transition-colors duration-fast ${
              config.direction === 'row'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-surface border-border text-foreground hover:bg-surface-hover'
            }`}
          >
            <ArrowRight className="w-4 h-4" />
            按行填充
          </button>
          <button
            type="button"
            onClick={() => handleDirectionChange('col')}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-md border transition-colors duration-fast ${
              config.direction === 'col'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-surface border-border text-foreground hover:bg-surface-hover'
            }`}
          >
            <ArrowDown className="w-4 h-4" />
            按列填充
          </button>
        </div>
      </div>

      {/* 验证信息 */}
      <div className={`flex items-center gap-2 px-3 py-2 text-xs rounded-md border ${getValidationClass()}`}>
        {getValidationIcon()}
        <span>{validation.message}</span>
      </div>

      {/* 预览 */}
      {preview.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">预览（前 5 行）</div>
          <div className="border border-border rounded-lg overflow-hidden max-h-[150px] overflow-y-auto">
            <table className="w-full text-xs">
              <tbody>
                {preview.slice(0, 5).map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-surface' : 'bg-muted/30'}>
                    {row.map((cell, j) => (
                      <td 
                        key={j} 
                        className="px-2 py-1 border-b border-r border-border-subtle truncate max-w-[80px]"
                        title={cell}
                      >
                        {cell || <span className="text-muted-foreground">空</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.length > 5 && (
            <div className="text-xs text-muted-foreground text-center">
              还有 {preview.length - 5} 行...
            </div>
          )}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-md border border-border bg-surface text-foreground hover:bg-surface-hover transition-colors duration-fast"
          >
            取消
          </button>
        )}
        <button
          type="button"
          onClick={onApply}
          disabled={!validation.valid}
          className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-fast"
        >
          应用重组
        </button>
      </div>
    </div>
  );
};

export default ReshapePanel;
