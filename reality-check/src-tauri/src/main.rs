// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rusqlite::{Connection, Result as SqlResult};
use chrono::Local;
use tauri::Manager;
use serde::Serialize;
use tauri::Emitter;
use std::thread;
use std::time::Duration;

// 1. Define the data structure that will be sent to React
#[derive(Serialize)]
struct ActivityLog {
    id: i32,
    time: String,
    activity: String,
}

fn get_db_connection() -> SqlResult<Connection> {
    let db_path = "reality_check.db";
    let conn = Connection::open(db_path)?;
    
    conn.execute(
        "CREATE TABLE IF NOT EXISTS activity_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            activity TEXT NOT NULL
        )",
        (),
    )?;
    
    Ok(conn)
}

// 2. The command to fetch today's data
#[tauri::command]
fn get_todays_logs() -> Result<Vec<ActivityLog>, String> {
    let conn = get_db_connection().map_err(|e| e.to_string())?;
    
    let now = Local::now();
    let today = now.format("%Y-%m-%d").to_string();

    // Query SQLite for today's logs, ordered by newest first
    let mut stmt = conn
        .prepare("SELECT id, time, activity FROM activity_log WHERE date = ?1 ORDER BY time DESC")
        .map_err(|e| e.to_string())?;
    
    let logs_iter = stmt.query_map([&today], |row| {
        Ok(ActivityLog {
            id: row.get(0)?,
            time: row.get(1)?,
            activity: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut logs = Vec::new();
    for log in logs_iter {
        logs.push(log.map_err(|e| e.to_string())?);
    }

    Ok(logs)
}

#[tauri::command]
fn log_activity(app: tauri::AppHandle, activity: String) -> Result<String, String> {
    let conn = match get_db_connection() {
        Ok(c) => c,
        Err(e) => return Err(format!("Database connection failed: {}", e)),
    };

    let now = Local::now();
    let date = now.format("%Y-%m-%d").to_string();
    let time = now.format("%H:%M:%S").to_string();

    match conn.execute(
        "INSERT INTO activity_log (date, time, activity) VALUES (?1, ?2, ?3)",
        (&date, &time, &activity),
    ) {
        Ok(_) => {
            if let Some(window) = app.get_webview_window("main") {
                window.hide().unwrap();
            }
            Ok("Successfully saved to database".to_string())
        }
        Err(e) => Err(format!("Failed to save activity: {}", e)),
    }
}

fn main() {
    if let Err(e) = get_db_connection() {
        eprintln!("Critical Error: Failed to initialize database: {}", e);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![log_activity, get_todays_logs])
        .setup(|app| {
            let app_handle = app.handle().clone();
            
            // SPAWN THE BACKGROUND DAEMON
            thread::spawn(move || {
                loop {
                    // Waiting 10 seconds for testing!
                    thread::sleep(Duration::from_secs(10));

                    if let Some(window) = app_handle.get_webview_window("main") {
                        window.show().unwrap();
                        window.unminimize().unwrap();
                        window.set_focus().unwrap();
                        window.set_always_on_top(true).unwrap();
                        
                        // 2. CHANGE {} TO () RIGHT HERE
                        window.emit("time-to-log", ()).unwrap();
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}