/**
 * ContextMenu - 右键菜单组件
 * 
 * 使用原生 onContextMenu 事件而非 Radix ContextMenuTrigger
 * 以避免 React 19 + Radix composeRefs 无限循环问题
 */

import * as React from 'react';
import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Filter, FilterX } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/new/components/ui/dropdown-menu';
import type { CopyFormat } from '../types';

export interface DataGridContextMenuProps {
  /** 子元素 */
  children: React.ReactNode;
  /** 当前单元格值 */
  cellValue?: unknown;
  /** 当前列名 */
  columnName?: string;
  /** 复制回调 */
  onCopy?: (format: CopyFormat) => void;
  /** 复制列名回调 */
  onCopyColumnName?: () => void;
  /** 筛选此值回调 */
  onFilterThisValue?: () => void;
  /** 排除此值回调 */
  onExcludeThisValue?: () => void;
  /** 清除筛选回调 */
  onClearFilter?: () => void;
  /** 是否有活跃筛选 */
  hasActiveFilter?: boolean;
}

export const DataGridContextMenu: React.FC<DataGridContextMenuProps> = ({
  children,
  cellValue,
  columnName,
  onCopy,
  onCopyColumnName,
  onFilterThisValue,
  onExcludeThisValue,
  onClearFilter,
  hasActiveFilter = false,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setPosition({ x: e.clientX, y: e.clientY });
    setOpen(true);
  }, []);

  return (
    <>
      {/* 包装子元素，添加右键菜单事件 */}
      <div onContextMenu={handleContextMenu} className="contents">
        {children}
      </div>

      {/* 使用 DropdownMenu 作为右键菜单（通过隐藏触发器） */}
      <DropdownMenu open={open} onOpenChange={setOpen}>
        {/* 隐藏的触发器 - 定位在鼠标位置 */}
        <DropdownMenuTrigger
          style={{
            position: 'fixed',
            left: position.x,
            top: position.y,
            width: 0,
            height: 0,
            padding: 0,
            margin: 0,
            border: 'none',
            opacity: 0,
            pointerEvents: 'none',
          }}
        />
        <DropdownMenuContent className="w-48" align="start" sideOffset={0}>
          {/* 复制选项 */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Copy className="mr-2 h-4 w-4" />
              {t('dataGrid.copy')}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={() => onCopy?.('tsv')}>
                {t('dataGrid.copyAsTSV')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onCopy?.('csv')}>
                {t('dataGrid.copyAsCSV')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onCopy?.('json')}>
                {t('dataGrid.copyAsJSON')}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {columnName && (
            <DropdownMenuItem onClick={onCopyColumnName}>
              <Copy className="mr-2 h-4 w-4" />
              {t('dataGrid.copyColumnName')}
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          {/* 筛选选项 */}
          {cellValue !== undefined && (
            <>
              <DropdownMenuItem onClick={onFilterThisValue}>
                <Filter className="mr-2 h-4 w-4" />
                {t('dataGrid.filterThisValue')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onExcludeThisValue}>
                <FilterX className="mr-2 h-4 w-4" />
                {t('dataGrid.excludeThisValue')}
              </DropdownMenuItem>
            </>
          )}

          {hasActiveFilter && (
            <DropdownMenuItem onClick={onClearFilter}>
              <FilterX className="mr-2 h-4 w-4" />
              {t('dataGrid.clearFilter')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};

export { DataGridContextMenu as default };
