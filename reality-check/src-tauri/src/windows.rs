use crate::error::AppResult;
use tauri::{App, Manager, WindowEvent};

const HIDE_ON_CLOSE: &[&str] = &["main", "prompt"];

pub fn attach_hide_on_close(app: &App) -> AppResult<()> {
    for label in HIDE_ON_CLOSE {
        let Some(window) = app.get_webview_window(label) else {
            continue;
        };
        let handle = window.clone();
        window.on_window_event(move |event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = handle.hide();
            }
        });
    }
    Ok(())
}
