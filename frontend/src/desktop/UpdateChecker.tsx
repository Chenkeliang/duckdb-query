import { useEffect } from 'react';
import { toast } from 'sonner';

const isTauri =
  typeof window !== 'undefined' &&
  Boolean(
    (window as { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown }).__TAURI__ ||
      (window as { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  );

/**
 * 桌面端自动更新:启动后静默检查 GitHub Releases 的 latest.json,
 * 有新版本时弹常驻 toast;用户点「立即更新」→ 应用内下载安装 → 自动重启。
 * Web/Docker 下不渲染任何东西。更新包经 minisign 签名校验(公钥在 tauri.conf.json)。
 */
export function UpdateChecker() {
  useEffect(() => {
    if (!isTauri) return;
    let cancelled = false;

    (async () => {
      try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const update = await check();
        if (cancelled || !update) return;

        toast.info(`发现新版本 v${update.version}`, {
          description: '更新会自动下载并重启应用',
          duration: Infinity,
          closeButton: true,
          action: {
            label: '立即更新',
            onClick: async () => {
              const progress = toast.loading('正在下载更新…', { duration: Infinity });
              try {
                let received = 0;
                let total = 0;
                await update.downloadAndInstall((event) => {
                  if (event.event === 'Started') {
                    total = event.data.contentLength ?? 0;
                  } else if (event.event === 'Progress') {
                    received += event.data.chunkLength;
                    if (total > 0) {
                      toast.loading(
                        `正在下载更新… ${Math.round((received / total) * 100)}%`,
                        { id: progress, duration: Infinity }
                      );
                    }
                  }
                });
                toast.success('更新完成,正在重启…', { id: progress });
                const { relaunch } = await import('@tauri-apps/plugin-process');
                await relaunch();
              } catch (e) {
                toast.error(`更新失败:${e instanceof Error ? e.message : String(e)}`, {
                  id: progress,
                  duration: 8000,
                });
              }
            },
          },
        });
      } catch {
        // 检查失败(离线/接口不可达)静默忽略,不打扰用户
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
