import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/tailwind.css';
import '@fontsource/inter/300.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
// Data-source redesign: IBM Plex Sans (body) + JetBrains Mono (mono identity).
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/jetbrains-mono/700.css';
import './i18n/config';
import { I18nextProvider } from 'react-i18next';
import i18n from './i18n/config';
import { Toaster } from '@/components/ui/sonner';
import { QueryProvider } from './providers/QueryProvider';
import { setApiBaseUrl } from './api/client';
import { openExternal } from './desktop/openExternal';
import { UpdateChecker } from './desktop/UpdateChecker';

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error('Root element not found');
}

const root = ReactDOM.createRoot(rootElement);

function renderApp() {
    root.render(
        <QueryProvider>
            <I18nextProvider i18n={i18n}>
                <App />
                <UpdateChecker />
                <Toaster duration={2000} richColors closeButton />
            </I18nextProvider>
        </QueryProvider>
    );
}

function renderSplash(message: string, showRetry = false) {
    // __dqRetry(bootstrap 内注入)会先让 Rust 侧杀掉并重新拉起后端再刷新页面;
    // 仅 reload 无法救活 spawn 失败的后端(spawn_backend 只在 setup 时跑一次)。
    const retryHtml = showRetry
        ? `<button onclick="window.__dqRetry ? window.__dqRetry() : window.location.reload()" style="margin-top:16px;padding:8px 24px;border:1px solid #555;border-radius:6px;background:#222;color:#eee;cursor:pointer;font-size:14px;">重试</button>`
        : '';
    rootElement!.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#0f0f0f;color:#e0e0e0;font-family:sans-serif;">
            <div style="font-size:16px;margin-bottom:8px;">${message}</div>
            ${retryHtml}
        </div>
    `;
}

// 90s 而非 30s：拿到端口后，后端还要完成整条重量级 import 链才能响应 /health；
// Windows 首启叠加杀软对 PyInstaller onedir 数千文件的逐个扫描，30s 常不够，
// 曾被误判为「本地引擎启动超时」（重试即好，因为文件已被杀软放行）。
async function pollHealth(
    base: string,
    timeoutMs = 90000,
    shouldAbort?: () => boolean
): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    const started = Date.now();
    let slowHintShown = false;
    while (Date.now() < deadline) {
        if (shouldAbort?.()) return false; // 后端进程已退出,等下去没有意义
        try {
            const res = await fetch(`${base}/health`);
            if (res.ok) return true;
        } catch {
            // backend not ready yet
        }
        if (!slowHintShown && Date.now() - started > 20000) {
            slowHintShown = true;
            renderSplash('仍在启动本地引擎，首次启动可能需要 1-2 分钟，请稍候…');
        }
        await new Promise<void>((r) => setTimeout(r, 500));
    }
    return false;
}

async function bootstrap() {
    const win = window as any;
    const inTauri = Boolean(win.__TAURI__ || win.__TAURI_INTERNALS__);

    if (!inTauri) {
        // Web / Docker path — render immediately, unchanged behavior.
        renderApp();
        return;
    }

    // In Tauri the webview blocks external <a> navigation; route external links
    // (e.g. the GitHub buttons on the welcome page) to the system browser.
    document.addEventListener('click', (e) => {
        const anchor = (e.target as HTMLElement | null)?.closest?.('a');
        const href = anchor?.getAttribute('href') ?? '';
        if (/^https?:\/\//i.test(href) && !href.includes('127.0.0.1') && !href.includes('localhost')) {
            e.preventDefault();
            openExternal(href);
        }
    });

    // Tauri path: resolve the backend base URL before rendering.
    renderSplash('正在启动本地引擎…');

    try {
        const { invoke } = await import('@tauri-apps/api/core');
        const { listen } = await import('@tauri-apps/api/event');

        // 重试 = 让 Rust 杀掉并重新 spawn 后端,再刷新 webview。
        (window as any).__dqRetry = async () => {
            try {
                await invoke('restart_backend');
            } catch {
                // 命令失败也照样 reload,不比纯 reload 更差
            }
            window.location.reload();
        };

        // 后端进程退出(stdout EOF)⇒ 立即失败,不再傻等启动窗口跑满。
        let backendExited = false;
        listen<boolean>('backend-exited', () => {
            backendExited = true;
        });

        // Race: invoke (already-ready) vs event (not-yet-ready).
        const base = await new Promise<string>((resolve) => {
            let settled = false;

            const settle = (url: string) => {
                if (settled) return;
                settled = true;
                resolve(url);
            };

            // Set up the event listener first so we don't miss it.
            listen<string>('api-ready', (event) => {
                if (event.payload && event.payload.startsWith('http')) {
                    settle(event.payload);
                }
            });

            listen('backend-exited', () => settle(''));

            // Then check if the backend is already up.
            invoke<string>('get_api_base').then((url) => {
                if (url && url.startsWith('http')) {
                    settle(url);
                }
            }).catch(() => {
                // ignore; the event will arrive later
            });

            // Give up if the backend never reports a port (spawn failed / binary
            // missing) so we fall to the retry splash instead of hanging forever.
            setTimeout(() => settle(''), 30000);
        });

        if (!base) {
            renderSplash('本地引擎启动失败，请重试。', true);
            return;
        }

        setApiBaseUrl(base);

        const healthy = await pollHealth(base, 90000, () => backendExited);
        if (!healthy) {
            renderSplash('本地引擎启动超时，请重试。', true);
            return;
        }
    } catch {
        renderSplash('本地引擎启动失败，请重试。', true);
        return;
    }

    renderApp();
}

bootstrap();
