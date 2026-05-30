import { useQuery } from '@tanstack/react-query';
import { getAiSettings } from '@/api/aiApi';

/**
 * AI 总开关是否开启（用于决定是否展示 AI 入口）。
 * 出错 / 未配置时默认 false，避免露出不可用的 AI 按钮。
 */
export function useAiEnabled(): boolean {
  const { data } = useQuery({
    queryKey: ['ai-settings', 'enabled'],
    queryFn: () => getAiSettings().then((s) => s.enabled),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return data ?? false;
}
