import { useMemo } from 'react';
import { useDuckDBTables } from './useDuckDBTables';
import { useDatabaseConnections, type DatabaseConnection } from './useDatabaseConnections';
import { useDataSources } from './useDataSources';
import { generateDatabaseAlias } from '../utils/sqlUtils';

/**
 * 增强的自动补全 Hook
 * 
 * 功能：
 * - 合并 DuckDB 表和外部数据库表
 * - 为外部表生成带前缀的表名（如 mysql_prod.users）
 * - 支持按前缀过滤
 * - 提供分组的表列表
 * 
 * 使用示例：
 * ```tsx
 * const { tables, columns, schema, getTablesForPrefix } = useEnhancedAutocomplete();
 * ```
 */

export interface AutocompleteTable {
  /** 表名（用于自动补全显示） */
  name: string;
  /** 完整限定名（用于插入 SQL） */
  qualifiedName: string;
  /** 来源类型 */
  source: 'duckdb' | 'external';
  /** 数据库连接 ID（仅外部表） */
  connectionId?: string;
  /** 数据库连接名称（仅外部表） */
  connectionName?: string;
  /** 数据库类型（仅外部表） */
  databaseType?: string;
  /** 前缀/别名（仅外部表） */
  prefix?: string;
  /** Schema（仅外部表） */
  schema?: string;
}

export interface AutocompleteSchema {
  /** 表名 -> 列名列表 */
  [tableName: string]: string[];
}

export interface EnhancedAutocompleteResult {
  /** 所有表列表 */
  tables: AutocompleteTable[];
  /** DuckDB 表列表 */
  duckdbTables: AutocompleteTable[];
  /** 外部表列表（按连接分组） */
  externalTablesByConnection: Record<string, AutocompleteTable[]>;
  /** 自动补全 schema（CodeMirror 格式） */
  schema: AutocompleteSchema;
  /** 表名列表（用于简单自动补全） */
  tableNames: string[];
  /** 列名映射 */
  columns: Record<string, string[]>;
  /** 根据前缀获取表列表 */
  getTablesForPrefix: (prefix: string) => AutocompleteTable[];
  /** 可用的数据库连接 */
  connections: DatabaseConnection[];
  /** 是否正在加载 */
  isLoading: boolean;
}

/**
 * 增强的自动补全 Hook
 */
export const useEnhancedAutocomplete = (): EnhancedAutocompleteResult => {
  const { tables: duckdbTableList, isLoading: isLoadingDuckDB } = useDuckDBTables();
  const { connections, isLoading: isLoadingConnections } = useDatabaseConnections();
  const { dataSources, isLoading: isLoadingDataSources } = useDataSources();

  // 构建 DuckDB 表列表
  const duckdbTables = useMemo<AutocompleteTable[]>(() => {
    return duckdbTableList.map((table) => ({
      name: table.name,
      qualifiedName: table.name,
      source: 'duckdb' as const,
    }));
  }, [duckdbTableList]);

  // 构建外部表列表（从 dataSources 获取）
  const externalTables = useMemo<AutocompleteTable[]>(() => {
    const result: AutocompleteTable[] = [];

    // 从 dataSources 中提取数据库类型的数据源及其表
    dataSources.forEach((ds) => {
      if (ds.type !== 'database') return;

      // 查找对应的连接信息
      const connection = connections.find((c) => c.id === ds.id);
      if (!connection) return;

      // 生成连接别名
      const alias = generateDatabaseAlias(connection);

      // 从 params 中获取表列表（如果有的话）
      const tables = (ds.params?.tables as Array<{ name: string; schema?: string }>) || [];

      tables.forEach((table) => {
        const tableName = table.name;
        const tableSchema = table.schema;

        // 生成完整限定名：alias.schema.table 或 alias.table
        const qualifiedName = tableSchema
          ? `${alias}.${tableSchema}.${tableName}`
          : `${alias}.${tableName}`;

        result.push({
          name: tableName,
          qualifiedName,
          source: 'external',
          connectionId: connection.id,
          connectionName: connection.name,
          databaseType: connection.type,
          prefix: alias,
          schema: tableSchema,
        });
      });
    });

    return result;
  }, [dataSources, connections]);

  // 按连接分组的外部表
  const externalTablesByConnection = useMemo(() => {
    const grouped: Record<string, AutocompleteTable[]> = {};

    externalTables.forEach((table) => {
      const key = table.connectionId || 'unknown';
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(table);
    });

    return grouped;
  }, [externalTables]);

  // 合并所有表
  const allTables = useMemo(() => {
    return [...duckdbTables, ...externalTables];
  }, [duckdbTables, externalTables]);

  // 构建 CodeMirror schema
  const schema = useMemo<AutocompleteSchema>(() => {
    const result: AutocompleteSchema = {};

    // DuckDB 表
    duckdbTables.forEach((table) => {
      result[table.name] = [];
    });

    // 外部表（使用完整限定名）
    externalTables.forEach((table) => {
      result[table.qualifiedName] = [];
      // 也添加简单表名（用于输入前缀后的补全）
      if (table.prefix) {
        const prefixedName = `${table.prefix}.${table.name}`;
        result[prefixedName] = [];
      }
    });

    return result;
  }, [duckdbTables, externalTables]);

  // 表名列表
  const tableNames = useMemo(() => {
    const names: string[] = [];

    // DuckDB 表名
    duckdbTables.forEach((table) => {
      names.push(table.name);
    });

    // 外部表（完整限定名）
    externalTables.forEach((table) => {
      names.push(table.qualifiedName);
    });

    return names;
  }, [duckdbTables, externalTables]);

  // 列名映射（目前为空，后续可以扩展）
  const columns = useMemo<Record<string, string[]>>(() => {
    return {};
  }, []);

  // 根据前缀获取表列表
  const getTablesForPrefix = useMemo(() => {
    return (prefix: string): AutocompleteTable[] => {
      if (!prefix) {
        return allTables;
      }

      const lowerPrefix = prefix.toLowerCase();

      // 查找匹配前缀的外部表
      return externalTables.filter((table) => {
        if (!table.prefix) return false;
        return table.prefix.toLowerCase() === lowerPrefix;
      });
    };
  }, [allTables, externalTables]);

  const isLoading = isLoadingDuckDB || isLoadingConnections || isLoadingDataSources;

  return {
    tables: allTables,
    duckdbTables,
    externalTablesByConnection,
    schema,
    tableNames,
    columns,
    getTablesForPrefix,
    connections,
    isLoading,
  };
};

export default useEnhancedAutocomplete;
