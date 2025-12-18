# 国际化翻译 Key 清单

本文档记录了 Query 模块中使用的所有翻译 key。

## 翻译文件位置

- 中文: `frontend/src/i18n/locales/zh/common.json`
- 英文: `frontend/src/i18n/locales/en/common.json`

## 使用方式

```typescript
import { useTranslation } from 'react-i18next';

const { t } = useTranslation('common');

// 使用翻译
<span>{t('query.builder.title')}</span>

// 带参数的翻译
<span>{t('query.result.rowCount', { count: 100 })}</span>
```

## 翻译 Key 清单

### 导航 (nav.*)

| Key | 中文 | 英文 | 使用位置 |
|-----|------|------|----------|
| nav.datasource | 数据源 | Data Sources | Sidebar |
| nav.unifiedquery | 统一查询 | Unified Query | Sidebar |
| nav.queryworkbench | 查询工作台 | Query Workbench | Sidebar |
| nav.tablemanagement | 数据表管理 | Table Management | Sidebar |
| nav.asynctasks | 异步任务 | Async Tasks | Sidebar |

### 操作 (actions.*)

| Key | 中文 | 英文 | 使用位置 |
|-----|------|------|----------|
| actions.cancel | 取消 | Cancel | 通用按钮 |
| actions.delete | 删除 | Delete | 通用按钮 |
| actions.refresh | 刷新 | Refresh | 通用按钮 |
| actions.reset | 重置 | Reset | 通用按钮 |

### 查询构建器 (query.builder.*)

| Key | 中文 | 英文 | 使用位置 |
|-----|------|------|----------|
| query.builder.title | 可视化查询 | Visual Query | QueryBuilder |
| query.builder.selectTable | 选择表 | Select table | QueryBuilder |
| query.builder.selectColumns | 选择列 | Select columns | QueryBuilder |
| query.builder.execute | 执行查询 | Execute query | QueryBuilder |
| query.builder.preview | 预览 SQL | Preview SQL | QueryBuilder |
| query.builder.tabBasic | 基础 | Basic | QueryBuilder Tab |
| query.builder.tabJoin | 关联 | Join | QueryBuilder Tab |
| query.builder.tabFilter | 过滤 | Filter | QueryBuilder Tab |
| query.builder.tabAggregate | 聚合 | Aggregate | QueryBuilder Tab |
| query.builder.tabSort | 排序 | Sort | QueryBuilder Tab |

### 表选择器 (query.tableSelector.*)

| Key | 中文 | 英文 | 使用位置 |
|-----|------|------|----------|
| query.tableSelector.selectTable | 选择表 | Select table | TableSelector |
| query.tableSelector.placeholder | 选择一个表... | Select a table... | TableSelector |
| query.tableSelector.searchPlaceholder | 搜索表名... | Search tables... | TableSelector |
| query.tableSelector.noResults | 未找到匹配的表 | No matching tables found | TableSelector |
| query.tableSelector.groupUploaded | 上传的文件 | Uploaded files | TableSelector |
| query.tableSelector.groupDatabase | 数据库表 | Database tables | TableSelector |
| query.tableSelector.groupAsync | 异步任务结果 | Async task results | TableSelector |

### 列选择器 (query.columnSelector.*)

| Key | 中文 | 英文 | 使用位置 |
|-----|------|------|----------|
| query.columnSelector.selectColumns | 选择列 | Select columns | ColumnSelector |
| query.columnSelector.placeholder | 请先选择一个表 | Please select a table first | ColumnSelector |
| query.columnSelector.selectAll | 全选 | Select all | ColumnSelector |
| query.columnSelector.deselectAll | 取消全选 | Deselect all | ColumnSelector |
| query.columnSelector.selectedCount | 已选择 {{count}} 列 | {{count}} columns selected | ColumnSelector |

### 过滤器 (query.filter.*)

| Key | 中文 | 英文 | 使用位置 |
|-----|------|------|----------|
| query.filter.addCondition | 添加条件 | Add condition | FilterBuilder |
| query.filter.removeCondition | 删除条件 | Remove condition | FilterBuilder |
| query.filter.column | 列 | Column | FilterBuilder |
| query.filter.operator | 操作符 | Operator | FilterBuilder |
| query.filter.value | 值 | Value | FilterBuilder |
| query.filter.noFilters | 暂无过滤条件 | No filter conditions | FilterBuilder |

### 聚合 (query.aggregate.*)

| Key | 中文 | 英文 | 使用位置 |
|-----|------|------|----------|
| query.aggregate.title | 聚合函数 | Aggregate Functions | AggregationBuilder |
| query.aggregate.addAggregation | 添加聚合 | Add Aggregation | AggregationBuilder |
| query.aggregate.function | 函数 | Function | AggregationBuilder |
| query.aggregate.column | 列 | Column | AggregationBuilder |
| query.aggregate.alias | 别名（可选） | Alias (optional) | AggregationBuilder |
| query.aggregate.groupBy | GROUP BY 字段 | GROUP BY Fields | AggregationBuilder |

### 排序 (query.sort.*)

| Key | 中文 | 英文 | 使用位置 |
|-----|------|------|----------|
| query.sort.title | 排序 | Sort | SortBuilder |
| query.sort.addSort | 添加排序 | Add Sort | SortBuilder |
| query.sort.column | 列 | Column | SortBuilder |
| query.sort.ascending | 升序 | Ascending | SortBuilder |
| query.sort.descending | 降序 | Descending | SortBuilder |

### 关联 (query.join.*)

| Key | 中文 | 英文 | 使用位置 |
|-----|------|------|----------|
| query.join.title | 表关联 | Table Joins | JoinBuilder |
| query.join.mainTable | 主表 | Main table | JoinBuilder |
| query.join.addJoin | 添加关联 | Add Join | JoinBuilder |
| query.join.selectTargetTable | 选择关联表 | Select target table | JoinBuilder |
| query.join.selectColumn | 选择列 | Select column | JoinBuilder |

### 结果面板 (query.result.*)

| Key | 中文 | 英文 | 使用位置 |
|-----|------|------|----------|
| query.result.noData | 暂无数据 | No data | ResultPanel |
| query.result.noDataHint | 执行查询以查看结果 | Execute a query to see results | ResultPanel |
| query.result.loading | 加载中... | Loading... | ResultPanel |
| query.result.error | 查询失败 | Query failed | ResultPanel |
| query.result.rowCount | 共 {{count}} 行 | {{count}} rows | ResultToolbar |
| query.result.execTime | 执行时间: {{time}}ms | Execution time: {{time}}ms | ResultToolbar |
| query.result.export | 导出 | Export | ResultToolbar |
| query.result.exportCSV | 导出 CSV | Export CSV | ResultToolbar |
| query.result.exportJSON | 导出 JSON | Export JSON | ResultToolbar |

### SQL 编辑器 (query.sql.*)

| Key | 中文 | 英文 | 使用位置 |
|-----|------|------|----------|
| query.sql.execute | 执行 | Execute | SQLToolbar |
| query.sql.executing | 执行中... | Executing... | SQLToolbar |
| query.sql.format | 格式化 | Format | SQLToolbar |
| query.sql.history | 查询历史 | Query History | SQLToolbar |
| query.sql.placeholder | 输入 SQL 查询语句... | Enter SQL query... | SQLEditor |
| query.sql.executeSuccess | 查询执行成功 | Query executed successfully | Toast |
| query.sql.executeError | 查询执行失败: {{message}} | Query execution failed: {{message}} | Toast |

### 查询历史 (query.history.*)

| Key | 中文 | 英文 | 使用位置 |
|-----|------|------|----------|
| query.history.title | 查询历史 | Query History | SQLHistory |
| query.history.description | 最近执行的 SQL 查询记录 | Recently executed SQL queries | SQLHistory |
| query.history.empty | 暂无历史记录 | No history | SQLHistory |
| query.history.clearAll | 清空历史 | Clear history | SQLHistory |
| query.history.failed | 失败 | Failed | SQLHistory |

### SQL 预览 (query.preview.*)

| Key | 中文 | 英文 | 使用位置 |
|-----|------|------|----------|
| query.preview.title | SQL 预览 | SQL Preview | SQLPreview |
| query.preview.copy | 复制 | Copy | SQLPreview |
| query.preview.copied | 已复制 | Copied | SQLPreview |
| query.preview.edit | 编辑 | Edit | SQLPreview |
| query.preview.noSQL | 暂无 SQL | No SQL | SQLPreview |

### 验证消息 (query.validation.*)

| Key | 中文 | 英文 | 使用位置 |
|-----|------|------|----------|
| query.validation.noTable | 请选择一个表 | Please select a table | useQueryBuilder |
| query.validation.noColumns | 请选择至少一列或添加聚合函数 | Please select at least one column or add an aggregation | useQueryBuilder |
| query.validation.filterNoColumn | 过滤条件 {{index}} 未选择列 | Filter {{index}} has no column selected | useQueryBuilder |
| query.validation.filterNoValue | 过滤条件 {{index}} 未设置值 | Filter {{index}} has no value set | useQueryBuilder |

### 异步任务 (async.*)

| Key | 中文 | 英文 | 使用位置 |
|-----|------|------|----------|
| async.title | 异步任务 | Async Tasks | AsyncTaskPanel |
| async.empty | 暂无异步任务 | No async tasks | AsyncTaskPanel |
| async.status | 状态 | Status | AsyncTaskPanel |
| async.sql | SQL | SQL | AsyncTaskPanel |
| async.time | 时间 | Time | AsyncTaskPanel |
| async.rows | 行数 | Rows | AsyncTaskPanel |
| async.actions | 操作 | Actions | AsyncTaskPanel |
| async.cancel | 取消 | Cancel | AsyncTaskPanel |
| async.status.pending | 等待中 | Pending | AsyncTaskPanel |
| async.status.running | 运行中 | Running | AsyncTaskPanel |
| async.status.completed | 已完成 | Completed | AsyncTaskPanel |
| async.status.failed | 失败 | Failed | AsyncTaskPanel |
| async.status.cancelled | 已取消 | Cancelled | AsyncTaskPanel |

## 添加新翻译的步骤

1. 在 `zh/common.json` 中添加中文翻译
2. 在 `en/common.json` 中添加英文翻译
3. 在组件中使用 `t('key')` 调用
4. 更新本文档

## 翻译 Key 命名规范

- 使用点分隔的层级结构：`模块.功能.具体文案`
- 使用小写字母和驼峰命名
- 保持简洁但有意义

示例：
- `query.builder.execute` - 查询构建器的执行按钮
- `query.result.noData` - 结果面板的无数据提示
- `async.status.running` - 异步任务的运行中状态

## 带参数的翻译

使用 `{{参数名}}` 语法：

```json
{
  "query.result.rowCount": "共 {{count}} 行"
}
```

```typescript
t('query.result.rowCount', { count: 100 })
// 输出: "共 100 行"
```

## 复数形式

i18next 支持复数形式，但目前项目中主要使用参数方式处理：

```json
{
  "query.columnSelector.selectedCount": "已选择 {{count}} 列"
}
```
