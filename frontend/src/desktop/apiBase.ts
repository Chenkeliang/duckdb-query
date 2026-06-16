/**
 * 解析 axios baseURL:Tauri 注入的 window.__API_BASE__ 优先,否则回退到传入的 env 值。
 */
export function resolveBaseUrl(envApiUrl: string): string {
  const injected = (window as any).__API_BASE__;
  if (typeof injected === 'string' && injected.startsWith('http')) return injected;
  return envApiUrl || '';
}
