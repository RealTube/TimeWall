// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rusqlite::{Connection, Result as SqlResult};
use chrono::Local;
use serde::Serialize;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

#[derive(Serialize)]
struct ActivityLog {
    id: i32,
    time: String,
    activity: String,
}

fn get_db_connection() -> SqlResult<Connection> {
    let db_path = "reality_check.db";
    let conn = Connection::open(db_path)?;
    
    // Logs table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS activity_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            activity TEXT NOT NULL
        )",
        (),
    )?;

    // NEW: Settings table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )",
        (),
    )?;

    // Insert default interval of 15 minutes if it doesn't exist
    conn.execute(
        "INSERT OR IGNORE INTO settings (key, value) VALUES ('interval_minutes', '15')",
        (),
    )?;
    
    Ok(conn)
}

// Command: Get Interval
#[tauri::command]
fn get_interval() -> Result<u32, String> {
    let conn = get_db_connection().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = 'interval_minutes'").map_err(|e| e.to_string())?;
    let interval_str: String = stmt.query_row([], |row| row.get(0)).unwrap_or_else(|_| "15".to_string());
    Ok(interval_str.parse().unwrap_or(15))
}

// Command: Set Interval
#[tauri::command]
fn set_interval(minutes: u32) -> Result<String, String> {
    let conn = get_db_connection().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE settings SET value = ?1 WHERE key = 'interval_minutes'",
        [&minutes.to_string()],
    ).map_err(|e| e.to_string())?;
    Ok("Interval updated".to_string())
}

#[tauri::command]
fn get_todays_logs() -> Result<Vec<ActivityLog>, String> {
    let conn = get_db_connection().map_err(|e| e.to_string())?;
    let now = Local::now();
    let today = now.format("%Y-%m-%d").to_string();

    let mut stmt = conn.prepare("SELECT id, time, activity FROM activity_log WHERE date = ?1 ORDER BY time DESC").map_err(|e| e.to_string())?;
    let logs_iter = stmt.query_map([&today], |row| {
        Ok(ActivityLog { id: row.get(0)?, time: row.get(1)?, activity: row.get(2)? })
    }).map_err(|e| e.to_string())?;

    let mut logs = Vec::new();
    for log in logs_iter { logs.push(log.map_err(|e| e.to_string())?); }
    Ok(logs)
}

#[tauri::command]
fn log_activity(app: tauri::AppHandle, activity: String) -> Result<String, String> {
    let conn = match get_db_connection() {
        Ok(c) => c, Err(e) => return Err(format!("Database connection failed: {}", e)),
    };
    let now = Local::now();
    let date = now.format("%Y-%m-%d").to_string();
    let time = now.format("%H:%M:%S").to_string();

    match conn.execute("INSERT INTO activity_log (date, time, activity) VALUES (?1, ?2, ?3)", (&date, &time, &activity)) {
        Ok(_) => {
            if let Some(window) = app.get_webview_window("prompt") { window.hide().unwrap(); }
            if let Some(main_window) = app.get_webview_window("main") { let _ = main_window.emit("refresh-dashboard", ()); }
            Ok("Success".to_string())
        }
        Err(e) => Err(format!("Failed to save: {}", e)),
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![log_activity, get_todays_logs, get_interval, set_interval])
        .setup(|app| {
            let app_handle = app.handle().clone();

            // 1. CREATE SYSTEM TRAY ICON
            // Clicking the tray icon on Mac/Windows will open the hidden dashboard
            let default_icon = app.default_window_icon().unwrap().clone();
            TrayIconBuilder::new()
                .tooltip("Hima")
                .icon(default_icon)
                .on_tray_icon_event(|tray, event| match event {
                    TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } => {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            window.show().unwrap();
                            window.set_focus().unwrap();
                        }
                    }
                    _ => {}
                })
                .build(app)?;
            
            // 2. THE SMART BACKGROUND DAEMON
            thread::spawn(move || {
                let mut last_trigger = Instant::now();
                
                loop {
                    // Check the clock every 5 seconds (very light on CPU)
                    thread::sleep(Duration::from_secs(5));

                    // Get current interval from database
                    let conn = get_db_connection().unwrap();
                    let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = 'interval_minutes'").unwrap();
                    let interval_str: String = stmt.query_row([], |row| row.get(0)).unwrap_or_else(|_| "15".to_string());
                    let interval_mins: u64 = interval_str.parse().unwrap_or(15);
                    
                    // If time elapsed is greater than or equal to the interval
                    if last_trigger.elapsed().as_secs() >= (interval_mins * 60) {
                        if let Some(window) = app_handle.get_webview_window("prompt") {
                            window.show().unwrap();
                            window.unminimize().unwrap();
                            window.set_focus().unwrap();
                            window.set_always_on_top(true).unwrap();
                            window.emit("time-to-log", ()).unwrap();
                        }
                        // Reset the clock!
                        last_trigger = Instant::now();
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}