# 联邦 JOIN 时间边界推荐 + 一键添加 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 JOIN 构建器里，自动识别联邦大表上的 create/update 审计时间列，一键往其联邦子查询追加一条"近 30 天"边界谓词（`placement='on'`），减少 ATTACH 抽取量、避免超时。

**Architecture:** 纯前端。一个无副作用的纯函数模块 `timeBound.ts` 负责检测/排序/默认值/构造；一个展示组件 `TimeBoundChip.tsx`；在 `JoinQueryPanel` 里计算建议、按表卡渲染芯片、点击时把一个 `FilterCondition`（`placement='on'`）追加进 `filterTree` 根组。现有的 `getOnConditionsTreeForTable`/`buildFilteredSubquery` 机制会把它下推进该表的联邦子查询——这正是用户实测唯一可下推的路径。零后端改动。

**Tech Stack:** React 18 + TypeScript + Vite + vitest；复用 `FilterBar` 的 `createCondition` / `FilterCondition` / `placement` 与子查询下推。

**Spec:** `docs/superpowers/specs/2026-05-31-join-time-bound-recommendation-design.md`
**Branch:** `feat_join_time_bound`（已创建）

---

## 关键事实（实现前必读）

- 所有前端命令在 `frontend/` 下运行。每条命令已带 `cd /Users/keliang/mypy/duckdb-query/frontend &&`。
- 单测：`npx vitest run <file>`；类型检查：`npx tsc --noEmit`；构建：`npm run build`。
- 提交署名必须是用户本人，**禁止** `Co-Authored-By: Claude` / `Generated with Claude Code` 等 trailer。提交前会自动跑代码规范检查。
- 复用的导出（全部来自 `src/Query/JoinQuery/FilterBar` 的 index）：`createCondition(table, column, operator, value, value2?, placement?)`、`getOnConditionsTreeForTable(tree, tableName)`、`generateFilterSQLForSubquery(tree)`、类型 `FilterCondition` / `FilterGroup`。
- `createCondition` 签名（`FilterBar/filterUtils.ts:682`）：`(table, column, operator, value, value2?, placement='where') => FilterCondition`，内部用 `nanoid()` 生成 id。
- 值经 `escapeSqlString` 自动加引号（`filterUtils.ts:183-184`）——`value` 必须是**裸日期串**，不能自带引号。
- `TableColumn` 类型在 `src/hooks/useTableColumns.ts:9`，形如 `{ name: string; type: string }`。
- `getTableName` / `isExternalTable` 来自 `@/utils/tableUtils`。
- `filterTree` 根恒为 `FilterGroup`（`createEmptyGroup()`），插入 = `setFilterTree(prev => ({ ...prev, children: [...prev.children, node] }))`。

---

## File Structure

- Create: `frontend/src/Query/JoinQuery/timeBound.ts` — 纯函数：类型识别、审计列分类、候选排序、默认值、建议构建、条件构造。
- Create: `frontend/src/Query/JoinQuery/TimeBoundChip.tsx` — 展示组件：芯片 + 多候选下拉。
- Create: `frontend/src/Query/JoinQuery/__tests__/timeBound.test.ts` — 纯函数单测 + 下推链路集成测试。
- Create: `frontend/src/Query/JoinQuery/__tests__/TimeBoundChip.test.tsx` — 组件测试。
- Modify: `frontend/src/Query/JoinQuery/JoinQueryPanel.tsx` — 计算建议、渲染芯片、插入处理、"全部添加"。
- Modify: `frontend/src/i18n/locales/zh/common.json` 与 `frontend/src/i18n/locales/en/common.json` — `query.join.timeBound.*`。

---

## Task 1: 时间列识别 + 审计列分类 + 候选排序（纯函数）

**Files:**
- Create: `frontend/src/Query/JoinQuery/timeBound.ts`
- Test: `frontend/src/Query/JoinQuery/__tests__/timeBound.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/Query/JoinQuery/__tests__/timeBound.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import {
  isTimeType,
  classifyAuditColumn,
  detectTimeBoundCandidates,
} from '../timeBound';

describe('isTimeType', () => {
  it('matches TIMESTAMP variants and DATE, excludes TIME/others', () => {
    expect(isTimeType('TIMESTAMP')).toBe(true);
    expect(isTimeType('timestamp')).toBe(true);
    expect(isTimeType('TIMESTAMP WITH TIME ZONE')).toBe(true);
    expect(isTimeType('TIMESTAMP_NS')).toBe(true);
    expect(isTimeType('DATE')).toBe(true);
    expect(isTimeType('TIME')).toBe(false);
    expect(isTimeType('TIME WITH TIME ZONE')).toBe(false);
    expect(isTimeType('VARCHAR')).toBe(false);
    expect(isTimeType('BIGINT')).toBe(false);
  });
});

describe('classifyAuditColumn', () => {
  it('classifies create / update audit names', () => {
    expect(classifyAuditColumn('create_time')).toBe('create');
    expect(classifyAuditColumn('created_at')).toBe('create');
    expect(classifyAuditColumn('gmt_create')).toBe('create');
    expect(classifyAuditColumn('ctime')).toBe('create');
    expect(classifyAuditColumn('update_time')).toBe('update');
    expect(classifyAuditColumn('updated_at')).toBe('update');
    expect(classifyAuditColumn('gmt_modified')).toBe('update');
    expect(classifyAuditColumn('mtime')).toBe('update');
    expect(classifyAuditColumn('birthday')).toBe(null);
    expect(classifyAuditColumn('expire_date')).toBe(null);
  });
});

describe('detectTimeBoundCandidates', () => {
  it('keeps only audit-named time-typed columns, create before update', () => {
    const cols = [
      { name: 'id', type: 'BIGINT' },
      { name: 'updated_at', type: 'TIMESTAMP' },
      { name: 'create_time', type: 'TIMESTAMP' },
      { name: 'birthday', type: 'DATE' },       // time-typed but not audit -> excluded
      { name: 'create_user', type: 'VARCHAR' }, // audit name but not time-typed -> excluded
    ];
    expect(detectTimeBoundCandidates(cols)).toEqual(['create_time', 'updated_at']);
  });

  it('returns empty when no audit time column', () => {
    expect(detectTimeBoundCandidates([
      { name: 'birthday', type: 'DATE' },
      { name: 'pay_time', type: 'TIMESTAMP' },
    ])).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/keliang/mypy/duckdb-query/frontend && npx vitest run src/Query/JoinQuery/__tests__/timeBound.test.ts`
Expected: FAIL（`Failed to resolve import "../timeBound"` 或函数未定义）。

- [ ] **Step 3: 写最小实现**

创建 `frontend/src/Query/JoinQuery/timeBound.ts`：

```ts
/**
 * 联邦大表 JOIN 时间边界推荐 —— 纯函数。
 * 检测 create/update 审计时间列，构造 placement='on' 的时间过滤条件，
 * 由现有联邦子查询下推机制限制 ATTACH 抽取量。
 */
import type { TableColumn } from '@/hooks/useTableColumns';
import { getTableName, isExternalTable } from '@/utils/tableUtils';
import type { SelectedTable } from '@/types/SelectedTable';
import { createCondition } from './FilterBar';
import type { FilterCondition, FilterGroup } from './FilterBar';

/** create 系词干（小写子串匹配）。'creat' 覆盖 create/created/gmt_create。 */
const CREATE_STEMS = ['creat', 'ctime', 'add_time', 'insert_time'];
/** update 系词干。'updat' 覆盖 update/updated；'modif' 覆盖 modify/modified/gmt_modified。 */
const UPDATE_STEMS = ['updat', 'modif', 'mtime'];

/** 是否为可做时间边界的 DuckDB 类型（TIMESTAMP* / DATE；排除 TIME）。 */
export function isTimeType(type: string): boolean {
  const t = (type || '').toUpperCase().replace(/\(.*\)/g, '').trim();
  if (t === 'DATE') return true;
  if (t.startsWith('TIMESTAMP')) return true; // TIMESTAMP / TIMESTAMP WITH TIME ZONE / TIMESTAMP_NS...
  return false; // TIME / TIME WITH TIME ZONE 等排除
}

export type AuditClass = 'create' | 'update' | null;

/** 按列名分类审计语义；非审计名返回 null。 */
export function classifyAuditColumn(name: string): AuditClass {
  const n = (name || '').toLowerCase();
  if (CREATE_STEMS.some((s) => n.includes(s))) return 'create';
  if (UPDATE_STEMS.some((s) => n.includes(s))) return 'update';
  return null;
}

/** 候选时间边界列：仅"类型为时间型 且 审计命名"的列，create 系排在 update 系前。 */
export function detectTimeBoundCandidates(columns: TableColumn[]): string[] {
  const timeCols = (columns || []).filter((c) => isTimeType(c.type));
  const creates = timeCols.filter((c) => classifyAuditColumn(c.name) === 'create').map((c) => c.name);
  const updates = timeCols.filter((c) => classifyAuditColumn(c.name) === 'update').map((c) => c.name);
  return [...creates, ...updates];
}
```

> 注：本文件后续 Task 会继续向其追加导出（默认值、建议、构造）。`SelectedTable` / `createCondition` / `FilterCondition` / `FilterGroup` 等导入此处先放好，供后续 Task 使用（本 Task 暂未用到的导入若触发 lint 未使用告警，在 Task 3 接入后即消解；若 lint 当前报错，可先注释这三行，Task 3 再启用）。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /Users/keliang/mypy/duckdb-query/frontend && npx vitest run src/Query/JoinQuery/__tests__/timeBound.test.ts`
Expected: PASS（3 个 describe 全绿）。

- [ ] **Step 5: 提交**

```bash
cd /Users/keliang/mypy/duckdb-query && git add frontend/src/Query/JoinQuery/timeBound.ts frontend/src/Query/JoinQuery/__tests__/timeBound.test.ts && git commit -m "feat(join): time-type detection + audit-column classification for time-bound recommendation"
```

---

## Task 2: 默认值 + 条件构造（纯函数）

**Files:**
- Modify: `frontend/src/Query/JoinQuery/timeBound.ts`
- Test: `frontend/src/Query/JoinQuery/__tests__/timeBound.test.ts`

- [ ] **Step 1: 追加失败测试**

在 `__tests__/timeBound.test.ts` 末尾追加：

```ts
import { defaultTimeBoundValue, buildTimeBoundCondition } from '../timeBound';

describe('defaultTimeBoundValue', () => {
  it('returns a bare datetime string 30 days before the given now (no quotes)', () => {
    const now = new Date(2026, 4, 31, 13, 45, 0); // 2026-05-31 本地时间
    expect(defaultTimeBoundValue(now, 30)).toBe('2026-05-01 00:00:00');
  });
});

describe('buildTimeBoundCondition', () => {
  it('builds a FilterCondition with placement=on and bare value', () => {
    const c = buildTimeBoundCondition('orders', 'create_time', '2026-05-01 00:00:00');
    expect(c.type).toBe('condition');
    expect(c.table).toBe('orders');
    expect(c.column).toBe('create_time');
    expect(c.operator).toBe('>=');
    expect(c.value).toBe('2026-05-01 00:00:00'); // 裸串，无引号
    expect(c.placement).toBe('on');               // 固定 ON -> 子查询下推
    expect(typeof c.id).toBe('string');
    expect(c.id.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/keliang/mypy/duckdb-query/frontend && npx vitest run src/Query/JoinQuery/__tests__/timeBound.test.ts`
Expected: FAIL（`defaultTimeBoundValue` / `buildTimeBoundCondition` 未导出）。

- [ ] **Step 3: 追加实现**

在 `timeBound.ts` 末尾追加：

```ts
/** 近 N 天的起点，格式化为裸日期串 'YYYY-MM-DD 00:00:00'（不含 SQL 引号；生成器会自动加）。 */
export function defaultTimeBoundValue(now: Date = new Date(), days = 30): string {
  const d = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} 00:00:00`;
}

/** 构造一条 placement='on' 的时间边界条件（走联邦子查询下推）。 */
export function buildTimeBoundCondition(
  tableName: string,
  column: string,
  value: string,
): FilterCondition {
  return createCondition(tableName, column, '>=', value, undefined, 'on');
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /Users/keliang/mypy/duckdb-query/frontend && npx vitest run src/Query/JoinQuery/__tests__/timeBound.test.ts`
Expected: PASS（全部 describe 绿）。

- [ ] **Step 5: 提交**

```bash
cd /Users/keliang/mypy/duckdb-query && git add frontend/src/Query/JoinQuery/timeBound.ts frontend/src/Query/JoinQuery/__tests__/timeBound.test.ts && git commit -m "feat(join): default 30-day value + time-bound condition factory (placement=on)"
```

---

## Task 3: 抑制规则 + 建议构建（纯函数）

**Files:**
- Modify: `frontend/src/Query/JoinQuery/timeBound.ts`
- Test: `frontend/src/Query/JoinQuery/__tests__/timeBound.test.ts`

- [ ] **Step 1: 追加失败测试**

在 `__tests__/timeBound.test.ts` 末尾追加：

```ts
import { buildTimeBoundSuggestions } from '../timeBound';
import { createEmptyGroup, createCondition } from '../FilterBar';

// 构造最小 SelectedTable：buildTimeBoundSuggestions 只用 getTableName / isExternalTable。
// external 表（联邦）形状参考现有用法：source='external' + name。
function externalTable(name: string) {
  return { source: 'external', name, connection: { id: 'c1' } } as any;
}
function localTable(name: string) {
  return { source: 'duckdb', name } as any;
}

const COLS = {
  orders: [
    { name: 'id', type: 'BIGINT' },
    { name: 'create_time', type: 'TIMESTAMP' },
    { name: 'updated_at', type: 'TIMESTAMP' },
  ],
  refunds: [
    { name: 'id', type: 'BIGINT' },
    { name: 'gmt_create', type: 'TIMESTAMP' },
  ],
};

describe('buildTimeBoundSuggestions', () => {
  it('suggests for federated tables with audit time columns, recommended=create', () => {
    const out = buildTimeBoundSuggestions({
      activeTables: [externalTable('orders'), externalTable('refunds')],
      tableColumnsMap: COLS,
      filterTree: createEmptyGroup(),
      joinConfigs: [],
    });
    expect(out).toEqual([
      { tableName: 'orders', candidates: ['create_time', 'updated_at'], recommended: 'create_time' },
      { tableName: 'refunds', candidates: ['gmt_create'], recommended: 'gmt_create' },
    ]);
  });

  it('skips local (non-federated) tables', () => {
    const out = buildTimeBoundSuggestions({
      activeTables: [localTable('orders')],
      tableColumnsMap: COLS,
      filterTree: createEmptyGroup(),
      joinConfigs: [],
    });
    expect(out).toEqual([]);
  });

  it('skips a table whose columns are not loaded', () => {
    const out = buildTimeBoundSuggestions({
      activeTables: [externalTable('orders')],
      tableColumnsMap: {},
      filterTree: createEmptyGroup(),
      joinConfigs: [],
    });
    expect(out).toEqual([]);
  });

  it('suppresses when filterTree already bounds the table on a time column', () => {
    const tree = createEmptyGroup();
    tree.children.push(createCondition('orders', 'create_time', '>=', '2026-01-01 00:00:00', undefined, 'on'));
    const out = buildTimeBoundSuggestions({
      activeTables: [externalTable('orders')],
      tableColumnsMap: COLS,
      filterTree: tree,
      joinConfigs: [],
    });
    expect(out).toEqual([]);
  });

  it('suppresses when a join expression already references a time column', () => {
    const out = buildTimeBoundSuggestions({
      activeTables: [externalTable('orders')],
      tableColumnsMap: COLS,
      filterTree: createEmptyGroup(),
      joinConfigs: [
        { conditions: [{ leftMode: 'expression', leftExpression: 'orders.create_time >= \'2026-01-01\'' }] },
      ],
    });
    expect(out).toEqual([]);
  });

  it('skips self-join (duplicate table names)', () => {
    const out = buildTimeBoundSuggestions({
      activeTables: [externalTable('orders'), externalTable('orders')],
      tableColumnsMap: COLS,
      filterTree: createEmptyGroup(),
      joinConfigs: [],
    });
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/keliang/mypy/duckdb-query/frontend && npx vitest run src/Query/JoinQuery/__tests__/timeBound.test.ts`
Expected: FAIL（`buildTimeBoundSuggestions` 未导出）。

- [ ] **Step 3: 追加实现**

在 `timeBound.ts` 末尾追加：

```ts
const RANGE_OPS = new Set(['=', '>', '>=', '<', '<=', 'BETWEEN']);

/** filterTree 内是否已有针对该表某时间列、范围类运算符的条件。 */
function hasFilterTreeBound(
  tree: FilterGroup,
  tableName: string,
  timeColNames: Set<string>,
): boolean {
  let found = false;
  const walk = (node: any): void => {
    if (found || !node) return;
    if (node.type === 'condition') {
      if (node.table === tableName && timeColNames.has(node.column) && RANGE_OPS.has(node.operator)) {
        found = true;
      }
    } else if (node.type === 'group' && Array.isArray(node.children)) {
      node.children.forEach(walk);
    }
  };
  walk(tree);
  return found;
}

interface ExprJoinCondition {
  leftMode?: string;
  rightMode?: string;
  leftExpression?: string;
  rightExpression?: string;
}
interface ExprJoinConfig {
  conditions?: ExprJoinCondition[];
}

/** joinConfigs 的 expression 条件里是否已提及该表的某时间列（兜底用户手敲的 ON 边界）。 */
function hasExpressionBound(joinConfigs: ExprJoinConfig[], timeColNames: Set<string>): boolean {
  for (const cfg of joinConfigs || []) {
    for (const c of cfg.conditions || []) {
      const exprs = [
        c.leftMode === 'expression' ? c.leftExpression : '',
        c.rightMode === 'expression' ? c.rightExpression : '',
      ];
      for (const e of exprs) {
        const low = (e || '').toLowerCase();
        for (const col of timeColNames) {
          if (low.includes(col.toLowerCase())) return true;
        }
      }
    }
  }
  return false;
}

export interface TimeBoundSuggestion {
  tableName: string;
  candidates: string[];
  recommended: string;
}

export interface TimeBoundContext {
  activeTables: SelectedTable[];
  tableColumnsMap: Record<string, TableColumn[]>;
  filterTree: FilterGroup;
  joinConfigs: ExprJoinConfig[];
}

/** 为联邦大表生成时间边界建议（每表 0/1 条）。 */
export function buildTimeBoundSuggestions(ctx: TimeBoundContext): TimeBoundSuggestion[] {
  const names = (ctx.activeTables || []).map((t) => getTableName(t));
  const dupNames = new Set(names.filter((n, i) => names.indexOf(n) !== i));

  const out: TimeBoundSuggestion[] = [];
  (ctx.activeTables || []).forEach((table) => {
    if (!isExternalTable(table)) return; // 仅联邦表
    const tableName = getTableName(table);
    if (dupNames.has(tableName)) return; // 自连接/重名跳过
    const columns = ctx.tableColumnsMap[tableName];
    if (!columns || columns.length === 0) return; // 列未加载
    const candidates = detectTimeBoundCandidates(columns);
    if (candidates.length === 0) return; // 无审计时间列
    const timeColNames = new Set(columns.filter((c) => isTimeType(c.type)).map((c) => c.name));
    if (hasFilterTreeBound(ctx.filterTree, tableName, timeColNames)) return;
    if (hasExpressionBound(ctx.joinConfigs, timeColNames)) return;
    out.push({ tableName, candidates, recommended: candidates[0] });
  });
  return out;
}
```

> 若 Task 1 曾注释掉 `SelectedTable` / `createCondition` / `FilterCondition` / `FilterGroup` 导入，现在全部启用（本 Task 与 Task 2 均已用到）。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /Users/keliang/mypy/duckdb-query/frontend && npx vitest run src/Query/JoinQuery/__tests__/timeBound.test.ts`
Expected: PASS。

- [ ] **Step 5: 类型检查**

Run: `cd /Users/keliang/mypy/duckdb-query/frontend && npx tsc --noEmit`
Expected: 退出码 0（无错误）。

- [ ] **Step 6: 提交**

```bash
cd /Users/keliang/mypy/duckdb-query && git add frontend/src/Query/JoinQuery/timeBound.ts frontend/src/Query/JoinQuery/__tests__/timeBound.test.ts && git commit -m "feat(join): build time-bound suggestions with suppression + self-join/local skip"
```

---

## Task 4: 下推链路集成测试（钉死"走子查询"的核心要求）

**Files:**
- Test: `frontend/src/Query/JoinQuery/__tests__/timeBound.test.ts`

> 这是验证 spec 核心约束的关键测试：插入的条件必须能被 `getOnConditionsTreeForTable` 取出、并由 `generateFilterSQLForSubquery` 渲染进该表子查询的 WHERE。

- [ ] **Step 1: 追加失败测试**

在 `__tests__/timeBound.test.ts` 末尾追加：

```ts
import { getOnConditionsTreeForTable, generateFilterSQLForSubquery } from '../FilterBar';

describe('time-bound condition flows into the per-table ON subquery pushdown', () => {
  it('getOnConditionsTreeForTable picks it up and renders into subquery WHERE', () => {
    const tree = createEmptyGroup();
    tree.children.push(buildTimeBoundCondition('orders', 'create_time', '2026-05-01 00:00:00'));

    const onTree = getOnConditionsTreeForTable(tree, 'orders');
    expect(onTree.children.length).toBe(1);

    const sql = generateFilterSQLForSubquery(onTree);
    expect(sql).toContain('create_time');
    expect(sql).toMatch(/>=\s*'2026-05-01 00:00:00'/); // 生成器自动加了引号
  });

  it('does not leak the on-placed condition to a different table', () => {
    const tree = createEmptyGroup();
    tree.children.push(buildTimeBoundCondition('orders', 'create_time', '2026-05-01 00:00:00'));
    const other = getOnConditionsTreeForTable(tree, 'refunds');
    expect(other.children.length).toBe(0);
  });
});
```

- [ ] **Step 2: 跑测试**

Run: `cd /Users/keliang/mypy/duckdb-query/frontend && npx vitest run src/Query/JoinQuery/__tests__/timeBound.test.ts`
Expected: 若 `getOnConditionsTreeForTable` 的 ON 树 SQL 渲染需要别名前缀等细节导致断言不符，按**实际输出**微调断言（仅放宽到 `toContain('create_time')` 与包含 `2026-05-01`），但**必须保留** "条件进入了 `orders` 的 ON 树、且不泄漏到 `refunds`" 这两条核心断言。最终 Expected: PASS。

> 实现者注：本 Task 不改任何源码，纯测试。若第一次运行即通过，跳过调整直接提交。

- [ ] **Step 3: 提交**

```bash
cd /Users/keliang/mypy/duckdb-query && git add frontend/src/Query/JoinQuery/__tests__/timeBound.test.ts && git commit -m "test(join): assert time-bound condition routes into per-table ON subquery pushdown"
```

---

## Task 5: i18n 文案

**Files:**
- Modify: `frontend/src/i18n/locales/zh/common.json`
- Modify: `frontend/src/i18n/locales/en/common.json`

- [ ] **Step 1: 找到 `query.join` 节点（若无则在 `query` 下新增）**

Run: `cd /Users/keliang/mypy/duckdb-query/frontend && npx --yes node -e "const z=require('./src/i18n/locales/zh/common.json'); console.log('query keys:', Object.keys(z.query||{}).join(','));"`
Expected: 打印 `query` 下的现有子键（用于确认 `join` 是否已存在、缩进风格）。

- [ ] **Step 2: 在 zh/common.json 的 `query` 对象内加入 `join.timeBound`**

在 `zh/common.json` 的 `"query"` 对象内（与其它 `query.*` 子键并列）加入（若已存在 `"join"` 子对象，则把 `timeBound` 并入其中）：

```json
"join": {
  "timeBound": {
    "chip": "近30天",
    "tooltip": "给该联邦大表的 {{column}} 加近30天范围（落 ON、下推到远端，减少抽取量、避免超时）",
    "addAll": "全部限定近30天",
    "pickColumn": "选择时间列"
  }
}
```

- [ ] **Step 3: 在 en/common.json 的 `query` 对象内加入对应英文**

```json
"join": {
  "timeBound": {
    "chip": "Last 30 days",
    "tooltip": "Add a last-30-days bound on {{column}} for this federated table (placed in ON, pushed down to reduce extraction and avoid timeouts)",
    "addAll": "Bound all to last 30 days",
    "pickColumn": "Pick time column"
  }
}
```

- [ ] **Step 4: 校验 JSON 合法**

Run: `cd /Users/keliang/mypy/duckdb-query/frontend && npx --yes node -e "require('./src/i18n/locales/zh/common.json'); require('./src/i18n/locales/en/common.json'); console.log('json ok');"`
Expected: 打印 `json ok`（无解析异常）。

- [ ] **Step 5: 提交**

```bash
cd /Users/keliang/mypy/duckdb-query && git add frontend/src/i18n/locales/zh/common.json frontend/src/i18n/locales/en/common.json && git commit -m "feat(join): i18n strings for time-bound recommendation (zh/en)"
```

---

## Task 6: `TimeBoundChip` 展示组件

**Files:**
- Create: `frontend/src/Query/JoinQuery/TimeBoundChip.tsx`
- Test: `frontend/src/Query/JoinQuery/__tests__/TimeBoundChip.test.tsx`

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/Query/JoinQuery/__tests__/TimeBoundChip.test.tsx`：

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TimeBoundChip } from '../TimeBoundChip';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, d?: string) => d ?? _k,
    i18n: { language: 'zh' },
  }),
}));

describe('TimeBoundChip', () => {
  it('single candidate: clicking adds the recommended column', () => {
    const onAdd = vi.fn();
    render(
      <TimeBoundChip tableName="orders" recommended="create_time" candidates={['create_time']} onAdd={onAdd} />,
    );
    fireEvent.click(screen.getByTestId('time-bound-chip-orders'));
    expect(onAdd).toHaveBeenCalledWith('create_time');
  });

  it('multiple candidates: can pick a non-default column', () => {
    const onAdd = vi.fn();
    render(
      <TimeBoundChip
        tableName="orders"
        recommended="create_time"
        candidates={['create_time', 'updated_at']}
        onAdd={onAdd}
      />,
    );
    // 打开下拉
    fireEvent.click(screen.getByTestId('time-bound-chip-menu-orders'));
    // 选择 updated_at
    fireEvent.click(screen.getByText('updated_at'));
    expect(onAdd).toHaveBeenCalledWith('updated_at');
  });

  it('shows the recommended column name', () => {
    render(
      <TimeBoundChip tableName="orders" recommended="create_time" candidates={['create_time']} onAdd={() => {}} />,
    );
    expect(screen.getByTestId('time-bound-chip-orders').textContent).toContain('create_time');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/keliang/mypy/duckdb-query/frontend && npx vitest run src/Query/JoinQuery/__tests__/TimeBoundChip.test.tsx`
Expected: FAIL（无法解析 `../TimeBoundChip`）。

- [ ] **Step 3: 写实现**

创建 `frontend/src/Query/JoinQuery/TimeBoundChip.tsx`：

```tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, ChevronDown } from 'lucide-react';

export interface TimeBoundChipProps {
  tableName: string;
  recommended: string;
  candidates: string[];
  onAdd: (column: string) => void;
}

/**
 * 联邦大表时间边界推荐芯片（展示组件）。
 * 单候选：点击即加 recommended。多候选：caret 打开候选列表，点列名加该列。
 */
export const TimeBoundChip: React.FC<TimeBoundChipProps> = ({
  tableName,
  recommended,
  candidates,
  onAdd,
}) => {
  const { t } = useTranslation('common');
  const [open, setOpen] = React.useState(false);
  const hasMultiple = candidates.length > 1;

  return (
    <div className="relative inline-flex items-center gap-1 my-1">
      <button
        type="button"
        data-testid={`time-bound-chip-${tableName}`}
        onClick={() => onAdd(recommended)}
        title={t('query.join.timeBound.tooltip', '给该表加近30天范围（落 ON 下推）').replace('{{column}}', recommended)}
        className="inline-flex items-center gap-1 rounded-full border border-warning/50 bg-warning/10 px-2 py-0.5 text-xs text-warning hover:bg-warning/20"
      >
        <Clock className="h-3 w-3" />
        <span>{t('query.join.timeBound.chip', '近30天')}</span>
        <span className="opacity-70">· {recommended}</span>
      </button>

      {hasMultiple && (
        <>
          <button
            type="button"
            data-testid={`time-bound-chip-menu-${tableName}`}
            onClick={() => setOpen((v) => !v)}
            aria-label={t('query.join.timeBound.pickColumn', '选择时间列')}
            className="rounded border border-border px-1 py-0.5 text-xs hover:bg-surface-hover"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
          {open && (
            <div className="absolute top-full left-0 z-10 mt-1 min-w-32 rounded-md border border-border bg-surface shadow-md">
              {candidates.map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onAdd(col);
                  }}
                  className="block w-full px-3 py-1 text-left text-xs hover:bg-surface-hover"
                >
                  {col}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
```

> 实现者注：`lucide-react` 已是项目依赖（其它组件在用）。若 `Clock`/`ChevronDown` 名称不符，用本仓库已用的等价图标替换，不影响逻辑与测试（测试不依赖图标）。className 用了项目既有的 token（`warning`/`border`/`surface-hover`）；若某 token 不存在，用相邻组件实际在用的类名替换，视觉不是验收点。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /Users/keliang/mypy/duckdb-query/frontend && npx vitest run src/Query/JoinQuery/__tests__/TimeBoundChip.test.tsx`
Expected: PASS（3 个用例绿）。

- [ ] **Step 5: 提交**

```bash
cd /Users/keliang/mypy/duckdb-query && git add frontend/src/Query/JoinQuery/TimeBoundChip.tsx frontend/src/Query/JoinQuery/__tests__/TimeBoundChip.test.tsx && git commit -m "feat(join): TimeBoundChip presentational component (single + multi-candidate)"
```

---

## Task 7: 接入 `JoinQueryPanel`

**Files:**
- Modify: `frontend/src/Query/JoinQuery/JoinQueryPanel.tsx`

> 说明：芯片渲染在**每张表卡下方**（loop 内、连接器之前），这样每表一个、统一覆盖最左表 t0，无需向 memo 化的 `MemoizedJoinConnector` 透传 props（更低风险）。

- [ ] **Step 1: 加导入**

在 `JoinQueryPanel.tsx` 顶部 import 区（与其它 `./` 相对导入并列）加入：

```ts
import { TimeBoundChip } from './TimeBoundChip';
import {
  buildTimeBoundSuggestions,
  defaultTimeBoundValue,
  buildTimeBoundCondition,
  type TimeBoundSuggestion,
} from './timeBound';
```

- [ ] **Step 2: 计算建议 + 处理函数**

在组件函数体内、`filterTree` 状态（约 `:1194`）与 `tableColumnsMap`（约 `:1211-1222`）之后，加入：

```ts
const timeBoundSuggestions = React.useMemo(
  () =>
    buildTimeBoundSuggestions({
      activeTables,
      tableColumnsMap,
      filterTree,
      joinConfigs,
    }),
  [activeTables, tableColumnsMap, filterTree, joinConfigs],
);

const timeBoundByTable = React.useMemo(() => {
  const m: Record<string, TimeBoundSuggestion> = {};
  timeBoundSuggestions.forEach((s) => {
    m[s.tableName] = s;
  });
  return m;
}, [timeBoundSuggestions]);

const handleAddTimeBound = React.useCallback((tableName: string, column: string) => {
  const node = buildTimeBoundCondition(tableName, column, defaultTimeBoundValue());
  setFilterTree((prev) => ({ ...prev, children: [...prev.children, node] }));
}, []);

const handleAddAllTimeBounds = React.useCallback(() => {
  const nodes = timeBoundSuggestions.map((s) =>
    buildTimeBoundCondition(s.tableName, s.recommended, defaultTimeBoundValue()),
  );
  setFilterTree((prev) => ({ ...prev, children: [...prev.children, ...nodes] }));
}, [timeBoundSuggestions]);
```

- [ ] **Step 3: 在表卡下方渲染芯片**

在渲染循环里，紧跟表卡组件（约 `:2038` 的 `/>` 之后、`{/* JOIN 连接器 */}` 约 `:2039` 之前）插入（`tableName` 已在该 `.map` 回调作用域内）：

```tsx
{timeBoundByTable[tableName] && (
  <TimeBoundChip
    tableName={tableName}
    recommended={timeBoundByTable[tableName].recommended}
    candidates={timeBoundByTable[tableName].candidates}
    onAdd={(col) => handleAddTimeBound(tableName, col)}
  />
)}
```

- [ ] **Step 4: "全部添加"按钮（≥2 张表时）**

在 FilterBar 区块（约 `:2059` 的 `{activeTables.length > 0 && (`）之前插入：

```tsx
{timeBoundSuggestions.length >= 2 && (
  <button
    type="button"
    onClick={handleAddAllTimeBounds}
    className="mb-2 inline-flex items-center gap-1 rounded-md border border-warning/50 bg-warning/10 px-2 py-1 text-xs text-warning hover:bg-warning/20"
  >
    {t('query.join.timeBound.addAll', '全部限定近30天')} ({timeBoundSuggestions.length})
  </button>
)}
```

- [ ] **Step 5: 类型检查**

Run: `cd /Users/keliang/mypy/duckdb-query/frontend && npx tsc --noEmit`
Expected: 退出码 0。若报 `t` 未定义，确认组件内已有 `const { t } = useTranslation('common')`（既有代码已在用 `t`，见 `:852` 等同名用法的同一组件）——本组件顶层应已有 `t`；若没有则复用现有的 `useTranslation` 实例，勿重复声明。

- [ ] **Step 6: 跑相关单测 + 构建**

Run: `cd /Users/keliang/mypy/duckdb-query/frontend && npx vitest run src/Query/JoinQuery/__tests__/ && npm run build`
Expected: 测试全绿；`npm run build` 成功（退出码 0）。

- [ ] **Step 7: 提交**

```bash
cd /Users/keliang/mypy/duckdb-query && git add frontend/src/Query/JoinQuery/JoinQueryPanel.tsx && git commit -m "feat(join): wire time-bound chips + add-all into JoinQueryPanel"
```

---

## Task 8: 全量回归 + 收尾

**Files:** 无（仅验证）

- [ ] **Step 1: 前端类型 + 全量单测 + 构建**

Run: `cd /Users/keliang/mypy/duckdb-query/frontend && npx tsc --noEmit && npx vitest run && npm run build`
Expected: tsc 退出码 0；vitest 全绿（注意：`federatedJoin.test.ts` 历史上有偶发属性测试 flake，与本特性无关——若仅它失败，单独重跑确认）；build 成功。

- [ ] **Step 2: 手动核验清单（需起前端，人工点）**

记录到提交说明或留待用户：
1. JOIN 两张联邦表（含 create/update 列）→ 两张表卡下各出现 `⏱ 近30天 · <列>` 芯片 + 顶部"全部限定近30天 (2)"。
2. 点单个芯片 → FilterBar 出现一条该表的 ON 时间条件 → 芯片消失 → SQL 预览里该表子查询含 `>= '...'`。
3. 多候选表的芯片 caret → 选 `updated_at` → 加的是 updated_at。
4. 本地（非联邦）表、无审计时间列的表、已手动加过时间边界的表 → 不出芯片。
5. 自连接（同名两次）→ 不出芯片。

- [ ] **Step 3: 完成分支**

调用 finishing-a-development-branch 技能收尾（合并策略由用户定）。

---

## Self-Review（计划自审）

- **Spec 覆盖**：§3 机制→Task 2/4；§4 检测/候选/抑制→Task 1/3；§5 一律 ON→Task 2（`buildTimeBoundCondition` 固定 'on'）；§6 插入→Task 7；§7 默认值裸串→Task 2；§8 UI/多候选/全部添加→Task 6/7；§9 i18n→Task 5；§10 测试→Task 1-4/6 + Task 8 手动；§12 边界（语义列不推/类型门槛/多列/自连接/非联邦/列加载/value 引号/已有边界抑制）→Task 1/3/4/6。无遗漏。
- **占位符扫描**：无 TBD/TODO；每个改码步骤均含完整代码与命令。
- **类型一致**：`TimeBoundSuggestion {tableName,candidates,recommended}` 在 Task 3 定义、Task 6/7 一致使用；`buildTimeBoundCondition`/`defaultTimeBoundValue`/`buildTimeBoundSuggestions` 命名跨 Task 一致；`createCondition` 签名与 `FilterBar` 实参顺序一致（table,column,operator,value,value2?,placement）。
- **风险标注**：Task 4 用导出的 `getOnConditionsTreeForTable`/`generateFilterSQLForSubquery` 钉死"走子查询下推"；t0 是否各自建子查询的运行时假设由手动核验清单第 2 条覆盖。
