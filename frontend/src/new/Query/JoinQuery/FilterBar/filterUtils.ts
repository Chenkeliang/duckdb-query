/**
 * 双模筛选器工具函数
 * Dual-Mode Filter Utility Functions
 * 
 * 包含：
 * - SQL 生成器 (generateFilterSQL)
 * - SQL 解析器 (parseFilterSQL)
 * - 转义函数 (escapeSqlIdentifier, escapeSqlString)
 * - 校验函数 (validateValueType, validateNestingDepth)
 * - 辅助函数 (createEmptyGroup, createCondition, countConditions)
 */

import { nanoid } from 'nanoid';
import type {
    FilterNode,
    FilterCondition,
    FilterGroup,
    FilterRaw,
    FilterOperator,
    FilterValue,
    FilterPlacement,
    PlacementContext,
    ValidationResult,
    ParseResult,
} from './types';
import { MAX_NESTING_DEPTH, PARSE_TIMEOUT_MS, MAX_VALUE_LENGTH } from './types';

// ============================================
// SQL 生成器
// ============================================

/**
 * 生成筛选条件的 SQL WHERE 子句
 * @param node 筛选节点
 * @returns SQL 字符串（不含 WHERE 关键字）
 */
export function generateFilterSQL(node: FilterNode): string {
    switch (node.type) {
        case 'condition':
            return generateConditionSQL(node);
        case 'group':
            return generateGroupSQL(node);
        case 'raw':
            return node.sql;
        default:
            return '';
    }
}

/**
 * 生成单个条件的 SQL
 */
function generateConditionSQL(cond: FilterCondition): string {
    const col = `${escapeSqlIdentifier(cond.table)}.${escapeSqlIdentifier(cond.column)}`;

    switch (cond.operator) {
        case 'IS NULL':
            return `${col} IS NULL`;
        case 'IS NOT NULL':
            return `${col} IS NOT NULL`;
        case 'IN':
        case 'NOT IN':
            const vals = formatMultiValue(cond.value);
            return `${col} ${cond.operator} (${vals})`;
        case 'BETWEEN':
            const val1 = formatSingleValue(cond.value);
            const val2 = formatSingleValue(cond.value2 ?? null);
            return `${col} BETWEEN ${val1} AND ${val2}`;

        case 'LIKE':
        case 'NOT LIKE':
            return `${col} ${cond.operator} ${formatSingleValue(cond.value)}`;
        default:
            return `${col} ${cond.operator} ${formatSingleValue(cond.value)}`;
    }
}

/**
 * 生成分组的 SQL
 */
function generateGroupSQL(group: FilterGroup): string {
    if (group.children.length === 0) {
        return '';
    }
    if (group.children.length === 1) {
        return generateFilterSQL(group.children[0]);
    }

    const parts = group.children
        .map(child => generateFilterSQL(child))
        .filter(Boolean);

    if (parts.length === 0) {
        return '';
    }
    if (parts.length === 1) {
        return parts[0];
    }

    return `(${parts.join(` ${group.logic} `)})`;
}

/**
 * 格式化单个值为 SQL
 */
function formatSingleValue(value: FilterValue): string {
    if (value === null || value === undefined) {
        return 'NULL';
    }
    if (typeof value === 'boolean') {
        return value ? 'TRUE' : 'FALSE';
    }
    if (typeof value === 'number') {
        return String(value);
    }
    if (typeof value === 'string') {
        return escapeSqlString(value);
    }
    // 数组情况（理论上单值不应该是数组，但做个兜底）
    if (Array.isArray(value) && value.length > 0) {
        return formatSingleValue(value[0]);
    }
    return 'NULL';
}

/**
 * 格式化多值为 SQL（用于 IN/NOT IN）
 */
function formatMultiValue(value: FilterValue): string {
    if (!Array.isArray(value)) {
        return formatSingleValue(value);
    }
    return value.map(v => formatSingleValue(v)).join(', ');
}

// ============================================
// 转义函数
// ============================================

/**
 * 转义 SQL 标识符（表名、列名）
 * 规则：用双引号包裹，内部双引号转义为两个双引号
 * @param name 标识符名称
 * @returns 转义后的标识符
 */
export function escapeSqlIdentifier(name: string): string {
    if (!name) return '""';
    return `"${name.replace(/"/g, '""')}"`;
}

/**
 * 转义 SQL 字符串值
 * 规则：用单引号包裹，内部单引号转义为两个单引号
 * @param str 字符串值
 * @returns 转义后的字符串
 */
export function escapeSqlString(str: string): string {
    if (str === null || str === undefined) return 'NULL';
    return `'${String(str).replace(/'/g, "''")}'`;
}

// ============================================
// SQL 解析器
// ============================================

/**
 * 解析 SQL WHERE 子句为 FilterNode
 * @param sql SQL 字符串
 * @returns 解析结果
 */
export function parseFilterSQL(sql: string): ParseResult {
    const trimmed = sql.trim();

    if (!trimmed) {
        return {
            success: true,
            node: createEmptyGroup(),
        };
    }

    try {
        const node = parseExpression(trimmed);
        return {
            success: true,
            node,
        };
    } catch (e) {
        // 解析失败，返回 Raw 节点
        return {
            success: false,
            node: createRawNode(trimmed),
            warnings: [`解析失败: ${e instanceof Error ? e.message : '未知错误'}`],
        };
    }
}

/**
 * 带超时的 SQL 解析
 * @param sql SQL 字符串
 * @param timeout 超时时间（毫秒）
 * @returns Promise<ParseResult>
 */
export async function parseFilterSQLWithTimeout(
    sql: string,
    timeout: number = PARSE_TIMEOUT_MS
): Promise<ParseResult> {
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            resolve({
                success: false,
                node: createRawNode(sql),
                warnings: ['解析超时，已保留原始 SQL'],
            });
        }, timeout);

        try {
            const result = parseFilterSQL(sql);
            clearTimeout(timer);
            resolve(result);
        } catch (e) {
            clearTimeout(timer);
            resolve({
                success: false,
                node: createRawNode(sql),
                warnings: [`解析错误: ${e instanceof Error ? e.message : '未知错误'}`],
            });
        }
    });
}

/**
 * 解析表达式（递归）
 */
function parseExpression(expr: string): FilterNode {
    const trimmed = expr.trim();

    // 1. 尝试按 OR 分割（最低优先级）
    const orParts = splitByLogic(trimmed, 'OR');
    if (orParts.length > 1) {
        return {
            id: nanoid(),
            type: 'group',
            logic: 'OR',
            children: orParts.map(parseExpression),
        };
    }

    // 2. 尝试按 AND 分割
    const andParts = splitByLogic(trimmed, 'AND');
    if (andParts.length > 1) {
        return {
            id: nanoid(),
            type: 'group',
            logic: 'AND',
            children: andParts.map(parseExpression),
        };
    }

    // 3. 处理括号
    if (trimmed.startsWith('(') && trimmed.endsWith(')') && isBalancedParentheses(trimmed)) {
        const inner = trimmed.slice(1, -1).trim();
        if (inner) {
            return parseExpression(inner);
        }
    }

    // 4. 尝试解析为条件
    return parseCondition(trimmed);
}

/**
 * 按逻辑操作符分割（忽略括号内的）
 */
function splitByLogic(expr: string, logic: 'AND' | 'OR'): string[] {
    const parts: string[] = [];
    let current = '';
    let depth = 0;
    let inString = false;
    let stringChar = '';

    // 正则匹配逻辑关键字（忽略大小写，需要两边有空格或边界）
    const logicRegex = logic === 'OR'
        ? /\s+OR\s+/gi
        : /\s+AND\s+/gi;

    for (let i = 0; i < expr.length; i++) {
        const char = expr[i];

        // 处理字符串
        if ((char === "'" || char === '"') && (i === 0 || expr[i - 1] !== '\\')) {
            if (!inString) {
                inString = true;
                stringChar = char;
            } else if (char === stringChar) {
                inString = false;
            }
        }

        // 处理括号
        if (!inString) {
            if (char === '(') depth++;
            if (char === ')') depth--;
        }

        current += char;

        // 检查是否匹配逻辑关键字
        if (depth === 0 && !inString) {
            const remaining = expr.slice(i + 1);
            const match = remaining.match(new RegExp(`^\\s+${logic}\\s+`, 'i'));
            if (match && current.trim()) {
                parts.push(current.trim());
                current = '';
                i += match[0].length; // 跳过逻辑关键字
            }
        }
    }

    if (current.trim()) {
        parts.push(current.trim());
    }

    return parts.length > 1 ? parts : [expr];
}

/**
 * 检查括号是否平衡
 */
function isBalancedParentheses(expr: string): boolean {
    let depth = 0;
    for (let i = 0; i < expr.length; i++) {
        if (expr[i] === '(') depth++;
        if (expr[i] === ')') depth--;
        // 除了首尾，中间不应该回到 0
        if (depth === 0 && i < expr.length - 1 && i > 0) {
            return false;
        }
    }
    return depth === 0;
}

/**
 * 解析单个条件
 */
function parseCondition(expr: string): FilterCondition | FilterRaw {
    const trimmed = expr.trim();

    // 匹配模式列表
    const patterns: Array<{
        regex: RegExp;
        handler: (match: RegExpMatchArray) => FilterCondition | null;
    }> = [
            // IS NULL / IS NOT NULL
            {
                regex: /^"?([^"]+)"?\."?([^"]+)"?\s+(IS\s+NULL|IS\s+NOT\s+NULL)$/i,
                handler: (m) => ({
                    id: nanoid(),
                    type: 'condition',
                    table: m[1],
                    column: m[2],
                    operator: m[3].toUpperCase().replace(/\s+/g, ' ') as FilterOperator,
                    value: null,
                }),
            },
            // IN / NOT IN
            {
                regex: /^"?([^"]+)"?\."?([^"]+)"?\s+(IN|NOT\s+IN)\s+\((.+)\)$/i,
                handler: (m) => {
                    const values = parseInValues(m[4]);
                    return {
                        id: nanoid(),
                        type: 'condition',
                        table: m[1],
                        column: m[2],
                        operator: m[3].toUpperCase().replace(/\s+/g, ' ') as FilterOperator,
                        value: values,
                    };
                },
            },
            // BETWEEN
            {
                regex: /^"?([^"]+)"?\."?([^"]+)"?\s+BETWEEN\s+(.+)\s+AND\s+(.+)$/i,
                handler: (m) => ({
                    id: nanoid(),
                    type: 'condition',
                    table: m[1],
                    column: m[2],
                    operator: 'BETWEEN',
                    value: parseValue(m[3].trim()),
                    value2: parseValue(m[4].trim()),
                }),
            },
            // LIKE / NOT LIKE
            {
                regex: /^"?([^"]+)"?\."?([^"]+)"?\s+(LIKE|NOT\s+LIKE)\s+(.+)$/i,
                handler: (m) => ({
                    id: nanoid(),
                    type: 'condition',
                    table: m[1],
                    column: m[2],
                    operator: m[3].toUpperCase().replace(/\s+/g, ' ') as FilterOperator,
                    value: parseValue(m[4].trim()),
                }),
            },
            // 比较操作符 (=, !=, <>, >, >=, <, <=)
            {
                regex: /^"?([^"]+)"?\."?([^"]+)"?\s*(=|!=|<>|>=|<=|>|<)\s*(.+)$/,
                handler: (m) => ({
                    id: nanoid(),
                    type: 'condition',
                    table: m[1],
                    column: m[2],
                    operator: (m[3] === '<>' ? '!=' : m[3]) as FilterOperator,
                    value: parseValue(m[4].trim()),
                }),
            },
        ];

    for (const { regex, handler } of patterns) {
        const match = trimmed.match(regex);
        if (match) {
            const result = handler(match);
            if (result) return result;
        }
    }

    // 无法解析，返回 Raw 节点
    return createRawNode(trimmed);
}

/**
 * 解析 IN 列表中的值
 */
function parseInValues(valuesStr: string): (string | number)[] {
    const values: (string | number)[] = [];
    let current = '';
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < valuesStr.length; i++) {
        const char = valuesStr[i];

        if ((char === "'" || char === '"') && (i === 0 || valuesStr[i - 1] !== '\\')) {
            if (!inString) {
                inString = true;
                stringChar = char;
            } else if (char === stringChar) {
                inString = false;
            }
            current += char;
        } else if (char === ',' && !inString) {
            const val = parseValue(current.trim());
            if (val !== null) values.push(val as string | number);
            current = '';
        } else {
            current += char;
        }
    }

    if (current.trim()) {
        const val = parseValue(current.trim());
        if (val !== null) values.push(val as string | number);
    }

    return values;
}

/**
 * 解析单个值
 */
function parseValue(str: string): FilterValue {
    const trimmed = str.trim();

    // NULL
    if (trimmed.toUpperCase() === 'NULL') {
        return null;
    }

    // Boolean
    if (trimmed.toUpperCase() === 'TRUE') return true;
    if (trimmed.toUpperCase() === 'FALSE') return false;

    // 字符串（单引号或双引号包裹）
    if ((trimmed.startsWith("'") && trimmed.endsWith("'")) ||
        (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
        // 去掉引号并处理转义
        const inner = trimmed.slice(1, -1);
        return inner.replace(/''/g, "'").replace(/""/g, '"');
    }

    // 数字
    const num = Number(trimmed);
    if (!isNaN(num)) {
        return num;
    }

    // 默认作为字符串
    return trimmed;
}

// ============================================
// 校验函数
// ============================================

/**
 * 校验值类型是否匹配列类型
 * @param value 值
 * @param columnType 列类型 (DuckDB 类型)
 * @returns 校验结果
 */
export function validateValueType(value: FilterValue, columnType: string): ValidationResult {
    if (value === null || value === undefined || value === '') {
        return { valid: true };
    }

    const type = columnType.toUpperCase();
    const strValue = String(value);

    // 整数类型
    if (type.includes('INT') || type.includes('BIGINT') || type.includes('SMALLINT') || type.includes('TINYINT')) {
        if (!/^-?\d+$/.test(strValue)) {
            return { valid: false, error: 'filter.error.invalidInteger', details: strValue };
        }
    }
    // 浮点类型
    else if (type.includes('DOUBLE') || type.includes('DECIMAL') || type.includes('FLOAT') || type.includes('REAL')) {
        if (isNaN(Number(strValue))) {
            return { valid: false, error: 'filter.error.invalidNumber', details: strValue };
        }
    }
    // 日期时间类型 (DATETIME, TIMESTAMP) - 需要放在 DATE 检查之前
    else if (type.includes('DATETIME') || type.includes('TIMESTAMP')) {
        if (isNaN(Date.parse(strValue))) {
            return { valid: false, error: 'filter.error.invalidTimestamp', details: strValue };
        }
    }
    // 日期类型 (纯 DATE，不包含时间)
    else if (type.includes('DATE')) {
        // 严格要求 ISO 格式：YYYY-MM-DD 或 YYYY-MM-DD HH:MM(:SS)
        // 不使用 Date.parse() 因为它接受太多格式（如 2024/12/23）
        if (!/^\d{4}-\d{2}-\d{2}(\s+\d{2}:\d{2}(:\d{2})?)?$/.test(strValue)) {
            return { valid: false, error: 'filter.error.invalidDate', details: strValue };
        }
    }
    // 布尔类型
    else if (type.includes('BOOL')) {
        const lower = strValue.toLowerCase();
        if (!['true', 'false', '1', '0'].includes(lower)) {
            return { valid: false, error: 'filter.error.invalidBoolean', details: strValue };
        }
    }

    // 检查值长度
    if (strValue.length > MAX_VALUE_LENGTH) {
        return { valid: false, error: 'filter.error.valueTooLong', details: `${strValue.length}` };
    }

    return { valid: true };
}

/**
 * 校验嵌套深度
 * @param tree 筛选树
 * @param maxDepth 最大允许深度
 * @returns 是否在允许范围内
 */
export function validateNestingDepth(tree: FilterGroup, maxDepth: number = MAX_NESTING_DEPTH): boolean {
    return getMaxDepth(tree) <= maxDepth;
}

/**
 * 获取树的最大深度
 */
function getMaxDepth(node: FilterNode, currentDepth: number = 1): number {
    if (node.type === 'group') {
        if (node.children.length === 0) return currentDepth;
        return Math.max(...node.children.map(child => getMaxDepth(child, currentDepth + 1)));
    }
    return currentDepth;
}

/**
 * 统计条件数量
 * @param tree 筛选树
 * @returns 条件总数
 */
export function countConditions(node: FilterNode): number {
    switch (node.type) {
        case 'condition':
            return 1;
        case 'raw':
            return 1;
        case 'group':
            return node.children.reduce((sum, child) => sum + countConditions(child), 0);
        default:
            return 0;
    }
}

// ============================================
// 辅助函数
// ============================================

/**
 * 创建空的根分组
 */
export function createEmptyGroup(): FilterGroup {
    return {
        id: nanoid(),
        type: 'group',
        logic: 'AND',
        children: [],
    };
}

/**
 * 创建条件节点
 * @param placement 条件应用位置，默认 'where'
 */
export function createCondition(
    table: string,
    column: string,
    operator: FilterOperator,
    value: FilterValue,
    value2?: FilterValue,
    placement: FilterPlacement = 'where'
): FilterCondition {
    return {
        id: nanoid(),
        type: 'condition',
        table,
        column,
        operator,
        value,
        placement,
        ...(value2 !== undefined && { value2 }),
    };
}

/**
 * 创建 Raw SQL 节点
 */
export function createRawNode(sql: string): FilterRaw {
    return {
        id: nanoid(),
        type: 'raw',
        sql,
    };
}

/**
 * 深拷贝筛选树
 */
export function cloneFilterTree(node: FilterNode): FilterNode {
    switch (node.type) {
        case 'condition':
            return {
                ...node,
                id: nanoid(),
                value: Array.isArray(node.value) ? [...node.value] : node.value,
            };
        case 'group':
            return {
                ...node,
                id: nanoid(),
                children: node.children.map(cloneFilterTree),
            };
        case 'raw':
            return {
                ...node,
                id: nanoid(),
            };
        default:
            return node;
    }
}

/**
 * 在树中查找节点
 */
export function findNodeById(tree: FilterNode, id: string): FilterNode | null {
    if (tree.id === id) return tree;
    if (tree.type === 'group') {
        for (const child of tree.children) {
            const found = findNodeById(child, id);
            if (found) return found;
        }
    }
    return null;
}

/**
 * 在树中删除节点
 */
export function removeNodeById(tree: FilterGroup, id: string): FilterGroup {
    return {
        ...tree,
        children: tree.children
            .filter(child => child.id !== id)
            .map(child => {
                if (child.type === 'group') {
                    return removeNodeById(child, id);
                }
                return child;
            }),
    };
}

/**
 * 在树中更新节点
 */
export function updateNodeById(tree: FilterGroup, id: string, updater: (node: FilterNode) => FilterNode): FilterGroup {
    return {
        ...tree,
        children: tree.children.map(child => {
            if (child.id === id) {
                return updater(child);
            }
            if (child.type === 'group') {
                return updateNodeById(child, id, updater);
            }
            return child;
        }),
    };
}

/**
 * 添加条件到树的根节点
 */
export function addConditionToTree(tree: FilterGroup, condition: FilterCondition): FilterGroup {
    return {
        ...tree,
        children: [...tree.children, condition],
    };
}

/**
 * 切换分组的逻辑操作符
 */
export function toggleGroupLogic(tree: FilterGroup, groupId: string): FilterGroup {
    if (tree.id === groupId) {
        return {
            ...tree,
            logic: tree.logic === 'AND' ? 'OR' : 'AND',
        };
    }
    return {
        ...tree,
        children: tree.children.map(child => {
            if (child.type === 'group') {
                return toggleGroupLogic(child, groupId);
            }
            return child;
        }),
    };
}

/**
 * 将两个节点合并为一个分组
 */
export function groupNodes(
    tree: FilterGroup,
    nodeId1: string,
    nodeId2: string,
    logic: 'AND' | 'OR' = 'AND'
): FilterGroup {
    const node1 = findNodeById(tree, nodeId1);
    const node2 = findNodeById(tree, nodeId2);

    if (!node1 || !node2) return tree;

    // 先从树中移除两个节点
    let newTree = removeNodeById(tree, nodeId1);
    newTree = removeNodeById(newTree, nodeId2);

    // 创建新分组
    const newGroup: FilterGroup = {
        id: nanoid(),
        type: 'group',
        logic,
        children: [cloneFilterTree(node1), cloneFilterTree(node2)],
    };

    // 添加新分组到根节点
    return {
        ...newTree,
        children: [...newTree.children, newGroup],
    };
}

// ============================================
// Placement 相关函数（ON/WHERE 条件分离）
// ============================================

/**
 * 按 placement 分离条件（平铺化，用于 ON 子句）
 * 遍历整个树，提取所有 placement='on' 和 placement='where' 的条件
 * 
 * @param tree 筛选树
 * @returns 分离后的 ON 条件和 WHERE 条件数组
 */
export function separateConditionsByPlacement(
    tree: FilterGroup
): { onConditions: FilterCondition[]; whereConditions: FilterCondition[] } {
    const onConditions: FilterCondition[] = [];
    const whereConditions: FilterCondition[] = [];

    function traverse(node: FilterNode) {
        if (node.type === 'condition') {
            if (node.placement === 'on') {
                onConditions.push(node);
            } else {
                // 无 placement 或 placement='where' 都归入 WHERE
                whereConditions.push(node);
            }
        } else if (node.type === 'group') {
            node.children.forEach(traverse);
        }
        // raw 类型不处理（保留在原始树中）
    }

    tree.children.forEach(traverse);
    return { onConditions, whereConditions };
}

/**
 * 递归克隆 filterTree，移除所有 placement='on' 的条件
 * 用于生成 WHERE 子句，确保嵌套 group 内的 ON 条件也被移除
 * 
 * @param tree 原始筛选树
 * @returns 移除 ON 条件后的新树
 */
export function cloneTreeWithoutOnConditions(tree: FilterGroup): FilterGroup {
    function cloneNode(node: FilterNode): FilterNode | null {
        if (node.type === 'condition') {
            // 跳过 placement='on' 的条件
            if (node.placement === 'on') {
                return null;
            }
            return { ...node, id: nanoid() };
        } else if (node.type === 'group') {
            // 递归克隆子节点
            const clonedChildren = node.children
                .map(child => cloneNode(child))
                .filter((child): child is FilterNode => child !== null);

            // 如果 group 变空，返回 null（自动裁剪）
            if (clonedChildren.length === 0) {
                return null;
            }

            return {
                ...node,
                id: nanoid(),
                children: clonedChildren
            };
        } else if (node.type === 'raw') {
            // raw SQL 暂时保留在 WHERE
            return { ...node, id: nanoid() };
        }
        return null;
    }

    const clonedChildren = tree.children
        .map(child => cloneNode(child))
        .filter((child): child is FilterNode => child !== null);

    return {
        ...tree,
        id: nanoid(),
        children: clonedChildren
    };
}

/**
 * 获取指定表的条件
 * 
 * @param conditions 条件数组
 * @param tableName 表名
 * @returns 属于该表的条件数组
 */
export function getConditionsForTable(
    conditions: FilterCondition[],
    tableName: string
): FilterCondition[] {
    return conditions.filter(c => c.table === tableName);
}

/**
 * 生成条件数组的 SQL（用于 ON 子句附加条件）
 * 注意：此函数会丢失 AND/OR 树结构，仅用于简单场景
 * 如需保留 OR 逻辑，请使用 cloneTreeForTableOnConditions + generateFilterSQL
 * 
 * @param conditions 条件数组
 * @returns SQL 字符串
 * @deprecated 请使用 getOnConditionsTreeForTable + generateFilterSQL 以保留 OR 逻辑
 */
export function generateConditionsSQL(conditions: FilterCondition[]): string {
    if (conditions.length === 0) return '';
    return conditions.map(c => generateFilterSQL(c)).join(' AND ');
}

/**
 * 克隆树，仅保留指定表的 ON 条件
 * 保留 AND/OR 逻辑结构，以支持 OR 条件
 * 
 * @param tree 原始筛选树
 * @param tableName 表名
 * @returns 仅包含该表 ON 条件的筛选树（保留 AND/OR 结构）
 */
export function getOnConditionsTreeForTable(
    tree: FilterGroup,
    tableName: string
): FilterGroup {
    function cloneNode(node: FilterNode): FilterNode | null {
        if (node.type === 'condition') {
            // 仅保留 placement='on' 且 table 匹配的条件
            const cond = node as FilterCondition;
            if (cond.placement === 'on' && cond.table === tableName) {
                return { ...cond, id: nanoid() };
            }
            return null;
        } else if (node.type === 'group') {
            // 递归克隆子节点
            const clonedChildren = node.children
                .map(child => cloneNode(child))
                .filter((child): child is FilterNode => child !== null);

            // 如果 group 变空，返回 null
            if (clonedChildren.length === 0) {
                return null;
            }

            return {
                ...node,
                id: nanoid(),
                children: clonedChildren
            };
        } else if (node.type === 'raw') {
            // raw SQL 不包含在 ON 条件中
            return null;
        }
        return null;
    }

    const clonedChildren = tree.children
        .map(child => cloneNode(child))
        .filter((child): child is FilterNode => child !== null);

    return {
        ...tree,
        id: nanoid(),
        children: clonedChildren
    };
}

/**
 * 获取条件的默认 placement
 * 根据 JOIN 类型和表位置智能推荐：
 * - LEFT JOIN / FULL JOIN 的右表条件默认 ON（避免丢失 NULL 行）
 * - 其他情况默认 WHERE
 * 
 * @param context 位置上下文
 * @returns 推荐的 placement
 */
export function getDefaultPlacement(context?: PlacementContext): FilterPlacement {
    if (!context) return 'where';
    if (
        context.isRightTable &&
        (context.joinType === 'LEFT JOIN' || context.joinType === 'FULL JOIN')
    ) {
        return 'on';
    }
    return 'where';
}

/**
 * 检查条件是否可以放入 OR 分组
 * ON 条件不允许在 OR 分组中（语义复杂，容易误用）
 * 
 * @param condition 条件节点
 * @returns 是否允许放入 OR 分组
 */
export function canPlaceInOrGroup(condition: FilterCondition): boolean {
    return condition.placement !== 'on';
}

/**
 * 检查分组是否包含 ON 条件
 * 用于阻止将包含 ON 条件的 AND 分组切换为 OR
 * 
 * @param group 分组节点
 * @returns 是否包含 ON 条件
 */
export function groupContainsOnConditions(group: FilterGroup): boolean {
    function traverse(node: FilterNode): boolean {
        if (node.type === 'condition') {
            return node.placement === 'on';
        } else if (node.type === 'group') {
            return node.children.some(traverse);
        }
        return false;
    }
    return group.children.some(traverse);
}
