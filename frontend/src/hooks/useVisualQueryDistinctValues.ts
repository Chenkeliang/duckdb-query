import { useQuery } from '@tanstack/react-query';
import { getVisualQueryDistinctValues } from '@/api';
import { mapFiltersForVisualQueryApi } from '@/utils/visualQueryFilterApi';
import type { FilterConfig } from '@/Query/VisualQuery/QueryBuilder';

export const VISUAL_QUERY_DISTINCT_VALUES_KEY = 'visual-query-distinct-values';

export interface VisualQueryDistinctValuesOptions {
  tableName: string | null;
  column: string | null;
  filters?: FilterConfig[];
  limit?: number;
  orderBy?: 'frequency' | 'metric';
  enabled?: boolean;
}

/**
 * Top-N 列唯一值（POST /api/visual-query/distinct-values）
 */
export function useVisualQueryDistinctValues({
  tableName,
  column,
  filters = [],
  limit = 12,
  orderBy = 'frequency',
  enabled = true,
}: VisualQueryDistinctValuesOptions) {
  const queryEnabled = Boolean(enabled && tableName && column);

  return useQuery({
    queryKey: [
      VISUAL_QUERY_DISTINCT_VALUES_KEY,
      tableName,
      column,
      limit,
      orderBy,
      filters,
    ],
    queryFn: async () => {
      if (!tableName || !column) {
        throw new Error('tableName and column are required');
      }
      return getVisualQueryDistinctValues({
        config: {
          table_name: tableName,
          selected_columns: [],
          aggregations: [],
          filters: mapFiltersForVisualQueryApi(filters),
          order_by: [],
          is_distinct: false,
        },
        column,
        limit,
        order_by: orderBy,
      });
    },
    enabled: queryEnabled,
    staleTime: 60_000,
  });
}
