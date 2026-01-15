/**
 * useVirtualScroll - 虚拟滚动 Hook
 * 
 * 支持行列双向虚拟化
 */

import { useRef, useCallback, useEffect } from 'react';
import { useVirtualizer, type Virtualizer, type VirtualItem } from '@tanstack/react-virtual';
import { DATAGRID_CONFIG } from '../types';

/** 使用配置中的列虚拟化阈值 */
const { columnThreshold: COLUMN_VIRTUALIZATION_THRESHOLD } = DATAGRID_CONFIG.virtualization;

export interface UseVirtualScrollOptions {
  /** 总行数 */
  rowCount: number;
  /** 总列数 */
  columnCount: number;
  /** 行高 */
  rowHeight: number;
  /** 列宽（可以是固定值、函数或数组） */
  columnWidth?: number | ((index: number) => number);
  /** 列宽数组 */
  columnWidths?: number[];
  /** 容器高度（可选） */
  containerHeight?: number;
  /** 容器宽度（可选） */
  containerWidth?: number;
  /** 行预渲染数 */
  rowOverscan?: number;
  /** 列预渲染数 */
  columnOverscan?: number;
  /** 是否启用列虚拟化（默认列数 > 50 时启用） */
  enableColumnVirtualization?: boolean;
  /** 滚动容器 ref（可选，如果不提供则内部创建） */
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
}

export interface UseVirtualScrollReturn {
  /** 行虚拟化实例 */
  rowVirtualizer: Virtualizer<HTMLDivElement, Element>;
  /** 列虚拟化实例（可选） */
  columnVirtualizer: Virtualizer<HTMLDivElement, Element> | null;
  /** 可见行 */
  virtualRows: VirtualItem[];
  /** 可见列 */
  virtualColumns: VirtualItem[];
  /** 总高度 */
  totalHeight: number;
  /** 总宽度 */
  totalWidth: number;
  /** 滚动到指定行 */
  scrollToRow: (index: number) => void;
  /** 滚动到指定列 */
  scrollToColumn: (index: number) => void;
  /** 滚动容器 ref */
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  /** 列头容器 ref（用于同步滚动） */
  headerContainerRef: React.RefObject<HTMLDivElement | null>;
  /** 同步列头滚动 */
  syncHeaderScroll: (scrollLeft: number) => void;
}

export function useVirtualScroll({
  rowCount,
  columnCount,
  rowHeight,
  columnWidth,
  columnWidths,
  rowOverscan = 5,
  columnOverscan = 3,
  enableColumnVirtualization,
  scrollContainerRef: externalScrollContainerRef,
}: UseVirtualScrollOptions): UseVirtualScrollReturn {
  const internalScrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = externalScrollContainerRef || internalScrollContainerRef;
  const headerContainerRef = useRef<HTMLDivElement>(null);
  const columnMeasureRafRef = useRef<number | null>(null);

  // 获取列宽的函数
  const getColumnWidth = useCallback((index: number): number => {
    if (columnWidths) {
      return columnWidths[index] || DATAGRID_CONFIG.defaultColumnWidth;
    }
    if (typeof columnWidth === 'function') {
      return columnWidth(index);
    }
    return columnWidth || DATAGRID_CONFIG.defaultColumnWidth;
  }, [columnWidth, columnWidths]);

  // 是否启用列虚拟化
  const shouldVirtualizeColumns =
    enableColumnVirtualization ?? columnCount > COLUMN_VIRTUALIZATION_THRESHOLD;

  // 行虚拟化
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => rowHeight,
    overscan: rowOverscan,
    // 使用 initialRect 避免初始渲染时的 flushSync
    initialRect: { width: 0, height: 400 },
  });

  // 列虚拟化（可选）
  const columnVirtualizer = shouldVirtualizeColumns
    ? useVirtualizer({
      horizontal: true,
      count: columnCount,
      getScrollElement: () => scrollContainerRef.current,
      estimateSize: getColumnWidth,
      overscan: columnOverscan,
      // 使用 initialRect 避免初始渲染时的 flushSync
      initialRect: { width: 800, height: 0 },
    })
    : null;

  // 列宽变化时需要触发 columnVirtualizer 重新测量，否则 start/size 仍使用旧 cache，
  // 会导致表头与单元格位置不一致（看起来像“串列/重叠”）。
  useEffect(() => {
    if (!columnVirtualizer) return;

    const raf = globalThis.requestAnimationFrame;
    const caf = globalThis.cancelAnimationFrame;

    if (typeof raf !== 'function') {
      columnVirtualizer.measure();
      return;
    }

    if (columnMeasureRafRef.current !== null) {
      if (typeof caf === 'function') {
        caf(columnMeasureRafRef.current);
      }
    }

    columnMeasureRafRef.current = raf(() => {
      columnVirtualizer.measure();
      columnMeasureRafRef.current = null;
    });

    return () => {
      if (columnMeasureRafRef.current !== null) {
        if (typeof caf === 'function') {
          caf(columnMeasureRafRef.current);
        }
        columnMeasureRafRef.current = null;
      }
    };
  }, [columnVirtualizer, columnWidths]);

  // 可见行
  const virtualRows = rowVirtualizer.getVirtualItems();

  // 可见列（如果不启用列虚拟化，返回所有列）
  const virtualColumns = columnVirtualizer
    ? columnVirtualizer.getVirtualItems()
    : Array.from({ length: columnCount }, (_, i) => {
      const start = Array.from({ length: i }, (_, j) => getColumnWidth(j)).reduce((a, b) => a + b, 0);
      const size = getColumnWidth(i);
      return {
        index: i,
        start,
        size,
        end: start + size,
        key: i,
        lane: 0,
      };
    });

  // 总高度
  const totalHeight = rowVirtualizer.getTotalSize();

  // 总宽度
  const totalWidth = columnVirtualizer
    ? columnVirtualizer.getTotalSize()
    : Array.from({ length: columnCount }, (_, i) => getColumnWidth(i)).reduce((a, b) => a + b, 0);

  // 滚动到指定行
  const scrollToRow = useCallback((index: number) => {
    rowVirtualizer.scrollToIndex(index, { align: 'start' });
  }, [rowVirtualizer]);

  // 滚动到指定列
  const scrollToColumn = useCallback((index: number) => {
    if (columnVirtualizer) {
      columnVirtualizer.scrollToIndex(index, { align: 'start' });
    }
  }, [columnVirtualizer]);

  // 同步列头滚动
  const syncHeaderScroll = useCallback((scrollLeft: number) => {
    if (headerContainerRef.current) {
      headerContainerRef.current.scrollLeft = scrollLeft;
    }
  }, []);

  return {
    rowVirtualizer,
    columnVirtualizer,
    virtualRows,
    virtualColumns,
    totalHeight,
    totalWidth,
    scrollToRow,
    scrollToColumn,
    scrollContainerRef,
    headerContainerRef,
    syncHeaderScroll,
  };
}
