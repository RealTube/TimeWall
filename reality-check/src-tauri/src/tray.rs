//! System-tray icon and menu. Left-click opens the dashboard; the context menu
//! offers Open / Pause-Resume / Quit. Quit is the only path that actually exits
//! the process — closing the dashboard window just hides it (see `lib.rs`).

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

use crate::db::{self, AppState};

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Hima", true, None::<&str>)?;
    let check_in = MenuItem::with_id(app, "check-in", "Check in now", true, None::<&str>)?;
    let pause = MenuItem::with_id(app, "pause", "Pause / Resume", true, None::<&str>)?;
    let pause_hour = MenuItem::with_id(app, "pause-hour", "Pause for 1 hour", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Hima", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &check_in, &pause, &pause_hour, &sep, &quit])?;

    let mut builder = TrayIconBuilder::with_id("hima-tray")
        .tooltip("Hima — your 15-minute reality check")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "check-in" => check_in_now(app),
            "pause" => toggle_pause(app),
            "pause-hour" => pause_for_an_hour(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }

    builder.build(app)?;
    Ok(())
}

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Surface the prompt on demand (FR-10). Re-arms the schedule first so the
/// regular prompt doesn't fire again moments after a manual check-in.
fn check_in_now(app: &AppHandle) {
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(conn) = state.conn.lock() {
            let interval: i64 = db::get_setting_or(&conn, "interval_minutes", "15")
                .parse()
                .unwrap_or(15);
            let align = db::get_setting_or(&conn, "align_to_clock", "1") == "1";
            let (_fire, next) =
                crate::timer::evaluate_due(chrono::Utc::now().timestamp(), 0, interval * 60, align);
            let _ = db::set_setting(&conn, "next_prompt_at", &next.to_string());
        }
    }
    crate::timer::surface_prompt(app);
}

/// The lunch/meeting case: silence prompts for an hour; the timer clears the
/// marker and resumes by itself (see `timer::tick`).
fn pause_for_an_hour(app: &AppHandle) {
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    if let Ok(conn) = state.conn.lock() {
        let until = chrono::Utc::now().timestamp() + 3600;
        let _ = db::set_setting(&conn, "paused_until", &until.to_string());
    }
    let _ = app.emit("refresh-dashboard", ());
}

fn toggle_pause(app: &AppHandle) {
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    if let Ok(conn) = state.conn.lock() {
        let now_paused = db::get_setting_or(&conn, "paused", "0") == "1";
        let _ = db::set_setting(&conn, "paused", if now_paused { "0" } else { "1" });
        if now_paused {
            // Resuming: re-arm so the next prompt starts from now.
            let interval: i64 = db::get_setting_or(&conn, "interval_minutes", "15")
                .parse()
                .unwrap_or(15);
            let align = db::get_setting_or(&conn, "align_to_clock", "1") == "1";
            let (_fire, next) =
                crate::timer::evaluate_due(chrono::Utc::now().timestamp(), 0, interval * 60, align);
            let _ = db::set_setting(&conn, "next_prompt_at", &next.to_string());
        }
    }
    let _ = app.emit("refresh-dashboard", ());
}
