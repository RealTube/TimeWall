//! System-tray icon and menu. Left-click opens the dashboard; the context menu
//! offers Open / Pause-Resume / Quit. Quit is the only path that actually exits
//! the process — closing the dashboard window just hides it (see `lib.rs`).

use chrono::TimeZone;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Wry,
};

use crate::db::{self, AppState};

/// Handle to the tray's pause entry so its label can follow the pause state.
struct TrayMenu {
    pause_item: MenuItem<Wry>,
}

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Hima", true, None::<&str>)?;
    let pause = MenuItem::with_id(app, "pause", "Pause", true, None::<&str>)?;
    let pause_hour = MenuItem::with_id(app, "pause-hour", "Pause for 1 hour", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Hima", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &pause, &pause_hour, &sep, &quit])?;

    let mut builder = TrayIconBuilder::with_id("hima-tray")
        .tooltip("Hima — your 15-minute reality check")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
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

    // Pause state persists across restarts, so the label may need to start
    // out as "Resume" rather than the "Pause" the item was built with.
    app.manage(TrayMenu { pause_item: pause });
    update_pause_label(app);
    Ok(())
}

/// Sync the tray's pause entry with the persisted pause state. Called from
/// every code path that flips `paused`/`paused_until`, including the timer
/// thread when a temporary pause expires.
pub fn update_pause_label(app: &AppHandle) {
    let Some(menu) = app.try_state::<TrayMenu>() else {
        return;
    };
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    let label = {
        let Ok(conn) = state.conn.lock() else {
            return;
        };
        pause_label(
            db::get_setting_or(&conn, "paused", "0") == "1",
            db::get_setting_or(&conn, "paused_until", "0")
                .parse()
                .unwrap_or(0),
            chrono::Utc::now().timestamp(),
        )
    };
    let _ = menu.pause_item.set_text(label);
}

/// "Pause" while running, "Resume" while manually paused, and
/// "Resume (paused until 1:30 PM)" during a temporary pause.
fn pause_label(paused: bool, paused_until: i64, now: i64) -> String {
    if paused {
        return "Resume".into();
    }
    if paused_until > now {
        if let Some(until) = chrono::Local.timestamp_opt(paused_until, 0).single() {
            return format!("Resume (paused until {})", until.format("%-I:%M %p"));
        }
        return "Resume".into();
    }
    "Pause".into()
}

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
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
    update_pause_label(app);
    let _ = app.emit("refresh-dashboard", ());
}

/// Toggle between paused and running. Resuming also clears a temporary pause,
/// so the click always does what the menu label says.
fn toggle_pause(app: &AppHandle) {
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    if let Ok(conn) = state.conn.lock() {
        let now = chrono::Utc::now().timestamp();
        let paused = db::get_setting_or(&conn, "paused", "0") == "1";
        let paused_until: i64 = db::get_setting_or(&conn, "paused_until", "0")
            .parse()
            .unwrap_or(0);
        if paused || paused_until > now {
            let _ = db::set_setting(&conn, "paused", "0");
            let _ = db::set_setting(&conn, "paused_until", "0");
            // Resuming: re-arm so the next prompt starts from now.
            let interval: i64 = db::get_setting_or(&conn, "interval_minutes", "15")
                .parse()
                .unwrap_or(15);
            let align = db::get_setting_or(&conn, "align_to_clock", "1") == "1";
            let (_fire, next) = crate::timer::evaluate_due(now, 0, interval * 60, align);
            let _ = db::set_setting(&conn, "next_prompt_at", &next.to_string());
        } else {
            let _ = db::set_setting(&conn, "paused", "1");
        }
    }
    update_pause_label(app);
    let _ = app.emit("refresh-dashboard", ());
}

#[cfg(test)]
mod tests {
    use super::pause_label;

    #[test]
    fn running_offers_pause() {
        assert_eq!(pause_label(false, 0, 1_000), "Pause");
    }

    #[test]
    fn manual_pause_offers_resume() {
        assert_eq!(pause_label(true, 0, 1_000), "Resume");
    }

    #[test]
    fn manual_pause_wins_over_temporary() {
        assert_eq!(pause_label(true, 2_000, 1_000), "Resume");
    }

    #[test]
    fn expired_temporary_pause_counts_as_running() {
        assert_eq!(pause_label(false, 900, 1_000), "Pause");
    }

    #[test]
    fn temporary_pause_shows_resume_time() {
        // The exact time rendered depends on the local timezone; pin the shape.
        let label = pause_label(false, 2_000, 1_000);
        assert!(label.starts_with("Resume (paused until "), "{label}");
        assert!(
            label.ends_with(" AM)") || label.ends_with(" PM)"),
            "{label}"
        );
    }
}
