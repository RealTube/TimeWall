//! Hima — an autonomous version of the "kitchen-timer time audit": every N
//! minutes it asks what you just did, and builds a private, encrypted record you
//! can actually trust. This module wires the plugins, encrypted store, tray, and
//! scheduler together.

mod commands;
mod crypto;
mod db;
mod timer;
mod tray;

use std::sync::Mutex;

use tauri::{Manager, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;

use crate::crypto::Crypto;
use crate::db::AppState;

/// Map a `String` error into something `?`-compatible with Tauri's setup hook.
fn boxed(e: String) -> Box<dyn std::error::Error> {
    Box::new(std::io::Error::other(e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Single-instance MUST be registered first so a second launch just
        // focuses the running app instead of spinning up a rival scheduler.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::log_activity,
            commands::get_todays_logs,
            commands::get_logs_for_date,
            commands::get_recent_activities,
            commands::update_activity,
            commands::delete_activity,
            commands::get_settings,
            commands::get_interval,
            commands::set_interval,
            commands::update_setting,
            commands::set_pause,
            commands::pause_for,
            commands::snooze,
            commands::get_next_prompt_at,
            commands::list_categories,
            commands::add_category,
            commands::update_category,
            commands::delete_category,
            commands::get_day_totals,
            commands::get_category_breakdown,
            commands::get_hourly_heatmap,
            commands::get_top_activities,
            commands::get_focus_stats,
            commands::export_csv,
            commands::erase_all_entries,
            commands::set_autostart,
            commands::get_autostart,
        ])
        .setup(|app| {
            // --- Encrypted store at the per-user app-data directory ---
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir).ok();
            let db_path = data_dir.join("hima.db");

            let crypto = Crypto::load_or_create().map_err(boxed)?;
            let conn = db::open(&db_path).map_err(boxed)?;

            // Arm the scheduler if it is uninitialized or stale (e.g. first run,
            // or the machine was off past the last target).
            {
                let now = chrono::Utc::now().timestamp();
                let interval: i64 = db::get_setting_or(&conn, "interval_minutes", "15")
                    .parse()
                    .unwrap_or(15);
                let align = db::get_setting_or(&conn, "align_to_clock", "1") == "1";
                let next_at: i64 = db::get_setting_or(&conn, "next_prompt_at", "0")
                    .parse()
                    .unwrap_or(0);
                if next_at <= now {
                    let (_fire, armed) = timer::evaluate_due(now, 0, interval * 60, align);
                    let _ = db::set_setting(&conn, "next_prompt_at", &armed.to_string());
                }
            }

            // Read once more before the connection moves into managed state.
            let show_onboarding = db::get_setting_or(&conn, "onboarded", "0") != "1";

            app.manage(AppState {
                conn: Mutex::new(conn),
                crypto,
            });

            // Native translucency on the hero prompt window (best-effort).
            if let Some(prompt) = app.get_webview_window("prompt") {
                #[cfg(target_os = "windows")]
                let _ = window_vibrancy::apply_acrylic(&prompt, Some((16, 16, 20, 110)));
                #[cfg(target_os = "macos")]
                let _ = window_vibrancy::apply_vibrancy(
                    &prompt,
                    window_vibrancy::NSVisualEffectMaterial::HudWindow,
                    None,
                    None,
                );
            }

            tray::build(app.handle())?;
            timer::spawn(app.handle().clone());

            // On first run, reveal the dashboard so onboarding is seen.
            if show_onboarding {
                if let Some(main) = app.get_webview_window("main") {
                    let _ = main.show();
                    let _ = main.set_focus();
                }
            }

            Ok(())
        })
        // Closing the dashboard hides it to the tray; the scheduler keeps running.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
