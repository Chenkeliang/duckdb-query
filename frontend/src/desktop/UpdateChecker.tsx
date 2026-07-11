import { useEffect } from 'react';
import { toast } from 'sonner';
import type { Update } from '@tauri-apps/plugin-updater';

import { isTauri } from '@/desktop/openExternal';

/**
 * 检查是否有新版本(仅桌面;Web/非 Tauri 环境返回 null)。
 * 设置页「检查更新」与启动时静默检查共用此入口。
 * 检查失败向上抛,由调用方决定静默(启动)还是提示(手动)。
 */
export async function checkForUpdate(): Promise<Update | null> {
  if (!isTauri()) return null;
  const { check } = await import('@tauri-apps/plugin-updater');
  // timeout 必须显式给:插件 Rust 侧 reqwest 默认无请求超时,GitHub 在部分网络
  // (国内)是 SYN 黑洞式不可达,不设超时手动"检查更新"按钮会转圈 20-130s。单位 ms。
  return check({ timeout: 10_000 });
}

/**
 * 弹"发现新版本"常驻提示;点「立即更新」→ 应用内下载安装(带进度)→ 自动重启。
 * 更新包经 minisign 签名校验(公钥在 tauri.conf.json)。
 */
export function promptUpdate(update: Update): void {
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
}

/**
 * 桌面端自动更新:启动后静默检查 GitHub Releases 的 latest.json,
 * 有新版本时弹常驻 toast。Web/Docker 下不渲染任何东西。
 */
export function UpdateChecker() {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const update = await checkForUpdate();
        if (cancelled || !update) return;
        promptUpdate(update);
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
