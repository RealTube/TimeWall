use crate::error::AppResult;
use crate::state::{AppState, DaemonState};
use chrono::{Duration as ChronoDuration, Local, TimeZone};
use std::sync::{Arc, Mutex};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

pub fn build(app: &AppHandle) -> AppResult<()> {
    let show_item = MenuItem::with_id(app, "show", "Open Hima", true, None::<&str>)?;
    let pause_1h = MenuItem::with_id(app, "pause_1h", "Pause for 1 hour", true, None::<&str>)?;
    let pause_2h = MenuItem::with_id(app, "pause_2h", "Pause for 2 hours", true, None::<&str>)?;
    let pause_today = MenuItem::with_id(
        app,
        "pause_today",
        "Pause until tomorrow",
        true,
        None::<&str>,
    )?;
    let resume = MenuItem::with_id(app, "resume", "Resume timer", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Hima", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;

    let menu = Menu::with_items(
        app,
        &[
            &show_item,
            &sep1,
            &pause_1h,
            &pause_2h,
            &pause_today,
            &resume,
            &sep2,
            &quit,
        ],
    )?;

    let default_icon = app
        .default_window_icon()
        .cloned()
        .ok_or_else(|| crate::error::AppError::WindowMissing("tray-icon"))?;

    TrayIconBuilder::new()
        .tooltip("Hima — 15-minute reality check")
        .icon(default_icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| handle_menu(app, event.id().as_ref()))
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_dashboard(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

fn handle_menu(app: &AppHandle, id: &str) {
    match id {
        "show" => show_dashboard(app),
        "pause_1h" => apply_pause(app, Some(ChronoDuration::hours(1))),
        "pause_2h" => apply_pause(app, Some(ChronoDuration::hours(2))),
        "pause_today" => apply_pause(app, pause_until_tomorrow()),
        "resume" => apply_pause(app, None),
        "quit" => app.exit(0),
        _ => {}
    }
}

fn show_dashboard(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn apply_pause(app: &AppHandle, duration: Option<ChronoDuration>) {
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    set_pause(&state.daemon, duration);
    let _ = app.emit("pause-changed", ());
}

pub fn set_pause(daemon: &Arc<Mutex<DaemonState>>, duration: Option<ChronoDuration>) {
    let mut guard = match daemon.lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };
    guard.paused_until = duration.map(|d| Local::now() + d);
}

pub fn pause_until_tomorrow() -> Option<ChronoDuration> {
    let now = Local::now();
    let tomorrow = (now + ChronoDuration::days(1)).date_naive();
    let midnight = tomorrow.and_hms_opt(0, 0, 0)?;
    let target = Local.from_local_datetime(&midnight).single()?;
    Some(target - now)
}
