/**
 * 作用域单一事实来源:导出的请求参数必须让"本地 + 远端"同时可查。
 * 回归此前的根因——远端表经 getTableName 丢别名、attach_databases 与选表两条路径不一致。
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/api', () => ({ getDuckDBTables: vi.fn() }));
vi.mock('@/api/databaseSchemasApi', () => ({ listConnectionTablesFlat: vi.fn() }));

import {
  addCandidateToScope,
  buildAgentScopeContext,
  connectionEntry,
  localEntry,
  qualifyRemoteTable,
  quotaBySource,
  removeTableFromScope,
  scopeChipLabel,
  setSourceMode,
  toggleTableInScope,
  type ScopeCandidate,
} from '../agentScope';

const SORDER = { id: 'db_sorder', name: 'SORDER', type: 'mysql' };

describe('agentScope', () => {
  it('derives the same alias the SQL editor uses', () => {
    expect(connectionEntry(SORDER).alias).toBe('mysql_sorder');
  });

  it('authorizes the connection even when the whole database is in scope', () => {
    const ctx = buildAgentScopeContext([localEntry(['orders']), connectionEntry(SORDER, 'all')]);
    // 整库:授权别名但不逐表列出(表清单由后端目录注入)
    expect(ctx.attachDatabases).toEqual([{ alias: 'mysql_sorder', connectionId: 'db_sorder' }]);
    expect(ctx.tables).toEqual(['orders']);
  });

  it('keeps the alias on remote tables so the agent can actually query them', () => {
    const ctx = buildAgentScopeContext([
      localEntry(['agent_eval_orders']),
      connectionEntry(SORDER, 'tables', ['mysql_sorder.crm_order']),
    ]);
    expect(ctx.tables).toContain('mysql_sorder.crm_order'); // 关键:别名不能被丢掉
    expect(ctx.tables).toContain('agent_eval_orders');
    expect(ctx.attachDatabases).toHaveLength(1);
  });

  it('picking a remote table auto-authorizes its connection', () => {
    const cand: ScopeCandidate = {
      ref: 'mysql_sorder.crm_order',
      display: 'crm_order',
      sourceId: 'db_sorder',
      sourceLabel: 'SORDER',
      kind: 'connection',
    };
    const next = addCandidateToScope([localEntry([])], cand, [SORDER]);
    const ctx = buildAgentScopeContext(next);
    expect(ctx.attachDatabases).toEqual([{ alias: 'mysql_sorder', connectionId: 'db_sorder' }]);
    expect(ctx.tables).toEqual(['mysql_sorder.crm_order']);
  });

  it('does not duplicate a table picked twice', () => {
    const cand: ScopeCandidate = {
      ref: 'mysql_sorder.crm_order', display: 'crm_order',
      sourceId: 'db_sorder', sourceLabel: 'SORDER', kind: 'connection',
    };
    let entries = addCandidateToScope([], cand, [SORDER]);
    entries = addCandidateToScope(entries, cand, [SORDER]);
    expect(buildAgentScopeContext(entries).tables).toEqual(['mysql_sorder.crm_order']);
  });

  it('keeps three-part names untouched (PostgreSQL schemas)', () => {
    expect(qualifyRemoteTable('pg_main', 'public.orders')).toBe('pg_main.public.orders');
    expect(qualifyRemoteTable('pg_main', 'pg_main.public.orders')).toBe('pg_main.public.orders');
  });

  it('labels chips by mode', () => {
    expect(scopeChipLabel(connectionEntry(SORDER, 'all'), 128)).toBe('SORDER · 全库(128)');
    expect(scopeChipLabel(connectionEntry(SORDER, 'tables', ['a', 'b']))).toBe('SORDER · 2 张表');
    // 一张没勾 = 整个 DuckDB 可问,chip 必须说清是"全部"而不是留白让人猜
    expect(scopeChipLabel(localEntry([]))).toBe('本地 DuckDB · 全部');
    // 选表模式下清空 = 真的没表可查(空集),照实说,别装成"整库可问"
    expect(scopeChipLabel(localEntry([], 'tables'))).toBe('本地 DuckDB · 未选表');
  });
});

describe('sqlSourcesFrom', () => {
  it('flags a cross-source query (local × remote)', async () => {
    const { sqlSourcesFrom } = await import('../agentScope');
    const sql = 'SELECT * FROM agent_eval_orders o JOIN mysql_sorder.store_order.crm_order m ON 1=1';
    expect(sqlSourcesFrom(sql, ['mysql_sorder'])).toEqual(['本地 DuckDB', 'mysql_sorder']);
  });

  it('flags a remote-only query without claiming local', async () => {
    const { sqlSourcesFrom } = await import('../agentScope');
    const sql = 'SELECT count(*) FROM mysql_sorder.store_order.crm_order';
    expect(sqlSourcesFrom(sql, ['mysql_sorder'])).toEqual(['mysql_sorder']);
  });

  it('local-only query lists just the local source', async () => {
    const { sqlSourcesFrom } = await import('../agentScope');
    expect(sqlSourcesFrom('SELECT * FROM orders', ['mysql_sorder'])).toEqual(['本地 DuckDB']);
  });
});

// ---- 范围即边界:请求里的 scope 必须如实描述用户的勾选(2026-07-26) ----

describe('buildAgentScopeContext scope payload', () => {
  it('一张没勾 = local_mode all(整库可问,不逐表限制)', () => {
    const { scope, tables } = buildAgentScopeContext([localEntry([])]);
    expect(scope.local_mode).toBe('all');
    expect(scope.local_tables).toEqual([]);
    expect(tables).toEqual([]);
  });

  it('勾了表 = local_mode tables + 表名(后端据此裁目录、闸拒越界)', () => {
    const { scope, tables } = buildAgentScopeContext([localEntry(['orders', 'refunds'])]);
    expect(scope.local_mode).toBe('tables');
    expect(scope.local_tables).toEqual(['orders', 'refunds']);
    expect(tables).toEqual(['orders', 'refunds']);
  });

  it('本地被移出 = local_mode none(纯对话,一张本地表都不放行)', () => {
    const { scope } = buildAgentScopeContext([connectionEntry(SORDER, 'all')]);
    expect(scope.local_mode).toBe('none');
  });

  it('连接全库不进 alias_tables;选表则按别名给出去前缀的表名', () => {
    const whole = buildAgentScopeContext([connectionEntry(SORDER, 'all')]);
    expect(whole.scope.alias_tables).toEqual({});
    // 别名由 generateDatabaseAlias 产出(与 SQL 编辑器同源),这里是 mysql_sorder
    const alias = connectionEntry(SORDER, 'all').alias as string;
    const picked = buildAgentScopeContext([
      connectionEntry(SORDER, 'tables', [`${alias}.crm_order`, `${alias}.iget_order`]),
    ]);
    expect(picked.scope.alias_tables).toEqual({ [alias]: ['crm_order', 'iget_order'] });
  });
});

describe('mention 候选配额', () => {
  const cand = (sourceId: string, n: number): ScopeCandidate[] =>
    Array.from({ length: n }, (_, i) => ({
      ref: `${sourceId}.t${i}`, display: `t${i}`, sourceId,
      sourceLabel: sourceId, kind: sourceId === 'local' ? 'local' : 'connection',
    }));

  it('按来源配额,表多的来源不再吃光名额把别的来源挤没', () => {
    // 实测缺陷:本机 53 张本地表 + 统一 slice(50) → 远端分组永远渲染不出来
    const all = [...cand('local', 53), ...cand('db', 10)];
    const { items, overflow } = quotaBySource(all, 8);
    expect(items.filter((c) => c.sourceId === 'local')).toHaveLength(8);
    expect(items.filter((c) => c.sourceId === 'db')).toHaveLength(8);
    expect(overflow).toEqual({ local: 45, db: 2 });
  });
});

describe('作用域增删', () => {
  it('@ 选中已是全库的连接的某张表 → 切成选表并勾上(不再静默无反应)', () => {
    const entries = [connectionEntry(SORDER, 'all')];
    const next = addCandidateToScope(entries, {
      ref: 'sorder.crm_order', display: 'crm_order', sourceId: SORDER.id,
      sourceLabel: 'SORDER', kind: 'connection',
    }, [SORDER]);
    expect(next[0].mode).toBe('tables');
    expect(next[0].tables).toEqual(['sorder.crm_order']);
  });

  it('移除单张表后停在"未选表",不整源消失', () => {
    const entries = [localEntry(['a', 'b'])];
    const next = removeTableFromScope(entries, 'local', 'a');
    expect(next[0].tables).toEqual(['b']);
    expect(next).toHaveLength(1);
  });

  it('切回全库会清空已选表,避免"看着是全库、其实还带着旧清单"', () => {
    const next = setSourceMode([localEntry(['a', 'b'])], 'local', 'all');
    expect(next[0]).toMatchObject({ mode: 'all', tables: [] });
  });

  it('toggleTableInScope 勾/取消同一张表', () => {
    const on = toggleTableInScope([localEntry([])], 'local', 'a');
    expect(on[0]).toMatchObject({ mode: 'tables', tables: ['a'] });
    const off = toggleTableInScope(on, 'local', 'a');
    expect(off[0].tables).toEqual([]);
  });
});
