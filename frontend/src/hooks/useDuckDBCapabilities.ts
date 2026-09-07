import { useQuery } from '@tanstack/react-query';

import { getDuckDBCapabilities } from '@/api';

export const DUCKDB_CAPABILITIES_QUERY_KEY = ['duckdb-capabilities'] as const;

export function useDuckDBCapabilities() {
  return useQuery({
    queryKey: DUCKDB_CAPABILITIES_QUERY_KEY,
    queryFn: getDuckDBCapabilities,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
