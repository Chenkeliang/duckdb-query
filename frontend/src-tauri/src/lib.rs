// DuckQuery desktop shell: launches the PyInstaller onedir backend as a child
// process, reads the OS-assigned loopback port it prints on stdout, exposes that
// to the webview, and kills the backend when the app exits.

use std::collections::VecDeque;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, RunEvent, WindowEvent};

/// Backend base URL port (0 until the backend has printed it).
#[derive(Default)]
struct ApiPort(Mutex<u16>);

/// Handle to the backend child process so we can kill it on exit.
struct Backend(Mutex<Option<Child>>);

/// 后端最近的 stderr 输出(run.py 的 [startup ...] 阶段行 + Python 报错)。
/// 供前端启动失败/超时时展示,用户截图即可远程定位卡在哪一步。
/// 锁内只做 O(1) 队列操作,不做任何 I/O——这个缓冲由 stderr 泄压线程写入,
/// 它一旦被阻塞,后端的 stderr 管道就会写满并反向卡死后端进程。
struct BackendDiag(Mutex<VecDeque<String>>);
const DIAG_CAP: usize = 100;

/// 串行化 restart_backend:kill→清端口→respawn 三步各自持锁并不原子,
/// 连点重试可能留下两个后端进程;整段包一把锁,后到的调用排队等前一次完成。
struct RestartLock(Mutex<()>);

fn push_diag(app: &AppHandle, line: String) {
    let diag = app.state::<BackendDiag>();
    let mut buf = diag.0.lock().unwrap();
    if buf.len() >= DIAG_CAP {
        buf.pop_front();
    }
    buf.push_back(line);
}

/// 与 Python 侧 paths.py get_user_data_dir 同一套平台约定(不含其 APP_ROOT 覆盖,
/// 桌面壳不设该 env),保证 engine-stderr.log 与后端自己写的 startup.log 同目录。
fn user_data_dir() -> Option<PathBuf> {
    if cfg!(target_os = "windows") {
        std::env::var_os("APPDATA").map(|b| PathBuf::from(b).join("DuckQuery"))
    } else if cfg!(target_os = "macos") {
        std::env::var_os("HOME")
            .map(|h| PathBuf::from(h).join("Library/Application Support/DuckQuery"))
    } else {
        std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local/share/DuckQuery"))
    }
}

fn engine_log_path() -> Option<PathBuf> {
    user_data_dir().map(|d| d.join("engine-stderr.log"))
}

const ENGINE_LOG_CAP_BYTES: u64 = 4 * 1024 * 1024;

/// 后端 stderr 的落盘副本:启动失败/异常退出的完整 traceback(含 PyInstaller
/// 引导期报错)都在这里,用户发一个文件即可定位,不依赖截图。每次 spawn 覆盖
/// 重写(与 startup.log 同策略)。
///
/// 写满上限后**轮转**(当前文件改名为 .log.1,再开新文件继续写),而不是停写:
/// 停写会让长会话里最该被诊断的那次失败恰好落在上限之后而无迹可寻——一次 80 轮
/// 验收就撞过这个坑,唯一一次 protocol_violation 的分类日志被丢掉了。轮转把占用
/// 仍限制在两个文件(约 8MB),但保证"最近的日志一定在"。任何写失败都静默降级,
/// 日志决不能反过来影响后端运行。
struct EngineLog {
    file: Option<std::fs::File>,
    path: Option<PathBuf>,
    written: u64,
}

impl EngineLog {
    fn create_at(path: Option<PathBuf>) -> Self {
        let file = path.as_ref().and_then(|p| {
            if let Some(dir) = p.parent() {
                let _ = std::fs::create_dir_all(dir);
            }
            std::fs::File::create(p).ok() // 覆盖重写,只保留本次启动
        });
        EngineLog { file, path, written: 0 }
    }

    fn create() -> Self {
        Self::create_at(engine_log_path())
    }

    /// 轮转到 .log.1 并开新文件;任何一步失败就退回"停写",绝不让日志影响后端。
    fn rotate(&mut self) {
        let Some(path) = self.path.clone() else {
            self.file = None;
            return;
        };
        self.file = None; // 先关掉旧句柄再改名
        let mut previous = path.clone();
        previous.set_extension("log.1");
        let _ = std::fs::remove_file(&previous);
        if std::fs::rename(&path, &previous).is_err() {
            return; // 改名失败:保持停写,避免无限膨胀
        }
        self.file = std::fs::File::create(&path).ok();
        self.written = 0;
        if let Some(f) = self.file.as_mut() {
            let _ = writeln!(f, "[engine-stderr.log rotated; previous 4MB kept as engine-stderr.log.1]");
        }
    }

    fn line(&mut self, s: &str) {
        if self.file.is_some() && self.written >= ENGINE_LOG_CAP_BYTES {
            self.rotate();
        }
        let Some(f) = self.file.as_mut() else { return };
        let _ = writeln!(f, "{s}");
        self.written += s.len() as u64 + 1;
    }
}

/// Snapshot of backend liveness for the frontend's startup state machine.
/// `alive` comes from try_wait on the real child handle, so a stale/lost
/// `backend-exited` event can never wedge the frontend: events are hints,
/// this is the source of truth.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct BackendState {
    alive: bool,
    port: u16,
    recent_stderr: Vec<String>,
    /// engine-stderr.log 的绝对路径(失败页原样展示,让用户能直接找到文件)
    log_path: String,
}

#[tauri::command]
fn backend_state(app: AppHandle) -> BackendState {
    let port = *app.state::<ApiPort>().0.lock().unwrap();
    let alive = match app.state::<Backend>().0.lock().unwrap().as_mut() {
        Some(child) => matches!(child.try_wait(), Ok(None)),
        None => false,
    };
    let recent_stderr = app
        .state::<BackendDiag>()
        .0
        .lock()
        .unwrap()
        .iter()
        .cloned()
        .collect();
    BackendState {
        alive,
        port,
        recent_stderr,
        log_path: engine_log_path()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_default(),
    }
}

/// 不可见/双向控制类 Unicode 格式字符(Cf 及相关)：既不被 is_control() 也不被
/// is_whitespace() 识别，却能让 URL 的显示形态与实际打开的地址不一致(伪装/混淆)。
/// 单独列黑名单而不是"禁止一切非 ASCII"——本产品面向中文用户，AI 对话里回链
/// `https://www.baidu.com/s?wd=你好` 这类带中文的合法 URL 会以未编码形态直接
/// 走到 open_external(见 main.tsx 的锚点拦截)，一刀切禁非 ASCII 会把它们静默丢弃。
fn is_dangerous_format_char(c: char) -> bool {
    matches!(c,
        '\u{200B}'..='\u{200F}'   // 零宽空格/连接符 + LRM/RLM
        | '\u{202A}'..='\u{202E}' // 双向嵌入/覆盖
        | '\u{2060}'..='\u{2064}' // word joiner + 不可见运算符
        | '\u{2066}'..='\u{2069}' // 双向隔离
        | '\u{FEFF}'              // BOM / 零宽不折行空格
        | '\u{00AD}'              // 软连字符
        | '\u{034F}'              // 组合用字位连接符
    )
}

/// 校验 open_external 收到的 URL 是否可安全交给下游进程打开。
///
/// 只放行 http(s)，并拒绝含控制字符/空白的 URL：合法 URL 里的空白都会被百分号
/// 编码，出现裸空白/换行往往是想利用 explorer.exe(Windows) 的参数解析怪癖塞入
/// 额外参数(#20)。URL 是作为单个 spawn 参数传入(非 shell)，本无 shell 注入；这
/// 是对下游进程的额外防御。长度上限做基本 sanity。此外拒绝不可见/双向格式字符
/// (is_dangerous_format_char)——它们既非控制符也非空白，可被用来伪装打开的地址。
fn is_safe_external_url(url: &str) -> bool {
    (url.starts_with("http://") || url.starts_with("https://"))
        && url.len() <= 2048
        && !url
            .chars()
            .any(|c| c.is_control() || c.is_whitespace() || is_dangerous_format_char(c))
}

/// Open a URL in the user's default browser. The Tauri webview blocks
/// window.open() to external origins, so the frontend routes external links
/// (and localhost download URLs) through this command instead.
#[tauri::command]
fn open_external(url: String) {
    if !is_safe_external_url(&url) {
        return;
    }
    // `open` crate:macOS 走 `open`、Linux 走 xdg-open 族,Windows 走 ShellExecuteW。
    // 此前 Windows 分支直接 spawn `explorer.exe <url>`——explorer 按 shell 命名空间
    // 解析参数,URL 一带 query string(如下载链接的 ?format=csv)就静默失败,且
    // spawn 成功掩盖了错误,表现为"下载点了没反应"。ShellExecuteW 是打开 URL 的
    // 正确 Windows API,query string 无碍;URL 校验(is_safe_external_url)保持不变。
    let _ = open::that_detached(&url);
}

/// Resolve the backend onedir executable across bundle and dev layouts.
fn resolve_backend(app: &AppHandle) -> Option<PathBuf> {
    // PyInstaller appends `.exe` on Windows; the macOS/Linux builds have no
    // extension. Without this the Windows bundle's `duckquery-api.exe` is never
    // found -> backend never spawns -> "本地引擎启动失败".
    let rel = if cfg!(target_os = "windows") {
        "binaries/duckquery-api/duckquery-api.exe"
    } else {
        "binaries/duckquery-api/duckquery-api"
    };
    let mut candidates: Vec<PathBuf> = Vec::new();
    // Bundled app: resources live under the platform resource dir
    // (mac: Contents/Resources/, Windows: alongside/under the install dir).
    if let Ok(res) = app.path().resource_dir() {
        candidates.push(res.join(rel));
    }
    // Dev / fallback: relative to the running executable
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join(rel)); // Windows: resources next to the .exe
            candidates.push(dir.join("../Resources").join(rel)); // mac bundle alt
            candidates.push(dir.join("../..").join(rel)); // dev: target/debug -> src-tauri
            candidates.push(dir.join("../../..").join(rel));
        }
    }
    candidates.into_iter().find(|p| p.exists())
}

fn spawn_backend(app: &AppHandle) {
    // 每次 spawn 清空诊断缓冲/覆盖重写落盘日志,避免上一个后端的输出混入本次归因
    app.state::<BackendDiag>().0.lock().unwrap().clear();
    let mut engine_log = EngineLog::create();
    let path = match resolve_backend(app) {
        Some(p) => p,
        None => {
            eprintln!("[duckquery] backend binary not found in any candidate path");
            push_diag(app, "[shell] backend binary not found in any candidate path".into());
            engine_log.line("[shell] backend binary not found in any candidate path");
            return;
        }
    };
    eprintln!("[duckquery] spawning backend: {}", path.display());
    push_diag(app, format!("[shell] spawning backend: {}", path.display()));
    engine_log.line(&format!("[shell] spawning backend: {}", path.display()));
    let mut cmd = Command::new(&path);
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    // Windows: the backend is a console-subsystem exe (PyInstaller console=True, so it
    // can print the port to the piped stdout). Without CREATE_NO_WINDOW a black console
    // window flashes on every launch. Piped stdout still works with the flag set.
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[duckquery] failed to spawn backend: {e}");
            push_diag(app, format!("[shell] failed to spawn backend: {e}"));
            engine_log.line(&format!("[shell] failed to spawn backend: {e}"));
            return;
        }
    };

    let stdout = child.stdout.take().expect("piped stdout");
    let stderr = child.stderr.take().expect("piped stderr");
    *app.state::<Backend>().0.lock().unwrap() = Some(child);

    // Drain the backend's stderr so its pipe buffer never fills (a full ~64KB pipe
    // would block the backend on its next log write). Also surfaces backend errors,
    // mirrors each line into the diag ring buffer for the frontend splash, and
    // appends it to engine-stderr.log(锁外落盘,不在 diag 锁内做 I/O)。
    let diag_handle = app.clone();
    std::thread::spawn(move || {
        let mut engine_log = engine_log;
        let reader = BufReader::new(stderr);
        for line in reader.lines().map_while(Result::ok) {
            eprintln!("[backend] {line}");
            engine_log.line(&line);
            push_diag(&diag_handle, line);
        }
    });

    // Read the backend's stdout; its first numeric line is the chosen port.
    // 端口/存活状态由前端轮询 backend_state 获取(事件驱动曾有注册竞态与旧进程
    // 迟到事件的误归因,已弃用),这里只负责解析端口写入 ApiPort。
    let handle = app.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        let mut port_set = false;
        for line in reader.lines().map_while(Result::ok) {
            if !port_set {
                if let Ok(port) = line.trim().parse::<u16>() {
                    *handle.state::<ApiPort>().0.lock().unwrap() = port;
                    eprintln!("[duckquery] backend ready on http://127.0.0.1:{port}");
                    port_set = true;
                }
            }
        }
        eprintln!("[duckquery] backend stdout closed (process exited)");
    });
}

/// 在系统文件管理器中打开日志目录(engine-stderr.log / startup.log 所在处),
/// 供失败页"打开日志位置"按钮一键定位。不接受任何前端参数——路径完全由
/// Rust 侧计算,不扩大 open_external 已收紧的注入面(#20)。
#[tauri::command]
fn open_log_dir() {
    if let Some(dir) = user_data_dir() {
        let _ = std::fs::create_dir_all(&dir); // 极早期失败时目录可能还不存在
        let _ = open::that_detached(&dir);
    }
}

/// Kill any existing backend and spawn a fresh one. Lets the frontend's retry
/// button actually recover from a failed/crashed spawn — a plain webview reload
/// cannot, because spawn_backend otherwise only runs once in setup().
#[tauri::command]
fn restart_backend(app: AppHandle) {
    let lock = app.state::<RestartLock>();
    let _guard = lock.0.lock().unwrap();
    kill_backend(&app);
    *app.state::<ApiPort>().0.lock().unwrap() = 0;
    spawn_backend(&app);
}

/// Best-effort local HTTP POST to /api/system/shutdown over a raw TCP socket. Avoids pulling
/// in reqwest for a single fire-and-forget call. Returns true if the request was written to
/// the socket (not necessarily that a 200 came back) — either way the caller then polls the
/// child for exit and falls back to a hard kill if it doesn't stop in time.
fn post_shutdown_request(port: u16) -> bool {
    let addr = format!("127.0.0.1:{port}");
    let stream = match TcpStream::connect(&addr) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
    let mut stream = stream;
    let request = format!(
        "POST /api/system/shutdown HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
    );
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    // Drain (part of) the response so the server doesn't see a reset on some platforms;
    // we don't need to parse it — the try_wait poll below is the real signal.
    let mut buf = [0u8; 512];
    let _ = stream.read(&mut buf);
    true
}

/// Kill the backend, preferring a graceful shutdown over SIGKILL: SIGKILL gives the DuckDB
/// connection pool no chance to close its connections, which leaves the WAL dirty — replaying
/// a dirty WAL can fail replay on next launch; the backend preserves that WAL and refuses to
/// open an older checkpoint. So: ask nicely via HTTP first, give it up to 5s to exit on its
/// own, and only hard-kill if that fails (backend didn't start, request failed, or it hung).
fn kill_backend(app: &AppHandle) {
    let port = *app.state::<ApiPort>().0.lock().unwrap();
    // 先 take() 再进 if-let:scrutinee 里的 MutexGuard 临时量会活到整个 if 块结束,
    // 那样 Backend 锁会被优雅停机的 5s 等待持满——backend_state 轮询查存活要拿
    // 同一把锁,不能被卡住。
    let taken = app.state::<Backend>().0.lock().unwrap().take();
    if let Some(mut child) = taken {
        let mut exited_gracefully = false;

        if port != 0 && post_shutdown_request(port) {
            let deadline = Instant::now() + Duration::from_secs(5);
            while Instant::now() < deadline {
                match child.try_wait() {
                    Ok(Some(_)) => {
                        exited_gracefully = true;
                        break;
                    }
                    Ok(None) => std::thread::sleep(Duration::from_millis(100)),
                    Err(_) => break,
                }
            }
        }

        if !exited_gracefully {
            let _ = child.kill();
        }
        let _ = child.wait();
        eprintln!("[duckquery] backend killed (graceful={exited_gracefully})");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_focus();
            }
        }));
        builder = builder.plugin(tauri_plugin_dialog::init());
        builder = builder.plugin(tauri_plugin_http::init());
        // 网格导出直写本地文件:save 对话框选中的路径由 dialog 插件在运行时
        // 动态加入 fs 插件的 scope,故 capability 只需授 write 操作、无需路径白名单
        builder = builder.plugin(tauri_plugin_fs::init());
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
        builder = builder.plugin(tauri_plugin_process::init());
    }

    builder
        .manage(ApiPort::default())
        .manage(Backend(Mutex::new(None)))
        .manage(BackendDiag(Mutex::new(VecDeque::new())))
        .manage(RestartLock(Mutex::new(())))
        .invoke_handler(tauri::generate_handler![
            open_external,
            open_log_dir,
            restart_backend,
            backend_state
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            spawn_backend(&app.handle().clone());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| match event {
            RunEvent::ExitRequested { .. } => kill_backend(app_handle),
            RunEvent::WindowEvent {
                event: WindowEvent::Destroyed,
                ..
            } => {
                kill_backend(app_handle);
                app_handle.exit(0);
            }
            _ => {}
        });
}

#[cfg(test)]
mod tests {
    use super::is_safe_external_url;
    use super::{EngineLog, ENGINE_LOG_CAP_BYTES};

    #[test]
    fn engine_log_truncates_per_create() {
        let dir = std::env::temp_dir().join(format!("dq-engine-log-test-{}", std::process::id()));
        let path = dir.join("engine-stderr.log");
        let mut log = EngineLog::create_at(Some(path.clone()));
        log.line("first run line");
        drop(log);
        // 第二次 create 模拟重启:必须覆盖重写,只保留本次输出
        let mut log = EngineLog::create_at(Some(path.clone()));
        log.line("second run line");
        drop(log);
        let content = std::fs::read_to_string(&path).unwrap();
        assert!(content.contains("second run line"));
        assert!(!content.contains("first run line"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn engine_log_rotates_at_cap_and_keeps_newest() {
        // 回归:上限到了要轮转而不是停写。停写会让长会话里最该诊断的那次失败
        // 恰好落在上限之后(80 轮验收里唯一一次 protocol_violation 就是这样丢的)。
        let dir = std::env::temp_dir().join(format!("dq-engine-cap-test-{}", std::process::id()));
        let path = dir.join("engine-stderr.log");
        let mut log = EngineLog::create_at(Some(path.clone()));
        log.line("old line before cap");
        log.written = ENGINE_LOG_CAP_BYTES; // 模拟已写满
        log.line("line after cap");
        drop(log);

        let current = std::fs::read_to_string(&path).unwrap();
        assert!(current.contains("line after cap"), "轮转后最新日志必须还在");
        assert!(!current.contains("old line before cap"), "新文件不应含旧内容");

        let mut previous = path.clone();
        previous.set_extension("log.1");
        let kept = std::fs::read_to_string(&previous).unwrap();
        assert!(kept.contains("old line before cap"), "上一段日志应保留为 .log.1");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn engine_log_degrades_silently_without_path() {
        let mut log = EngineLog::create_at(None);
        log.line("goes nowhere"); // 不 panic 即可
    }

    #[test]
    fn accepts_plain_http_and_https() {
        assert!(is_safe_external_url("https://example.com/a?b=1#c"));
        assert!(is_safe_external_url("http://127.0.0.1:48001/download/x.csv"));
    }

    #[test]
    fn rejects_non_http_schemes() {
        assert!(!is_safe_external_url("file:///etc/passwd"));
        assert!(!is_safe_external_url("javascript:alert(1)"));
        assert!(!is_safe_external_url("ftp://x.com/a"));
        assert!(!is_safe_external_url(""));
    }

    #[test]
    fn rejects_whitespace_and_control_chars() {
        // explorer.exe 参数注入面：空格/制表/换行/回车
        assert!(!is_safe_external_url("https://x.com/a b"));
        assert!(!is_safe_external_url("https://x.com/ --flag"));
        assert!(!is_safe_external_url("https://x.com/a\tb"));
        assert!(!is_safe_external_url("https://x.com/a\nb"));
        assert!(!is_safe_external_url("https://x.com/a\r\nb"));
        assert!(!is_safe_external_url("https://x.com/a\u{0000}b"));
    }

    #[test]
    fn rejects_overlong() {
        let long = format!("https://x.com/{}", "a".repeat(3000));
        assert!(!is_safe_external_url(&long));
    }

    #[test]
    fn rejects_unicode_format_chars() {
        // Cf 格式字符：既非 is_control 也非 is_whitespace,靠 is_dangerous_format_char 拦下
        assert!(!is_safe_external_url("https://x.com/\u{202E}evil")); // 双向覆盖(RLO)
        assert!(!is_safe_external_url("https://x.com/\u{200B}evil")); // 零宽空格(ZWSP)
        assert!(!is_safe_external_url("https://x.com/\u{2069}evil")); // 双向隔离结束
        assert!(!is_safe_external_url("https://x.com/\u{FEFF}evil")); // BOM
        assert!(!is_safe_external_url("https://x.com/\u{00AD}evil")); // 软连字符
    }

    #[test]
    fn allows_legitimate_non_ascii_urls() {
        // 中文用户场景:AI 回链里未编码的中文 URL 必须放行(不能一刀切禁非 ASCII)
        assert!(is_safe_external_url("https://www.baidu.com/s?wd=你好"));
        assert!(is_safe_external_url("https://zh.wikipedia.org/wiki/中文"));
    }
}
