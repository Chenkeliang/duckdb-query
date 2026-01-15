/**
 * GridBody - 表格主体组件（虚拟滚动）
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { GridRow } from './GridRow';
import { GridCell } from './GridCell';
import { SelectionOverlay } from './SelectionOverlay';
import type { VirtualItem } from '@tanstack/react-virtual';
import type { SelectionRange } from '../types';

export interface GridBodyProps {
  /** 行数据 */
  data: Record<string, unknown>[];
  /** 列字段名列表 */
  columns: string[];
  /** 列宽数组 */
  columnWidths: number[];
  /** 行高 */
  rowHeight: number;
  /** 虚拟行 */
  virtualRows: VirtualItem[];
  /** 虚拟列（可选） */
  virtualColumns?: VirtualItem[];
  /** 总高度 */
  totalHeight: number;
  /** 总宽度 */
  totalWidth: number;
  /** 选区范围 */
  selectionRange: SelectionRange | null;
  /** 焦点位置 */
  focusPosition?: { rowIndex: number; colIndex: number } | null;
  /** 判断单元格是否选中 */
  isCellSelected: (rowIndex: number, colIndex: number) => boolean;
  /** 单元格鼠标按下回调（用于拖拽选区） */
  onCellMouseDown?: (rowIndex: number, colIndex: number, e: React.MouseEvent) => void;
  /** 单元格鼠标进入回调 */
  onCellMouseEnter?: (rowIndex: number, colIndex: number) => void;
  /** 滚动容器 ref */
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  /** 滚动回调 */
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
  /** 自定义类名 */
  className?: string;
}

export const GridBody: React.FC<GridBodyProps> = ({
  data,
  columns,
  columnWidths,
  rowHeight,
  virtualRows,
  virtualColumns,
  totalHeight,
  totalWidth,
  selectionRange,
  focusPosition,
  isCellSelected,
  onCellMouseDown,
  onCellMouseEnter,
  scrollContainerRef,
  onScroll,
  className,
}) => {
  const offsets = React.useMemo(() => {
    const out: number[] = new Array(columnWidths.length);
    let acc = 0;
    for (let i = 0; i < columnWidths.length; i++) {
      out[i] = acc;
      acc += columnWidths[i] || 0;
    }
    return out;
  }, [columnWidths]);

  // 使用虚拟列或全部列（都带上绝对定位 left）
  const visibleColumns = React.useMemo(() => {
    if (virtualColumns && virtualColumns.length > 0) {
      return virtualColumns.map((vc) => ({
        index: vc.index,
        field: columns[vc.index],
        width: columnWidths[vc.index],
        left: vc.start,
      }));
    }

    return columns.map((field, index) => ({
      index,
      field,
      width: columnWidths[index],
      left: offsets[index] || 0,
    }));
  }, [virtualColumns, columns, columnWidths, offsets]);

  return (
    <div
      ref={scrollContainerRef}
      role="grid"
      className={cn('relative overflow-auto', className)}
      onScroll={onScroll}
    >
      {/* 虚拟滚动容器 */}
      <div
        style={{
          height: totalHeight,
          width: totalWidth,
          position: 'relative',
        }}
      >
        {/* 渲染虚拟行 */}
        {virtualRows.map((virtualRow) => {
          const rowData = data[virtualRow.index];
          if (!rowData) return null;

          return (
            <GridRow
              key={virtualRow.index}
              rowIndex={virtualRow.index}
              height={rowHeight}
              top={virtualRow.start}
            >
              {visibleColumns.map((col) => {
                const value = rowData[col.field];
                const isSelected = isCellSelected(virtualRow.index, col.index);
                const isFocused =
                  focusPosition?.rowIndex === virtualRow.index &&
                  focusPosition?.colIndex === col.index;

                return (
                  <GridCell
                    key={col.field}
                    value={value}
                    rowIndex={virtualRow.index}
                    colIndex={col.index}
                    isSelected={isSelected}
                    isFocused={isFocused}
                    width={col.width}
                    left={col.left}
                    height={rowHeight}
                    onMouseDown={onCellMouseDown}
                    onMouseEnter={onCellMouseEnter}
                  />
                );
              })}
            </GridRow>
          );
        })}

        {/* 选区覆盖层 */}
        <SelectionOverlay
          range={selectionRange}
          rowHeight={rowHeight}
          columnWidths={columnWidths}
        />
      </div>
    </div>
  );
};

export { GridBody as default };
