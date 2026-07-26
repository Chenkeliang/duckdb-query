/**
 * 智能体「问数范围」(作用域)的单一事实来源。
 *
 * 背景:抽屉此前有两条互不相通的路径——左侧树选表推导 attach_databases,@ 提及只查本地表,
 * 且传给后端的表名经 getTableName 丢掉了连接别名。结果就是"选了远端表却查不到"。
 * 这里把两者统一成一种引用:本地表用裸名,远端表用 `alias.table` / `alias.schema.table`
 * (与 SQL 编辑器、后端 guard、目录注入完全同形),并由同一份状态导出请求参数与界面 chip。
 */

import { getDuckDBTables } from '@/api';
import { listConnectionTablesFlat } from '@/api/databaseSchemasApi';
import { generateDatabaseAlias } from '@/utils/sqlUtils';

/** 一个数据源在本轮问数中的授权条目。 */
export interface ScopeEntry {
  /** 'local' 或连接 id */
  id: string;
  kind: 'local' | 'connection';
  /** 展示名:本地 DuckDB / 连接名 */
  label: string;
  /** 连接类型(mysql/postgresql/sqlite/duckdb),用于配色与副标题 */
  dbType?: string;
  /** 连接专用:SQL 中使用的别名,与编辑器 generateDatabaseAlias 同源 */
  alias?: string;
  connectionId?: string;
  /** all=整库(表清单由后端目录注入);tables=只授权选中的表 */
  mode: 'all' | 'tables';
  /** mode==='tables' 时的表引用(本地裸名 / 远端限定名) */
  tables: string[];
}

export interface ScopeCandidate {
  /** 插入对话与发给后端的引用名 */
  ref: string;
  /** 列表里展示的短名 */
  display: string;
  sourceId: string;
  sourceLabel: string;
  kind: 'local' | 'connection';
  dbType?: string;
  rowCount?: number;
}

export interface ConnectionLite {
  id: string;
  name: string;
  type: string;
}

export const LOCAL_SOURCE_ID = 'local';

export function localEntry(tables: string[] = [], mode?: 'all' | 'tables'): ScopeEntry {
  // 缺省语义:一张没勾 = 整个 DuckDB 可问;勾了才收紧成"只问这几张"
  const resolved = mode ?? (tables.length ? 'tables' : 'all');
  return { id: LOCAL_SOURCE_ID, kind: 'local', label: '本地 DuckDB', mode: resolved, tables };
}

export function connectionEntry(
  conn: ConnectionLite,
  mode: 'all' | 'tables' = 'all',
  tables: string[] = [],
): ScopeEntry {
  return {
    id: conn.id,
    kind: 'connection',
    label: conn.name,
    dbType: conn.type,
    alias: generateDatabaseAlias({ id: conn.id, name: conn.name, type: conn.type } as never),
    connectionId: conn.id,
    mode,
    tables,
  };
}

/**
 * 由作用域导出 Agent 请求参数。
 * - attach_databases:每个连接条目授权一次(整库或选表都需要,否则 guard 会拒)
 * - tables:仅"选表"模式下给出;整库模式交由后端目录注入,避免把上千表名塞进请求
 */
export interface AgentScopePayload {
  local_mode: 'all' | 'tables' | 'none';
  local_tables: string[];
  /** 别名 → 选中表名(不含别名前缀);未列出的别名 = 该库整库 */
  alias_tables: Record<string, string[]>;
}

export function buildAgentScopeContext(entries: ScopeEntry[]): {
  tables: string[];
  attachDatabases: { alias: string; connectionId: string }[];
  scope: AgentScopePayload;
} {
  const tables: string[] = [];
  const attachDatabases: { alias: string; connectionId: string }[] = [];
  const local = entries.find((e) => e.kind === 'local');
  const aliasTables: Record<string, string[]> = {};
  for (const e of entries) {
    if (e.kind === 'connection' && e.alias && e.connectionId) {
      attachDatabases.push({ alias: e.alias, connectionId: e.connectionId });
      // 选表模式才逐表收窄;全库模式不列入 alias_tables(后端据此保持整库)
      if (e.mode === 'tables') {
        aliasTables[e.alias] = e.tables.map((t) => stripAlias(e.alias as string, t));
      }
    }
    if (e.mode === 'tables') tables.push(...e.tables);
  }
  return {
    tables: Array.from(new Set(tables)),
    attachDatabases,
    scope: {
      // 本地不在 entries 里 = 用户把它移出了范围 → 后端一张本地表都不放行
      local_mode: !local ? 'none' : local.mode === 'all' ? 'all' : 'tables',
      local_tables: local && local.mode === 'tables' ? [...local.tables] : [],
      alias_tables: aliasTables,
    },
  };
}

/** 去掉限定名的别名前缀,只留后端 guard 比对用的表名(alias.schema.table → schema.table)。 */
export function stripAlias(alias: string, ref: string): string {
  const prefix = `${alias.toLowerCase()}.`;
  return ref.toLowerCase().startsWith(prefix) ? ref.slice(prefix.length) : ref;
}

/** chip 文案:整库标表数,选表标张数。 */
export function scopeChipLabel(entry: ScopeEntry, tableCount?: number): string {
  if (entry.mode === 'all') {
    const whole = entry.kind === 'local' ? '全部' : '全库';
    return tableCount != null
      ? `${entry.label} · ${whole}(${tableCount})`
      : `${entry.label} · ${whole}`;
  }
  // 选表模式下的空集是真实状态(用户清空了勾选),照实说,别装成"整库可问"
  if (!entry.tables.length) return `${entry.label} · 未选表`;
  return `${entry.label} · ${entry.tables.length} 张表`;
}

/** 把远端表名拼成带别名的限定名;已带别名前缀的原样返回。 */
export function qualifyRemoteTable(alias: string, rawName: string): string {
  const name = (rawName || '').trim();
  if (!name) return '';
  return name.toLowerCase().startsWith(`${alias.toLowerCase()}.`) ? name : `${alias}.${name}`;
}

/**
 * @ 候选:本地表 + 各连接的表(限定名)。单个连接失败不影响其余来源。
 * 远端表清单直接来自连接自身的元数据接口——只读结构,不加载任何数据行。
 */
export async function loadScopeCandidates(
  connections: ConnectionLite[],
): Promise<ScopeCandidate[]> {
  const out: ScopeCandidate[] = [];
  const localPromise = getDuckDBTables()
    .then((tables) =>
      tables.map<ScopeCandidate>((t) => ({
        ref: t.name,
        display: t.name,
        sourceId: LOCAL_SOURCE_ID,
        sourceLabel: '本地 DuckDB',
        kind: 'local',
        rowCount: (t as { row_count?: number }).row_count,
      })),
    )
    .catch(() => [] as ScopeCandidate[]);

  const remotePromises = connections.map((conn) => {
    const alias = generateDatabaseAlias({ id: conn.id, name: conn.name, type: conn.type } as never);
    return listConnectionTablesFlat(conn.id)
      .then((tables) =>
        tables.map<ScopeCandidate>((t) => ({
          ref: qualifyRemoteTable(alias, t.name),
          display: t.name,
          sourceId: conn.id,
          sourceLabel: conn.name,
          kind: 'connection',
          dbType: conn.type,
          rowCount: t.row_count,
        })),
      )
      .catch(() => [] as ScopeCandidate[]);
  });

  const groups = await Promise.all([localPromise, ...remotePromises]);
  for (const g of groups) out.push(...g);
  return out;
}

/**
 * 从最终 SQL 里推断这条查询碰了哪些数据源(用于"跨源查询"徽标)。
 * 只按限定名前缀识别:出现 `alias.` 前缀记为该别名,出现裸表名记为本地。
 */
export function sqlSourcesFrom(sql: string, aliases: string[]): string[] {
  const text = sql || '';
  const found: string[] = [];
  for (const alias of aliases) {
    const re = new RegExp(`(^|[^\\w.])${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.`, 'i');
    if (re.test(text)) found.push(alias);
  }
  // 去掉带别名前缀的引用后仍有 FROM/JOIN 目标 → 说明也用到了本地表
  const stripped = aliases.reduce(
    (acc, a) => acc.replace(new RegExp(`\\b${a}\\.[\\w".]+`, 'gi'), ' '),
    text,
  );
  if (/\b(from|join)\s+["\w]/i.test(stripped)) found.unshift('本地 DuckDB');
  return found;
}

/** 选中一个候选后的新作用域:远端表会自动把它所属连接加入授权(修"选了却查不到")。 */
export function addCandidateToScope(
  entries: ScopeEntry[],
  cand: ScopeCandidate,
  connections: ConnectionLite[],
): ScopeEntry[] {
  const next = entries.map((e) => ({ ...e, tables: [...e.tables] }));
  let entry = next.find((e) => e.id === cand.sourceId);
  if (!entry) {
    if (cand.kind === 'local') {
      entry = localEntry([]);
    } else {
      const conn = connections.find((c) => c.id === cand.sourceId);
      if (!conn) return entries;
      entry = connectionEntry(conn, 'tables', []);
    }
    next.push(entry);
  }
  if (entry.mode === 'all') {
    // 用户点名了具体表 = 想收窄到它,而不是"反正整库都能查"。静默不动会让人
    // 以为 @ 没生效(实测反馈),这里显式切成选表模式。
    entry.mode = 'tables';
    entry.tables = [];
  }
  if (!entry.tables.includes(cand.ref)) entry.tables.push(cand.ref);
  return next;
}


/** 从作用域里移除一张表(@ 加错了不必整源重来)。移光后停在"未选表"。 */
export function removeTableFromScope(entries: ScopeEntry[], sourceId: string, ref: string): ScopeEntry[] {
  return entries.map((e) =>
    e.id === sourceId ? { ...e, mode: 'tables', tables: e.tables.filter((t) => t !== ref) } : e,
  );
}

/** 切换某个来源的"全部/全库 ↔ 选表"。切到选表时清空,由用户明确勾选。 */
export function setSourceMode(
  entries: ScopeEntry[],
  sourceId: string,
  mode: 'all' | 'tables',
): ScopeEntry[] {
  return entries.map((e) =>
    e.id === sourceId ? { ...e, mode, tables: mode === 'all' ? [] : e.tables } : e,
  );
}

/** 勾/取消一张表(编辑器里的复选框)。 */
export function toggleTableInScope(
  entries: ScopeEntry[],
  sourceId: string,
  ref: string,
): ScopeEntry[] {
  return entries.map((e) => {
    if (e.id !== sourceId) return e;
    const has = e.tables.includes(ref);
    return {
      ...e,
      mode: 'tables' as const,
      tables: has ? e.tables.filter((t) => t !== ref) : [...e.tables, ref],
    };
  });
}


/**
 * 单个来源的表清单(范围编辑器展开时才拉,按来源缓存)。
 * 与 loadScopeCandidates 的差别:这里**不吞异常**——拉失败要让那一行显示
 * "读取失败,点此重试",而不是渲染成空清单让人以为这个库没有表。
 */
export async function loadSourceTables(
  entry: ScopeEntry,
  connections: ConnectionLite[],
): Promise<ScopeCandidate[]> {
  if (entry.kind === 'local') {
    const tables = await getDuckDBTables();
    return tables.map<ScopeCandidate>((t) => ({
      ref: t.name,
      display: t.name,
      sourceId: LOCAL_SOURCE_ID,
      sourceLabel: '本地 DuckDB',
      kind: 'local',
      rowCount: (t as { row_count?: number }).row_count,
    }));
  }
  const conn = connections.find((c) => c.id === entry.id);
  const alias = entry.alias
    || (conn ? generateDatabaseAlias({ id: conn.id, name: conn.name, type: conn.type } as never) : '');
  const tables = await listConnectionTablesFlat(entry.id);
  return tables.map<ScopeCandidate>((t) => ({
    ref: qualifyRemoteTable(alias, t.name),
    display: t.name,
    sourceId: entry.id,
    sourceLabel: entry.label,
    kind: 'connection',
    dbType: entry.dbType,
    rowCount: t.row_count,
  }));
}

/**
 * @ 候选按来源配额取前 N 条。
 * 修实测缺陷:此前先本地后远端再统一 slice(50),本机 53 张本地表就把名额吃光,
 * 远端分组永远渲染不出来——"@ 支持远程表"名存实亡。
 */
export function quotaBySource(
  candidates: ScopeCandidate[],
  perSource: number,
): { items: ScopeCandidate[]; overflow: Record<string, number> } {
  const seen: Record<string, number> = {};
  const overflow: Record<string, number> = {};
  const items: ScopeCandidate[] = [];
  for (const c of candidates) {
    const n = seen[c.sourceId] || 0;
    if (n < perSource) {
      items.push(c);
      seen[c.sourceId] = n + 1;
    } else {
      overflow[c.sourceId] = (overflow[c.sourceId] || 0) + 1;
    }
  }
  return { items, overflow };
}
