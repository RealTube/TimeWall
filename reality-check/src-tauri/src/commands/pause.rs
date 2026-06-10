use crate::error::{AppError, AppResult};
use crate::state::{AppState, PauseStatus};
use crate::tray;
use chrono::Duration as ChronoDuration;
use serde::Deserialize;
use tauri::{AppHandle, Emitter, State};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case", tag = "kind", content = "value")]
pub enum PausePayload {
    Minutes(i64),
    UntilTomorrow,
}

#[tauri::command]
pub fn pause_daemon(
    app: AppHandle,
    state: State<'_, AppState>,
    payload: PausePayload,
) -> AppResult<PauseStatus> {
    let duration = match payload {
        PausePayload::Minutes(m) => {
            if m <= 0 {
                return Err(AppError::InvalidInput("minutes must be positive".into()));
            }
            Some(ChronoDuration::minutes(m))
        }
        PausePayload::UntilTomorrow => tray::pause_until_tomorrow(),
    };

    tray::set_pause(&state.daemon, duration);
    let _ = app.emit("pause-changed", ());
    current_pause_status(&state)
}

#[tauri::command]
pub fn resume_daemon(app: AppHandle, state: State<'_, AppState>) -> AppResult<PauseStatus> {
    tray::set_pause(&state.daemon, None);
    let _ = app.emit("pause-changed", ());
    current_pause_status(&state)
}

#[tauri::command]
pub fn get_pause_status(state: State<'_, AppState>) -> AppResult<PauseStatus> {
    current_pause_status(&state)
}

fn current_pause_status(state: &State<'_, AppState>) -> AppResult<PauseStatus> {
    let guard = state.daemon.lock().map_err(|_| AppError::LockPoisoned)?;
    Ok(PauseStatus::from(&*guard))
}
