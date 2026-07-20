// Hide the console window in release builds (this is a GUI app).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, RunEvent, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

const DAEMON_ORIGIN: &str = "http://127.0.0.1:4400";
const DAEMON_ADDR: &str = "127.0.0.1:4400";

/// Handle to the daemon process the shell spawns, or an already-running instance.
enum DaemonHandle {
    Owned(Child),
    External,
}

struct DaemonState(Mutex<Option<DaemonHandle>>);

fn is_control_home(p: &Path) -> bool {
    p.join("apps").join("daemon").exists()
}

/// Locate CONTROL_HOME: env override, then bundled resources (installed app),
/// then walk up from the executable to a monorepo checkout (dev).
fn find_control_home(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(home) = std::env::var("CONTROL_HOME") {
        let p = PathBuf::from(home);
        if is_control_home(&p) {
            return Some(p);
        }
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        if is_control_home(&resource_dir) {
            return Some(resource_dir);
        }
    }

    let mut dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
    loop {
        if dir.join("pnpm-workspace.yaml").exists() && is_control_home(&dir) {
            return Some(dir);
        }
        if dir.join(".control-home").exists() && is_control_home(&dir) {
            return Some(dir);
        }
        if !dir.pop() {
            return None;
        }
    }
}

/// Resolve `node.exe` on Windows so we don't pick up a `.cmd` shim that mangles
/// backslash paths (symptom: `EISDIR … lstat 'C:'`).
fn node_program() -> PathBuf {
    #[cfg(windows)]
    {
        if let Some(path) = which_node_exe() {
            return path;
        }
    }
    PathBuf::from("node")
}

#[cfg(windows)]
fn which_node_exe() -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        let candidate = dir.join("node.exe");
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

/// Spawn the daemon. Prefer the staged `dist/index.js` (installed / bundled);
/// fall back to `tsx` + TypeScript sources when running from the monorepo.
///
/// Entry args are relative to `daemon_dir` so Windows never sees a `C:\…`
/// script path that shims can truncate to `C:`.
fn spawn_daemon(home: &Path) -> std::io::Result<Child> {
    use std::io::Write;

    let daemon_dir = home.join("apps").join("daemon");
    let dist_entry = daemon_dir.join("dist").join("index.js");
    let src_entry = daemon_dir.join("src").join("index.ts");
    let log_path = std::env::temp_dir().join("control-daemon.log");

    let mut cmd = Command::new(node_program());
    let entry_label: String;
    if dist_entry.is_file() {
        cmd.arg("dist/index.js");
        entry_label = format!("dist/index.js (home={})", home.display());
    } else if src_entry.is_file() {
        cmd.arg("--import").arg("tsx").arg("src/index.ts");
        entry_label = format!("src/index.ts via tsx (home={})", home.display());
    } else {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!(
                "no daemon entry under {} (expected dist/index.js or src/index.ts)",
                daemon_dir.display()
            ),
        ));
    }

    if let Ok(mut header) = std::fs::File::create(&log_path) {
        let _ = writeln!(
            header,
            "[control-shell] spawning node → {entry_label}\n[control-shell] cwd {}\n",
            daemon_dir.display()
        );
    }

    let log = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .ok();

    cmd.current_dir(&daemon_dir)
        .env("CONTROL_HOME", home)
        .stdin(Stdio::null());
    if let Some(f) = log {
        let err = f.try_clone().ok();
        cmd.stdout(Stdio::from(f));
        if let Some(e) = err {
            cmd.stderr(Stdio::from(e));
        }
    } else {
        cmd.stdout(Stdio::null()).stderr(Stdio::null());
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd.spawn()
}

/// True when an existing CONTROL daemon is already listening and healthy.
fn is_control_daemon_healthy() -> bool {
    let addr = DAEMON_ADDR.parse().expect("valid addr");
    let mut stream = match TcpStream::connect_timeout(&addr, Duration::from_millis(500)) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
    if stream
        .write_all(
            b"GET /api/health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
        )
        .is_err()
    {
        return false;
    }
    let mut buf = [0u8; 512];
    let Ok(n) = stream.read(&mut buf) else {
        return false;
    };
    let text = String::from_utf8_lossy(&buf[..n]);
    text.contains("\"ok\":true") || text.contains("\"ok\": true")
}

/// Block until the daemon accepts connections (~30s budget).
fn wait_for_daemon() -> bool {
    let addr = DAEMON_ADDR.parse().expect("valid addr");
    for _ in 0..60 {
        if is_control_daemon_healthy() {
            return true;
        }
        if TcpStream::connect_timeout(&addr, Duration::from_millis(500)).is_ok() {
            std::thread::sleep(Duration::from_millis(200));
            if is_control_daemon_healthy() {
                return true;
            }
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    false
}

fn show_main(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

/// Point the window at the daemon once it's up, or surface a failure message.
fn load_when_ready(app: &AppHandle) {
    let handle = app.clone();
    std::thread::spawn(move || {
        if wait_for_daemon() {
            if let Some(win) = handle.get_webview_window("main") {
                let _ = win.eval(&format!("window.location.replace('{DAEMON_ORIGIN}')"));
            }
        } else if let Some(win) = handle.get_webview_window("main") {
            let _ = win.eval(
                "document.getElementById('status').textContent = \
                 'Daemon did not start — is Node.js ≥22 on PATH? See %TEMP%\\\\control-daemon.log';",
            );
        }
    });
}

fn restart_daemon(app: &AppHandle) {
    let state = app.state::<DaemonState>();
    {
        let mut guard = state.0.lock().unwrap();
        if let Some(handle) = guard.take() {
            if let DaemonHandle::Owned(mut child) = handle {
                let _ = child.kill();
            }
        }
    }
    if is_control_daemon_healthy() {
        *state.0.lock().unwrap() = Some(DaemonHandle::External);
    } else if let Some(home) = find_control_home(app) {
        if let Ok(child) = spawn_daemon(&home) {
            *state.0.lock().unwrap() = Some(DaemonHandle::Owned(child));
        }
    }
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.eval("window.location.replace('index.html')");
    }
    load_when_ready(app);
}

/// Quit policy: kill only a shell-spawned daemon. An adopted external daemon
/// keeps running so dev servers survive closing the tray UI.
fn kill_daemon(app: &AppHandle) {
    let state = app.state::<DaemonState>();
    let handle = state.0.lock().unwrap().take();
    if let Some(DaemonHandle::Owned(mut child)) = handle {
        let _ = child.kill();
    }
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_dialog::init())
        .manage(DaemonState(Mutex::new(None)))
        .setup(|app| {
            let handle = app.handle();

            if is_control_daemon_healthy() {
                *app.state::<DaemonState>().0.lock().unwrap() = Some(DaemonHandle::External);
            } else if let Some(home) = find_control_home(handle) {
                if let Ok(child) = spawn_daemon(&home) {
                    *app.state::<DaemonState>().0.lock().unwrap() = Some(DaemonHandle::Owned(child));
                }
            }

            let open = MenuItem::with_id(app, "open", "Open CONTROL", true, None::<&str>)?;
            let restart = MenuItem::with_id(app, "restart", "Restart daemon", true, None::<&str>)?;
            let autostart_enabled = handle.autolaunch().is_enabled().unwrap_or(false);
            let autostart = MenuItem::with_id(
                app,
                "autostart",
                if autostart_enabled {
                    "✓ Start on login"
                } else {
                    "Start on login"
                },
                true,
                None::<&str>,
            )?;
            let quit = MenuItem::with_id(app, "quit", "Quit CONTROL", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &restart, &autostart, &quit])?;

            let autostart_item = autostart.clone();
            TrayIconBuilder::with_id("control-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("CONTROL — Local Dev Command Center")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "open" => show_main(app),
                    "restart" => restart_daemon(app),
                    "quit" => {
                        kill_daemon(app);
                        app.exit(0);
                    }
                    "autostart" => {
                        let mgr = app.autolaunch();
                        let now_enabled = if mgr.is_enabled().unwrap_or(false) {
                            let _ = mgr.disable();
                            false
                        } else {
                            let _ = mgr.enable();
                            true
                        };
                        let _ = autostart_item.set_text(if now_enabled {
                            "✓ Start on login"
                        } else {
                            "Start on login"
                        });
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;

            load_when_ready(handle);
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the window hides to tray — the daemon (and your servers)
            // keep running. Quit fully from the tray menu.
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .build(tauri::generate_context!())
        .expect("failed to build CONTROL shell");

    app.run(|app_handle, event| {
        if let RunEvent::ExitRequested { .. } = event {
            kill_daemon(app_handle);
        }
    });
}
