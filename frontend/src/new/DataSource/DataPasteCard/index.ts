/**
 * DataPasteCard 模块
 * 
 * 提供剪贴板数据处理功能：
 * - DataPasteCard: 主组件
 * - hooks: 状态管理 hooks
 * - components: UI 子组件
 */

export { DataPasteCard, default } from './DataPasteCard';

// Re-export hooks
export { 
  useSmartParse, 
  useCleanup, 
  useReshape,
  type ParseResult, 
  type ParseConfig,
  type CleanupAction,
  type CleanupResult,
  type CleanupStats,
  type ReshapeConfig,
  type ReshapeValidation,
  type ReshapeCombination,
  type FillDirection,
} from './hooks';

// Re-export components
export { 
  FormatSwitcher, 
  SmartPreview, 
  ReshapePanel, 
  CleanupToolbar 
} from './components';
