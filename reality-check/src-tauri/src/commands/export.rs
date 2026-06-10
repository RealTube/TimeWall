use crate::db::queries;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use std::path::PathBuf;
use tauri::State;

#[tauri::command]
pub fn export_csv(state: State<'_, AppState>, destination: String) -> AppResult<String> {
    if destination.trim().is_empty() {
        return Err(AppError::InvalidInput("destination path required".into()));
    }
    let path = PathBuf::from(&destination);
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            return Err(AppError::InvalidInput(format!(
                "parent directory does not exist: {}",
                parent.display()
            )));
        }
    }

    let logs = {
        let conn = state.db()?;
        queries::all_logs(&conn)?
    };

    let mut writer = csv::Writer::from_path(&path)?;
    writer.write_record(["id", "date", "time", "activity", "duration_minutes"])?;
    for log in &logs {
        writer.write_record([
            log.id.to_string(),
            log.date.clone(),
            log.time.clone(),
            log.activity.clone(),
            log.duration.to_string(),
        ])?;
    }
    writer.flush()?;

    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn suggest_export_filename() -> String {
    format!("hima-export-{}.csv", chrono::Local::now().format("%Y-%m-%d"))
}
