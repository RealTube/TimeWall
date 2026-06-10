//! Background scheduler.
//!
//! Wakes every few seconds and, when wall-clock time reaches `next_prompt_at`,
//! either surfaces the logging prompt or — if the user is idle — records an
//! "away" interval. Using a persisted wall-clock target (instead of a process
//! `Instant`) means sleep/hibernate is handled correctly: on wake it fires once
//! and re-arms, never storming. The whole loop is panic-isolated so a transient
//! error can never permanently kill the timer.

use std::panic::{catch_unwind, AssertUnwindSafe};
use std::thread;
use std::time::Duration;

use chrono::Utc;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::db::{self, AppState, IDLE_LABEL};

const TICK_SECS: u64 = 5;

/// Pure scheduling decision, factored out so it can be unit-tested.
///
/// Returns `(should_fire, new_next_at)` given the current time, the armed
/// target, the interval, and whether to snap to clock boundaries. A
/// non-positive `next_at` means "uninitialized" and arms without firing.
pub fn evaluate_due(now: i64, next_at: i64, interval_secs: i64, align: bool) -> (bool, i64) {
    let interval = interval_secs.max(60);
    let arm = |from: i64| {
        if align {
            ((from / interval) + 1) * interval
        } else {
            from + interval
        }
    };
    if next_at <= 0 {
        return (false, arm(now));
    }
    if now < next_at {
        return (false, next_at);
    }
    (true, arm(now))
}

/// Spawn the scheduler thread. Safe to call once during setup.
pub fn spawn(app: AppHandle) {
    thread::spawn(move || loop {
        // Isolate each tick: a panic here is logged, not fatal to the loop.
        if catch_unwind(AssertUnwindSafe(|| tick(&app))).is_err() {
            log::error!("timer tick panicked; continuing");
        }
        thread::sleep(Duration::from_secs(TICK_SECS));
    });
}

fn tick(app: &AppHandle) {
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };

    // Read scheduling settings under a short lock.
    let (paused, interval_min, align, idle_threshold_min, next_at, notify) = {
        let Ok(conn) = state.conn.lock() else {
            return;
        };
        (
            db::get_setting_or(&conn, "paused", "0") == "1",
            db::get_setting_or(&conn, "interval_minutes", "15")
                .parse()
                .unwrap_or(15),
            db::get_setting_or(&conn, "align_to_clock", "1") == "1",
            db::get_setting_or(&conn, "idle_threshold_min", "5")
                .parse()
                .unwrap_or(5),
            db::get_setting_or(&conn, "next_prompt_at", "0")
                .parse()
                .unwrap_or(0),
            db::get_setting_or(&conn, "notifications", "1") == "1",
        )
    };

    if paused {
        return;
    }

    let now = Utc::now().timestamp();
    let (fire, new_next) = evaluate_due(now, next_at, interval_min * 60, align);

    if new_next != next_at {
        if let Ok(conn) = state.conn.lock() {
            let _ = db::set_setting(&conn, "next_prompt_at", &new_next.to_string());
        }
    }

    if !fire {
        return;
    }

    // Idle check is fail-safe: any error is treated as "active" so we still prompt.
    let idle_secs = current_idle_secs();
    if idle_secs >= idle_threshold_min * 60 {
        if let Ok(conn) = state.conn.lock() {
            let _ = db::insert_activity(&conn, &state.crypto, IDLE_LABEL, None, true, interval_min);
        }
        let _ = app.emit("refresh-dashboard", ());
        log::info!("interval marked idle ({idle_secs}s away)");
        return;
    }

    surface_prompt(app);

    // Windows often blocks focus-stealing, so a gentle toast ensures the user
    // notices (and provides the sound cue) even if the popup only flashes.
    if notify {
        let _ = app
            .notification()
            .builder()
            .title("Reality check")
            .body("What did you just do?")
            .show();
    }
}

fn surface_prompt(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("prompt") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_always_on_top(true);
        let _ = win.set_focus();
        let _ = win.emit("time-to-log", ());
    } else {
        log::warn!("prompt window missing when timer fired");
    }
}

fn current_idle_secs() -> i64 {
    match user_idle::UserIdle::get_time() {
        Ok(idle) => idle.as_seconds() as i64,
        Err(_) => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::evaluate_due;

    #[test]
    fn does_not_fire_before_target() {
        let (fire, next) = evaluate_due(1_000, 1_100, 900, false);
        assert!(!fire);
        assert_eq!(next, 1_100);
    }

    #[test]
    fn fires_and_rearms_relative() {
        let (fire, next) = evaluate_due(2_000, 1_500, 900, false);
        assert!(fire);
        assert_eq!(next, 2_900);
    }

    #[test]
    fn aligns_to_clock_boundary() {
        // 900s = 15min. now just past a boundary → next is the following boundary.
        let (fire, next) = evaluate_due(1_801, 1_800, 900, true);
        assert!(fire);
        assert_eq!(next, 2_700);
    }

    #[test]
    fn uninitialized_arms_without_firing() {
        let (fire, next) = evaluate_due(1_000, 0, 900, false);
        assert!(!fire);
        assert_eq!(next, 1_900);
    }

    #[test]
    fn sleep_gap_fires_once_not_per_missed_interval() {
        // Asleep for hours past a long-stale target: still a single fire.
        let (fire, next) = evaluate_due(100_000, 1_000, 900, true);
        assert!(fire);
        assert!(next > 100_000 && next <= 100_900);
    }
}
