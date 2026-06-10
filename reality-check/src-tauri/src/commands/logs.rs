use crate::categorize;
use crate::db::queries::{self, ActivityLog};
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use chrono::Local;
use tauri::{AppHandle, Emitter, Manager, State};

#[tauri::command]
pub fn get_todays_logs(state: State<'_, AppState>) -> AppResult<Vec<ActivityLog>> {
    let today = Local::now().format("%Y-%m-%d").to_string();
    let conn = state.db()?;
    queries::logs_for_date(&conn, &today)
}

#[tauri::command]
pub fn get_logs_in_range(
    state: State<'_, AppState>,
    start_date: String,
    end_date: String,
) -> AppResult<Vec<ActivityLog>> {
    let conn = state.db()?;
    queries::logs_in_range(&conn, &start_date, &end_date)
}

#[tauri::command]
pub fn log_activity(
    app: AppHandle,
    state: State<'_, AppState>,
    activity: String,
) -> AppResult<i64> {
    let trimmed = activity.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidInput("activity cannot be empty".into()));
    }

    let now = Local::now();
    let date = now.format("%Y-%m-%d").to_string();
    let time = now.format("%H:%M:%S").to_string();
    let category = categorize::categorize(trimmed);

    let conn = state.db()?;
    let interval = queries::get_interval_minutes(&conn)?;
    let id = queries::insert_log(&conn, &date, &time, trimmed, interval, category)?;
    drop(conn);

    if let Some(prompt_window) = app.get_webview_window("prompt") {
        let _ = prompt_window.hide();
    }
    if let Some(main_window) = app.get_webview_window("main") {
        let _ = main_window.emit("refresh-dashboard", ());
    }

    Ok(id)
}

#[tauri::command]
pub fn update_log_category(
    app: AppHandle,
    state: State<'_, AppState>,
    id: i64,
    category: String,
) -> AppResult<()> {
    if !categorize::is_valid(&category) {
        return Err(AppError::InvalidInput(format!(
            "unknown category: {category}"
        )));
    }
    let conn = state.db()?;
    queries::update_log_category(&conn, id, &category)?;
    drop(conn);
    let _ = app.emit("refresh-dashboard", ());
    Ok(())
}

#[tauri::command]
pub fn get_recent_activities(
    state: State<'_, AppState>,
    limit: Option<u32>,
) -> AppResult<Vec<String>> {
    let conn = state.db()?;
    queries::recent_unique_activities(&conn, limit.unwrap_or(5).clamp(1, 20))
}
