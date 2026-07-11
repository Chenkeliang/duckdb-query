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

/** Rust 侧 backend_state 命令的返回:进程存活以 try_wait 为准,是启动阶段的唯一真值。 */
interface BackendState {
    alive: boolean;
    port: number;
    recentStderr: string[];
    /** engine-stderr.log 的绝对路径,失败页原样展示 */
    logPath: string;
}

// 端口在后端重量级 import 之前打印,正常几秒内就有;超过此值说明 exe 本体被
// 杀软扫描拖住或彻底卡死。健康检查上限则放得很宽:只要进程还活着就继续等,
// Windows 首启杀软对 onedir 数千文件的逐个扫描可拖到数分钟(90s 硬上限曾把
// 慢机器的正常首启误判成「启动超时」)。
const PORT_WAIT_CAP_MS = 180_000;
const HEALTH_WAIT_CAP_MS = 600_000;
// 单次 /health fetch 必须有超时:被防火墙静默丢包/握手后无人应答的连接会挂住
// fetch 数十秒,吃掉轮询预算还阻塞存活检测(fetch 默认无超时)。
const HEALTH_FETCH_TIMEOUT_MS = 4000;
// 兜底文案:backend_state 拿不到时才用;正常路径下失败页展示 Rust 侧返回的
// engine-stderr.log 真实绝对路径(logPath)。
const LOG_PATH_HINT =
    '日志目录: Windows %APPDATA%\\DuckQuery · macOS ~/Library/Application Support/DuckQuery';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 启动画面骨架只渲染一次,之后按字段更新,避免整块重绘打断重试按钮状态。 */
function renderSplashShell() {
    rootElement!.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#0f0f0f;color:#e0e0e0;font-family:sans-serif;padding:0 24px;">
            <div id="dq-status" style="font-size:16px;margin-bottom:8px;text-align:center;">正在启动本地引擎…</div>
            <div id="dq-cause" style="display:none;font-size:12px;color:#d09090;margin-bottom:6px;max-width:640px;text-align:center;word-break:break-all;"></div>
            <div id="dq-hint" style="font-size:13px;color:#909090;margin-bottom:6px;text-align:center;max-width:640px;word-break:break-all;"></div>
            <div id="dq-stage" style="font-size:12px;color:#6a6a6a;font-family:monospace;margin-bottom:8px;max-width:560px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></div>
            <pre id="dq-diag" style="display:none;font-size:11px;color:#8a8a8a;background:#171717;border:1px solid #2a2a2a;border-radius:6px;padding:10px 12px;max-width:640px;max-height:180px;overflow:auto;text-align:left;white-space:pre-wrap;word-break:break-all;"></pre>
            <button id="dq-retry" style="display:none;margin-top:16px;padding:8px 24px;border:1px solid #555;border-radius:6px;background:#222;color:#eee;cursor:pointer;font-size:14px;">重试</button>
        </div>
    `;
    const retry = document.getElementById('dq-retry') as HTMLButtonElement | null;
    if (retry) {
        // 防抖:restart_backend 的 kill→respawn 需要数秒,连点会反复杀掉刚拉起的后端
        retry.onclick = () => {
            retry.disabled = true;
            retry.textContent = '重试中…';
            const w = window as any;
            // __dqRetry(bootstrap 内注入)会先让 Rust 侧杀掉并重新拉起后端再刷新页面;
            // 仅 reload 无法救活 spawn 失败的后端(spawn_backend 只在 setup 时跑一次)。
            if (w.__dqRetry) w.__dqRetry();
            else window.location.reload();
        };
    }
}

function updateSplash(fields: {
    status?: string;
    cause?: string;
    hint?: string;
    stage?: string;
    diag?: string[];
    retry?: boolean;
}) {
    if (!document.getElementById('dq-status')) renderSplashShell();
    if (fields.status !== undefined) document.getElementById('dq-status')!.textContent = fields.status;
    if (fields.cause !== undefined) {
        const el = document.getElementById('dq-cause')!;
        el.textContent = fields.cause;
        el.style.display = fields.cause ? 'block' : 'none';
    }
    if (fields.hint !== undefined) document.getElementById('dq-hint')!.textContent = fields.hint;
    if (fields.stage !== undefined) document.getElementById('dq-stage')!.textContent = fields.stage;
    if (fields.diag !== undefined) {
        const el = document.getElementById('dq-diag')!;
        el.textContent = fields.diag.join('\n'); // textContent,无 XSS 面
        el.style.display = fields.diag.length ? 'block' : 'none';
    }
    if (fields.retry !== undefined) {
        (document.getElementById('dq-retry') as HTMLButtonElement).style.display = fields.retry
            ? 'inline-block'
            : 'none';
    }
}

/** 取后端最近一条 [startup +x.xs] 阶段行,长等待时让用户看到实际进展。 */
function latestStage(state: BackendState | null): string {
    const lines = state?.recentStderr ?? [];
    for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].includes('[startup +')) return lines[i];
    }
    return '';
}

function failSplash(message: string, state: BackendState | null) {
    // 从后端最后的输出里提出"原因":崩溃时 traceback 的结尾行就是异常本身;
    // 没有报错特征时退化为最后一行(通常是最后到达的启动阶段,即卡住的位置)。
    const lines = (state?.recentStderr ?? []).map((l) => l.trim()).filter(Boolean);
    const errLine = [...lines]
        .reverse()
        .find((l) => /error|exception|traceback|failed|panic/i.test(l));
    const lastLine = lines.length > 0 ? lines[lines.length - 1] : '';
    const cause = errLine ? `错误信息: ${errLine}` : lastLine ? `最后输出: ${lastLine}` : '';
    const logHint = state?.logPath ? `完整日志已保存: ${state.logPath}` : LOG_PATH_HINT;
    updateSplash({
        status: message,
        cause,
        hint: `${logHint}（反馈问题时请提供该文件，或截图本页）`,
        stage: '',
        diag: state?.recentStderr?.slice(-12) ?? [],
        retry: true,
    });
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
    // 唯一真值是轮询 backend_state(Rust 侧对子进程句柄 try_wait):此前依赖
    // api-ready/backend-exited 事件,存在注册竞态(listen 未 await,极快的崩溃
    // 事件会丢)与旧进程 stdout 线程迟到的 backend-exited 误归因;轮询从构造上
    // 消灭这两类竞态,且能把「进程死了」和「进程活着但还没就绪」如实分开——
    // 崩溃不再被误报成「启动超时」,慢启动(杀软扫描)不再被 90s 硬上限误杀。
    renderSplashShell();

    try {
        const { invoke } = await import('@tauri-apps/api/core');

        // 重试 = 让 Rust 杀掉并重新 spawn 后端,再刷新 webview。retrying 抑制
        // 旧轮询循环在 kill→respawn 间隙把「进程暂时不在」误报成异常退出。
        let retrying = false;
        (window as any).__dqRetry = async () => {
            retrying = true;
            try {
                await invoke('restart_backend');
            } catch {
                // 命令失败也照样 reload,不比纯 reload 更差
            }
            window.location.reload();
        };

        const fetchState = async (): Promise<BackendState | null> => {
            try {
                return await invoke<BackendState>('backend_state');
            } catch {
                return null;
            }
        };

        const started = Date.now();
        // setup() 里 spawn 先于 webview 加载,但不依赖这个顺序:开头 3s 内且从未
        // 观察到存活时,不把 alive=false 当作已退出(可能只是还没 spawn)。
        let sawAlive = false;
        const confirmedDead = (state: BackendState | null) =>
            state !== null && !state.alive && (sawAlive || Date.now() - started > 3000);

        // Phase 1: 等端口(后端在重量级 import 之前打印,正常几秒内)。
        let state: BackendState | null = null;
        let base = '';
        for (;;) {
            state = await fetchState();
            if (state?.alive) sawAlive = true;
            if (retrying) {
                await sleep(500);
                continue;
            }
            // 先判死后判端口:端口打印后进程也可能立刻崩(import 链在其后),
            // 拿着死进程的端口进健康轮询只是白等。
            if (confirmedDead(state)) {
                failSplash(
                    sawAlive ? '本地引擎异常退出，请重试。' : '本地引擎启动失败，请重试。',
                    state
                );
                return;
            }
            if (state && state.port > 0) {
                base = `http://127.0.0.1:${state.port}`;
                break;
            }
            if (Date.now() - started > PORT_WAIT_CAP_MS) {
                failSplash('本地引擎启动超时，请重试。', state);
                return;
            }
            if (Date.now() - started > 15000) {
                updateSplash({
                    hint: '安全软件首次扫描可能较慢，请稍候',
                    stage: latestStage(state),
                });
            }
            await sleep(500);
        }

        setApiBaseUrl(base);

        // Phase 2: 轮询 /health。进程活着就继续等(阶梯式提示),死了立即如实报告。
        const fetchWithTimeout = async (url: string, ms: number): Promise<Response> => {
            if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
                return fetch(url, { signal: AbortSignal.timeout(ms) });
            }
            // 旧引擎(如固定版本的 WebView2)没有 AbortSignal.timeout,手动兜底,
            // 保证健康检查在任何引擎上都不会无限挂起
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), ms);
            try {
                return await fetch(url, { signal: ctrl.signal });
            } finally {
                clearTimeout(timer);
            }
        };
        for (;;) {
            try {
                const res = await fetchWithTimeout(`${base}/health`, HEALTH_FETCH_TIMEOUT_MS);
                if (res.ok) break;
            } catch {
                // backend not ready yet
            }
            state = await fetchState();
            if (state?.alive) sawAlive = true;
            if (retrying) {
                await sleep(500);
                continue;
            }
            if (confirmedDead(state)) {
                failSplash('本地引擎异常退出，请重试。', state);
                return;
            }
            const elapsed = Date.now() - started;
            if (elapsed > HEALTH_WAIT_CAP_MS) {
                failSplash('本地引擎启动超时，请重试。', state);
                return;
            }
            if (elapsed > 90000) {
                updateSplash({
                    status: '仍在启动本地引擎…',
                    hint: '安全软件可能正在逐个扫描引擎组件（首次安装常见，可能需要几分钟）。可将安装目录加入杀软信任区加速后续启动。',
                    stage: latestStage(state),
                    retry: true,
                });
            } else if (elapsed > 20000) {
                updateSplash({
                    status: '仍在启动本地引擎，首次启动可能需要 1-2 分钟，请稍候…',
                    stage: latestStage(state),
                });
            } else {
                updateSplash({ stage: latestStage(state) });
            }
            await sleep(500);
        }
    } catch {
        updateSplash({ status: '本地引擎启动失败，请重试。', retry: true });
        return;
    }

    renderApp();
}

bootstrap();
