/**
 * 打开外部 URL。
 * 桌面(Tauri)的 webview 会拦截 window.open 的外部跳转,改走原生 open_external 命令
 * (系统默认浏览器);Web/Docker 下回退到 window.open。
 */
export const isTauri = (): boolean =>
  Boolean(
    (window as { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown }).__TAURI__ ||
      (window as { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  );

export async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_external", { url });
      return;
    } catch {
      // 命令不可用时回退
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
