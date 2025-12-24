/**
 * 双模筛选器类型定义
 * Dual-Mode Filter Type Definitions
 */

// ============================================
// 操作符类型
// ============================================

/**
 * 筛选操作符
 */
export type FilterOperator =
    | '='
    | '!='
    | '>'
    | '>='
    | '<'
    | '<='
    | 'LIKE'
    | 'NOT LIKE'
    | 'IN'
    | 'NOT IN'
    | 'IS NULL'
    | 'IS NOT NULL'
    | 'BETWEEN';

/**
 * 逻辑连接符
 */
export type LogicOperator = 'AND' | 'OR';

// ============================================
// 节点类型
// ============================================

/**
 * 基础节点接口
 */
interface FilterNodeBase {
    id: string;
}

/**
 * 单个条件节点（叶子节点）
 */
export interface FilterCondition extends FilterNodeBase {
    type: 'condition';
    /** 表名或表别名 */
    table: string;
    /** 列名 */
    column: string;
    /** 操作符 */
    operator: FilterOperator;
    /** 值 - 根据操作符类型可能是不同类型 */
    value: FilterValue;
    /** 第二个值（用于 BETWEEN） */
    value2?: FilterValue;
}

/**
 * 逻辑分组节点（分支节点）
 */
export interface FilterGroup extends FilterNodeBase {
    type: 'group';
    /** 组内逻辑连接符 */
    logic: LogicOperator;
    /** 子节点列表 */
    children: FilterNode[];
}

/**
 * 原始 SQL 节点（降级兜底）
 */
export interface FilterRaw extends FilterNodeBase {
    type: 'raw';
    /** 原始 SQL 字符串 */
    sql: string;
}

/**
 * 筛选节点联合类型
 */
export type FilterNode = FilterCondition | FilterGroup | FilterRaw;

// ============================================
// 值类型
// ============================================

/**
 * 筛选值类型
 * - string: 字符串值
 * - number: 数值
 * - boolean: 布尔值
 * - null: 空值
 * - (string | number)[]: 用于 IN/NOT IN 的多值
 */
export type FilterValue = string | number | boolean | null | (string | number)[];

// ============================================
// 辅助类型
// ============================================

/**
 * 可用列信息
 */
export interface ColumnInfo {
    /** 表名 */
    table: string;
    /** 列名 */
    column: string;
    /** 列类型 (DuckDB 类型) */
    type: string;
}

/**
 * 值校验结果
 */
export interface ValidationResult {
    /** 是否有效 */
    valid: boolean;
    /** 错误 i18n key (可选) */
    error?: string;
    /** 错误详情 (可选) */
    details?: string;
}

/**
 * 解析结果
 */
export interface ParseResult {
    /** 解析是否成功 */
    success: boolean;
    /** 解析结果节点 */
    node: FilterNode;
    /** 警告信息（部分解析成功时） */
    warnings?: string[];
}

// ============================================
// 操作符元数据
// ============================================

/**
 * 操作符配置
 */
export interface OperatorConfig {
    /** 操作符 */
    value: FilterOperator;
    /** 显示标签 i18n key */
    labelKey: string;
    /** 显示符号 */
    symbol: string;
    /** 是否需要值输入 */
    needsValue: boolean;
    /** 是否需要第二个值 (BETWEEN) */
    needsSecondValue: boolean;
    /** 是否需要多值输入 (IN/NOT IN) */
    isMultiValue: boolean;
}

/**
 * 所有操作符配置
 */
export const OPERATOR_CONFIGS: OperatorConfig[] = [
    { value: '=', labelKey: 'filter.operator.equals', symbol: '=', needsValue: true, needsSecondValue: false, isMultiValue: false },
    { value: '!=', labelKey: 'filter.operator.notEquals', symbol: '≠', needsValue: true, needsSecondValue: false, isMultiValue: false },
    { value: '>', labelKey: 'filter.operator.greaterThan', symbol: '>', needsValue: true, needsSecondValue: false, isMultiValue: false },
    { value: '>=', labelKey: 'filter.operator.greaterThanOrEqual', symbol: '≥', needsValue: true, needsSecondValue: false, isMultiValue: false },
    { value: '<', labelKey: 'filter.operator.lessThan', symbol: '<', needsValue: true, needsSecondValue: false, isMultiValue: false },
    { value: '<=', labelKey: 'filter.operator.lessThanOrEqual', symbol: '≤', needsValue: true, needsSecondValue: false, isMultiValue: false },
    { value: 'LIKE', labelKey: 'filter.operator.like', symbol: 'LIKE', needsValue: true, needsSecondValue: false, isMultiValue: false },
    { value: 'NOT LIKE', labelKey: 'filter.operator.notLike', symbol: 'NOT LIKE', needsValue: true, needsSecondValue: false, isMultiValue: false },
    { value: 'IN', labelKey: 'filter.operator.in', symbol: 'IN', needsValue: true, needsSecondValue: false, isMultiValue: true },
    { value: 'NOT IN', labelKey: 'filter.operator.notIn', symbol: 'NOT IN', needsValue: true, needsSecondValue: false, isMultiValue: true },
    { value: 'IS NULL', labelKey: 'filter.operator.isNull', symbol: 'IS NULL', needsValue: false, needsSecondValue: false, isMultiValue: false },
    { value: 'IS NOT NULL', labelKey: 'filter.operator.isNotNull', symbol: 'IS NOT NULL', needsValue: false, needsSecondValue: false, isMultiValue: false },
    { value: 'BETWEEN', labelKey: 'filter.operator.between', symbol: 'BETWEEN', needsValue: true, needsSecondValue: true, isMultiValue: false },
];

/**
 * 获取操作符配置
 */
export function getOperatorConfig(operator: FilterOperator): OperatorConfig | undefined {
    return OPERATOR_CONFIGS.find(config => config.value === operator);
}

// ============================================
// 常量
// ============================================

/** 最大嵌套层级 */
export const MAX_NESTING_DEPTH = 5;

/** 建议的最大条件数量 */
export const MAX_CONDITIONS_RECOMMENDED = 50;

/** 超过此数量启用虚拟滚动 */
export const VIRTUAL_SCROLL_THRESHOLD = 50;

/** SQL 解析超时时间 (ms) */
export const PARSE_TIMEOUT_MS = 100;

/** 模式切换防抖时间 (ms) */
export const MODE_SWITCH_DEBOUNCE_MS = 300;

/** 值最大长度 */
export const MAX_VALUE_LENGTH = 1000;
