use crate::db::queries;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use chrono::Local;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct StreakInfo {
    pub days: u32,
    pub today_log_count: u32,
    pub min_logs_required: u32,
    pub today_qualifies: bool,
}

#[tauri::command]
pub fn get_streak(state: State<'_, AppState>) -> AppResult<StreakInfo> {
    let conn = state.db()?;
    let min_logs = queries::get_streak_min_logs(&conn)?;
    let today = Local::now().date_naive();
    let today_str = today.format("%Y-%m-%d").to_string();
    let today_count = queries::count_logs_for_date(&conn, &today_str)?;

    let mut streak = 0u32;
    let mut cursor = match today.pred_opt() {
        Some(d) => d,
        None => {
            return Ok(StreakInfo {
                days: 0,
                today_log_count: today_count,
                min_logs_required: min_logs,
                today_qualifies: today_count >= min_logs,
            })
        }
    };

    for _ in 0..365 {
        let date_str = cursor.format("%Y-%m-%d").to_string();
        let count = queries::count_logs_for_date(&conn, &date_str)?;
        if count >= min_logs {
            streak += 1;
            cursor = match cursor.pred_opt() {
                Some(d) => d,
                None => break,
            };
        } else {
            break;
        }
    }

    Ok(StreakInfo {
        days: streak,
        today_log_count: today_count,
        min_logs_required: min_logs,
        today_qualifies: today_count >= min_logs,
    })
}

#[tauri::command]
pub fn get_daily_goal(state: State<'_, AppState>) -> AppResult<u32> {
    let conn = state.db()?;
    queries::get_daily_goal_minutes(&conn)
}

#[tauri::command]
pub fn set_daily_goal(state: State<'_, AppState>, minutes: u32) -> AppResult<()> {
    if minutes == 0 {
        return Err(AppError::InvalidInput("goal must be >= 1 minute".into()));
    }
    if minutes > 24 * 60 {
        return Err(AppError::InvalidInput("goal must be <= 24 hours".into()));
    }
    let conn = state.db()?;
    queries::set_setting(&conn, "daily_goal_minutes", &minutes.to_string())
}

#[tauri::command]
pub fn get_streak_min_logs(state: State<'_, AppState>) -> AppResult<u32> {
    let conn = state.db()?;
    queries::get_streak_min_logs(&conn)
}

#[tauri::command]
pub fn set_streak_min_logs(state: State<'_, AppState>, count: u32) -> AppResult<()> {
    if count == 0 || count > 200 {
        return Err(AppError::InvalidInput(
            "streak threshold must be 1..=200".into(),
        ));
    }
    let conn = state.db()?;
    queries::set_setting(&conn, "streak_min_logs", &count.to_string())
}
