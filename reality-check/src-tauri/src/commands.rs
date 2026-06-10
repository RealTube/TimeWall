//! Tauri commands — thin, validated wrappers over [`crate::db`]. Every command
//! locks the shared connection only briefly and never panics.

use chrono::Utc;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_autostart::ManagerExt;

use crate::db::{self, ActivityLog, AppState, Category, CategorySlice, DayTotal};
use crate::timer::evaluate_due;

const MAX_ACTIVITY_LEN: usize = 200;
const MAX_CATEGORY_LEN: usize = 40;

fn lock<'a>(state: &'a State<AppState>) -> Result<std::sync::MutexGuard<'a, rusqlite::Connection>, String> {
    state.conn.lock().map_err(|_| "database is busy".to_string())
}

fn clean(input: &str, max: usize) -> Result<String, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("Cannot be empty".into());
    }
    Ok(trimmed.chars().take(max).collect())
}

/// Re-arm the next prompt relative to now (used after interval/pause changes).
fn rearm(conn: &rusqlite::Connection) -> Result<(), String> {
    let interval: i64 = db::get_setting_or(conn, "interval_minutes", "15")
        .parse()
        .unwrap_or(15);
    let align = db::get_setting_or(conn, "align_to_clock", "1") == "1";
    let (_fire, next) = evaluate_due(Utc::now().timestamp(), 0, interval * 60, align);
    db::set_setting(conn, "next_prompt_at", &next.to_string())
}

// --- Logging ---------------------------------------------------------------

#[tauri::command]
pub fn log_activity(
    app: AppHandle,
    state: State<AppState>,
    activity: String,
    category_id: Option<i64>,
) -> Result<(), String> {
    let activity = clean(&activity, MAX_ACTIVITY_LEN)?;
    {
        let conn = lock(&state)?;
        let interval: i64 = db::get_setting_or(&conn, "interval_minutes", "15")
            .parse()
            .unwrap_or(15);
        db::insert_activity(&conn, &state.crypto, &activity, category_id, false, interval)?;
    }
    if let Some(p) = app.get_webview_window("prompt") {
        let _ = p.hide();
    }
    if let Some(m) = app.get_webview_window("main") {
        let _ = m.emit("refresh-dashboard", ());
    }
    Ok(())
}

#[tauri::command]
pub fn get_todays_logs(state: State<AppState>) -> Result<Vec<ActivityLog>, String> {
    let conn = lock(&state)?;
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    db::logs_for_date(&conn, &state.crypto, &today)
}

#[tauri::command]
pub fn get_logs_for_date(state: State<AppState>, date: String) -> Result<Vec<ActivityLog>, String> {
    let conn = lock(&state)?;
    db::logs_for_date(&conn, &state.crypto, &date)
}

#[tauri::command]
pub fn get_recent_activities(
    state: State<AppState>,
    limit: Option<usize>,
) -> Result<Vec<String>, String> {
    let conn = lock(&state)?;
    db::recent_activities(&conn, &state.crypto, limit.unwrap_or(8).clamp(1, 24))
}

#[tauri::command]
pub fn update_activity(
    app: AppHandle,
    state: State<AppState>,
    id: i64,
    activity: String,
    category_id: Option<i64>,
) -> Result<(), String> {
    let activity = clean(&activity, MAX_ACTIVITY_LEN)?;
    {
        let conn = lock(&state)?;
        db::update_activity(&conn, &state.crypto, id, &activity, category_id)?;
    }
    let _ = app.emit("refresh-dashboard", ());
    Ok(())
}

#[tauri::command]
pub fn delete_activity(app: AppHandle, state: State<AppState>, id: i64) -> Result<(), String> {
    {
        let conn = lock(&state)?;
        db::delete_activity(&conn, id)?;
    }
    let _ = app.emit("refresh-dashboard", ());
    Ok(())
}

// --- Settings & scheduling -------------------------------------------------

#[derive(serde::Serialize)]
pub struct AppSettings {
    interval_minutes: i64,
    paused: bool,
    idle_threshold_min: i64,
    align_to_clock: bool,
    theme: String,
    notifications: bool,
    sound: bool,
    onboarded: bool,
}

#[tauri::command]
pub fn get_settings(state: State<AppState>) -> Result<AppSettings, String> {
    let conn = lock(&state)?;
    Ok(AppSettings {
        interval_minutes: db::get_setting_or(&conn, "interval_minutes", "15")
            .parse()
            .unwrap_or(15),
        paused: db::get_setting_or(&conn, "paused", "0") == "1",
        idle_threshold_min: db::get_setting_or(&conn, "idle_threshold_min", "5")
            .parse()
            .unwrap_or(5),
        align_to_clock: db::get_setting_or(&conn, "align_to_clock", "1") == "1",
        theme: db::get_setting_or(&conn, "theme", "system"),
        notifications: db::get_setting_or(&conn, "notifications", "1") == "1",
        sound: db::get_setting_or(&conn, "sound", "1") == "1",
        onboarded: db::get_setting_or(&conn, "onboarded", "0") == "1",
    })
}

#[tauri::command]
pub fn get_interval(state: State<AppState>) -> Result<u32, String> {
    let conn = lock(&state)?;
    Ok(db::get_setting_or(&conn, "interval_minutes", "15")
        .parse()
        .unwrap_or(15))
}

#[tauri::command]
pub fn set_interval(state: State<AppState>, minutes: i64) -> Result<(), String> {
    if !(1..=240).contains(&minutes) {
        return Err("Interval must be between 1 and 240 minutes".into());
    }
    let conn = lock(&state)?;
    db::set_setting(&conn, "interval_minutes", &minutes.to_string())?;
    rearm(&conn)
}

/// Generic setter for boolean/string settings on an allow-list.
#[tauri::command]
pub fn update_setting(state: State<AppState>, key: String, value: String) -> Result<(), String> {
    const ALLOWED: &[&str] = &[
        "idle_threshold_min",
        "align_to_clock",
        "theme",
        "notifications",
        "sound",
        "onboarded",
    ];
    if !ALLOWED.contains(&key.as_str()) {
        return Err(format!("Setting '{key}' is not writable"));
    }
    let conn = lock(&state)?;
    db::set_setting(&conn, &key, &value)
}

#[tauri::command]
pub fn set_pause(app: AppHandle, state: State<AppState>, paused: bool) -> Result<(), String> {
    {
        let conn = lock(&state)?;
        db::set_setting(&conn, "paused", if paused { "1" } else { "0" })?;
        if !paused {
            rearm(&conn)?;
        }
    }
    let _ = app.emit("refresh-dashboard", ());
    Ok(())
}

/// Push the next prompt out by a few minutes (the prompt's "snooze"/Esc action).
#[tauri::command]
pub fn snooze(app: AppHandle, state: State<AppState>, minutes: Option<i64>) -> Result<(), String> {
    let m = minutes.unwrap_or(5).clamp(1, 120);
    {
        let conn = lock(&state)?;
        let next = Utc::now().timestamp() + m * 60;
        db::set_setting(&conn, "next_prompt_at", &next.to_string())?;
    }
    if let Some(p) = app.get_webview_window("prompt") {
        let _ = p.hide();
    }
    Ok(())
}

// --- Categories ------------------------------------------------------------

#[tauri::command]
pub fn list_categories(state: State<AppState>) -> Result<Vec<Category>, String> {
    let conn = lock(&state)?;
    db::list_categories(&conn)
}

#[tauri::command]
pub fn add_category(
    state: State<AppState>,
    name: String,
    color: String,
    is_productive: bool,
) -> Result<i64, String> {
    let name = clean(&name, MAX_CATEGORY_LEN)?;
    let color = clean(&color, 9)?;
    let conn = lock(&state)?;
    db::add_category(&conn, &name, &color, is_productive)
}

#[tauri::command]
pub fn update_category(
    state: State<AppState>,
    id: i64,
    name: String,
    color: String,
    is_productive: bool,
) -> Result<(), String> {
    let name = clean(&name, MAX_CATEGORY_LEN)?;
    let color = clean(&color, 9)?;
    let conn = lock(&state)?;
    db::update_category(&conn, id, &name, &color, is_productive)
}

#[tauri::command]
pub fn delete_category(state: State<AppState>, id: i64) -> Result<(), String> {
    let conn = lock(&state)?;
    db::delete_category(&conn, id)
}

// --- Insights --------------------------------------------------------------

#[tauri::command]
pub fn get_day_totals(
    state: State<AppState>,
    start: String,
    end: String,
) -> Result<Vec<DayTotal>, String> {
    let conn = lock(&state)?;
    db::day_totals(&conn, &start, &end)
}

#[tauri::command]
pub fn get_category_breakdown(
    state: State<AppState>,
    start: String,
    end: String,
) -> Result<Vec<CategorySlice>, String> {
    let conn = lock(&state)?;
    db::category_breakdown(&conn, &start, &end)
}

// --- Autostart -------------------------------------------------------------

#[tauri::command]
pub fn set_autostart(app: AppHandle, enabled: bool) -> Result<(), String> {
    let manager = app.autolaunch();
    if enabled {
        manager.enable().map_err(|e| e.to_string())
    } else {
        manager.disable().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn get_autostart(app: AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}
