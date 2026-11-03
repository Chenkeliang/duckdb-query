import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createQuackService, deleteQuackService, getQuackCatalogs, getQuackColumns,
  getQuackSchemas, getQuackTables, listQuackServices, updateQuackService,
  type QuackServiceInput,
} from '@/api';

export const QUACK_SERVICES_QUERY_KEY = ['quack-services'] as const;
export const quackMetadataKey = (serviceId: string) => ['quack-metadata', serviceId] as const;

export function useQuackServices() {
  const query = useQuery({
    queryKey: QUACK_SERVICES_QUERY_KEY,
    queryFn: listQuackServices,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  return { ...query, services: query.data ?? [] };
}

export function useQuackServiceMutations() {
  const client = useQueryClient();
  const invalidate = () => client.invalidateQueries({ queryKey: QUACK_SERVICES_QUERY_KEY });
  const create = useMutation({ mutationFn: createQuackService, onSuccess: invalidate });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: QuackServiceInput }) => updateQuackService(id, input),
    onSuccess: async (_, { id }) => {
      client.removeQueries({ queryKey: quackMetadataKey(id) });
      await invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: deleteQuackService,
    onSuccess: async (_, id) => {
      client.removeQueries({ queryKey: quackMetadataKey(id) });
      await invalidate();
    },
  });
  return { create, update, remove };
}

export function useQuackCatalogs(id: string, enabled = true) {
  return useQuery({ queryKey: [...quackMetadataKey(id), 'catalogs'], queryFn: () => getQuackCatalogs(id), enabled, staleTime: 60_000, retry: false });
}

export function useQuackSchemas(id: string, catalog: string, enabled = true) {
  // eslint-disable-next-line duckquery/require-tanstack-query -- This is a shared hook; the rule only recognizes legacy hook filenames.
  return useQuery({ queryKey: [...quackMetadataKey(id), 'schemas', catalog], queryFn: () => getQuackSchemas(id, catalog), enabled, staleTime: 60_000, retry: false });
}

export function useQuackTables(id: string, catalog: string, schema: string, enabled = true) {
  return useQuery({ queryKey: [...quackMetadataKey(id), 'tables', catalog, schema], queryFn: () => getQuackTables(id, catalog, schema), enabled, staleTime: 60_000, retry: false });
}

export function useQuackColumns(id: string, catalog: string, schema: string, table: string, enabled = true) {
  return useQuery({ queryKey: [...quackMetadataKey(id), 'columns', catalog, schema, table], queryFn: () => getQuackColumns(id, catalog, schema, table), enabled, staleTime: 60_000, retry: false });
}
