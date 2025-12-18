/**
 * ResultPanel 模块导出
 */

// 主组件
export { ResultPanel } from './ResultPanel';
export type { ResultPanelProps } from './ResultPanel';

// AG-Grid 封装
export { AGGridWrapper } from './AGGridWrapper';
export type { AGGridWrapperProps } from './AGGridWrapper';

// 工具栏
export { ResultToolbar } from './ResultToolbar';
export type { ResultToolbarProps } from './ResultToolbar';

// Hooks
export {
  useColumnTypeDetection,
  useAGGridConfig,
  useGridStats,
} from './hooks';

export type {
  ColumnType,
  ColumnTypeInfo,
  ColumnTypeMap,
  UseAGGridConfigOptions,
  UseAGGridConfigReturn,
  GridStats,
  ColumnVisibility,
  UseGridStatsOptions,
  UseGridStatsReturn,
} from './hooks';
