use crate::db;
use crate::state::DaemonState;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

const TICK_SECONDS: u64 = 5;

pub fn spawn(app: AppHandle, db_path: PathBuf, daemon: Arc<Mutex<DaemonState>>) {
    thread::spawn(move || run_loop(app, db_path, daemon));
}

fn run_loop(app: AppHandle, db_path: PathBuf, daemon: Arc<Mutex<DaemonState>>) {
    let conn = match db::open(&db_path) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[daemon] cannot open DB: {e}");
            return;
        }
    };

    let mut last_trigger = Instant::now();

    loop {
        thread::sleep(Duration::from_secs(TICK_SECONDS));

        let paused = match daemon.lock() {
            Ok(g) => g.is_paused(),
            Err(p) => p.into_inner().is_paused(),
        };

        if paused {
            last_trigger = Instant::now();
            continue;
        }

        let interval_mins = db::queries::get_interval_minutes(&conn).unwrap_or(15);
        let interval_secs = u64::from(interval_mins.saturating_mul(60));

        if last_trigger.elapsed().as_secs() >= interval_secs {
            show_prompt(&app);
            last_trigger = Instant::now();
        }
    }
}

fn show_prompt(app: &AppHandle) {
    let Some(window) = app.get_webview_window("prompt") else {
        eprintln!("[daemon] prompt window missing");
        return;
    };

    if let Err(e) = window.show() {
        eprintln!("[daemon] show failed: {e}");
    }
    let _ = window.unminimize();
    let _ = window.set_focus();
    let _ = window.set_always_on_top(true);
    if let Err(e) = window.emit("time-to-log", ()) {
        eprintln!("[daemon] emit failed: {e}");
    }
}
