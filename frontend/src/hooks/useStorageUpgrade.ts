import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getStorageUpgradeStatus, scheduleStorageUpgrade } from '@/api';

export const STORAGE_UPGRADE_QUERY_KEY = ['storage-upgrade'] as const;

export function useStorageUpgrade() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: STORAGE_UPGRADE_QUERY_KEY,
    queryFn: getStorageUpgradeStatus,
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  });
  const schedule = useMutation({
    mutationFn: scheduleStorageUpgrade,
    onSuccess: (status) => {
      queryClient.setQueryData(STORAGE_UPGRADE_QUERY_KEY, status);
    },
  });
  return { ...query, schedule };
}
