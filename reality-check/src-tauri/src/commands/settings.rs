use crate::db::queries;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn get_interval(state: State<'_, AppState>) -> AppResult<u32> {
    let conn = state.db()?;
    queries::get_interval_minutes(&conn)
}

#[tauri::command]
pub fn set_interval(state: State<'_, AppState>, minutes: u32) -> AppResult<()> {
    if minutes == 0 {
        return Err(AppError::InvalidInput("interval must be >= 1".into()));
    }
    if minutes > 240 {
        return Err(AppError::InvalidInput("interval must be <= 240".into()));
    }
    let conn = state.db()?;
    queries::set_setting(&conn, "interval_minutes", &minutes.to_string())
}
