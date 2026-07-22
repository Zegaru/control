// Hide the console window in release builds (this is a GUI app).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, RunEvent, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_positioner::{Position, WindowExt};

const DAEMON_ORIGIN: &str = "http://127.0.0.1:4400";
const DAEMON_ADDR: &str = "127.0.0.1:4400";
const VITE_UI_ORIGIN: &str = "http://127.0.0.1:5173";
/// Nudge the tray popover down from TrayCenter (pixels).
const TRAY_POPOVER_Y_NUDGE: i32 = 24;

/// Set to `false` to restore the OS-native tray context menu.
const USE_CUSTOM_TRAY_POPOVER: bool = true;

/// Handle to the daemon process the shell spawns, or an already-running instance.
enum DaemonHandle {
    Owned(Child),
    External,
}

struct DaemonState(Mutex<Option<DaemonHandle>>);

fn is_control_home(p: &Path) -> bool {
    p.join("apps").join("daemon").exists()
}

/// Locate CONTROL_HOME: env override, then (dev) monorepo checkout, then bundled
/// resources (installed app), then monorepo walk-up from the executable.
fn find_control_home(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(home) = std::env::var("CONTROL_HOME") {
        let p = PathBuf::from(home);
        if is_control_home(&p) {
            return Some(p);
        }
    }

    #[cfg(debug_assertions)]
    if let Some(home) = find_monorepo_home() {
        return Some(home);
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        if is_control_home(&resource_dir) {
            return Some(resource_dir);
        }
    }

    find_monorepo_home()
}

fn find_monorepo_home() -> Option<PathBuf> {
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
    // Dev shell builds: run TypeScript sources so daemon changes apply without
    // rebuilding dist/ (stale dist caused empty PATCH updates for new fields).
    if cfg!(debug_assertions) && src_entry.is_file() {
        cmd.arg("--import").arg("tsx").arg("src/index.ts");
        entry_label = format!("src/index.ts via tsx (home={})", home.display());
    } else if dist_entry.is_file() {
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
    #[cfg(debug_assertions)]
    {
        cmd.env("CONTROL_DEV", "1");
    }
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

fn is_vite_dev_up() -> bool {
    "127.0.0.1:5173"
        .parse::<std::net::SocketAddr>()
        .ok()
        .and_then(|addr| TcpStream::connect_timeout(&addr, Duration::from_millis(300)).ok())
        .is_some()
}

/// Dev: prefer the Vite dev server (live UI). Release / no Vite: daemon-served dist.
fn ui_load_origin() -> &'static str {
    #[cfg(debug_assertions)]
    {
        if is_vite_dev_up() {
            return VITE_UI_ORIGIN;
        }
    }
    DAEMON_ORIGIN
}

fn wait_for_ui_load() -> bool {
    let origin = ui_load_origin();
    if origin == VITE_UI_ORIGIN {
        for _ in 0..60 {
            if is_vite_dev_up() && is_control_daemon_healthy() {
                return true;
            }
            std::thread::sleep(Duration::from_millis(500));
        }
        is_vite_dev_up() && is_control_daemon_healthy()
    } else {
        wait_for_daemon()
    }
}

fn show_main(app: &AppHandle) {
    hide_tray_popover(app);
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

fn hide_tray_popover(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("tray") {
        let _ = win.hide();
    }
}

fn position_tray_popover(win: &tauri::WebviewWindow) {
    if win.move_window_constrained(Position::TrayCenter).is_ok() {
        if let Ok(pos) = win.outer_position() {
            let _ = win.set_position(PhysicalPosition::new(pos.x, pos.y + TRAY_POPOVER_Y_NUDGE));
        }
    }
}

fn push_tray_stats(app: &AppHandle) {
    let snap = tray_get_snapshot();
    let Ok(json) = serde_json::to_string(&snap) else {
        return;
    };
    if let Some(win) = app.get_webview_window("tray") {
        let _ = win.eval(&format!(
            "if (window.__controlTrayApply) window.__controlTrayApply({json});"
        ));
    }
}

fn toggle_tray_popover(app: &AppHandle) {
    let Some(win) = app.get_webview_window("tray") else {
        return;
    };
    if win.is_visible().unwrap_or(false) {
        let _ = win.hide();
        return;
    }
    position_tray_popover(&win);
    let _ = win.show();
    let _ = win.set_focus();
    push_tray_stats(app);
    let _ = app.emit_to("tray", "tray-shown", ());
    let _ = win.eval("window.__controlTrayFocus?.()");
}

fn fetch_daemon_json(path: &str) -> Option<serde_json::Value> {
    let addr = DAEMON_ADDR.parse().ok()?;
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(800)).ok()?;
    let _ = stream.set_read_timeout(Some(Duration::from_millis(800)));
    let req = format!(
        "GET /api{path} HTTP/1.1\r\nHost: 127.0.0.1\r\nAccept: application/json\r\nConnection: close\r\n\r\n"
    );
    stream.write_all(req.as_bytes()).ok()?;
    let mut buf = Vec::new();
    stream.read_to_end(&mut buf).ok()?;
    let text = String::from_utf8_lossy(&buf);
    let body = text.split("\r\n\r\n").nth(1)?.trim();
    serde_json::from_str(body).ok()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TraySnapshot {
    online: bool,
    cpu: u8,
    memory: u8,
    project_count: usize,
    active_runs: usize,
    docker_available: Option<bool>,
}

#[tauri::command]
fn tray_get_snapshot() -> TraySnapshot {
    let online = fetch_daemon_json("/health")
        .as_ref()
        .and_then(|v| v.get("ok"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    if !online {
        return TraySnapshot {
            online: false,
            cpu: 0,
            memory: 0,
            project_count: 0,
            active_runs: 0,
            docker_available: None,
        };
    }

    let metrics = fetch_daemon_json("/host/metrics");
    let cpu = metrics
        .as_ref()
        .and_then(|v| v.get("cpu"))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0)
        .round()
        .clamp(0.0, 100.0) as u8;
    let memory = metrics
        .as_ref()
        .and_then(|v| v.get("memory"))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0)
        .round()
        .clamp(0.0, 100.0) as u8;

    let (project_count, active_runs) = fetch_daemon_json("/projects")
        .and_then(|v| v.as_array().cloned())
        .map(|projects| {
            let active = projects
                .iter()
                .filter_map(|p| p.get("activeRunCount").and_then(|n| n.as_u64()))
                .sum::<u64>() as usize;
            (projects.len(), active)
        })
        .unwrap_or((0, 0));

    let docker_available = fetch_daemon_json("/docker/status")
        .as_ref()
        .and_then(|v| v.get("available"))
        .and_then(|v| v.as_bool());

    TraySnapshot {
        online: true,
        cpu,
        memory,
        project_count,
        active_runs,
        docker_available,
    }
}

/// Point the window at the UI once the daemon (and optional Vite dev server) are up.
fn load_when_ready(app: &AppHandle) {
    let handle = app.clone();
    std::thread::spawn(move || {
        if wait_for_ui_load() {
            let origin = ui_load_origin();
            if let Some(win) = handle.get_webview_window("main") {
                let _ = win.eval(&format!("window.location.replace('{origin}')"));
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

#[tauri::command]
fn tray_open(app: AppHandle) {
    show_main(&app);
}

#[tauri::command]
fn tray_restart_daemon(app: AppHandle) {
    restart_daemon(&app);
}

#[tauri::command]
fn tray_is_autostart_enabled(app: AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
fn tray_toggle_autostart(app: AppHandle) -> bool {
    let mgr = app.autolaunch();
    let now_enabled = if mgr.is_enabled().unwrap_or(false) {
        let _ = mgr.disable();
        false
    } else {
        let _ = mgr.enable();
        true
    };
    now_enabled
}

#[tauri::command]
fn tray_quit(app: AppHandle) {
    kill_daemon(&app);
    app.exit(0);
}

#[tauri::command]
fn tray_hide(app: AppHandle) {
    hide_tray_popover(&app);
}

fn build_native_tray_menu(app: &mut tauri::App) -> tauri::Result<()> {
    let handle = app.handle();
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

    Ok(())
}

fn build_custom_tray_popover(app: &mut tauri::App) -> tauri::Result<()> {
    TrayIconBuilder::with_id("control-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("CONTROL — Local Dev Command Center")
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            tauri_plugin_positioner::on_tray_event(tray.app_handle(), &event);
            match event {
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } => show_main(tray.app_handle()),
                TrayIconEvent::Click {
                    button: MouseButton::Right,
                    button_state: MouseButtonState::Up,
                    ..
                } => toggle_tray_popover(tray.app_handle()),
                _ => {}
            }
        })
        .build(app)?;

    Ok(())
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_positioner::init())
        .invoke_handler(tauri::generate_handler![
            tray_open,
            tray_restart_daemon,
            tray_toggle_autostart,
            tray_is_autostart_enabled,
            tray_quit,
            tray_hide,
            tray_get_snapshot,
        ])
        .manage(DaemonState(Mutex::new(None)))
        .setup(|app| {
            let handle = app.handle().clone();

            if is_control_daemon_healthy() {
                *app.state::<DaemonState>().0.lock().unwrap() = Some(DaemonHandle::External);
            } else if let Some(home) = find_control_home(&handle) {
                if let Ok(child) = spawn_daemon(&home) {
                    *app.state::<DaemonState>().0.lock().unwrap() = Some(DaemonHandle::Owned(child));
                }
            }

            if USE_CUSTOM_TRAY_POPOVER {
                build_custom_tray_popover(app)?;
            } else {
                build_native_tray_menu(app)?;
            }

            load_when_ready(&handle);
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "tray" {
                if let WindowEvent::Focused(false) = event {
                    let _ = window.hide();
                }
                return;
            }

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
