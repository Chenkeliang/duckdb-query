import { useQuery } from '@tanstack/react-query';
import { getAiSettings, type AiSettings } from '@/api/aiApi';

/**
 * 纯派生:某 feature 是否「已配置」。
 * 规则:总开关开 && (feature 指定的 provider 或 default_provider) 指向一个 enabled、
 * 且至少有一个 model 的供应商。镜像后端 resolve_feature 的回落逻辑。
 */
export function isFeatureConfigured(s: AiSettings | undefined, feature: string): boolean {
  if (!s || !s.enabled) return false;
  const providerId = s.features?.[feature]?.provider || s.default_provider;
  if (!providerId) return false;
  const p = s.providers.find((pp) => pp.id === providerId);
  return !!p && p.enabled && (p.models?.length ?? 0) > 0;
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
