// DuckQuery desktop shell: launches the PyInstaller onedir backend as a child
// process, reads the OS-assigned loopback port it prints on stdout, exposes that
// to the webview, and kills the backend when the app exits.

use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

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

/// Open a URL in the user's default browser. The Tauri webview blocks
/// window.open() to external origins, so the frontend routes external links
/// (and localhost download URLs) through this command instead.
#[tauri::command]
fn open_external(url: String) {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return; // only http(s); ignore anything else
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
    });
}

fn kill_backend(app: &AppHandle) {
    if let Some(mut child) = app.state::<Backend>().0.lock().unwrap().take() {
        let _ = child.kill();
        let _ = child.wait();
        eprintln!("[duckquery] backend killed");
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
    }

    builder
        .manage(ApiPort::default())
        .manage(Backend(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![get_api_base, open_external])
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
