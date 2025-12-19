import type { DatabaseType, SelectedTable } from "@/new/types/SelectedTable";
import type { TableSource } from "@/new/hooks/useQueryWorkspace";
import { normalizeSelectedTable } from "@/new/utils/tableUtils";
import { tokenizeSQL } from "./sqlTokenizer";

export type SqlDialect = DatabaseType | "duckdb";

/**
 * 引用 SQL 标识符（表名、列名等）
 * 
 * 注意：由于所有查询最终都在 DuckDB 中执行（包括通过 ATTACH 的外部数据库），
 * 我们统一使用 DuckDB 兼容的双引号语法。DuckDB 能够正确处理双引号标识符，
 * 即使是查询 ATTACH 的 MySQL/PostgreSQL 数据库。
 * 
 * @param identifier - 标识符名称
 * @param _dialect - SQL 方言（保留参数以便将来需要时扩展，当前未使用）
 * @returns 带引号的标识符
 */
export function quoteIdent(identifier: string, _dialect: SqlDialect): string {
  // 统一使用双引号，因为 DuckDB 是最终执行环境
  // DuckDB 兼容双引号标识符，即使查询 ATTACH 的外部数据库
  const escaped = identifier.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function quoteQualifiedTable(
  table: { name: string; schema?: string },
  dialect: SqlDialect
): string {
  if (table.schema) {
    return `${quoteIdent(table.schema, dialect)}.${quoteIdent(table.name, dialect)}`;
  }
  return quoteIdent(table.name, dialect);
}

export function getDialectFromSource(source?: TableSource): SqlDialect {
  if (source?.type === "external") {
    return source.databaseType ?? "mysql";
  }
  return "duckdb";
}

export function getSourceFromSelectedTable(table: SelectedTable): TableSource {
  const normalized = normalizeSelectedTable(table);
  if (normalized.source === "external" && normalized.connection) {
    return {
      type: "external",
      connectionId: normalized.connection.id,
      connectionName: normalized.connection.name,
      databaseType: normalized.connection.type,
      schema: normalized.schema,
    };
  }
  return { type: "duckdb" };
}

/**
 * 生成外部表的完整限定名（用于 ATTACH 模式）
 * 
 * 格式: "alias"."schema"."table" 或 "alias"."table"
 * 
 * @param table - 选中的表
 * @returns { qualifiedName: string, attachDatabase: AttachDatabase | null }
 * 
 * @example
 * // MySQL 表（无 schema）
 * generateExternalTableReference({ name: 'orders', source: 'external', connection: { id: '1', name: 'prod_db', type: 'mysql' } })
 * // => { qualifiedName: '"mysql_prod_db"."orders"', attachDatabase: { alias: 'mysql_prod_db', connectionId: '1' } }
 * 
 * // PostgreSQL 表（有 schema）
 * generateExternalTableReference({ name: 'users', schema: 'public', source: 'external', connection: { id: '2', name: 'pg_db', type: 'postgresql' } })
 * // => { qualifiedName: '"postgresql_pg_db"."public"."users"', attachDatabase: { alias: 'postgresql_pg_db', connectionId: '2' } }
 * 
 * // DuckDB 本地表
 * generateExternalTableReference({ name: 'local_table', source: 'duckdb' })
 * // => { qualifiedName: '"local_table"', attachDatabase: null }
 */
export function generateExternalTableReference(table: SelectedTable): {
  qualifiedName: string;
  attachDatabase: AttachDatabase | null;
} {
  const normalized = normalizeSelectedTable(table);
  
  // DuckDB 本地表：直接返回表名
  if (normalized.source !== "external" || !normalized.connection) {
    return {
      qualifiedName: quoteQualifiedTable(
        { name: normalized.name, schema: normalized.schema },
        "duckdb"
      ),
      attachDatabase: null,
    };
  }
  
  // 外部表：生成带别名前缀的完整限定名
  const alias = generateDatabaseAlias({
    id: normalized.connection.id,
    name: normalized.connection.name,
    type: normalized.connection.type,
  });
  
  // 构建完整限定名: alias.schema.table 或 alias.table
  const parts: string[] = [alias];
  if (normalized.schema) {
    parts.push(normalized.schema);
  }
  parts.push(normalized.name);
  
  const qualifiedName = parts.map(p => quoteIdent(p, "duckdb")).join(".");
  
  return {
    qualifiedName,
    attachDatabase: {
      alias,
      connectionId: normalized.connection.id,
    },
  };
}

// ============================================================================
// 联邦查询支持
// ============================================================================

/**
 * 附加数据库信息
 */
export interface AttachDatabase {
  /** 数据库别名，用于 SQL 中引用 */
  alias: string;
  /** 数据库连接 ID */
  connectionId: string;
}

/**
 * 数据库连接信息
 */
export interface DatabaseConnection {
  id: string;
  name: string;
  type: DatabaseType;
  host?: string;
  port?: number;
  database?: string;
}

/**
 * 表引用信息
 */
export interface TableReference {
  name: string;
  schema?: string;
  alias?: string;
  isExternal: boolean;
  connectionId?: string;
}

/**
 * 生成唯一的数据库别名
 *
 * @param connection - 数据库连接信息
 * @param existingAliases - 已存在的别名集合（用于避免冲突）
 * @returns 唯一的数据库别名
 *
 * @example
 * generateDatabaseAlias({ id: '1', name: 'orders_db', type: 'mysql' })
 * // => 'mysql_orders_db'
 */
export function generateDatabaseAlias(
  connection: DatabaseConnection,
  existingAliases?: Set<string>
): string {
  // 基础别名: 类型_名称，如 mysql_orders_db
  const baseAlias = `${connection.type}_${connection.name}`
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_") // 合并连续下划线
    .replace(/^_|_$/g, ""); // 移除首尾下划线

  // 确保以字母开头
  const safeAlias = /^[a-z]/.test(baseAlias) ? baseAlias : `db_${baseAlias}`;

  if (!existingAliases || !existingAliases.has(safeAlias)) {
    return safeAlias;
  }

  // 如果有冲突，添加数字后缀
  let counter = 1;
  while (existingAliases.has(`${safeAlias}_${counter}`)) {
    counter++;
  }
  return `${safeAlias}_${counter}`;
}

/**
 * 从选中的表列表中提取需要 ATTACH 的外部数据库
 *
 * @param tables - 选中的表列表
 * @returns 需要 ATTACH 的数据库列表（去重）
 *
 * @example
 * extractAttachDatabases([
 *   { name: 'users', source: 'duckdb' },
 *   { name: 'orders', source: 'external', connection: { id: '1', name: 'mysql_db', type: 'mysql' } },
 *   { name: 'products', source: 'external', connection: { id: '1', name: 'mysql_db', type: 'mysql' } },
 * ])
 * // => [{ alias: 'mysql_mysql_db', connectionId: '1' }]
 */
export function extractAttachDatabases(tables: SelectedTable[]): AttachDatabase[] {
  const seen = new Set<string>();
  const existingAliases = new Set<string>();
  const result: AttachDatabase[] = [];

  for (const table of tables) {
    const normalized = normalizeSelectedTable(table);

    // 只处理外部表
    if (normalized.source !== "external" || !normalized.connection) {
      continue;
    }

    const connectionId = normalized.connection.id;

    // 跳过已处理的连接
    if (seen.has(connectionId)) {
      continue;
    }

    seen.add(connectionId);

    // 生成唯一别名
    const alias = generateDatabaseAlias(
      {
        id: connectionId,
        name: normalized.connection.name,
        type: normalized.connection.type,
      },
      existingAliases
    );

    existingAliases.add(alias);

    result.push({
      alias,
      connectionId,
    });
  }

  return result;
}

/**
 * 格式化表引用（用于 SQL 生成）
 *
 * @param table - 表引用信息
 * @param dialect - SQL 方言
 * @returns 格式化后的表引用字符串
 *
 * @example
 * // 外部表
 * formatTableReference({ name: 'users', alias: 'mysql_db', isExternal: true }, 'duckdb')
 * // => '"mysql_db"."users"'
 *
 * // 外部表带 schema
 * formatTableReference({ name: 'users', schema: 'public', alias: 'pg_db', isExternal: true }, 'duckdb')
 * // => '"pg_db"."public"."users"'
 *
 * // DuckDB 本地表
 * formatTableReference({ name: 'local_users', isExternal: false }, 'duckdb')
 * // => '"local_users"'
 */
export function formatTableReference(
  table: TableReference,
  dialect: SqlDialect
): string {
  if (table.isExternal && table.alias) {
    // 外部表: alias.schema.table 或 alias.table
    const parts = [table.alias];
    if (table.schema) {
      parts.push(table.schema);
    }
    parts.push(table.name);
    return parts.map((p) => quoteIdent(p, dialect)).join(".");
  }

  // DuckDB 本地表: 直接使用表名（可能带 schema）
  if (table.schema) {
    return `${quoteIdent(table.schema, dialect)}.${quoteIdent(table.name, dialect)}`;
  }
  return quoteIdent(table.name, dialect);
}

/**
 * 从选中的表创建表引用
 *
 * @param table - 选中的表
 * @param attachDatabases - 已生成的 attach_databases 列表（用于查找别名）
 * @returns 表引用信息
 */
export function createTableReference(
  table: SelectedTable,
  attachDatabases: AttachDatabase[]
): TableReference {
  const normalized = normalizeSelectedTable(table);

  if (normalized.source === "external" && normalized.connection) {
    // 查找对应的别名
    const attachDb = attachDatabases.find(
      (db) => db.connectionId === normalized.connection?.id
    );

    return {
      name: normalized.name,
      schema: normalized.schema,
      alias: attachDb?.alias,
      isExternal: true,
      connectionId: normalized.connection.id,
    };
  }

  // DuckDB 本地表
  return {
    name: normalized.name,
    schema: normalized.schema,
    isExternal: false,
  };
}



// ============================================================================
// SQL 解析 - 表引用提取
// ============================================================================

/**
 * 解析后的表引用信息
 */
export interface ParsedTableReference {
  /** 完整表引用（如 mysql_orders.users） */
  fullName: string;
  /** 前缀/数据库别名（如 mysql_orders），无前缀时为 null */
  prefix: string | null;
  /** 表名（如 users） */
  tableName: string;
  /** Schema（如果有三段式引用） */
  schema?: string;
  /** 表别名（如 AS u 中的 u） */
  tableAlias?: string;
  /** 是否带引号 */
  isQuoted: boolean;
}

/**
 * 前缀匹配结果
 */
export interface PrefixMatchResult {
  /** 匹配的连接 */
  connection: DatabaseConnection | null;
  /** 是否匹配成功 */
  matched: boolean;
  /** 如果有多个匹配，记录警告 */
  warning?: string;
}

/**
 * AttachDatabases 合并结果
 */
export interface MergeAttachDatabasesResult {
  /** 合并后的 attachDatabases */
  attachDatabases: AttachDatabase[];
  /** 未识别的前缀列表 */
  unrecognizedPrefixes: string[];
  /** 是否需要联邦查询 */
  requiresFederatedQuery: boolean;
}

// SQL 关键字集合（用于排除别名）
const SQL_KEYWORDS_FOR_ALIAS = new Set([
  'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'OUTER', 'NATURAL',
  'ON', 'WHERE', 'GROUP', 'HAVING', 'ORDER', 'LIMIT', 'OFFSET',
  'UNION', 'INTERSECT', 'EXCEPT', 'AND', 'OR', 'NOT',
  'SET', 'VALUES', 'INTO', 'FROM', 'SELECT', 'AS', 'USING',
]);

// 解析器状态类型
type ParserState = 'initial' | 'after_from_join' | 'reading_table' | 'after_table' | 'after_as' | 'in_with';

/**
 * 从 SQL 字符串中提取表引用（基于 Tokenizer 的实现）
 *
 * @param sql - SQL 查询字符串
 * @returns 解析后的表引用列表
 *
 * @example
 * parseSQLTableReferences('SELECT * FROM mysql_orders.users u JOIN local_table t ON u.id = t.user_id')
 * // => [
 * //   { fullName: 'mysql_orders.users', prefix: 'mysql_orders', tableName: 'users', tableAlias: 'u', isQuoted: false },
 * //   { fullName: 'local_table', prefix: null, tableName: 'local_table', tableAlias: 't', isQuoted: false }
 * // ]
 */
export function parseSQLTableReferences(sql: string): ParsedTableReference[] {
  const tokens = tokenizeSQL(sql);
  const results: ParsedTableReference[] = [];
  const seen = new Set<string>();
  const cteNames = new Set<string>();
  
  let state: ParserState = 'initial';
  let tableParts: Array<{ value: string; isQuoted: boolean }> = [];
  let currentAlias: string | undefined;
  
  // 辅助函数：将 tableParts 转换为 ParsedTableReference
  const flushTable = () => {
    if (tableParts.length === 0) return;
    
    const isQuoted = tableParts.some(p => p.isQuoted);
    const parts = tableParts.map(p => p.value);
    const fullName = parts.join('.');
    const tableName = parts[parts.length - 1];
    
    // 检查是否是 CTE 名称
    if (cteNames.has(tableName.toLowerCase())) {
      tableParts = [];
      currentAlias = undefined;
      return;
    }
    
    // 去重
    const key = fullName.toLowerCase();
    if (seen.has(key)) {
      tableParts = [];
      currentAlias = undefined;
      return;
    }
    seen.add(key);
    
    let ref: ParsedTableReference;
    if (parts.length === 1) {
      ref = {
        fullName,
        prefix: null,
        tableName,
        tableAlias: currentAlias,
        isQuoted,
      };
    } else if (parts.length === 2) {
      ref = {
        fullName,
        prefix: parts[0],
        tableName,
        tableAlias: currentAlias,
        isQuoted,
      };
    } else {
      // 3+ parts: prefix.schema.table
      ref = {
        fullName,
        prefix: parts[0],
        schema: parts[1],
        tableName,
        tableAlias: currentAlias,
        isQuoted,
      };
    }
    
    results.push(ref);
    tableParts = [];
    currentAlias = undefined;
  };
  
  // 第一遍：提取所有 CTE 名称
  let tempInWith = false;
  let tempParenDepth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const nextToken = tokens[i + 1];
    
    if (token.type === 'lparen') {
      if (tempInWith) tempParenDepth++;
      continue;
    }
    if (token.type === 'rparen') {
      if (tempInWith) tempParenDepth--;
      continue;
    }
    
    if (token.type === 'keyword' && token.value.toUpperCase() === 'WITH') {
      tempInWith = true;
      tempParenDepth = 0;
      continue;
    }
    
    if (tempInWith) {
      // 只有当括号深度为 0 时遇到 SELECT 才退出 WITH 子句
      if (token.type === 'keyword' && token.value.toUpperCase() === 'SELECT' && tempParenDepth === 0) {
        tempInWith = false;
        continue;
      }
      
      // CTE 名称后面跟着 AS（只在括号深度为 0 时识别）
      if (tempParenDepth === 0 && token.type === 'identifier' && nextToken?.type === 'keyword' && nextToken.value.toUpperCase() === 'AS') {
        cteNames.add(token.value.toLowerCase());
      }
    }
  }
  
  // 第二遍：提取表引用
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const nextToken = tokens[i + 1];
    
    // 跳过右括号
    if (token.type === 'rparen') {
      continue;
    }
    
    // 处理左括号
    if (token.type === 'lparen') {
      if (state === 'reading_table' || state === 'after_table') {
        // 这是函数调用，丢弃当前表
        tableParts = [];
        currentAlias = undefined;
      }
      // 无论什么状态，遇到左括号都回到 initial（子查询或函数调用）
      state = 'initial';
      continue;
    }
    
    // 状态机处理
    switch (state) {
      case 'initial':
        // 寻找 FROM 或 JOIN 关键字
        if (token.type === 'keyword') {
          const kw = token.value.toUpperCase();
          if (kw === 'FROM' || kw === 'JOIN') {
            state = 'after_from_join';
          }
        }
        break;
        
      case 'after_from_join':
        // 期待表名（标识符）
        if (token.type === 'identifier') {
          tableParts.push({ 
            value: token.value, 
            isQuoted: token.raw !== token.value 
          });
          state = 'reading_table';
        } else {
          state = 'initial';
        }
        break;
        
      case 'reading_table':
        // 可能是 .identifier 继续表名，或者结束
        if (token.type === 'dot') {
          // 继续读取下一部分
          if (nextToken?.type === 'identifier') {
            tableParts.push({ 
              value: nextToken.value, 
              isQuoted: nextToken.raw !== nextToken.value 
            });
            i++; // 跳过下一个 token
          }
        } else if (token.type === 'keyword') {
          const kw = token.value.toUpperCase();
          if (kw === 'AS') {
            state = 'after_as';
          } else if (kw === 'FROM' || kw === 'JOIN') {
            // 新的 FROM/JOIN，先保存当前表
            flushTable();
            state = 'after_from_join';
          } else if (SQL_KEYWORDS_FOR_ALIAS.has(kw)) {
            // 遇到其他关键字，保存当前表
            flushTable();
            state = 'initial';
          } else {
            // 可能是别名（非关键字）
            flushTable();
            state = 'initial';
          }
        } else if (token.type === 'identifier') {
          // 可能是别名
          currentAlias = token.value;
          state = 'after_table';
        } else if (token.type === 'comma') {
          // 多表 FROM，保存当前表
          flushTable();
          state = 'after_from_join';
        } else {
          // 其他情况，保存当前表
          flushTable();
          state = 'initial';
        }
        break;
        
      case 'after_table':
        // 已经有别名，等待下一个关键字
        if (token.type === 'keyword') {
          const kw = token.value.toUpperCase();
          if (kw === 'FROM' || kw === 'JOIN') {
            flushTable();
            state = 'after_from_join';
          } else {
            flushTable();
            state = 'initial';
          }
        } else if (token.type === 'comma') {
          flushTable();
          state = 'after_from_join';
        } else {
          flushTable();
          state = 'initial';
        }
        break;
        
      case 'after_as':
        // 期待别名
        if (token.type === 'identifier') {
          currentAlias = token.value;
          state = 'after_table';
        } else {
          // AS 后面不是标识符，保存当前表
          flushTable();
          state = 'initial';
        }
        break;
    }
  }
  
  // 处理最后一个表
  flushTable();
  
  return results;
}

export function matchPrefixToConnection(
  prefix: string,
  connections: DatabaseConnection[]
): PrefixMatchResult {
  const normalizedPrefix = prefix.toLowerCase();
  const matches: DatabaseConnection[] = [];
  
  for (const conn of connections) {
    // 1. 精确匹配连接名称
    if (conn.name.toLowerCase() === normalizedPrefix) {
      matches.push(conn);
      continue;
    }
    
    // 2. 匹配生成的别名
    const alias = generateDatabaseAlias(conn);
    if (alias.toLowerCase() === normalizedPrefix) {
      matches.push(conn);
      continue;
    }
    
    // 3. 部分匹配：前缀包含连接名称
    if (normalizedPrefix.includes(conn.name.toLowerCase())) {
      matches.push(conn);
    }
  }
  
  if (matches.length === 0) {
    return { connection: null, matched: false };
  }
  
  if (matches.length > 1) {
    return {
      connection: matches[0],
      matched: true,
      warning: `Prefix "${prefix}" matches multiple connections: ${matches.map(c => c.name).join(', ')}. Using first match: ${matches[0].name}.`,
    };
  }
  
  return { connection: matches[0], matched: true };
}

/**
 * 合并来自不同来源的 attachDatabases
 *
 * @param fromSelectedTables - 从选中表提取的 attachDatabases
 * @param fromSQLParsing - 从 SQL 解析提取的 attachDatabases
 * @param manualAdditions - 手动添加的 attachDatabases
 * @returns 合并结果
 */
export function mergeAttachDatabases(
  fromSelectedTables: AttachDatabase[],
  fromSQLParsing: AttachDatabase[],
  manualAdditions: AttachDatabase[] = []
): MergeAttachDatabasesResult {
  const merged = new Map<string, AttachDatabase>();
  const unrecognizedPrefixes: string[] = [];
  
  // 1. 首先添加 selectedTables 的（优先级最高）
  for (const db of fromSelectedTables) {
    merged.set(db.connectionId, db);
  }
  
  // 2. 添加 SQL 解析的（如果不存在）
  for (const db of fromSQLParsing) {
    if (!merged.has(db.connectionId)) {
      merged.set(db.connectionId, db);
    }
  }
  
  // 3. 添加手动添加的
  for (const db of manualAdditions) {
    if (!merged.has(db.connectionId)) {
      merged.set(db.connectionId, db);
    }
  }
  
  const attachDatabases = Array.from(merged.values());
  
  return {
    attachDatabases,
    unrecognizedPrefixes,
    requiresFederatedQuery: attachDatabases.length > 0,
  };
}

/**
 * 从 SQL 解析结果构建 attachDatabases
 *
 * @param parsedRefs - 解析后的表引用
 * @param connections - 可用的数据库连接
 * @returns { attachDatabases, unrecognizedPrefixes }
 */
export function buildAttachDatabasesFromParsedRefs(
  parsedRefs: ParsedTableReference[],
  connections: DatabaseConnection[]
): { attachDatabases: AttachDatabase[]; unrecognizedPrefixes: string[] } {
  const attachDatabases: AttachDatabase[] = [];
  const unrecognizedPrefixes: string[] = [];
  const seenConnectionIds = new Set<string>();
  const seenPrefixes = new Set<string>();
  
  for (const ref of parsedRefs) {
    if (!ref.prefix) continue;
    
    const prefixLower = ref.prefix.toLowerCase();
    if (seenPrefixes.has(prefixLower)) continue;
    seenPrefixes.add(prefixLower);
    
    const matchResult = matchPrefixToConnection(ref.prefix, connections);
    
    if (matchResult.matched && matchResult.connection) {
      if (!seenConnectionIds.has(matchResult.connection.id)) {
        seenConnectionIds.add(matchResult.connection.id);
        attachDatabases.push({
          alias: ref.prefix, // 使用 SQL 中的前缀作为别名
          connectionId: matchResult.connection.id,
        });
      }
      
      if (matchResult.warning) {
        console.warn(matchResult.warning);
      }
    } else {
      unrecognizedPrefixes.push(ref.prefix);
    }
  }
  
  return { attachDatabases, unrecognizedPrefixes };
}
