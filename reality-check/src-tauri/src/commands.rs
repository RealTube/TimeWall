//! Tauri commands — thin, validated wrappers over [`crate::db`]. Every command
//! locks the shared connection only briefly and never panics.

use chrono::Utc;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_dialog::DialogExt;

use crate::db::{
    self, ActivityLog, AppState, Category, CategorySlice, DayTotal, FocusStats, HeatCell,
    SearchHit, Streaks, TopActivity,
};
use crate::timer::evaluate_due;

const MAX_ACTIVITY_LEN: usize = 200;
const MAX_CATEGORY_LEN: usize = 40;

fn lock<'a>(
    state: &'a State<AppState>,
) -> Result<std::sync::MutexGuard<'a, rusqlite::Connection>, String> {
    state
        .conn
        .lock()
        .map_err(|_| "database is busy".to_string())
}

fn clean(input: &str, max: usize) -> Result<String, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("Cannot be empty".into());
    }
    Ok(trimmed.chars().take(max).collect())
}

/// Re-arm the next prompt relative to now (used after interval/pause changes).
fn rearm(conn: &rusqlite::Connection) -> Result<(), String> {
    let interval: i64 = db::get_setting_or(conn, "interval_minutes", "15")
        .parse()
        .unwrap_or(15);
    let align = db::get_setting_or(conn, "align_to_clock", "1") == "1";
    let (_fire, next) = evaluate_due(Utc::now().timestamp(), 0, interval * 60, align);
    db::set_setting(conn, "next_prompt_at", &next.to_string())
}

// --- Logging ---------------------------------------------------------------

#[tauri::command]
pub fn log_activity(
    app: AppHandle,
    state: State<AppState>,
    activity: String,
    category_id: Option<i64>,
) -> Result<(), String> {
    let activity = clean(&activity, MAX_ACTIVITY_LEN)?;
    {
        let conn = lock(&state)?;
        let interval: i64 = db::get_setting_or(&conn, "interval_minutes", "15")
            .parse()
            .unwrap_or(15);
        // FR-11: an explicit choice wins; otherwise remember what the user
        // categorized this exact text as last time. Inference must never block
        // the log, so a lookup error degrades to "uncategorized".
        let category_id = match category_id {
            Some(id) => Some(id),
            None => db::last_category_for(&conn, &state.crypto, &activity).unwrap_or(None),
        };
        db::insert_activity(
            &conn,
            &state.crypto,
            &activity,
            category_id,
            false,
            interval,
        )?;
    }
    if let Some(p) = app.get_webview_window("prompt") {
        let _ = p.hide();
    }
    if let Some(m) = app.get_webview_window("main") {
        let _ = m.emit("refresh-dashboard", ());
    }
    Ok(())
}

#[tauri::command]
pub fn get_todays_logs(state: State<AppState>) -> Result<Vec<ActivityLog>, String> {
    let conn = lock(&state)?;
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    db::logs_for_date(&conn, &state.crypto, &today)
}

#[tauri::command]
pub fn get_logs_for_date(state: State<AppState>, date: String) -> Result<Vec<ActivityLog>, String> {
    let conn = lock(&state)?;
    db::logs_for_date(&conn, &state.crypto, &date)
}

#[tauri::command]
pub fn get_recent_activities(
    state: State<AppState>,
    limit: Option<usize>,
) -> Result<Vec<String>, String> {
    let conn = lock(&state)?;
    db::recent_activities(&conn, &state.crypto, limit.unwrap_or(8).clamp(1, 24))
}

#[tauri::command]
pub fn update_activity(
    app: AppHandle,
    state: State<AppState>,
    id: i64,
    activity: String,
    category_id: Option<i64>,
) -> Result<(), String> {
    let activity = clean(&activity, MAX_ACTIVITY_LEN)?;
    {
        let conn = lock(&state)?;
        db::update_activity(&conn, &state.crypto, id, &activity, category_id)?;
    }
    let _ = app.emit("refresh-dashboard", ());
    Ok(())
}

#[tauri::command]
pub fn delete_activity(app: AppHandle, state: State<AppState>, id: i64) -> Result<(), String> {
    {
        let conn = lock(&state)?;
        db::delete_activity(&conn, id)?;
    }
    let _ = app.emit("refresh-dashboard", ());
    Ok(())
}

// --- Settings & scheduling -------------------------------------------------

#[derive(serde::Serialize)]
pub struct AppSettings {
    interval_minutes: i64,
    paused: bool,
    paused_until: i64,
    idle_threshold_min: i64,
    align_to_clock: bool,
    theme: String,
    notifications: bool,
    sound: bool,
    onboarded: bool,
    schedule_enabled: bool,
    schedule_start_min: i64,
    schedule_end_min: i64,
    schedule_days: String,
}

#[tauri::command]
pub fn get_settings(state: State<AppState>) -> Result<AppSettings, String> {
    let conn = lock(&state)?;
    Ok(AppSettings {
        interval_minutes: db::get_setting_or(&conn, "interval_minutes", "15")
            .parse()
            .unwrap_or(15),
        paused: db::get_setting_or(&conn, "paused", "0") == "1",
        paused_until: db::get_setting_or(&conn, "paused_until", "0")
            .parse()
            .unwrap_or(0),
        idle_threshold_min: db::get_setting_or(&conn, "idle_threshold_min", "5")
            .parse()
            .unwrap_or(5),
        align_to_clock: db::get_setting_or(&conn, "align_to_clock", "1") == "1",
        theme: db::get_setting_or(&conn, "theme", "system"),
        notifications: db::get_setting_or(&conn, "notifications", "1") == "1",
        sound: db::get_setting_or(&conn, "sound", "1") == "1",
        onboarded: db::get_setting_or(&conn, "onboarded", "0") == "1",
        schedule_enabled: db::get_setting_or(&conn, "schedule_enabled", "0") == "1",
        schedule_start_min: db::get_setting_or(&conn, "schedule_start_min", "540")
            .parse()
            .unwrap_or(540),
        schedule_end_min: db::get_setting_or(&conn, "schedule_end_min", "1080")
            .parse()
            .unwrap_or(1080),
        schedule_days: db::get_setting_or(&conn, "schedule_days", "1,2,3,4,5"),
    })
}

#[tauri::command]
pub fn get_interval(state: State<AppState>) -> Result<u32, String> {
    let conn = lock(&state)?;
    Ok(db::get_setting_or(&conn, "interval_minutes", "15")
        .parse()
        .unwrap_or(15))
}

#[tauri::command]
pub fn set_interval(state: State<AppState>, minutes: i64) -> Result<(), String> {
    if !(1..=240).contains(&minutes) {
        return Err("Interval must be between 1 and 240 minutes".into());
    }
    let conn = lock(&state)?;
    db::set_setting(&conn, "interval_minutes", &minutes.to_string())?;
    rearm(&conn)
}

/// Generic setter for boolean/string settings on an allow-list, with per-key
/// validation so bad values can never reach the scheduler.
#[tauri::command]
pub fn update_setting(state: State<AppState>, key: String, value: String) -> Result<(), String> {
    const ALLOWED: &[&str] = &[
        "idle_threshold_min",
        "align_to_clock",
        "theme",
        "notifications",
        "sound",
        "onboarded",
        "schedule_enabled",
        "schedule_start_min",
        "schedule_end_min",
        "schedule_days",
    ];
    if !ALLOWED.contains(&key.as_str()) {
        return Err(format!("Setting '{key}' is not writable"));
    }
    validate_setting(&key, &value)?;
    let conn = lock(&state)?;
    db::set_setting(&conn, &key, &value)
}

fn validate_setting(key: &str, value: &str) -> Result<(), String> {
    match key {
        "schedule_start_min" | "schedule_end_min" => {
            let v: i64 = value.parse().map_err(|_| "Expected minutes".to_string())?;
            if !(0..1440).contains(&v) {
                return Err("Time must be within the day".into());
            }
        }
        "schedule_days" => {
            let days: Vec<i64> = value
                .split(',')
                .filter(|s| !s.trim().is_empty())
                .map(|s| s.trim().parse::<i64>())
                .collect::<Result<_, _>>()
                .map_err(|_| "Expected weekday numbers".to_string())?;
            if days.is_empty() || days.iter().any(|d| !(1..=7).contains(d)) {
                return Err("Pick at least one weekday".into());
            }
        }
        "idle_threshold_min" => {
            let v: i64 = value.parse().map_err(|_| "Expected minutes".to_string())?;
            if !(1..=120).contains(&v) {
                return Err("Away threshold must be 1–120 minutes".into());
            }
        }
        _ => {}
    }
    Ok(())
}

#[tauri::command]
pub fn set_pause(app: AppHandle, state: State<AppState>, paused: bool) -> Result<(), String> {
    {
        let conn = lock(&state)?;
        db::set_setting(&conn, "paused", if paused { "1" } else { "0" })?;
        if !paused {
            rearm(&conn)?;
        }
    }
    crate::tray::update_pause_label(&app);
    let _ = app.emit("refresh-dashboard", ());
    Ok(())
}

/// Push the next prompt out by a few minutes (the prompt's "snooze"/Esc action).
#[tauri::command]
pub fn snooze(app: AppHandle, state: State<AppState>, minutes: Option<i64>) -> Result<(), String> {
    let m = minutes.unwrap_or(5).clamp(1, 120);
    {
        let conn = lock(&state)?;
        let next = Utc::now().timestamp() + m * 60;
        db::set_setting(&conn, "next_prompt_at", &next.to_string())?;
    }
    if let Some(p) = app.get_webview_window("prompt") {
        let _ = p.hide();
    }
    Ok(())
}

/// Temporarily pause prompting; the timer resumes itself when this expires
/// (the tray's "Pause for 1 hour", FR-2.4).
#[tauri::command]
pub fn pause_for(app: AppHandle, state: State<AppState>, minutes: i64) -> Result<(), String> {
    let m = minutes.clamp(1, 24 * 60);
    {
        let conn = lock(&state)?;
        let until = Utc::now().timestamp() + m * 60;
        db::set_setting(&conn, "paused_until", &until.to_string())?;
    }
    crate::tray::update_pause_label(&app);
    let _ = app.emit("refresh-dashboard", ());
    Ok(())
}

/// Surface the check-in card on demand (the dashboard's "Check in now").
/// The schedule is untouched — the next timed prompt still fires as armed.
#[tauri::command]
pub fn check_in_now(app: AppHandle) -> Result<(), String> {
    crate::timer::surface_prompt(&app);
    Ok(())
}

/// Unix timestamp of the next scheduled prompt, or 0 when paused — powers the
/// dashboard's "next check-in" indicator.
#[tauri::command]
pub fn get_next_prompt_at(state: State<AppState>) -> Result<i64, String> {
    let conn = lock(&state)?;
    if db::get_setting_or(&conn, "paused", "0") == "1" {
        return Ok(0);
    }
    let paused_until: i64 = db::get_setting_or(&conn, "paused_until", "0")
        .parse()
        .unwrap_or(0);
    if paused_until > Utc::now().timestamp() {
        return Ok(0);
    }
    Ok(db::get_setting_or(&conn, "next_prompt_at", "0")
        .parse()
        .unwrap_or(0))
}

// --- Categories ------------------------------------------------------------

#[tauri::command]
pub fn list_categories(state: State<AppState>) -> Result<Vec<Category>, String> {
    let conn = lock(&state)?;
    db::list_categories(&conn)
}

#[tauri::command]
pub fn add_category(
    state: State<AppState>,
    name: String,
    color: String,
    is_productive: bool,
) -> Result<i64, String> {
    let name = clean(&name, MAX_CATEGORY_LEN)?;
    let color = clean(&color, 9)?;
    let conn = lock(&state)?;
    db::add_category(&conn, &name, &color, is_productive)
}

#[tauri::command]
pub fn update_category(
    state: State<AppState>,
    id: i64,
    name: String,
    color: String,
    is_productive: bool,
    weekly_target_min: Option<i64>,
) -> Result<(), String> {
    let name = clean(&name, MAX_CATEGORY_LEN)?;
    let color = clean(&color, 9)?;
    let target = weekly_target_min.unwrap_or(0);
    if !(0..=6000).contains(&target) {
        return Err("Weekly target must be 0–100 hours".into());
    }
    let conn = lock(&state)?;
    db::update_category(&conn, id, &name, &color, is_productive, target)
}

#[tauri::command]
pub fn delete_category(state: State<AppState>, id: i64) -> Result<(), String> {
    let conn = lock(&state)?;
    db::delete_category(&conn, id)
}

// --- Insights --------------------------------------------------------------

#[tauri::command]
pub fn get_day_totals(
    state: State<AppState>,
    start: String,
    end: String,
) -> Result<Vec<DayTotal>, String> {
    let conn = lock(&state)?;
    db::day_totals(&conn, &start, &end)
}

#[tauri::command]
pub fn get_category_breakdown(
    state: State<AppState>,
    start: String,
    end: String,
) -> Result<Vec<CategorySlice>, String> {
    let conn = lock(&state)?;
    db::category_breakdown(&conn, &start, &end)
}

#[tauri::command]
pub fn get_hourly_heatmap(
    state: State<AppState>,
    start: String,
    end: String,
) -> Result<Vec<HeatCell>, String> {
    let conn = lock(&state)?;
    db::hourly_heatmap(&conn, &start, &end)
}

#[tauri::command]
pub fn get_top_activities(
    state: State<AppState>,
    start: String,
    end: String,
    limit: Option<usize>,
) -> Result<Vec<TopActivity>, String> {
    let conn = lock(&state)?;
    db::top_activities(
        &conn,
        &state.crypto,
        &start,
        &end,
        limit.unwrap_or(8).clamp(1, 50),
    )
}

#[tauri::command]
pub fn get_focus_stats(
    state: State<AppState>,
    start: String,
    end: String,
) -> Result<FocusStats, String> {
    let conn = lock(&state)?;
    db::focus_stats(&conn, &state.crypto, &start, &end)
}

/// Journal search (FR-15): substring over decrypted entries, newest first.
/// The query is never logged or persisted.
#[tauri::command]
pub fn search_entries(
    state: State<AppState>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<SearchHit>, String> {
    let conn = lock(&state)?;
    db::search_entries(
        &conn,
        &state.crypto,
        &query,
        limit.unwrap_or(60).clamp(1, 200),
    )
}

/// Consecutive-logged-day streaks (FR-13) — §8's adoption metric, surfaced.
#[tauri::command]
pub fn get_streaks(state: State<AppState>) -> Result<Streaks, String> {
    let dates = {
        let conn = lock(&state)?;
        db::logged_dates_desc(&conn)?
    };
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    Ok(db::streaks_from_dates(&dates, &today))
}

// --- Data ownership ----------------------------------------------------------

/// Quote a CSV field per RFC 4180 when it contains a delimiter, quote, or newline.
fn csv_field(s: &str) -> String {
    if s.contains([',', '"', '\n', '\r']) {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

/// Export a date range to CSV through a native save dialog. Returns the chosen
/// path, or `None` if the user cancelled. UTF-8 BOM so Excel detects encoding.
#[tauri::command]
pub fn export_csv(
    app: AppHandle,
    state: State<AppState>,
    start: String,
    end: String,
) -> Result<Option<String>, String> {
    let rows = {
        let conn = lock(&state)?;
        db::export_rows(&conn, &state.crypto, &start, &end)?
    };

    let default_name = format!(
        "hima-export-{}.csv",
        chrono::Local::now().format("%Y-%m-%d")
    );
    let Some(picked) = app
        .dialog()
        .file()
        .set_file_name(&default_name)
        .add_filter("CSV", &["csv"])
        .blocking_save_file()
    else {
        return Ok(None);
    };
    let path = picked
        .into_path()
        .map_err(|e| format!("invalid path: {e}"))?;

    let mut out = String::with_capacity(rows.len() * 48 + 64);
    out.push('\u{feff}'); // BOM: Excel-friendly UTF-8
    out.push_str("date,time,activity,category,productive,was_away,interval_minutes\n");
    for r in &rows {
        out.push_str(&format!(
            "{},{},{},{},{},{},{}\n",
            csv_field(&r.date),
            csv_field(&r.time),
            csv_field(&r.activity),
            csv_field(&r.category),
            if r.was_idle {
                "" // away intervals carry no productivity claim
            } else if r.is_productive {
                "yes"
            } else {
                "no"
            },
            if r.was_idle { "yes" } else { "no" },
            r.interval_min,
        ));
    }
    std::fs::write(&path, out).map_err(|e| format!("could not write file: {e}"))?;
    Ok(Some(path.display().to_string()))
}

/// Save a frontend-rendered Markdown report through a native save dialog
/// (FR-14). Mirrors `export_csv`: data leaves the machine only by the user's
/// hand. Returns the chosen path, or `None` if the user cancelled.
#[tauri::command]
pub fn save_report(app: AppHandle, content: String) -> Result<Option<String>, String> {
    const MAX_REPORT_BYTES: usize = 2 * 1024 * 1024;
    if content.trim().is_empty() {
        return Err("Nothing to save".into());
    }
    if content.len() > MAX_REPORT_BYTES {
        return Err("Report is unexpectedly large".into());
    }
    let default_name = format!("hima-report-{}.md", chrono::Local::now().format("%Y-%m-%d"));
    let Some(picked) = app
        .dialog()
        .file()
        .set_file_name(&default_name)
        .add_filter("Markdown", &["md"])
        .blocking_save_file()
    else {
        return Ok(None);
    };
    let path = picked
        .into_path()
        .map_err(|e| format!("invalid path: {e}"))?;
    std::fs::write(&path, content).map_err(|e| format!("could not write file: {e}"))?;
    Ok(Some(path.display().to_string()))
}

/// Irreversibly delete every log entry (FR-6.2). The UI double-confirms; the
/// backend just obeys. Categories and settings are intentionally preserved.
#[tauri::command]
pub fn erase_all_entries(app: AppHandle, state: State<AppState>) -> Result<usize, String> {
    let deleted = {
        let conn = lock(&state)?;
        db::erase_logs(&conn)?
    };
    let _ = app.emit("refresh-dashboard", ());
    Ok(deleted)
}

// --- Backup, restore & import (FR-17/18) -------------------------------------

const MIN_PASSPHRASE_CHARS: usize = 8;

fn check_passphrase(passphrase: &str) -> Result<(), String> {
    if passphrase.chars().count() < MIN_PASSPHRASE_CHARS {
        return Err("Passphrase must be at least 8 characters".into());
    }
    Ok(())
}

/// Write the entire audit — entries, categories, portable settings — into one
/// passphrase-encrypted file (FR-17.1). The OS keychain is not involved, so
/// the file is readable on any machine that knows the passphrase.
#[tauri::command]
pub fn backup_create(
    app: AppHandle,
    state: State<AppState>,
    passphrase: String,
) -> Result<Option<String>, String> {
    check_passphrase(&passphrase)?;

    let default_name = format!(
        "hima-backup-{}.himabackup",
        chrono::Local::now().format("%Y-%m-%d")
    );
    let Some(picked) = app
        .dialog()
        .file()
        .set_file_name(&default_name)
        .add_filter("Hima backup", &["himabackup"])
        .blocking_save_file()
    else {
        return Ok(None);
    };
    let path = picked
        .into_path()
        .map_err(|e| format!("invalid path: {e}"))?;

    let payload = {
        let conn = lock(&state)?;
        let entries = db::all_entries_for_backup(&conn, &state.crypto)?
            .into_iter()
            .map(|e| crate::backup::BackupEntry {
                date: e.date,
                time: e.time,
                ts: e.ts.unwrap_or(0),
                activity: e.activity,
                category: e.category,
                was_idle: e.was_idle,
                interval_min: e.interval_min,
            })
            .collect();
        let categories = db::list_categories(&conn)?
            .into_iter()
            .map(|c| crate::backup::BackupCategory {
                name: c.name,
                color: c.color,
                is_productive: c.is_productive,
                sort_order: c.sort_order,
                weekly_target_min: c.weekly_target_min,
            })
            .collect();
        let settings = db::PORTABLE_SETTING_KEYS
            .iter()
            .map(|k| (k.to_string(), db::get_setting_or(&conn, k, "")))
            .filter(|(_, v)| !v.is_empty())
            .collect();
        crate::backup::BackupPayload {
            format: 1,
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            exported_at: Utc::now().to_rfc3339(),
            categories,
            entries,
            settings,
        }
    };

    let sealed = crate::backup::seal(&payload, &passphrase)?;
    std::fs::write(&path, sealed).map_err(|e| format!("could not write file: {e}"))?;
    Ok(Some(path.display().to_string()))
}

/// Open a backup file and merge it into the local store (FR-17.2). Additive
/// by construction: existing (date, time) rows are skipped, categories are
/// matched by name, local category config wins. Returns `None` on cancel.
#[tauri::command]
pub fn backup_restore(
    app: AppHandle,
    state: State<AppState>,
    passphrase: String,
) -> Result<Option<db::MergeOutcome>, String> {
    check_passphrase(&passphrase)?;

    let Some(picked) = app
        .dialog()
        .file()
        .add_filter("Hima backup", &["himabackup"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = picked
        .into_path()
        .map_err(|e| format!("invalid path: {e}"))?;
    let bytes = std::fs::read(&path).map_err(|e| format!("could not read file: {e}"))?;
    let payload = crate::backup::open(&bytes, &passphrase)?;

    let outcome = {
        let conn = lock(&state)?;
        let incoming_cats: Vec<db::IncomingCategory> = payload
            .categories
            .into_iter()
            .map(|c| db::IncomingCategory {
                name: c.name,
                color: c.color,
                is_productive: c.is_productive,
                sort_order: c.sort_order,
                weekly_target_min: c.weekly_target_min,
            })
            .collect();
        let cats_added = db::ensure_categories(&conn, &incoming_cats)?;

        let entries: Vec<db::IncomingEntry> = payload
            .entries
            .into_iter()
            .map(|e| db::IncomingEntry {
                date: e.date,
                time: e.time,
                ts: (e.ts > 0).then_some(e.ts),
                activity: e.activity,
                category: e.category,
                was_idle: e.was_idle,
                interval_min: e.interval_min,
            })
            .collect();
        let mut outcome = db::merge_entries(&conn, &state.crypto, &entries)?;
        outcome.categories_added += cats_added;

        // Portable preferences only, each re-validated like any settings write.
        for (key, value) in payload.settings {
            if !db::PORTABLE_SETTING_KEYS.contains(&key.as_str()) {
                continue;
            }
            let valid = if key == "interval_minutes" {
                value.parse::<i64>().is_ok_and(|m| (1..=240).contains(&m))
            } else {
                validate_setting(&key, &value).is_ok()
            };
            if valid {
                db::set_setting(&conn, &key, &value)?;
            }
        }
        rearm(&conn)?;
        outcome
    };

    let _ = app.emit("refresh-dashboard", ());
    Ok(Some(outcome))
}

/// Import a CSV — Hima's own export or the classic kitchen-timer spreadsheet
/// (FR-18). Same additive merge as restore. Returns `None` on cancel.
#[tauri::command]
pub fn import_csv(app: AppHandle, state: State<AppState>) -> Result<Option<ImportSummary>, String> {
    let Some(picked) = app
        .dialog()
        .file()
        .add_filter("CSV", &["csv"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = picked
        .into_path()
        .map_err(|e| format!("invalid path: {e}"))?;
    let bytes = std::fs::read(&path).map_err(|e| format!("could not read file: {e}"))?;
    let (rows, invalid) = crate::backup::parse_csv(&bytes)?;

    let entries: Vec<db::IncomingEntry> = rows
        .into_iter()
        .map(|r| db::IncomingEntry {
            date: r.date,
            time: r.time,
            ts: None,
            activity: r.activity,
            category: r.category,
            was_idle: r.was_idle,
            interval_min: r.interval_min,
        })
        .collect();

    let outcome = {
        let conn = lock(&state)?;
        db::merge_entries(&conn, &state.crypto, &entries)?
    };
    let _ = app.emit("refresh-dashboard", ());
    Ok(Some(ImportSummary {
        imported: outcome.imported,
        skipped: outcome.skipped,
        categories_added: outcome.categories_added,
        invalid: invalid as i64,
    }))
}

#[derive(serde::Serialize)]
pub struct ImportSummary {
    pub imported: i64,
    pub skipped: i64,
    pub categories_added: i64,
    pub invalid: i64,
}

/// Answered vs missed vs away intervals over a range — the audit-quality
/// input to the Findings card (FR-20).
#[tauri::command]
pub fn get_answer_stats(
    state: State<AppState>,
    start: String,
    end: String,
) -> Result<db::AnswerStats, String> {
    let conn = lock(&state)?;
    db::answer_stats(&conn, &state.crypto, &start, &end)
}

#[cfg(test)]
mod tests {
    use super::{csv_field, validate_setting};

    #[test]
    fn csv_plain_fields_pass_through() {
        assert_eq!(csv_field("Deep work"), "Deep work");
    }

    #[test]
    fn csv_quotes_delimiters_and_quotes() {
        assert_eq!(csv_field("a,b"), "\"a,b\"");
        assert_eq!(csv_field("say \"hi\""), "\"say \"\"hi\"\"\"");
        assert_eq!(csv_field("line\nbreak"), "\"line\nbreak\"");
    }

    #[test]
    fn schedule_validation_bounds() {
        assert!(validate_setting("schedule_start_min", "540").is_ok());
        assert!(validate_setting("schedule_start_min", "1440").is_err());
        assert!(validate_setting("schedule_days", "1,2,3").is_ok());
        assert!(validate_setting("schedule_days", "0,8").is_err());
        assert!(validate_setting("schedule_days", "").is_err());
        assert!(validate_setting("idle_threshold_min", "0").is_err());
    }
}

// --- Autostart -------------------------------------------------------------

#[tauri::command]
pub fn set_autostart(app: AppHandle, enabled: bool) -> Result<(), String> {
    let manager = app.autolaunch();
    if enabled {
        manager.enable().map_err(|e| e.to_string())
    } else {
        manager.disable().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn get_autostart(app: AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}
