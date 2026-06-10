#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod categorize;
mod commands;
mod daemon;
mod db;
mod error;
mod state;
mod tray;
mod windows;

use crate::error::AppResult;
use crate::state::AppState;
use std::path::PathBuf;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            commands::logs::get_todays_logs,
            commands::logs::get_logs_in_range,
            commands::logs::log_activity,
            commands::logs::update_log_category,
            commands::logs::get_recent_activities,
            commands::settings::get_interval,
            commands::settings::set_interval,
            commands::insights::get_streak,
            commands::insights::get_daily_goal,
            commands::insights::set_daily_goal,
            commands::insights::get_streak_min_logs,
            commands::insights::set_streak_min_logs,
            commands::pause::pause_daemon,
            commands::pause::resume_daemon,
            commands::pause::get_pause_status,
            commands::export::export_csv,
            commands::export::suggest_export_filename,
        ])
        .setup(|app| {
            let db_path = resolve_db_path(app.handle())?;
            initialize(app, db_path)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn initialize(app: &mut tauri::App, db_path: PathBuf) -> AppResult<()> {
    let conn = db::open(&db_path)?;
    let app_state = AppState::new(conn);
    let daemon_handle = app_state.daemon.clone();

    app.manage(app_state);

    tray::build(app.handle())?;
    windows::attach_hide_on_close(app)?;
    daemon::spawn(app.handle().clone(), db_path, daemon_handle);

    Ok(())
}

fn resolve_db_path(app: &tauri::AppHandle) -> AppResult<PathBuf> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| error::AppError::InvalidInput(format!("no app data dir: {e}")))?;
    std::fs::create_dir_all(&data_dir)?;
    let target = data_dir.join(db::DB_FILENAME);

    if !target.exists() {
        let legacy = PathBuf::from(db::DB_FILENAME);
        if legacy.exists() {
            migrate_legacy_db(&legacy, &target)?;
            eprintln!(
                "[hima] migrated legacy DB {} -> {}",
                legacy.display(),
                target.display()
            );
        }
    }

    Ok(target)
}

fn migrate_legacy_db(legacy: &PathBuf, target: &PathBuf) -> AppResult<()> {
    std::fs::copy(legacy, target)?;
    for ext in ["db-wal", "db-shm"] {
        let from = legacy.with_extension(ext);
        if from.exists() {
            let _ = std::fs::copy(&from, target.with_extension(ext));
        }
    }
    Ok(())
}
