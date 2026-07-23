/**
 * SelectedTable 类型定义
 * 
 * 支持 DuckDB 内部表和外部数据库表的统一表示
 */

/**
 * 数据库连接类型
 */
export type DatabaseType = 'mysql' | 'postgresql' | 'sqlite' | 'duckdb';

/**
 * 数据源类型
 */
export type DataSourceType = 'duckdb' | 'external';

/**
 * 外部数据库连接信息
 */
export interface ExternalConnection {
  /** 连接 ID */
  id: string;
  /** 连接名称 */
  name: string;
  /** 数据库类型 */
  type: DatabaseType;
}

/**
 * SelectedTable 对象格式
 * 用于表示选中的表，包含完整的来源信息
 */
export interface SelectedTableObject {
  /** 表名 */
  name: string;
  /** 数据源类型: duckdb 或 external */
  source: DataSourceType;
  /** 外部数据库连接信息（仅当 source 为 external 时有效） */
  connection?: ExternalConnection;
  /** 模式名（PostgreSQL 使用） */
  schema?: string;
  /** 显示名称（用于 UI 展示） */
  displayName?: string;
}

/**
 * SelectedTable 联合类型
 * 支持旧版字符串格式和新版对象格式
 * 
 * @example
 * // 旧版格式（向后兼容）
 * const table1: SelectedTable = "users";
 * 
 * // 新版 DuckDB 表格式
 * const table2: SelectedTable = { name: "users", source: "duckdb" };
 * 
 * // 新版外部表格式
 * const table3: SelectedTable = {
 *   name: "orders",
 *   source: "external",
 *   connection: { id: "mysql_1", name: "Production DB", type: "mysql" }
 * };
 */
export type SelectedTable = string | SelectedTableObject;

/**
 * 数据库类型图标映射
 */
export const DATABASE_TYPE_ICONS: Record<DatabaseType, string> = {
  mysql: '🐬',
  postgresql: '🐘',
  sqlite: '📄',
  duckdb: '🦆',
};

/**
 * 数据库类型显示名称映射
 */
export const DATABASE_TYPE_LABELS: Record<DatabaseType, string> = {
  mysql: 'MySQL',
  postgresql: 'PostgreSQL',
  sqlite: 'SQLite',
  duckdb: 'DuckDB',
};
