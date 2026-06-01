/**
 * 联邦大表 JOIN 时间边界推荐 —— 纯函数。
 * 检测 create/update 审计时间列，构造 placement='on' 的时间过滤条件，
 * 由现有联邦子查询下推机制限制 ATTACH 抽取量。
 */
import type { TableColumn } from '@/hooks/useTableColumns';
import { createCondition } from './FilterBar';
import type { FilterCondition, FilterGroup, FilterNode } from './FilterBar';
import type { SelectedTable } from '@/types/SelectedTable';
import { getTableName, isExternalTable } from '@/utils/tableUtils';

/** create 系词干（小写子串匹配）。'creat' 覆盖 create/created/gmt_create。 */
const CREATE_STEMS = ['creat', 'ctime', 'add_time', 'insert_time'];
/** update 系词干。'updat' 覆盖 update/updated；'modif' 覆盖 modify/modified/gmt_modified。 */
const UPDATE_STEMS = ['updat', 'modif', 'mtime'];

/**
 * 是否为可做时间边界的列类型（排除 TIME）。
 * 注意：联邦表详情接口返回**源库原生类型**（MySQL `datetime`/`timestamp`/`date`、
 * PG `timestamp without time zone` 等），不是 DuckDB 归一化类型，要一并覆盖。
 */
export function isTimeType(type: string): boolean {
  const t = (type || '').toUpperCase().replace(/\(.*\)/g, '').trim();
  if (t === 'DATE' || t === 'DATETIME') return true; // DATETIME = MySQL
  if (t.startsWith('TIMESTAMP')) return true; // DuckDB TIMESTAMP* / MySQL timestamp / PG timestamp [without|with] time zone
  return false; // TIME / TIME WITH TIME ZONE / YEAR 排除
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
  // 归零到本地午夜，避免 DST 切换夜导致毫秒减法落在前/后一天的非零点而取错日期
  d.setHours(0, 0, 0, 0);
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

const RANGE_OPS = new Set(['=', '>', '>=', '<', '<=', 'BETWEEN']);

/** filterTree 内是否已有针对该表某候选时间列、范围类运算符的条件。 */
function hasFilterTreeBound(
  tree: FilterGroup,
  tableName: string,
  colNames: Set<string>,
): boolean {
  let found = false;
  const walk = (node: FilterNode): void => {
    if (found || !node) return;
    if (node.type === 'condition') {
      if (node.table === tableName && colNames.has(node.column) && RANGE_OPS.has(node.operator)) {
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

/**
 * joinConfigs 的 expression 条件里是否已提及该表的某候选时间列（兜底用户手敲的 ON 边界）。
 * 必须带 `表名.列名` 前缀匹配——否则另一张表的同名时间列（如两表都有 create_time）会误抑制本表。
 */
function hasExpressionBound(
  joinConfigs: ExprJoinConfig[],
  tableName: string,
  colNames: Set<string>,
): boolean {
  const prefix = (tableName || '').toLowerCase() + '.';
  for (const cfg of joinConfigs || []) {
    for (const c of cfg.conditions || []) {
      const exprs = [
        c.leftMode === 'expression' ? c.leftExpression : '',
        c.rightMode === 'expression' ? c.rightExpression : '',
      ];
      for (const e of exprs) {
        const low = (e || '').toLowerCase();
        for (const col of colNames) {
          if (low.includes(prefix + col.toLowerCase())) return true;
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
    if (!isExternalTable(table)) return;
    const tableName = getTableName(table);
    if (dupNames.has(tableName)) return;
    const columns = ctx.tableColumnsMap[tableName];
    if (!columns || columns.length === 0) return;
    const candidates = detectTimeBoundCandidates(columns);
    if (candidates.length === 0) return;
    // 抑制只看候选(审计)列：用户若已对 birthday 等非候选时间列设界，不影响本推荐
    const candidateSet = new Set(candidates);
    if (hasFilterTreeBound(ctx.filterTree, tableName, candidateSet)) return;
    if (hasExpressionBound(ctx.joinConfigs, tableName, candidateSet)) return;
    out.push({ tableName, candidates, recommended: candidates[0] });
  });
  return out;
}

/** 从 filterTree 移除所有引用某表的条件（表被移除/清空时调用，避免残留失效条件）。 */
export function removeTableConditions(tree: FilterGroup, tableName: string): FilterGroup {
  const prune = (node: FilterNode): FilterNode | null => {
    if (node.type === 'condition') {
      return node.table === tableName ? null : node;
    }
    if (node.type === 'group') {
      return {
        ...node,
        children: node.children.map(prune).filter((n): n is FilterNode => n !== null),
      };
    }
    return node; // raw 节点原样保留
  };
  return prune(tree) as FilterGroup;
}
