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
                <Toaster duration={2000} richColors closeButton />
            </I18nextProvider>
        </QueryProvider>
    );
}

function renderSplash(message: string, showRetry = false) {
    const retryHtml = showRetry
        ? `<button onclick="window.location.reload()" style="margin-top:16px;padding:8px 24px;border:1px solid #555;border-radius:6px;background:#222;color:#eee;cursor:pointer;font-size:14px;">重试</button>`
        : '';
    rootElement!.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#0f0f0f;color:#e0e0e0;font-family:sans-serif;">
            <div style="font-size:16px;margin-bottom:8px;">${message}</div>
            ${retryHtml}
        </div>
    `;
}

async function pollHealth(base: string, timeoutMs = 30000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`${base}/health`);
            if (res.ok) return true;
        } catch {
            // backend not ready yet
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

    // Tauri path: resolve the backend base URL before rendering.
    renderSplash('正在启动本地引擎…');

    try {
        const { invoke } = await import('@tauri-apps/api/core');
        const { listen } = await import('@tauri-apps/api/event');

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

            // Then check if the backend is already up.
            invoke<string>('get_api_base').then((url) => {
                if (url && url.startsWith('http')) {
                    settle(url);
                }
            }).catch(() => {
                // ignore; the event will arrive later
            });
        });

        setApiBaseUrl(base);

        const healthy = await pollHealth(base);
        if (!healthy) {
            renderSplash('本地引擎启动超时，请重试。', true);
            return;
        }
    } catch (err) {
        renderSplash('本地引擎启动失败，请重试。', true);
        return;
    }

    renderApp();
}

bootstrap();
