/**
 * JOIN 工作台表级 SQL 别名（AS）工具
 */

import type { FilterCondition, FilterGroup, FilterNode } from './FilterBar/types';

const SQL_ALIAS_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function defaultJoinTableAlias(index: number): string {
  return `t${index + 1}`;
}

export function isValidSqlTableAlias(alias: string): boolean {
  const trimmed = alias.trim();
  return trimmed.length > 0 && SQL_ALIAS_PATTERN.test(trimmed);
}

/** 用户输入规范化；无效则返回 null */
export function normalizeUserSqlAlias(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || !isValidSqlTableAlias(trimmed)) {
    return null;
  }
  return trimmed;
}

export function buildJoinTableAliasMap(
  tableNames: string[],
  overrides: Record<string, string>
): Record<string, string> {
  const map: Record<string, string> = {};
  const used = new Set<string>();

  tableNames.forEach((name, index) => {
    const custom = normalizeUserSqlAlias(overrides[name] ?? '');
    let alias = custom ?? defaultJoinTableAlias(index);
    if (used.has(alias)) {
      let suffix = 2;
      while (used.has(`${alias}_${suffix}`)) {
        suffix += 1;
      }
      alias = `${alias}_${suffix}`;
    }
    used.add(alias);
    map[name] = alias;
  });

  return map;
}

export function resolveJoinTableAlias(
  tableName: string,
  index: number,
  aliasMap: Record<string, string>
): string {
  return aliasMap[tableName] ?? defaultJoinTableAlias(index);
}

/** 任一解析别名与物理表名不同则不走服务端 JOIN（避免预览 SQL 与执行不一致） */
export function joinQueryUsesDistinctSqlAliases(
  tableNames: string[],
  aliasMap: Record<string, string>
): boolean {
  return tableNames.some((name, index) => {
    const alias = aliasMap[name] ?? defaultJoinTableAlias(index);
    return alias !== name;
  });
}

function remapFilterNode(node: FilterNode, nameToAlias: Record<string, string>): FilterNode {
  switch (node.type) {
    case 'condition': {
      const alias = nameToAlias[node.table];
      if (!alias || alias === node.table) {
        return node;
      }
      return { ...node, table: alias };
    }
    case 'group':
      return {
        ...node,
        children: node.children.map((child) => remapFilterNode(child, nameToAlias)),
      };
    case 'raw':
      return node;
    default:
      return node;
  }
}

export function remapFilterTreeTableNames(
  tree: FilterGroup,
  nameToAlias: Record<string, string>
): FilterGroup {
  return remapFilterNode(tree, nameToAlias) as FilterGroup;
}

export function collectDuplicateAliases(
  tableNames: string[],
  overrides: Record<string, string>
): string[] {
  const seen = new Map<string, string>();
  const duplicates = new Set<string>();

  tableNames.forEach((name, index) => {
    const alias =
      normalizeUserSqlAlias(overrides[name] ?? '') ?? defaultJoinTableAlias(index);
    const prev = seen.get(alias);
    if (prev && prev !== name) {
      duplicates.add(alias);
    } else {
      seen.set(alias, name);
    }
  });

  return [...duplicates];
}
