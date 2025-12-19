# Design Document: SQL Panel Federated Query Support

## Overview

本设计为查询面板（SQL 查询、透视表、集合操作等）添加统一的联邦查询支持层。核心功能包括：

1. **SQL 解析**：从 SQL 字符串中提取表名前缀（如 `mysql_orders.users`）
2. **前缀匹配**：将提取的前缀与已配置的数据库连接进行匹配
3. **attachDatabases 构建**：合并 selectedTables 和 SQL 解析结果，自动去重
4. **统一服务层**：提供可复用的联邦查询检测和构建逻辑
5. **自动补全增强**：SQL 编辑器支持 DuckDB 表和外部表的自动补全

## 技术方案调研结论

### SQL 解析方案选择：简化 Tokenizer + 状态机

**调研的方案**：

| 方案             | 包大小   | 适用性                   | 结论          |
| ---------------- | -------- | ------------------------ | ------------- |
| 正则表达式       | 0        | 边界情况多，难维护       | ❌ 已验证不可行 |
| node-sql-parser  | ~500KB   | 功能过度，包太大         | ❌ 不推荐       |
| 手写 Tokenizer   | ~3KB     | 可控、够用               | ✅ 推荐         |

**选择理由**：

1. 零依赖，不增加包大小
2. 代码量小（~150 行），易于维护
3. 逻辑清晰，完美处理边界情况（注释、字符串、引号、函数调用）
4. 符合项目"组件选择原则"：不引入过度依赖

**实现思路**：

```typescript
// Token 类型定义
type TokenType = 'keyword' | 'identifier' | 'dot' | 'lparen' | 'rparen' | 'string' | 'other';

interface Token {
  type: TokenType;
  value: string;
  position: number;
}

// 1. Tokenizer：逐字符扫描，跳过注释/字符串，生成 token 流
function tokenize(sql: string): Token[];

// 2. 状态机：遇到 FROM/JOIN → 期待表名 → 检查是否函数调用
function extractTableReferences(tokens: Token[]): ParsedTableReference[];
```

**Tokenizer 处理的边界情况**：
- 单行注释 `-- comment`
- 多行注释 `/* comment */`
- 字符串字面量 `'string'`
- 双引号标识符 `"identifier"`
- 反引号标识符 `` `identifier` ``
- 方括号标识符 `[identifier]`
- 函数调用检测（标识符后跟 `(`）

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Query Panels                                  │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐│
│  │ SQLQueryPanel│ │ JoinQuery   │ │ PivotTable  │ │ SetOperations││
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘│
│         │                │                │                │        │
│         └────────────────┴────────────────┴────────────────┘        │
│                                   │                                  │
│                                   ▼                                  │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                  useFederatedQueryDetection                      ││
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ││
│  │  │ parseSQLTables  │  │ matchPrefixes   │  │ mergeAttachDBs  │  ││
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘  ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                   │                                  │
│                                   ▼                                  │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                    useQueryWorkspace                             ││
│  │  handleQueryExecute(sql, source) → API Selection                 ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                   │                                  │
│         ┌─────────────────────────┼─────────────────────────┐       │
│         ▼                         ▼                         ▼       │
│  ┌──────────────┐         ┌──────────────┐         ┌──────────────┐ │
│  │ DuckDB API   │         │ External API │         │ Federated API│ │
│  │ /api/query   │         │ /api/external│         │ /api/federated│ │
│  └──────────────┘         └──────────────┘         └──────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. SQL Table Parser (`parseSQLTableReferences`)

从 SQL 字符串中提取表引用，包括前缀信息。

```typescript
interface ParsedTableReference {
  /** 完整表引用（如 mysql_orders.users） */
  fullName: string;
  /** 前缀/数据库别名（如 mysql_orders） */
  prefix: string | null;
  /** 表名（如 users） */
  tableName: string;
  /** Schema（如果有） */
  schema?: string;
  /** 表别名（如 AS u 中的 u） */
  alias?: string;
  /** 是否带引号 */
  isQuoted: boolean;
}

function parseSQLTableReferences(sql: string): ParsedTableReference[];
```

**解析规则：**
- 支持 FROM 子句：`FROM prefix.table`
- 支持 JOIN 子句：`JOIN prefix.table ON ...`
- 支持别名：`prefix.table AS t`
- 支持引号：`"prefix"."table"`
- 支持子查询中的表引用
- 排除 CTE 名称
- 排除函数调用（如 `read_csv('file.csv')`）

### 2. Prefix Matcher (`matchPrefixToConnection`)

将表名前缀与已配置的数据库连接进行匹配。

```typescript
interface PrefixMatchResult {
  /** 匹配的连接 */
  connection: DatabaseConnection | null;
  /** 是否匹配成功 */
  matched: boolean;
  /** 如果有多个匹配，记录警告 */
  warning?: string;
}

function matchPrefixToConnection(
  prefix: string,
  connections: DatabaseConnection[]
): PrefixMatchResult;
```

**匹配规则：**
1. 精确匹配连接名称（如 `mysql_orders` 匹配 `name: 'mysql_orders'`）
2. 匹配生成的别名（如 `mysql_orders` 匹配 `generateDatabaseAlias(connection)`）
3. 如果多个连接匹配，使用第一个并记录警告

### 3. AttachDatabases Merger (`mergeAttachDatabases`)

合并来自 selectedTables 和 SQL 解析的 attachDatabases。

```typescript
interface MergeResult {
  /** 合并后的 attachDatabases */
  attachDatabases: AttachDatabase[];
  /** 未识别的前缀列表 */
  unrecognizedPrefixes: string[];
  /** 是否需要联邦查询 */
  requiresFederatedQuery: boolean;
}

function mergeAttachDatabases(
  fromSelectedTables: AttachDatabase[],
  fromSQLParsing: AttachDatabase[],
  manualAdditions?: AttachDatabase[]
): MergeResult;
```

### 4. Federated Query Detection Hook (`useFederatedQueryDetection`)

统一的联邦查询检测 Hook，供所有查询面板使用。

```typescript
interface UseFederatedQueryDetectionOptions {
  /** SQL 字符串 */
  sql: string;
  /** 选中的表列表 */
  selectedTables: SelectedTable[];
  /** 可用的数据库连接 */
  connections: DatabaseConnection[];
  /** 手动添加的 attachDatabases */
  manualAttachDatabases?: AttachDatabase[];
}

interface UseFederatedQueryDetectionReturn {
  /** 最终的 attachDatabases 列表 */
  attachDatabases: AttachDatabase[];
  /** 未识别的前缀 */
  unrecognizedPrefixes: string[];
  /** 是否需要联邦查询 */
  requiresFederatedQuery: boolean;
  /** 构建的 TableSource */
  tableSource: TableSource;
  /** 手动添加 attachDatabase */
  addAttachDatabase: (db: AttachDatabase) => void;
  /** 手动移除 attachDatabase */
  removeAttachDatabase: (connectionId: string) => void;
}

function useFederatedQueryDetection(
  options: UseFederatedQueryDetectionOptions
): UseFederatedQueryDetectionReturn;
```

### 5. Unrecognized Prefix Warning Component

显示未识别前缀的警告，并提供配置新连接的入口。

```typescript
interface UnrecognizedPrefixWarningProps {
  /** 未识别的前缀列表 */
  prefixes: string[];
  /** 配置新连接的回调 */
  onConfigureConnection: (prefix: string) => void;
  /** 忽略警告的回调 */
  onDismiss: () => void;
}
```

### 6. Enhanced SQL Editor Autocomplete

增强 SQL 编辑器的自动补全，支持外部表。

```typescript
interface EnhancedAutocompleteSchema {
  /** DuckDB 表 */
  duckdbTables: Array<{ name: string; columns: string[] }>;
  /** 外部表（按连接分组） */
  externalTables: Array<{
    connectionId: string;
    connectionName: string;
    prefix: string;
    tables: Array<{ name: string; columns: string[] }>;
  }>;
}
```

## Data Models

### ParsedTableReference

```typescript
interface ParsedTableReference {
  fullName: string;      // "mysql_orders.users"
  prefix: string | null; // "mysql_orders"
  tableName: string;     // "users"
  schema?: string;       // "public" (for PostgreSQL)
  alias?: string;        // "u" (from AS u)
  isQuoted: boolean;     // true if "mysql_orders"."users"
}
```

### FederatedQueryDetectionState

```typescript
interface FederatedQueryDetectionState {
  // 来源分析
  fromSelectedTables: AttachDatabase[];
  fromSQLParsing: AttachDatabase[];
  manualAdditions: AttachDatabase[];
  
  // 合并结果
  mergedAttachDatabases: AttachDatabase[];
  unrecognizedPrefixes: string[];
  
  // 查询类型判断
  requiresFederatedQuery: boolean;
  queryType: 'duckdb' | 'external' | 'federated';
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: SQL Parser Extracts All Table References
*For any* valid SQL string containing table references with prefixes, the parser SHALL extract all prefixes correctly, including those in FROM, JOIN, and subquery clauses.
**Validates: Requirements 1.1, 4.1, 4.2, 4.4**

### Property 2: Prefix Matching Returns Correct Connection
*For any* table prefix and list of database connections, if the prefix matches a connection name or generated alias, the matcher SHALL return that connection.
**Validates: Requirements 1.2, 1.3**

### Property 3: AttachDatabases Merge Deduplicates
*For any* two lists of AttachDatabase with overlapping connectionIds, the merge function SHALL produce a list with no duplicate connectionIds.
**Validates: Requirements 2.2**

### Property 4: SelectedTables Priority Over SQL Parsing
*For any* conflict between selectedTables and SQL parsing for the same connection, the merged result SHALL use the selectedTables information.
**Validates: Requirements 2.3**

### Property 5: Federated Query API Selection
*For any* SQL containing external table references (matched prefixes), the system SHALL use the federated query API endpoint.
**Validates: Requirements 1.5, 10.2, 10.5**

### Property 6: Standard Query API for DuckDB-Only
*For any* SQL containing only DuckDB table references (no matched prefixes), the system SHALL use the standard DuckDB query API endpoint.
**Validates: Requirements 1.4, 11.4**

### Property 7: Unrecognized Prefix Detection
*For any* SQL containing table prefixes that do not match any configured connection, the system SHALL report those prefixes as unrecognized.
**Validates: Requirements 5.1, 6.5**

### Property 8: Quoted Identifier Parsing
*For any* SQL containing quoted identifiers (e.g., `"prefix"."table"`), the parser SHALL correctly extract the prefix without quotes.
**Validates: Requirements 4.5, 13.2**

### Property 9: Table Alias Handling
*For any* SQL containing table aliases (e.g., `prefix.table AS t`), the parser SHALL extract the original table reference, not the alias.
**Validates: Requirements 4.3, 13.3**

### Property 10: CTE Exclusion
*For any* SQL containing CTEs (WITH clauses), the parser SHALL not treat CTE names as external table references.
**Validates: Requirements 13.4**

### Property 11: Function Call Exclusion
*For any* SQL containing function calls that look like table references (e.g., `read_csv('file.csv')`), the parser SHALL not treat them as external tables.
**Validates: Requirements 13.5**

### Property 12: Backward Compatibility
*For any* existing SQL query without external table references, the system SHALL continue to execute using the standard query API without changes.
**Validates: Requirements 14.1**

## Interaction Design

### 1. SQL 输入与自动检测流程

```
用户输入 SQL
    │
    ▼
┌─────────────────────────────────────┐
│ 实时解析 SQL（防抖 300ms）           │
│ - 提取表引用                         │
│ - 匹配数据库连接                     │
└─────────────────────────────────────┘
    │
    ├─── 无外部表 ───► 标准模式（无指示器）
    │
    ├─── 有外部表 ───► 显示 AttachedDatabasesIndicator
    │                  显示将要 ATTACH 的数据库
    │
    └─── 有未识别前缀 ───► 显示 UnrecognizedPrefixWarning
                          提供配置入口
```

### 2. 自动补全交互

```
用户输入 "SELECT * FROM "
    │
    ▼
┌─────────────────────────────────────┐
│ 显示所有可用表                       │
│ ┌─────────────────────────────────┐ │
│ │ 📊 DuckDB Tables                │ │
│ │   users                         │ │
│ │   orders                        │ │
│ │   products                      │ │
│ ├─────────────────────────────────┤ │
│ │ 🔗 mysql_orders (MySQL)         │ │
│ │   mysql_orders.customers        │ │
│ │   mysql_orders.transactions     │ │
│ ├─────────────────────────────────┤ │
│ │ 🔗 pg_analytics (PostgreSQL)    │ │
│ │   pg_analytics.events           │ │
│ │   pg_analytics.metrics          │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘

用户输入 "SELECT * FROM mysql_orders."
    │
    ▼
┌─────────────────────────────────────┐
│ 只显示该连接下的表                   │
│ ┌─────────────────────────────────┐ │
│ │ 🔗 mysql_orders (MySQL)         │ │
│ │   customers                     │ │
│ │   transactions                  │ │
│ │   order_items                   │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### 3. 执行查询流程

```
用户点击执行
    │
    ▼
┌─────────────────────────────────────┐
│ 检查 attachDatabases                 │
└─────────────────────────────────────┘
    │
    ├─── 空列表 ───► 使用标准 DuckDB API
    │               POST /api/query
    │
    ├─── 非空列表 ───► 使用联邦查询 API
    │                 POST /api/federated-query
    │                 Body: { sql, attachDatabases }
    │
    └─── 有未识别前缀 ───► 显示确认对话框
                          "以下前缀未识别: xxx"
                          [配置连接] [忽略并执行] [取消]
```

### 4. 手动覆盖交互

```
AttachedDatabasesIndicator 点击展开
    │
    ▼
┌─────────────────────────────────────┐
│ 附加数据库管理面板                   │
│ ┌─────────────────────────────────┐ │
│ │ 自动检测:                       │ │
│ │ ☑ mysql_orders (MySQL)    [×]  │ │
│ │ ☑ pg_analytics (PostgreSQL)[×] │ │
│ ├─────────────────────────────────┤ │
│ │ 手动添加:                       │ │
│ │ ☑ sqlite_backup (SQLite)  [×]  │ │
│ ├─────────────────────────────────┤ │
│ │ [+ 添加数据库连接]              │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

## UI Components Design

### 1. AttachedDatabasesIndicator（增强版）

位置：SQL 编辑器工具栏右侧

```
┌─────────────────────────────────────────────────────────────────┐
│ [执行] [格式化] [历史]                    🔗 2个外部数据库 ▼    │
└─────────────────────────────────────────────────────────────────┘
                                                    │
                                                    ▼ (点击展开)
                                    ┌─────────────────────────────┐
                                    │ 将连接的数据库:              │
                                    │ ┌─────────────────────────┐ │
                                    │ │ 🟢 mysql_orders (MySQL) │ │
                                    │ │    host: 192.168.1.100  │ │
                                    │ │    database: orders_db  │ │
                                    │ ├─────────────────────────┤ │
                                    │ │ 🟢 pg_analytics (PG)    │ │
                                    │ │    host: 192.168.1.101  │ │
                                    │ │    database: analytics  │ │
                                    │ └─────────────────────────┘ │
                                    │ [管理连接...]               │
                                    └─────────────────────────────┘
```

### 2. UnrecognizedPrefixWarning

位置：SQL 编辑器上方，Alert 样式

```
┌─────────────────────────────────────────────────────────────────┐
│ ⚠️ 检测到未识别的数据库前缀                              [×]   │
│                                                                 │
│ 以下前缀未匹配到已配置的数据库连接:                             │
│                                                                 │
│ • mysql_unknown  [配置连接]                                     │
│ • pg_test        [配置连接]                                     │
│                                                                 │
│ 您可以配置新的数据库连接，或忽略这些前缀继续执行。              │
│                                                                 │
│ [忽略并执行]  [取消]                                            │
└─────────────────────────────────────────────────────────────────┘
```

### 3. FederatedQueryStatusBar

位置：SQL 编辑器底部状态栏

```
┌─────────────────────────────────────────────────────────────────┐
│ 查询类型: 联邦查询 | 数据库: DuckDB + mysql_orders + pg_analytics│
└─────────────────────────────────────────────────────────────────┘
```

### 4. DatabaseConnectionQuickAdd Dialog

点击"配置连接"后弹出的快速配置对话框

```
┌─────────────────────────────────────────────────────────────────┐
│ 配置数据库连接                                           [×]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ 连接名称: [mysql_unknown        ]  (预填从 SQL 检测到的前缀)   │
│                                                                 │
│ 数据库类型: [MySQL ▼]                                          │
│                                                                 │
│ 主机: [                    ]                                    │
│ 端口: [3306                ]                                    │
│ 数据库: [                  ]                                    │
│ 用户名: [                  ]                                    │
│ 密码: [                    ]                                    │
│                                                                 │
│ [测试连接]                                                      │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                    [取消]  [保存并使用]         │
└─────────────────────────────────────────────────────────────────┘
```

## Error Handling

### 1. Unrecognized Prefix

**触发条件：** SQL 中的表前缀未匹配到任何已配置的数据库连接

**处理流程：**
```
检测到未识别前缀
    │
    ▼
显示 UnrecognizedPrefixWarning
    │
    ├─── 用户点击 [配置连接] ───► 打开 DatabaseConnectionQuickAdd
    │                              │
    │                              ├─── 配置成功 ───► 重新检测 SQL
    │                              │                  更新 attachDatabases
    │                              │
    │                              └─── 配置取消 ───► 返回警告状态
    │
    ├─── 用户点击 [忽略并执行] ───► 执行查询（排除未识别的表）
    │                              显示提示："已忽略未识别的表引用"
    │
    └─── 用户点击 [取消] ───► 取消执行，保持编辑状态
```

**错误消息：**
- 中文：`检测到未识别的数据库前缀: {prefixes}。请配置对应的数据库连接或忽略这些前缀。`
- 英文：`Unrecognized database prefixes detected: {prefixes}. Please configure the corresponding database connections or ignore these prefixes.`

### 2. Connection Deleted

**触发条件：** SQL 引用的数据库连接已被删除

**处理流程：**
```
执行查询时检测到连接不存在
    │
    ▼
显示错误 Alert
    │
    ├─── 用户点击 [重新配置] ───► 打开 DatabaseConnectionQuickAdd
    │
    └─── 用户点击 [移除引用] ───► 从 attachDatabases 中移除
                                  重新检测 SQL
```

**错误消息：**
- 中文：`数据库连接 "{name}" 已不存在。请重新配置或移除相关引用。`
- 英文：`Database connection "{name}" no longer exists. Please reconfigure or remove the reference.`

### 3. SQL Parsing Failure

**触发条件：** SQL 语法错误导致无法解析

**处理流程：**
```
SQL 解析失败
    │
    ▼
回退到标准查询模式
    │
    ▼
执行查询（让数据库报告实际错误）
    │
    ▼
显示数据库返回的错误信息
```

**注意：** 不显示解析失败的警告，因为用户可能正在输入中。只有在执行时才让数据库报告错误。

### 4. Multiple Prefix Matches

**触发条件：** 一个前缀匹配到多个数据库连接

**处理流程：**
```
检测到多个匹配
    │
    ▼
使用第一个匹配的连接
    │
    ▼
在控制台记录警告（不打扰用户）
console.warn(`Prefix "${prefix}" matches multiple connections: ${names}. Using first match: ${firstMatch}.`)
```

### 5. Connection Error During Execution

**触发条件：** 联邦查询执行时连接外部数据库失败

**处理流程：**
```
连接失败
    │
    ▼
解析错误类型
    │
    ├─── 认证失败 ───► "数据库 {name} 认证失败，请检查用户名和密码"
    │
    ├─── 网络错误 ───► "无法连接到数据库 {name} ({host}:{port})，请检查网络"
    │
    ├─── 超时 ───► "连接数据库 {name} 超时，请稍后重试"
    │
    └─── 其他 ───► 显示原始错误信息
```

**错误消息格式：**
```typescript
interface FederatedQueryErrorDisplay {
  title: string;           // "联邦查询执行失败"
  message: string;         // 具体错误描述
  connectionName?: string; // 出错的连接名称
  suggestion?: string;     // 建议操作
  actions?: Array<{
    label: string;
    action: () => void;
  }>;
}
```

### 6. Partial Success Handling

**触发条件：** 部分外部数据库连接成功，部分失败

**处理流程：**
```
部分连接失败
    │
    ▼
显示警告（不是错误）
    │
    ▼
询问用户是否继续
    │
    ├─── [继续执行] ───► 使用成功的连接执行查询
    │
    └─── [取消] ───► 取消执行
```

**警告消息：**
- 中文：`以下数据库连接失败: {failedConnections}。是否使用剩余连接继续执行？`
- 英文：`The following database connections failed: {failedConnections}. Continue with remaining connections?`

## Testing Strategy

### Unit Tests
- SQL parser with various SQL patterns
- Prefix matcher with edge cases
- Merge function with overlapping inputs

### Property-Based Tests (using fast-check)
- Property 1: SQL parser extracts all prefixes
- Property 2: Prefix matching correctness
- Property 3: Merge deduplication
- Property 4: SelectedTables priority
- Property 5-6: API selection based on table types
- Property 7: Unrecognized prefix detection
- Property 8-11: Edge case handling

### Integration Tests
- SQLQueryPanel with federated query execution
- Autocomplete with mixed table sources
- Warning display and configuration flow

