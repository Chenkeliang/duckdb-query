/**
 * 联邦大表 JOIN 时间边界推荐 —— 纯函数。
 * 检测 create/update 审计时间列，构造 placement='on' 的时间过滤条件，
 * 由现有联邦子查询下推机制限制 ATTACH 抽取量。
 */
import type { TableColumn } from '@/hooks/useTableColumns';
import { createCondition } from './FilterBar';
import type { FilterCondition } from './FilterBar';

/** create 系词干（小写子串匹配）。'creat' 覆盖 create/created/gmt_create。 */
const CREATE_STEMS = ['creat', 'ctime', 'add_time', 'insert_time'];
/** update 系词干。'updat' 覆盖 update/updated；'modif' 覆盖 modify/modified/gmt_modified。 */
const UPDATE_STEMS = ['updat', 'modif', 'mtime'];

/** 是否为可做时间边界的 DuckDB 类型（TIMESTAMP* / DATE；排除 TIME）。 */
export function isTimeType(type: string): boolean {
  const t = (type || '').toUpperCase().replace(/\(.*\)/g, '').trim();
  if (t === 'DATE') return true;
  if (t.startsWith('TIMESTAMP')) return true;
  return false;
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
