/**
 * SelectedTable 工具函数
 * 
 * 提供统一的表处理函数，支持新旧格式的兼容性处理
 */

import type {
  SelectedTable,
  SelectedTableObject,
  DataSourceType,
  DatabaseType,
  ExternalConnection,
} from '../types/SelectedTable';

import {
  DATABASE_TYPE_ICONS,
  DATABASE_TYPE_LABELS,
} from '../types/SelectedTable';

// 重新导出类型和常量
export type { SelectedTable, SelectedTableObject, DataSourceType, DatabaseType, ExternalConnection };
export { DATABASE_TYPE_ICONS, DATABASE_TYPE_LABELS };

/**
 * 将 SelectedTable 统一转换为 SelectedTableObject 格式
 * 
 * @param table - 输入的表（字符串或对象格式）
 * @returns 标准化的 SelectedTableObject
 * 
 * @example
 * // 字符串格式转换
 * normalizeSelectedTable("users")
 * // => { name: "users", source: "duckdb" }
 * 
 * // 对象格式保持不变
 * normalizeSelectedTable({ name: "orders", source: "external", connection: {...} })
 * // => { name: "orders", source: "external", connection: {...} }
 */
export function normalizeSelectedTable(table: SelectedTable): SelectedTableObject {
  if (typeof table === 'string') {
    return {
      name: table,
      source: 'duckdb',
    };
  }
  return table;
}

/**
 * 从 SelectedTable 中提取表名
 * 
 * @param table - 输入的表（字符串或对象格式）
 * @returns 表名字符串
 * 
 * @example
 * getTableName("users") // => "users"
 * getTableName({ name: "orders", source: "external" }) // => "orders"
 */
export function getTableName(table: SelectedTable): string {
  if (typeof table === 'string') {
    return table;
  }
  return table.name;
}

/**
 * 判断表是否为外部数据库表
 * 
 * @param table - 输入的表（字符串或对象格式）
 * @returns 如果是外部表返回 true，否则返回 false
 * 
 * @example
 * isExternalTable("users") // => false
 * isExternalTable({ name: "users", source: "duckdb" }) // => false
 * isExternalTable({ name: "orders", source: "external" }) // => true
 */
export function isExternalTable(table: SelectedTable): boolean {
  if (typeof table === 'string') {
    return false;
  }
  return table.source === 'external';
}

/**
 * 判断表是否为 DuckDB 内部表
 * 
 * @param table - 输入的表（字符串或对象格式）
 * @returns 如果是 DuckDB 表返回 true，否则返回 false
 */
export function isDuckDBTable(table: SelectedTable): boolean {
  return !isExternalTable(table);
}

/**
 * 获取表的数据源类型
 * 
 * @param table - 输入的表（字符串或对象格式）
 * @returns 数据源类型 'duckdb' 或 'external'
 */
export function getTableSource(table: SelectedTable): DataSourceType {
  return normalizeSelectedTable(table).source;
}

/**
 * 获取外部表的连接信息
 * 
 * @param table - 输入的表（字符串或对象格式）
 * @returns 连接信息，如果不是外部表则返回 undefined
 */
export function getTableConnection(table: SelectedTable): ExternalConnection | undefined {
  if (typeof table === 'string') {
    return undefined;
  }
  return table.connection;
}

/**
 * 获取表的显示名称
 * 
 * @param table - 输入的表（字符串或对象格式）
 * @returns 显示名称
 */
export function getTableDisplayName(table: SelectedTable): string {
  const normalized = normalizeSelectedTable(table);
  if (normalized.displayName) {
    return normalized.displayName;
  }
  if (normalized.schema) {
    return `${normalized.schema}.${normalized.name}`;
  }
  return normalized.name;
}

/**
 * 获取表的完整标识（包含数据库类型图标）
 * 
 * @param table - 输入的表（字符串或对象格式）
 * @returns 带图标的显示名称
 */
export function getTableLabel(table: SelectedTable): string {
  const normalized = normalizeSelectedTable(table);
  const displayName = getTableDisplayName(table);
  
  if (normalized.source === 'external' && normalized.connection) {
    const icon = DATABASE_TYPE_ICONS[normalized.connection.type] || '📊';
    return `${icon} ${displayName}`;
  }
  
  return `📊 ${displayName}`;
}

/**
 * 创建 DuckDB 表对象
 * 
 * @param name - 表名
 * @param displayName - 可选的显示名称
 * @returns SelectedTableObject
 */
export function createDuckDBTable(name: string, displayName?: string): SelectedTableObject {
  return {
    name,
    source: 'duckdb',
    displayName,
  };
}

/**
 * 创建外部数据库表对象
 * 
 * @param name - 表名
 * @param connection - 连接信息
 * @param schema - 可选的模式名
 * @param displayName - 可选的显示名称
 * @returns SelectedTableObject
 */
export function createExternalTable(
  name: string,
  connection: ExternalConnection,
  schema?: string,
  displayName?: string
): SelectedTableObject {
  return {
    name,
    source: 'external',
    connection,
    schema,
    displayName,
  };
}

/**
 * 检查表列表中是否包含外部表
 * 
 * @param tables - 表列表
 * @returns 如果包含外部表返回 true
 */
export function hasExternalTables(tables: SelectedTable[]): boolean {
  return tables.some(isExternalTable);
}

/**
 * 检查表列表中是否包含 DuckDB 表
 * 
 * @param tables - 表列表
 * @returns 如果包含 DuckDB 表返回 true
 */
export function hasDuckDBTables(tables: SelectedTable[]): boolean {
  return tables.some(isDuckDBTable);
}

/**
 * 检查表列表是否混合了不同数据源的表
 * 
 * @param tables - 表列表
 * @returns 如果混合了不同数据源返回 true
 */
export function hasMixedSources(tables: SelectedTable[]): boolean {
  return hasExternalTables(tables) && hasDuckDBTables(tables);
}

/**
 * 检查外部表是否来自同一个数据库连接
 * 
 * @param tables - 表列表
 * @returns 如果所有外部表来自同一连接返回 true
 */
export function isSameConnection(tables: SelectedTable[]): boolean {
  const externalTables = tables.filter(isExternalTable);
  if (externalTables.length <= 1) {
    return true;
  }
  
  const connections = new Set<string>();
  for (const table of externalTables) {
    const connection = getTableConnection(table);
    if (connection) {
      connections.add(connection.id);
    }
  }
  
  return connections.size <= 1;
}

/**
 * 获取表列表中所有不同的连接
 * 
 * @param tables - 表列表
 * @returns 连接 ID 数组
 */
export function getUniqueConnections(tables: SelectedTable[]): string[] {
  const connections = new Set<string>();
  
  for (const table of tables) {
    const normalized = normalizeSelectedTable(table);
    if (normalized.source === 'duckdb') {
      connections.add('duckdb');
    } else if (normalized.connection) {
      connections.add(normalized.connection.id);
    }
  }
  
  return Array.from(connections);
}

/**
 * 按数据源分组表
 * 
 * @param tables - 表列表
 * @returns 分组后的表对象
 */
export function groupTablesBySource(tables: SelectedTable[]): {
  duckdb: SelectedTableObject[];
  external: Map<string, SelectedTableObject[]>;
} {
  const duckdb: SelectedTableObject[] = [];
  const external = new Map<string, SelectedTableObject[]>();
  
  for (const table of tables) {
    const normalized = normalizeSelectedTable(table);
    if (normalized.source === 'duckdb') {
      duckdb.push(normalized);
    } else if (normalized.connection) {
      const connectionId = normalized.connection.id;
      if (!external.has(connectionId)) {
        external.set(connectionId, []);
      }
      external.get(connectionId)!.push(normalized);
    }
  }
  
  return { duckdb, external };
}


/**
 * 比较两个 SelectedTable 是否相同
 * 
 * @param a - 第一个表
 * @param b - 第二个表
 * @returns 如果两个表相同返回 true
 */
export function isSameTable(a: SelectedTable, b: SelectedTable): boolean {
  const normalizedA = normalizeSelectedTable(a);
  const normalizedB = normalizeSelectedTable(b);
  
  // 数据源类型必须相同
  if (normalizedA.source !== normalizedB.source) return false;
  
  // 表名必须相同
  if (normalizedA.name !== normalizedB.name) return false;
  
  // 对于外部表，还需要比较连接 ID 和 schema
  if (normalizedA.source === 'external' && normalizedB.source === 'external') {
    return (
      normalizedA.connection?.id === normalizedB.connection?.id &&
      normalizedA.schema === normalizedB.schema
    );
  }
  
  return true;
}

/**
 * 判断表是否在选中列表中
 * 
 * 支持两种格式的 selectedTables：
 * 1. string[] - 旧格式，只包含表名
 * 2. SelectedTable[] - 新格式，包含完整的表信息
 * 
 * @param table - 要检查的表
 * @param selectedTables - 选中的表列表
 * @param connectionId - 可选的连接 ID（用于外部表匹配）
 * @param schema - 可选的 schema（用于外部表匹配）
 * @returns 如果表被选中返回 true
 */
export function isTableSelected(
  table: string | SelectedTable,
  selectedTables: (string | SelectedTable)[],
  connectionId?: string,
  schema?: string
): boolean {
  const tableName = typeof table === 'string' ? table : table.name;
  
  return selectedTables.some(selected => {
    if (typeof selected === 'string') {
      // 旧格式：简单字符串匹配
      // 支持完整标识符格式：connectionId.schema.tableName
      if (selected === tableName) return true;
      if (connectionId && schema && selected === `${connectionId}.${schema}.${tableName}`) return true;
      if (connectionId && selected === `${connectionId}.${tableName}`) return true;
      return false;
    }
    
    // 新格式：对象匹配
    const normalized = normalizeSelectedTable(selected);
    
    // 如果传入的是字符串表名，需要构建完整的表对象进行比较
    if (typeof table === 'string') {
      // 如果有连接 ID，说明是外部表
      if (connectionId) {
        return (
          normalized.source === 'external' &&
          normalized.connection?.id === connectionId &&
          normalized.schema === schema &&
          normalized.name === tableName
        );
      }
      // 否则是 DuckDB 表
      return normalized.source === 'duckdb' && normalized.name === tableName;
    }
    
    // 两个都是对象，使用 isSameTable 比较
    return isSameTable(table, selected);
  });
}
