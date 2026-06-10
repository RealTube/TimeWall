use crate::error::{AppError, AppResult};
use chrono::{DateTime, Local};
use rusqlite::Connection;
use serde::Serialize;
use std::sync::{Arc, Mutex, MutexGuard};

pub struct AppState {
    db: Mutex<Connection>,
    pub daemon: Arc<Mutex<DaemonState>>,
}

impl AppState {
    pub fn new(conn: Connection) -> Self {
        Self {
            db: Mutex::new(conn),
            daemon: Arc::new(Mutex::new(DaemonState::default())),
        }
    }

    pub fn db(&self) -> AppResult<MutexGuard<'_, Connection>> {
        self.db.lock().map_err(|_| AppError::LockPoisoned)
    }
}

#[derive(Debug, Default, Clone)]
pub struct DaemonState {
    pub paused_until: Option<DateTime<Local>>,
}

impl DaemonState {
    pub fn is_paused(&self) -> bool {
        match self.paused_until {
            Some(until) => until > Local::now(),
            None => false,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct PauseStatus {
    pub paused: bool,
    pub paused_until: Option<String>,
}

impl From<&DaemonState> for PauseStatus {
    fn from(state: &DaemonState) -> Self {
        let paused = state.is_paused();
        Self {
            paused,
            paused_until: if paused {
                state.paused_until.map(|t| t.to_rfc3339())
            } else {
                None
            },
        }
    }
}
