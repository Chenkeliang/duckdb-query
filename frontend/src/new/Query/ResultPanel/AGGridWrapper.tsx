/**
 * AG-Grid 封装组件
 * 提供统一的配置和主题支持
 * 
 * @deprecated 此组件将被 DataGridWrapper 替代
 * 新的 DataGrid 基于 TanStack Table，提供更好的性能和更小的包体积
 * 
 * 迁移指南：
 * - 使用 DataGridWrapper 替代 AGGridWrapper
 * - 新组件支持相同的 props 接口
 * - 可通过 ResultToolbar 中的切换按钮测试新组件
 * 
 * TODO: 在 DataGrid 完全稳定后移除此组件
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
  ModuleRegistry,
  AllCommunityModule,
  type ColDef,
  type GridOptions,
  type GridApi,
  type GridReadyEvent,
  type FirstDataRenderedEvent,
} from 'ag-grid-community';

import { useGridCopy } from './hooks';
import { CustomHeaderComponent } from './CustomHeaderComponent';

// 注册 AG Grid 模块
ModuleRegistry.registerModules([AllCommunityModule]);

// AG-Grid 样式 (legacy CSS 主题)
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

export interface AGGridWrapperProps {
  /** 行数据 */
  rowData: any[] | null;
  /** 列定义 */
  columnDefs: ColDef[];
  /** Grid 准备就绪回调 */
  onGridReady?: (params: { api: GridApi }) => void;
  /** 首次数据渲染完成回调 */
  onFirstDataRendered?: () => void;
  /** 是否显示加载状态 */
  loading?: boolean;
  /** 自定义类名 */
  className?: string;
  /** 空状态提示文本 */
  noRowsOverlayText?: string;
  /** 加载状态提示文本 */
  loadingOverlayText?: string;
  /** 是否启用行选择 */
  enableRowSelection?: boolean;
  /** 
   * @deprecated Community 版本不支持范围选择，此属性已废弃
   * 需要 Enterprise 模块才能使用
   */
  enableRangeSelection?: boolean;
  /** 默认列定义 */
  defaultColDef?: ColDef;
  /** 额外的 Grid 配置 */
  gridOptions?: Partial<GridOptions>;
}

type ValueFilterMode = 'include' | 'exclude';

export interface ColumnValueFilter {
  values: string[];
  mode: ValueFilterMode;
}

export interface ColumnValueFilterContext {
  getColumnValueFilter: (colId: string) => ColumnValueFilter | null;
  setColumnValueFilter: (colId: string, filter: ColumnValueFilter) => void;
  clearColumnValueFilter: (colId: string) => void;
}

/**
 * AG-Grid 封装组件
 * 
 * 特性：
 * - 自动适配深色/浅色主题
 * - 统一的默认配置
 * - 自动列宽调整
 * - 虚拟滚动（内置）
 */
export const AGGridWrapper: React.FC<AGGridWrapperProps> = ({
  rowData,
  columnDefs,
  onGridReady,
  onFirstDataRendered,
  loading = false,
  className = '',
  noRowsOverlayText = '暂无数据',
  loadingOverlayText = '加载中...',
  enableRowSelection = true,
  // enableRangeSelection 已废弃，Community 版本不支持
  defaultColDef: customDefaultColDef,
  gridOptions: customGridOptions,
}) => {
  const gridRef = useRef<AgGridReact>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [gridApi, setGridApi] = useState<GridApi | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const columnValueFiltersRef = useRef<Record<string, ColumnValueFilter>>({});
  
  // 复制功能
  const { copyToClipboard, setFocusedColumn } = useGridCopy(gridApi);

  const getColumnValueFilter = useCallback((colId: string) => {
    return columnValueFiltersRef.current[colId] ?? null;
  }, []);

  const setColumnValueFilter = useCallback(
    (colId: string, filter: ColumnValueFilter) => {
      columnValueFiltersRef.current = {
        ...columnValueFiltersRef.current,
        [colId]: filter,
      };
      gridApi?.onFilterChanged();
    },
    [gridApi]
  );

  const clearColumnValueFilter = useCallback(
    (colId: string) => {
      const next = { ...columnValueFiltersRef.current };
      delete next[colId];
      columnValueFiltersRef.current = next;
      gridApi?.onFilterChanged();
    },
    [gridApi]
  );

  const filterContext = useMemo<ColumnValueFilterContext>(
    () => ({
      getColumnValueFilter,
      setColumnValueFilter,
      clearColumnValueFilter,
    }),
    [getColumnValueFilter, setColumnValueFilter, clearColumnValueFilter]
  );

  // 检测深色模式
  useEffect(() => {
    const checkDarkMode = () => {
      const isDark = document.documentElement.classList.contains('dark');
      setIsDarkMode(isDark);
    };

    // 初始检测
    checkDarkMode();

    // 监听主题变化
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          checkDarkMode();
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  // 默认列定义 - 使用 useMemo 稳定引用，避免每次 render 创建新对象导致 AG Grid 触发 modelUpdated
  const defaultColDef: ColDef = useMemo(() => ({
    sortable: true,
    filter: true,  // Community 版本支持基础过滤器
    resizable: true,
    flex: 1,
    minWidth: 100,
    // v33+ 排序配置移到 defaultColDef
    sortingOrder: ['asc', 'desc', null],
    // 注意：menuTabs 和 lockPinned 需要 Enterprise 模块，已移除
    ...customDefaultColDef,
  }), [customDefaultColDef]);

  // Grid 配置 - 使用 useMemo 稳定引用，避免无限更新循环
  const gridOptions: GridOptions = useMemo(() => {
    const mergedContext = {
      ...(customGridOptions?.context || {}),
      columnValueFilters: filterContext,
    };

    return {
    // 使用 legacy CSS 主题模式，禁用 v34 Theming API
    // 这样 ag-theme-alpine / ag-theme-alpine-dark 类才能正常生效
    theme: 'legacy',
    
    // 允许传入额外配置（但关键交互由本组件保证）
    ...customGridOptions,

    // 行选择（v32+ 新 API）
    rowSelection: enableRowSelection ? {
      mode: 'multiRow',
      // 点击单元格时不触发行选择（避免影响单元格选择/复制）
      enableClickSelection: false,
      // 禁用默认复制行为，使用自定义复制逻辑
      copySelectedRows: false,
    } : undefined,

    // 文本选择（Community 版本支持）
    // 注意：cellSelection 和 enableRangeSelection 是 Enterprise 功能，已移除
    enableCellTextSelection: true,
    
    // 动画
    animateRows: true,
    
    // 多列排序
    multiSortKey: 'ctrl',
    
    // 虚拟滚动（默认启用）
    rowBuffer: 10,
    
    // 空状态和加载状态
    overlayNoRowsTemplate: `<span class="ag-overlay-no-rows-center">${noRowsOverlayText}</span>`,
    overlayLoadingTemplate: `<span class="ag-overlay-loading-center">${loadingOverlayText}</span>`,
    
    // 性能优化
    suppressColumnVirtualisation: false,
    suppressRowVirtualisation: false,

    // 自定义列值筛选（Excel 风格菜单）
    context: mergedContext,
    isExternalFilterPresent: () => Object.keys(columnValueFiltersRef.current).length > 0,
    doesExternalFilterPass: (node) => {
      const data = node.data as Record<string, unknown> | undefined;
      if (!data) return true;

      const filters = columnValueFiltersRef.current;
      for (const [colId, filter] of Object.entries(filters)) {
        const rawValue = data[colId];
        const value = rawValue === null || rawValue === undefined ? '(空)' : String(rawValue);
        const selected = filter.values.includes(value);

        if (filter.mode === 'include') {
          if (!selected) return false;
        } else {
          if (selected) return false;
        }
      }

      return true;
    },
    };
  }, [
    enableRowSelection,
    noRowsOverlayText,
    loadingOverlayText,
    customGridOptions,
    filterContext,
  ]);

  // Grid 准备就绪
  const handleGridReady = useCallback((params: GridReadyEvent) => {
    setGridApi(params.api);
    
    // 监听单元格聚焦事件，记录当前聚焦的列（用于单列复制）
    params.api.addEventListener('cellFocused', (event: any) => {
      if (event.column) {
        setFocusedColumn(event.column.getColId());
      }
    });
    
    // 通知父组件
    onGridReady?.({ api: params.api });
  }, [onGridReady, setFocusedColumn]);

  // 首次数据渲染完成
  const handleFirstDataRendered = useCallback((params: FirstDataRenderedEvent) => {
    // 自动调整列宽
    params.api.sizeColumnsToFit();
    
    // 通知父组件
    onFirstDataRendered?.();
  }, [onFirstDataRendered]);

  // 窗口大小变化时重新调整列宽
  useEffect(() => {
    const handleResize = () => {
      if (gridApi) {
        // 使用 requestAnimationFrame 优化性能
        requestAnimationFrame(() => {
          gridApi.sizeColumnsToFit();
        });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [gridApi]);

  // 显示/隐藏加载状态
  useEffect(() => {
    if (gridApi) {
      if (loading) {
        gridApi.showLoadingOverlay();
      } else if (!rowData || rowData.length === 0) {
        gridApi.showNoRowsOverlay();
      } else {
        gridApi.hideOverlay();
      }
    }
  }, [gridApi, loading, rowData]);

  // 键盘事件处理
  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const tagName = target.tagName.toLowerCase();
      if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') return true;
      if (target.isContentEditable) return true;
      if (target.closest('[contenteditable="true"]')) return true;
      return false;
    };

    const hasTextSelectionInGrid = (): boolean => {
      const container = containerRef.current;
      const selection = window.getSelection?.();
      if (!container || !selection || selection.isCollapsed) return false;
      const anchorNode = selection.anchorNode;
      if (!anchorNode) return false;
      return container.contains(anchorNode);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // 仅在 grid 容器内触发（避免影响编辑器/输入框等全局快捷键）
      const container = containerRef.current;
      const target = e.target as Node | null;
      if (!container || !target || !container.contains(target)) return;

      // 允许输入框/编辑器自身处理复制/全选
      if (isEditableTarget(e.target)) return;

      const key = e.key.toLowerCase();

      // Ctrl+C / Cmd+C - 复制
      if ((e.ctrlKey || e.metaKey) && key === 'c') {
        // 如果用户在 grid 内做了文字选中，优先使用浏览器默认复制
        if (hasTextSelectionInGrid()) return;
        e.preventDefault();
        copyToClipboard();
      }
      // Ctrl+A / Cmd+A - 全选
      if ((e.ctrlKey || e.metaKey) && key === 'a') {
        e.preventDefault();
        gridApi?.selectAll();
      }
      // Esc - 清除选中状态
      if (e.key === 'Escape') {
        gridApi?.deselectAll();
        // 注意：getCellRanges 和 clearRangeSelection 是 Enterprise 功能
        // Community 版本使用防御式调用
        try {
          const ranges = (gridApi as any)?.getCellRanges?.();
          if (ranges && ranges.length > 0) {
            (gridApi as any)?.clearRangeSelection?.();
          }
        } catch {
          // Enterprise 功能不可用，忽略
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [copyToClipboard, gridApi]);

  // 主题类名
  const themeClass = isDarkMode ? 'ag-theme-alpine-dark' : 'ag-theme-alpine';

  return (
    <div ref={containerRef} className={`${themeClass} h-full w-full ${className}`}>
      <AgGridReact
        ref={gridRef}
        rowData={rowData}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        gridOptions={gridOptions}
        onGridReady={handleGridReady}
        onFirstDataRendered={handleFirstDataRendered}
      />
    </div>
  );
};

export default AGGridWrapper;
