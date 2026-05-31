import { describe, it, expect } from 'vitest';
import {
  isTimeType,
  classifyAuditColumn,
  detectTimeBoundCandidates,
  defaultTimeBoundValue,
  buildTimeBoundCondition,
  buildTimeBoundSuggestions,
} from '../timeBound';
import { createEmptyGroup, createCondition } from '../FilterBar';

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
      { name: 'birthday', type: 'DATE' },
      { name: 'create_user', type: 'VARCHAR' },
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

describe('defaultTimeBoundValue', () => {
  it('returns a bare datetime string 30 days before the given now (no quotes)', () => {
    const now = new Date(2026, 4, 31, 13, 45, 0); // 2026-05-31 本地时间
    expect(defaultTimeBoundValue(now, 30)).toBe('2026-05-01 00:00:00');
  });

  it('rolls back across a month boundary', () => {
    const now = new Date(2026, 0, 15, 9, 0, 0); // 2026-01-15
    expect(defaultTimeBoundValue(now, 30)).toBe('2025-12-16 00:00:00');
  });
});

describe('buildTimeBoundCondition', () => {
  it('builds a FilterCondition with placement=on and bare value', () => {
    const c = buildTimeBoundCondition('orders', 'create_time', '2026-05-01 00:00:00');
    expect(c.type).toBe('condition');
    expect(c.table).toBe('orders');
    expect(c.column).toBe('create_time');
    expect(c.operator).toBe('>=');
    expect(c.value).toBe('2026-05-01 00:00:00');
    expect(c.placement).toBe('on');
    expect(typeof c.id).toBe('string');
    expect(c.id.length).toBeGreaterThan(0);
  });
});

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

  it('does NOT suppress orders when another table (refunds) shares a column name and is bounded', () => {
    // orders 和 refunds 都没有 create_time 同名问题，这里给两表都加 create_time 验证表名前缀隔离
    const cols = {
      orders: [{ name: 'create_time', type: 'TIMESTAMP' }],
      refunds: [{ name: 'create_time', type: 'TIMESTAMP' }],
    };
    const out = buildTimeBoundSuggestions({
      activeTables: [externalTable('orders'), externalTable('refunds')],
      tableColumnsMap: cols,
      filterTree: createEmptyGroup(),
      joinConfigs: [
        { conditions: [{ rightMode: 'expression', rightExpression: 'refunds.create_time >= \'2026-01-01\'' }] },
      ],
    });
    // refunds 被抑制，orders 仍应建议
    expect(out.map((s) => s.tableName)).toEqual(['orders']);
  });

  it('does NOT suppress when a non-candidate time column (birthday) is bounded', () => {
    const cols = {
      members: [
        { name: 'create_time', type: 'TIMESTAMP' },
        { name: 'birthday', type: 'DATE' },
      ],
    };
    const tree = createEmptyGroup();
    tree.children.push(createCondition('members', 'birthday', '>=', '2000-01-01', undefined, 'where'));
    const out = buildTimeBoundSuggestions({
      activeTables: [externalTable('members')],
      tableColumnsMap: cols,
      filterTree: tree,
      joinConfigs: [],
    });
    expect(out.map((s) => s.tableName)).toEqual(['members']);
  });
});
