/**
 * 双模筛选器模块导出
 * Dual-Mode Filter Module Exports
 */

// 类型导出
export type {
    FilterOperator,
    LogicOperator,
    FilterCondition,
    FilterGroup,
    FilterRaw,
    FilterNode,
    FilterValue,
    FilterPlacement,
    PlacementContext,
    ColumnInfo,
    ValidationResult,
    ParseResult,
    OperatorConfig,
} from './types';

// 常量导出
export {
    OPERATOR_CONFIGS,
    getOperatorConfig,
    MAX_NESTING_DEPTH,
    MAX_CONDITIONS_RECOMMENDED,
    VIRTUAL_SCROLL_THRESHOLD,
    PARSE_TIMEOUT_MS,
    MODE_SWITCH_DEBOUNCE_MS,
    MAX_VALUE_LENGTH,
} from './types';

// 工具函数导出
export {
    // SQL 生成
    generateFilterSQL,
    // SQL 解析
    parseFilterSQL,
    parseFilterSQLWithTimeout,
    // 转义函数
    escapeSqlIdentifier,
    escapeSqlString,
    // 校验函数
    validateValueType,
    validateNestingDepth,
    countConditions,
    // 创建函数
    createEmptyGroup,
    createCondition,
    createRawNode,
    // 树操作函数
    cloneFilterTree,
    findNodeById,
    removeNodeById,
    updateNodeById,
    addConditionToTree,
    toggleGroupLogic,
    groupNodes,
    // Placement 相关函数 (ON/WHERE 条件分离)
    separateConditionsByPlacement,
    cloneTreeWithoutOnConditions,
    getConditionsForTable,
    generateConditionsSQL,
    getOnConditionsTreeForTable,
    getDefaultPlacement,
    canPlaceInOrGroup,
    groupContainsOnConditions,
} from './filterUtils';

// UI 组件导出
export { FilterChip } from './FilterChip';
export type { FilterChipProps } from './FilterChip';

export { LogicConnector, LogicConnectorStatic } from './LogicConnector';
export type { LogicConnectorProps } from './LogicConnector';

export { TagsInput } from './TagsInput';
export type { TagsInputProps } from './TagsInput';

export { FilterPopover } from './FilterPopover';
export type { FilterPopoverProps } from './FilterPopover';

export { GroupChip } from './GroupChip';
export type { GroupChipProps } from './GroupChip';

export { FilterBar } from './FilterBar';
export type { FilterBarProps } from './FilterBar';

export { DraggableFilterList } from './DraggableFilterList';
export type { DraggableFilterListProps } from './DraggableFilterList';

export { PlacementSelector } from './PlacementSelector';
