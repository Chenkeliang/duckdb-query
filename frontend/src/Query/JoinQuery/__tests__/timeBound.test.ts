import { describe, it, expect } from 'vitest';
import {
  isTimeType,
  classifyAuditColumn,
  detectTimeBoundCandidates,
} from '../timeBound';
import { defaultTimeBoundValue, buildTimeBoundCondition } from '../timeBound';

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
