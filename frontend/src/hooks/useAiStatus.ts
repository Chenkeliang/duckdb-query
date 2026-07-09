import { useQuery } from '@tanstack/react-query';
import { getAiSettings, type AiSettings } from '@/api';

/**
 * 纯派生:某 feature 是否「已配置」。
 * 回落顺序:feature 指定 → default_provider → 第一个已启用且有模型的供应商
 * (只配一个供应商没点"设为默认"时也应可用)。镜像后端 resolve_feature 的回落逻辑。
 */
export function isFeatureConfigured(s: AiSettings | undefined, feature: string): boolean {
  if (!s || !s.enabled) return false;
  const usable = (p?: { enabled: boolean; models?: string[] }) => !!p && p.enabled && (p.models?.length ?? 0) > 0;
  const providerId = s.features?.[feature]?.provider || s.default_provider;
  const p = providerId ? s.providers.find((pp) => pp.id === providerId) : undefined;
  if (usable(p)) return true;
  return s.providers.some((pp) => usable(pp));
}

export interface AiStatus {
  enabled: boolean;
  configured: boolean;
}

/** 三态门控:{enabled, configured}。出错/加载中默认全 false(不露出不可用入口)。 */
export function useAiStatus(feature: string): AiStatus {
  const { data } = useQuery({
    queryKey: ['ai-settings', 'full'],
    queryFn: getAiSettings,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return {
    enabled: data?.enabled ?? false,
    configured: isFeatureConfigured(data, feature),
  };
}
