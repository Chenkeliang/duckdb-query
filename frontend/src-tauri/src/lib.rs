// DuckQuery desktop shell: launches the PyInstaller onedir backend as a child
// process, reads the OS-assigned loopback port it prints on stdout, exposes that
// to the webview, and kills the backend when the app exits.

use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager, RunEvent, WindowEvent};

/// Backend base URL port (0 until the backend has printed it).
#[derive(Default)]
struct ApiPort(Mutex<u16>);

/// Handle to the backend child process so we can kill it on exit.
struct Backend(Mutex<Option<Child>>);

#[tauri::command]
fn get_api_base(port: tauri::State<ApiPort>) -> String {
    let p = *port.0.lock().unwrap();
    if p == 0 {
        String::new()
    } else {
        format!("http://127.0.0.1:{}", p)
    }
}

/// 校验 open_external 收到的 URL 是否可安全交给下游进程打开。
///
/// 只放行 http(s)，并拒绝含控制字符/空白的 URL：合法 URL 里的空白都会被百分号
/// 编码，出现裸空白/换行往往是想利用 explorer.exe(Windows) 的参数解析怪癖塞入
/// 额外参数(#20)。URL 是作为单个 spawn 参数传入(非 shell)，本无 shell 注入；这
/// 是对下游进程的额外防御。长度上限做基本 sanity。
fn is_safe_external_url(url: &str) -> bool {
    (url.starts_with("http://") || url.starts_with("https://"))
        && url.len() <= 2048
        && !url.chars().any(|c| c.is_control() || c.is_whitespace())
}

/// Open a URL in the user's default browser. The Tauri webview blocks
/// window.open() to external origins, so the frontend routes external links
/// (and localhost download URLs) through this command instead.
#[tauri::command]
fn open_external(url: String) {
    if !is_safe_external_url(&url) {
        return;
    }
    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("open").arg(&url).spawn();
    #[cfg(target_os = "windows")]
    let _ = std::process::Command::new("explorer").arg(&url).spawn();
    #[cfg(target_os = "linux")]
    let _ = std::process::Command::new("xdg-open").arg(&url).spawn();
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
    let path = match resolve_backend(app) {
        Some(p) => p,
        None => {
            eprintln!("[duckquery] backend binary not found in any candidate path");
            return;
        }
    };
    eprintln!("[duckquery] spawning backend: {}", path.display());
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
            return;
        }
    };

    let stdout = child.stdout.take().expect("piped stdout");
    let stderr = child.stderr.take().expect("piped stderr");
    *app.state::<Backend>().0.lock().unwrap() = Some(child);

    // Drain the backend's stderr so its pipe buffer never fills (a full ~64KB pipe
    // would block the backend on its next log write). Also surfaces backend errors.
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines().map_while(Result::ok) {
            eprintln!("[backend] {line}");
        }
    });

    // Read the backend's stdout; its first numeric line is the chosen port.
    let handle = app.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        let mut port_set = false;
        for line in reader.lines().map_while(Result::ok) {
            if !port_set {
                if let Ok(port) = line.trim().parse::<u16>() {
                    *handle.state::<ApiPort>().0.lock().unwrap() = port;
                    let base = format!("http://127.0.0.1:{}", port);
                    eprintln!("[duckquery] backend ready on {base}");
                    let _ = handle.emit("api-ready", base);
                    port_set = true;
                }
            }
        }
        // stdout EOF ⇒ backend process exited. Tell the frontend so it can fail
        // fast instead of waiting out its 30s/90s startup windows on a process
        // that crashed in the first 100ms. (Also fires on normal app shutdown,
        // when the webview is being torn down anyway — harmless.)
        eprintln!("[duckquery] backend stdout closed (process exited)");
        let _ = handle.emit("backend-exited", port_set);
    });
}

/// Kill any existing backend and spawn a fresh one. Lets the frontend's retry
/// button actually recover from a failed/crashed spawn — a plain webview reload
/// cannot, because spawn_backend otherwise only runs once in setup().
#[tauri::command]
fn restart_backend(app: AppHandle) {
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
/// a dirty WAL can throw on next launch and trigger WAL quarantine, losing everything written
/// since the last checkpoint. So: ask nicely via HTTP first, give it up to 5s to exit on its
/// own, and only hard-kill if that fails (backend didn't start, request failed, or it hung).
fn kill_backend(app: &AppHandle) {
    let port = *app.state::<ApiPort>().0.lock().unwrap();
    if let Some(mut child) = app.state::<Backend>().0.lock().unwrap().take() {
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
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
        builder = builder.plugin(tauri_plugin_process::init());
    }

    builder
        .manage(ApiPort::default())
        .manage(Backend(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            get_api_base,
            open_external,
            restart_backend
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
}
