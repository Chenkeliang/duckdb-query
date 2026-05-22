import type { FilterConfig } from '@/Query/VisualQuery/QueryBuilder';

/** 将可视化 FilterBuilder 条件转为后端 VisualQueryConfig.filters */
export function mapFiltersForVisualQueryApi(filters: FilterConfig[]) {
  return filters
    .filter((f) => f.column)
    .map((f) => ({
      column: f.column,
      operator: f.operator,
      value: f.value ?? null,
      value2: f.value2 ?? null,
      logic_operator: f.logicOperator,
    }));
}
