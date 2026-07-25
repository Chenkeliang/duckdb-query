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
  scopeChipLabel,
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
    // 未钉表时只显示来源名,不显示"0 张表"(那会被读成"没表可查")
    expect(scopeChipLabel(localEntry([]))).toBe('本地 DuckDB');
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
