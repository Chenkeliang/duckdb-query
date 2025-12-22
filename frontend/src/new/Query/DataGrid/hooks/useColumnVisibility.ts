/**
 * 列可见性管理 Hook
 * 
 * 特性：
 * - 支持隐藏/显示单个列
 * - 支持显示所有列
 * - 支持重置为默认
 * - 仅会话级状态（不持久化到 localStorage）
 * 
 * 注意：不持久化的原因是查询工作台的 SQL 是动态的，
 * 不同查询返回不同的列结构，持久化会导致列名对不上的问题。
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';

/**
 * 列可见性状态
 * key: 列字段名
 * value: 是否可见（true 或 undefined 表示可见，false 表示隐藏）
 */
export interface ColumnVisibilityState {
  [field: string]: boolean;
}

export interface UseColumnVisibilityOptions {
  /** 所有列字段名 */
  columns: string[];
  /** 初始可见性状态 */
  initialVisibility?: ColumnVisibilityState;
  /** 可见性变化回调 */
  onChange?: (visibility: ColumnVisibilityState) => void;
}

export interface ColumnVisibilityInfo {
  /** 列字段名 */
  field: string;
  /** 是否可见 */
  visible: boolean;
}

export interface UseColumnVisibilityReturn {
  /** 可见性状态 */
  visibility: ColumnVisibilityState;
  /** 可见列列表 */
  visibleColumns: string[];
  /** 隐藏列列表 */
  hiddenColumns: string[];
  /** 可见列数量 */
  visibleCount: number;
  /** 隐藏列数量 */
  hiddenCount: number;
  /** 切换列可见性 */
  toggleColumn: (field: string) => void;
  /** 设置列可见性 */
  setColumnVisible: (field: string, visible: boolean) => void;
  /** 显示所有列 */
  showAllColumns: () => void;
  /** 隐藏所有列（保留至少一列） */
  hideAllColumns: () => void;
  /** 重置为默认（全部显示） */
  resetVisibility: () => void;
  /** 列可见性信息（用于 UI 渲染） */
  columnVisibilityInfo: ColumnVisibilityInfo[];
  /** 判断列是否可见 */
  isColumnVisible: (field: string) => boolean;
}

/**
 * 列可见性管理 Hook
 * 
 * @example
 * ```tsx
 * const {
 *   visibleColumns,
 *   toggleColumn,
 *   showAllColumns,
 *   columnVisibilityInfo,
 * } = useColumnVisibility({
 *   columns: ['id', 'name', 'email'],
 * });
 * 
 * // 在 UI 中渲染列可见性控制
 * columnVisibilityInfo.map(({ field, visible }) => (
 *   <Checkbox
 *     key={field}
 *     checked={visible}
 *     onChange={() => toggleColumn(field)}
 *   />
 * ));
 * ```
 */
export function useColumnVisibility({
  columns,
  initialVisibility,
  onChange,
}: UseColumnVisibilityOptions): UseColumnVisibilityReturn {
  // 仅会话级状态，不持久化到 localStorage
  const [visibility, setVisibility] = useState<ColumnVisibilityState>(
    initialVisibility || {}
  );

  // 使用 ref 存储 onChange 回调，避免依赖变化导致的无限循环
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // 当列变化时（新查询），重置可见性
  // 使用 columns 的 JSON 字符串作为依赖，避免数组引用变化导致的无限循环
  const columnsKey = useMemo(() => columns.join(','), [columns]);
  
  useEffect(() => {
    // 重置为全部可见
    setVisibility({});
  }, [columnsKey]);

  // 通知变化（使用 ref 避免 onChange 变化导致的无限循环）
  useEffect(() => {
    onChangeRef.current?.(visibility);
  }, [visibility]);

  // 可见列
  const visibleColumns = useMemo(() => {
    return columns.filter((col) => visibility[col] !== false);
  }, [columns, visibility]);

  // 隐藏列
  const hiddenColumns = useMemo(() => {
    return columns.filter((col) => visibility[col] === false);
  }, [columns, visibility]);

  // 切换可见性
  const toggleColumn = useCallback((field: string) => {
    setVisibility((prev) => ({
      ...prev,
      [field]: prev[field] === false,
    }));
  }, []);

  // 设置可见性
  const setColumnVisible = useCallback((field: string, visible: boolean) => {
    setVisibility((prev) => ({
      ...prev,
      [field]: visible,
    }));
  }, []);

  // 显示所有列
  const showAllColumns = useCallback(() => {
    setVisibility({});
  }, []);

  // 隐藏所有列（保留第一列）
  const hideAllColumns = useCallback(() => {
    const newVisibility: ColumnVisibilityState = {};
    columns.forEach((col, index) => {
      // 保留第一列可见
      if (index > 0) {
        newVisibility[col] = false;
      }
    });
    setVisibility(newVisibility);
  }, [columns]);

  // 重置为默认
  const resetVisibility = useCallback(() => {
    setVisibility(initialVisibility || {});
  }, [initialVisibility]);

  // 判断列是否可见
  const isColumnVisible = useCallback(
    (field: string) => visibility[field] !== false,
    [visibility]
  );

  // 列可见性信息（用于 UI）
  const columnVisibilityInfo = useMemo<ColumnVisibilityInfo[]>(() => {
    return columns.map((field) => ({
      field,
      visible: visibility[field] !== false,
    }));
  }, [columns, visibility]);

  return {
    visibility,
    visibleColumns,
    hiddenColumns,
    visibleCount: visibleColumns.length,
    hiddenCount: hiddenColumns.length,
    toggleColumn,
    setColumnVisible,
    showAllColumns,
    hideAllColumns,
    resetVisibility,
    columnVisibilityInfo,
    isColumnVisible,
  };
}
