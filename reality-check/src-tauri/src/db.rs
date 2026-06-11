//! Encrypted local data store.
//!
//! A single keyed SQLite connection lives behind a `Mutex` in Tauri managed
//! state and is shared by both the commands and the timer thread. Activity text
//! is encrypted via [`Crypto`] before storage; everything else (timestamps,
//! category ids) is plain so we can index and aggregate efficiently.

use std::collections::HashSet;
use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;

use chrono::{Local, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

use crate::crypto::Crypto;

/// Shared application state: the encrypted connection plus its cipher.
pub struct AppState {
    pub conn: Mutex<Connection>,
    pub crypto: Crypto,
}

/// Label recorded for an interval the user was away from the desk.
pub const IDLE_LABEL: &str = "Away from desk";

/// Label recorded when a prompt went unanswered for a whole interval — the
/// user was present (not idle) but never logged. Recorded instead of silently
/// dropping the interval so totals stay honest; excluded from worked time.
pub const MISSED_LABEL: &str = "Missed check-in";

#[derive(Serialize)]
pub struct ActivityLog {
    pub id: i64,
    pub time: String,
    pub activity: String,
    pub category_id: Option<i64>,
    pub was_idle: bool,
    /// Minutes this entry covered *when it was logged* — totals must use this,
    /// never the current interval setting, so changing the interval can't
    /// rewrite history.
    pub interval_min: i64,
}

#[derive(Serialize, Clone)]
pub struct Category {
    pub id: i64,
    pub name: String,
    pub color: String,
    pub is_productive: bool,
    pub sort_order: i64,
    /// Optional weekly target in minutes; 0 = no target (FR-16).
    pub weekly_target_min: i64,
}

#[derive(Serialize)]
pub struct DayTotal {
    pub date: String,
    pub worked_minutes: i64,
    pub idle_minutes: i64,
    /// Worked minutes in categories flagged productive (uncategorized counts
    /// as not productive, consistent with `category_breakdown`).
    pub productive_minutes: i64,
}

#[derive(Serialize)]
pub struct CategorySlice {
    pub category_id: Option<i64>,
    pub name: String,
    pub color: String,
    pub is_productive: bool,
    pub minutes: i64,
}

/// One cell of the time-of-day heatmap. `weekday` is 0 = Monday … 6 = Sunday.
#[derive(Serialize)]
pub struct HeatCell {
    pub weekday: i64,
    pub hour: i64,
    pub minutes: i64,
}

/// A named activity ranked by total time over a range.
#[derive(Serialize)]
pub struct TopActivity {
    pub activity: String,
    pub minutes: i64,
    pub count: i64,
}

/// Focus-fragmentation profile over a range. A "block" is a run of consecutive
/// check-ins with the same activity text within one day; idle breaks a block.
#[derive(Serialize)]
pub struct FocusStats {
    pub avg_block_min: f64,
    pub longest_block_min: i64,
    pub switches_per_day: f64,
    pub days_counted: i64,
}

/// A journal entry matched by [`search_entries`] (FR-15).
#[derive(Serialize)]
pub struct SearchHit {
    pub id: i64,
    pub date: String,
    pub time: String,
    pub activity: String,
    pub category_id: Option<i64>,
}

/// Consecutive-logged-day streaks (FR-13). A day counts when it has at least
/// one non-away check-in.
#[derive(Serialize)]
pub struct Streaks {
    pub current: i64,
    pub best: i64,
    pub days_logged: i64,
}

/// A decrypted row ready for CSV export (category resolved to its name).
pub struct ExportRow {
    pub date: String,
    pub time: String,
    pub activity: String,
    pub category: String,
    pub is_productive: bool,
    pub was_idle: bool,
    pub interval_min: i64,
}

/// Open (or create) the encrypted DB, set robust pragmas, and run migrations.
pub fn open(path: &Path) -> Result<Connection, String> {
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.busy_timeout(Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
    // WAL + NORMAL gives durable, concurrent-friendly writes; FKs on for ON DELETE.
    conn.execute_batch(
        "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON;",
    )
    .map_err(|e| e.to_string())?;
    run_migrations(&conn)?;
    Ok(conn)
}

/// Versioned migrations keyed off `PRAGMA user_version`. Add `if version < N`
/// blocks for future schema changes; never edit a shipped block.
fn run_migrations(conn: &Connection) -> Result<(), String> {
    let version: i64 = conn
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;

    if version < 1 {
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS categories (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                name          TEXT NOT NULL,
                color         TEXT NOT NULL,
                is_productive INTEGER NOT NULL DEFAULT 1,
                sort_order    INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS activity_log (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                date         TEXT NOT NULL,
                time         TEXT NOT NULL,
                logged_at_ts INTEGER NOT NULL,
                activity_enc BLOB NOT NULL,
                category_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL,
                was_idle     INTEGER NOT NULL DEFAULT 0,
                interval_min INTEGER NOT NULL DEFAULT 15
            );
            CREATE INDEX IF NOT EXISTS idx_activity_date ON activity_log(date);
            CREATE INDEX IF NOT EXISTS idx_activity_ts ON activity_log(logged_at_ts);

            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            "#,
        )
        .map_err(|e| e.to_string())?;

        for (k, v) in [
            ("interval_minutes", "15"),
            ("paused", "0"),
            ("idle_threshold_min", "5"),
            ("align_to_clock", "1"),
            ("theme", "system"),
            ("notifications", "1"),
            ("sound", "1"),
            ("onboarded", "0"),
            ("next_prompt_at", "0"),
        ] {
            conn.execute(
                "INSERT OR IGNORE INTO settings (key, value) VALUES (?1, ?2)",
                params![k, v],
            )
            .map_err(|e| e.to_string())?;
        }

        for (name, color, productive, order) in [
            ("Deep Work", "#5B8DEF", 1, 0),
            ("Meetings", "#A78BFA", 1, 1),
            ("Sales", "#34D399", 1, 2),
            ("Admin", "#FBBF24", 1, 3),
            ("Email & Comms", "#38BDF8", 1, 4),
            ("Break", "#9CA3AF", 0, 5),
            ("Distraction", "#F87171", 0, 6),
        ] {
            conn.execute(
                "INSERT INTO categories (name, color, is_productive, sort_order) VALUES (?1, ?2, ?3, ?4)",
                params![name, color, productive, order],
            )
            .map_err(|e| e.to_string())?;
        }

        conn.pragma_update(None, "user_version", 1)
            .map_err(|e| e.to_string())?;
    }

    if version < 2 {
        // 1.0: active schedule (work hours) + temporary pause. Times are
        // minutes-from-midnight local; days are ISO weekday numbers (Mon=1).
        for (k, v) in [
            ("schedule_enabled", "0"),
            ("schedule_start_min", "540"),
            ("schedule_end_min", "1080"),
            ("schedule_days", "1,2,3,4,5"),
            ("paused_until", "0"),
        ] {
            conn.execute(
                "INSERT OR IGNORE INTO settings (key, value) VALUES (?1, ?2)",
                params![k, v],
            )
            .map_err(|e| e.to_string())?;
        }
        conn.pragma_update(None, "user_version", 2)
            .map_err(|e| e.to_string())?;
    }

    if version < 3 {
        // 1.1: optional gentle weekly target per category, in minutes (FR-16).
        conn.execute_batch(
            "ALTER TABLE categories ADD COLUMN weekly_target_min INTEGER NOT NULL DEFAULT 0;",
        )
        .map_err(|e| e.to_string())?;
        conn.pragma_update(None, "user_version", 3)
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

pub fn get_setting_or(conn: &Connection, key: &str, default: &str) -> String {
    conn.query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| {
        r.get::<_, String>(0)
    })
    .optional()
    .ok()
    .flatten()
    .unwrap_or_else(|| default.to_string())
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Activity log
// ---------------------------------------------------------------------------

pub fn insert_activity(
    conn: &Connection,
    crypto: &Crypto,
    activity: &str,
    category_id: Option<i64>,
    was_idle: bool,
    interval_min: i64,
) -> Result<(), String> {
    let now_local = Local::now();
    let date = now_local.format("%Y-%m-%d").to_string();
    let time = now_local.format("%H:%M:%S").to_string();
    let ts = Utc::now().timestamp();
    let enc = crypto.encrypt(activity)?;
    conn.execute(
        "INSERT INTO activity_log
            (date, time, logged_at_ts, activity_enc, category_id, was_idle, interval_min)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            date,
            time,
            ts,
            enc,
            category_id,
            was_idle as i64,
            interval_min
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn logs_for_date(
    conn: &Connection,
    crypto: &Crypto,
    date: &str,
) -> Result<Vec<ActivityLog>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, time, activity_enc, category_id, was_idle, interval_min
             FROM activity_log WHERE date = ?1
             ORDER BY logged_at_ts DESC, id DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([date], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Vec<u8>>(2)?,
                row.get::<_, Option<i64>>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, i64>(5)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for r in rows {
        let (id, time, enc, category_id, was_idle, interval_min) = r.map_err(|e| e.to_string())?;
        let activity = crypto.decrypt(&enc).unwrap_or_else(|_| "—".to_string());
        out.push(ActivityLog {
            id,
            time,
            activity,
            category_id,
            was_idle: was_idle != 0,
            interval_min,
        });
    }
    Ok(out)
}

pub fn recent_activities(
    conn: &Connection,
    crypto: &Crypto,
    limit: usize,
) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT activity_enc FROM activity_log
             WHERE was_idle = 0
             ORDER BY logged_at_ts DESC, id DESC LIMIT 80",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| row.get::<_, Vec<u8>>(0))
        .map_err(|e| e.to_string())?;

    let mut seen: HashSet<String> = HashSet::new();
    let mut out = Vec::new();
    for r in rows {
        let enc = r.map_err(|e| e.to_string())?;
        if let Ok(text) = crypto.decrypt(&enc) {
            if seen.insert(text.to_lowercase()) {
                out.push(text);
                if out.len() >= limit {
                    break;
                }
            }
        }
    }
    Ok(out)
}

/// The category the user most recently assigned to this exact text (FR-11).
/// Case- and whitespace-insensitive; scans recent categorized entries only,
/// newest first, so the lookup stays O(recent history) — and a deliberate
/// re-categorization immediately becomes the new memory.
pub fn last_category_for(
    conn: &Connection,
    crypto: &Crypto,
    activity: &str,
) -> Result<Option<i64>, String> {
    let needle = activity.trim().to_lowercase();
    let mut stmt = conn
        .prepare(
            "SELECT activity_enc, category_id FROM activity_log
             WHERE was_idle = 0 AND category_id IS NOT NULL
             ORDER BY logged_at_ts DESC, id DESC LIMIT 400",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, Vec<u8>>(0)?, r.get::<_, i64>(1)?)))
        .map_err(|e| e.to_string())?;
    for r in rows {
        let (enc, category_id) = r.map_err(|e| e.to_string())?;
        if let Ok(text) = crypto.decrypt(&enc) {
            if text.trim().to_lowercase() == needle {
                return Ok(Some(category_id));
            }
        }
    }
    Ok(None)
}

/// Case-insensitive substring search over the decrypted journal, newest first
/// (FR-15). The query lives only in memory; away markers are excluded — search
/// is about the user's own words.
pub fn search_entries(
    conn: &Connection,
    crypto: &Crypto,
    query: &str,
    limit: usize,
) -> Result<Vec<SearchHit>, String> {
    let needle = query.trim().to_lowercase();
    if needle.is_empty() {
        return Ok(Vec::new());
    }
    let mut stmt = conn
        .prepare(
            "SELECT id, date, time, activity_enc, category_id FROM activity_log
             WHERE was_idle = 0
             ORDER BY logged_at_ts DESC, id DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, Vec<u8>>(3)?,
                r.get::<_, Option<i64>>(4)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for r in rows {
        let (id, date, time, enc, category_id) = r.map_err(|e| e.to_string())?;
        let Ok(activity) = crypto.decrypt(&enc) else {
            continue;
        };
        if activity.to_lowercase().contains(&needle) {
            out.push(SearchHit {
                id,
                date,
                time,
                activity,
                category_id,
            });
            if out.len() >= limit {
                break;
            }
        }
    }
    Ok(out)
}

/// Distinct local dates with at least one non-away check-in, newest first —
/// the input to [`streaks_from_dates`].
pub fn logged_dates_desc(conn: &Connection) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare("SELECT DISTINCT date FROM activity_log WHERE was_idle = 0 ORDER BY date DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

/// Consecutive-day streaks over distinct logged dates (FR-13). `dates_desc`
/// must be distinct and newest-first. A run still counts as "current" when its
/// newest day is yesterday — today's log may simply not have started yet.
pub fn streaks_from_dates(dates_desc: &[String], today: &str) -> Streaks {
    let parse = |s: &str| chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").ok();
    let dates: Vec<chrono::NaiveDate> = dates_desc.iter().filter_map(|s| parse(s)).collect();
    let days_logged = dates.len() as i64;

    let mut best: i64 = 0;
    let mut current: i64 = 0;
    let mut i = 0;
    while i < dates.len() {
        let mut len: usize = 1;
        while i + len < dates.len()
            && dates[i + len - 1] - dates[i + len] == chrono::Duration::days(1)
        {
            len += 1;
        }
        best = best.max(len as i64);
        // Only the newest run can be current (input is descending).
        if i == 0 {
            if let Some(t) = parse(today) {
                if (0..=1).contains(&(t - dates[0]).num_days()) {
                    current = len as i64;
                }
            }
        }
        i += len;
    }
    Streaks {
        current,
        best,
        days_logged,
    }
}

/// An edit is a user's explicit claim about the interval, so it also clears
/// the idle flag — editing an "Away from desk" / "Missed check-in" row
/// reclaims it as real work (idle detection can't see reading or thinking).
pub fn update_activity(
    conn: &Connection,
    crypto: &Crypto,
    id: i64,
    activity: &str,
    category_id: Option<i64>,
) -> Result<(), String> {
    let enc = crypto.encrypt(activity)?;
    conn.execute(
        "UPDATE activity_log SET activity_enc = ?1, category_id = ?2, was_idle = 0 WHERE id = ?3",
        params![enc, category_id, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_activity(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute("DELETE FROM activity_log WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

pub fn list_categories(conn: &Connection) -> Result<Vec<Category>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, color, is_productive, sort_order, weekly_target_min
             FROM categories ORDER BY sort_order, id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Category {
                id: r.get(0)?,
                name: r.get(1)?,
                color: r.get(2)?,
                is_productive: r.get::<_, i64>(3)? != 0,
                sort_order: r.get(4)?,
                weekly_target_min: r.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

pub fn add_category(
    conn: &Connection,
    name: &str,
    color: &str,
    is_productive: bool,
) -> Result<i64, String> {
    let order: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM categories",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    conn.execute(
        "INSERT INTO categories (name, color, is_productive, sort_order)
         VALUES (?1, ?2, ?3, ?4)",
        params![name, color, is_productive as i64, order],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

pub fn update_category(
    conn: &Connection,
    id: i64,
    name: &str,
    color: &str,
    is_productive: bool,
    weekly_target_min: i64,
) -> Result<(), String> {
    conn.execute(
        "UPDATE categories
         SET name = ?1, color = ?2, is_productive = ?3, weekly_target_min = ?4
         WHERE id = ?5",
        params![name, color, is_productive as i64, weekly_target_min, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_category(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute("DELETE FROM categories WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Aggregation (for History & insights)
// ---------------------------------------------------------------------------

pub fn day_totals(conn: &Connection, start: &str, end: &str) -> Result<Vec<DayTotal>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT a.date,
                COALESCE(SUM(CASE WHEN a.was_idle = 0 THEN a.interval_min ELSE 0 END), 0) AS worked,
                COALESCE(SUM(CASE WHEN a.was_idle = 1 THEN a.interval_min ELSE 0 END), 0) AS idle,
                COALESCE(SUM(CASE WHEN a.was_idle = 0 AND COALESCE(c.is_productive, 0) = 1
                              THEN a.interval_min ELSE 0 END), 0) AS productive
             FROM activity_log a
             LEFT JOIN categories c ON a.category_id = c.id
             WHERE a.date BETWEEN ?1 AND ?2
             GROUP BY a.date ORDER BY a.date",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([start, end], |r| {
            Ok(DayTotal {
                date: r.get(0)?,
                worked_minutes: r.get(1)?,
                idle_minutes: r.get(2)?,
                productive_minutes: r.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

pub fn category_breakdown(
    conn: &Connection,
    start: &str,
    end: &str,
) -> Result<Vec<CategorySlice>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT a.category_id,
                    COALESCE(c.name, 'Uncategorized') AS name,
                    COALESCE(c.color, '#9CA3AF') AS color,
                    COALESCE(c.is_productive, 0) AS productive,
                    SUM(a.interval_min) AS minutes
             FROM activity_log a
             LEFT JOIN categories c ON a.category_id = c.id
             WHERE a.date BETWEEN ?1 AND ?2 AND a.was_idle = 0
             GROUP BY a.category_id ORDER BY minutes DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([start, end], |r| {
            Ok(CategorySlice {
                category_id: r.get(0)?,
                name: r.get(1)?,
                color: r.get(2)?,
                is_productive: r.get::<_, i64>(3)? != 0,
                minutes: r.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

/// Worked minutes by (weekday, hour-of-day) — "when do I actually work?".
/// SQLite's `%w` is 0 = Sunday; we re-base to 0 = Monday for the UI.
pub fn hourly_heatmap(conn: &Connection, start: &str, end: &str) -> Result<Vec<HeatCell>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT CAST(strftime('%w', date) AS INTEGER) AS dow,
                    CAST(substr(time, 1, 2) AS INTEGER) AS hour,
                    SUM(interval_min) AS minutes
             FROM activity_log
             WHERE date BETWEEN ?1 AND ?2 AND was_idle = 0
             GROUP BY dow, hour",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([start, end], |r| {
            Ok(HeatCell {
                weekday: (r.get::<_, i64>(0)? + 6) % 7,
                hour: r.get(1)?,
                minutes: r.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

/// Activities ranked by total time. Grouping is case/whitespace-insensitive;
/// the first-seen spelling is kept for display.
pub fn top_activities(
    conn: &Connection,
    crypto: &Crypto,
    start: &str,
    end: &str,
    limit: usize,
) -> Result<Vec<TopActivity>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT activity_enc, interval_min FROM activity_log
             WHERE date BETWEEN ?1 AND ?2 AND was_idle = 0
             ORDER BY logged_at_ts",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([start, end], |r| {
            Ok((r.get::<_, Vec<u8>>(0)?, r.get::<_, i64>(1)?))
        })
        .map_err(|e| e.to_string())?;

    // key (normalized) → (display text, minutes, count)
    let mut acc: std::collections::HashMap<String, (String, i64, i64)> =
        std::collections::HashMap::new();
    for r in rows {
        let (enc, interval) = r.map_err(|e| e.to_string())?;
        let Ok(text) = crypto.decrypt(&enc) else {
            continue;
        };
        let key = text.trim().to_lowercase();
        let entry = acc
            .entry(key)
            .or_insert_with(|| (text.trim().to_string(), 0, 0));
        entry.1 += interval;
        entry.2 += 1;
    }

    let mut out: Vec<TopActivity> = acc
        .into_values()
        .map(|(activity, minutes, count)| TopActivity {
            activity,
            minutes,
            count,
        })
        .collect();
    out.sort_by(|a, b| b.minutes.cmp(&a.minutes).then(a.activity.cmp(&b.activity)));
    out.truncate(limit);
    Ok(out)
}

/// Walk the range's check-ins in order and measure focus blocks (see
/// [`FocusStats`]). Days with no worked entries don't dilute the averages.
pub fn focus_stats(
    conn: &Connection,
    crypto: &Crypto,
    start: &str,
    end: &str,
) -> Result<FocusStats, String> {
    let mut stmt = conn
        .prepare(
            "SELECT date, activity_enc, was_idle, interval_min FROM activity_log
             WHERE date BETWEEN ?1 AND ?2
             ORDER BY date, logged_at_ts, id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([start, end], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, Vec<u8>>(1)?,
                r.get::<_, i64>(2)? != 0,
                r.get::<_, i64>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut blocks: Vec<i64> = Vec::new();
    let mut switches_total: i64 = 0;
    let mut days: HashSet<String> = HashSet::new();

    // (date, normalized activity) of the open block, plus its accumulated minutes.
    let mut current: Option<(String, String)> = None;
    let mut current_min: i64 = 0;
    let close = |blocks: &mut Vec<i64>, current_min: &mut i64| {
        if *current_min > 0 {
            blocks.push(*current_min);
            *current_min = 0;
        }
    };

    for r in rows {
        let (date, enc, was_idle, interval) = r.map_err(|e| e.to_string())?;
        if was_idle {
            close(&mut blocks, &mut current_min);
            current = None;
            continue;
        }
        let Ok(text) = crypto.decrypt(&enc) else {
            continue;
        };
        days.insert(date.clone());
        let key = text.trim().to_lowercase();
        let continues = current
            .as_ref()
            .is_some_and(|(d, k)| *d == date && *k == key);
        if continues {
            current_min += interval;
        } else {
            // A new block; only a same-day change of activity is a "switch".
            if current.as_ref().is_some_and(|(d, _)| *d == date) {
                switches_total += 1;
            }
            close(&mut blocks, &mut current_min);
            current = Some((date, key));
            current_min = interval;
        }
    }
    close(&mut blocks, &mut current_min);

    let days_counted = days.len() as i64;
    let total_min: i64 = blocks.iter().sum();
    Ok(FocusStats {
        avg_block_min: if blocks.is_empty() {
            0.0
        } else {
            total_min as f64 / blocks.len() as f64
        },
        longest_block_min: blocks.iter().copied().max().unwrap_or(0),
        switches_per_day: if days_counted == 0 {
            0.0
        } else {
            switches_total as f64 / days_counted as f64
        },
        days_counted,
    })
}

/// Decrypted, category-resolved rows for CSV export, oldest first.
pub fn export_rows(
    conn: &Connection,
    crypto: &Crypto,
    start: &str,
    end: &str,
) -> Result<Vec<ExportRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT a.date, a.time, a.activity_enc, a.was_idle, a.interval_min,
                    COALESCE(c.name, ''), COALESCE(c.is_productive, 0)
             FROM activity_log a
             LEFT JOIN categories c ON a.category_id = c.id
             WHERE a.date BETWEEN ?1 AND ?2
             ORDER BY a.date, a.logged_at_ts, a.id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([start, end], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, Vec<u8>>(2)?,
                r.get::<_, i64>(3)? != 0,
                r.get::<_, i64>(4)?,
                r.get::<_, String>(5)?,
                r.get::<_, i64>(6)? != 0,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for r in rows {
        let (date, time, enc, was_idle, interval_min, category, is_productive) =
            r.map_err(|e| e.to_string())?;
        out.push(ExportRow {
            date,
            time,
            activity: crypto.decrypt(&enc).unwrap_or_else(|_| "—".to_string()),
            category,
            is_productive,
            was_idle,
            interval_min,
        });
    }
    Ok(out)
}

/// Delete every log entry. Categories and settings survive (FR-6.2).
pub fn erase_logs(conn: &Connection) -> Result<usize, String> {
    conn.execute("DELETE FROM activity_log", [])
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mem() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn migrations_seed_defaults() {
        let conn = mem();
        assert_eq!(get_setting_or(&conn, "interval_minutes", "x"), "15");
        assert_eq!(list_categories(&conn).unwrap().len(), 7);
    }

    #[test]
    fn settings_upsert() {
        let conn = mem();
        set_setting(&conn, "interval_minutes", "30").unwrap();
        assert_eq!(get_setting_or(&conn, "interval_minutes", "x"), "30");
    }

    #[test]
    fn totals_split_worked_idle_and_productive() {
        let conn = mem();
        let crypto = crate::crypto::Crypto::test_fixed();
        let cats = list_categories(&conn).unwrap();
        let productive = cats.iter().find(|c| c.is_productive).unwrap();
        let busywork = cats.iter().find(|c| !c.is_productive).unwrap();
        insert_activity(&conn, &crypto, "work", Some(productive.id), false, 15).unwrap();
        insert_activity(&conn, &crypto, "scroll", Some(busywork.id), false, 15).unwrap();
        insert_activity(&conn, &crypto, "untagged", None, false, 15).unwrap();
        insert_activity(&conn, &crypto, IDLE_LABEL, None, true, 15).unwrap();
        let today = Local::now().format("%Y-%m-%d").to_string();
        let totals = day_totals(&conn, &today, &today).unwrap();
        assert_eq!(totals.len(), 1);
        assert_eq!(totals[0].worked_minutes, 45);
        assert_eq!(totals[0].idle_minutes, 15);
        // Only the productive-category interval counts; uncategorized doesn't.
        assert_eq!(totals[0].productive_minutes, 15);
    }

    fn today() -> String {
        Local::now().format("%Y-%m-%d").to_string()
    }

    #[test]
    fn editing_an_idle_row_reclaims_it_as_work() {
        let conn = mem();
        let crypto = crate::crypto::Crypto::test_fixed();
        insert_activity(&conn, &crypto, MISSED_LABEL, None, true, 15).unwrap();
        let id = conn.last_insert_rowid();
        update_activity(&conn, &crypto, id, "client call", None).unwrap();
        let logs = logs_for_date(&conn, &crypto, &today()).unwrap();
        assert_eq!(logs[0].activity, "client call");
        assert!(!logs[0].was_idle);
        let totals = day_totals(&conn, &today(), &today()).unwrap();
        assert_eq!(totals[0].worked_minutes, 15);
        assert_eq!(totals[0].idle_minutes, 0);
    }

    #[test]
    fn heatmap_counts_worked_minutes_only() {
        let conn = mem();
        let crypto = crate::crypto::Crypto::test_fixed();
        insert_activity(&conn, &crypto, "work", None, false, 15).unwrap();
        insert_activity(&conn, &crypto, "more work", None, false, 15).unwrap();
        insert_activity(&conn, &crypto, IDLE_LABEL, None, true, 15).unwrap();
        let cells = hourly_heatmap(&conn, &today(), &today()).unwrap();
        let total: i64 = cells.iter().map(|c| c.minutes).sum();
        assert_eq!(total, 30); // idle interval excluded
        assert!(cells.iter().all(|c| (0..7).contains(&c.weekday)));
        assert!(cells.iter().all(|c| (0..24).contains(&c.hour)));
    }

    #[test]
    fn top_activities_group_case_insensitively_and_rank_by_time() {
        let conn = mem();
        let crypto = crate::crypto::Crypto::test_fixed();
        insert_activity(&conn, &crypto, "Email", None, false, 15).unwrap();
        insert_activity(&conn, &crypto, "email ", None, false, 15).unwrap();
        insert_activity(&conn, &crypto, "Code", None, false, 15).unwrap();
        let top = top_activities(&conn, &crypto, &today(), &today(), 10).unwrap();
        assert_eq!(top.len(), 2);
        assert_eq!(top[0].activity, "Email"); // first-seen spelling wins
        assert_eq!(top[0].minutes, 30);
        assert_eq!(top[0].count, 2);
    }

    #[test]
    fn focus_stats_measure_blocks_switches_and_idle_breaks() {
        let conn = mem();
        let crypto = crate::crypto::Crypto::test_fixed();
        for (text, idle) in [
            ("spec", false),
            ("spec", false),    // continues the block → 30-min block
            ("email", false),   // switch #1
            (IDLE_LABEL, true), // breaks the block, not a switch
            ("email", false),   // new block after idle
        ] {
            insert_activity(&conn, &crypto, text, None, idle, 15).unwrap();
        }
        let s = focus_stats(&conn, &crypto, &today(), &today()).unwrap();
        assert_eq!(s.longest_block_min, 30);
        assert_eq!(s.days_counted, 1);
        assert!((s.avg_block_min - 20.0).abs() < f64::EPSILON); // (30+15+15)/3
        assert!((s.switches_per_day - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn export_rows_resolve_category_and_decrypt() {
        let conn = mem();
        let crypto = crate::crypto::Crypto::test_fixed();
        let cats = list_categories(&conn).unwrap();
        insert_activity(&conn, &crypto, "Wrote spec", Some(cats[0].id), false, 15).unwrap();
        insert_activity(&conn, &crypto, IDLE_LABEL, None, true, 15).unwrap();
        let rows = export_rows(&conn, &crypto, &today(), &today()).unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].activity, "Wrote spec");
        assert_eq!(rows[0].category, cats[0].name);
        assert!(rows[0].is_productive);
        assert!(rows[1].was_idle);
        assert_eq!(rows[1].category, "");
    }

    #[test]
    fn erase_logs_removes_entries_but_keeps_categories() {
        let conn = mem();
        let crypto = crate::crypto::Crypto::test_fixed();
        insert_activity(&conn, &crypto, "work", None, false, 15).unwrap();
        assert_eq!(erase_logs(&conn).unwrap(), 1);
        assert!(logs_for_date(&conn, &crypto, &today()).unwrap().is_empty());
        assert!(!list_categories(&conn).unwrap().is_empty());
    }

    #[test]
    fn migration_v2_seeds_schedule_defaults() {
        let conn = mem();
        assert_eq!(get_setting_or(&conn, "schedule_enabled", "x"), "0");
        assert_eq!(get_setting_or(&conn, "schedule_start_min", "x"), "540");
        assert_eq!(get_setting_or(&conn, "schedule_end_min", "x"), "1080");
        assert_eq!(get_setting_or(&conn, "schedule_days", "x"), "1,2,3,4,5");
    }

    #[test]
    fn logs_carry_the_interval_they_were_recorded_with() {
        let conn = mem();
        let crypto = crate::crypto::Crypto::test_fixed();
        insert_activity(&conn, &crypto, "old entry", None, false, 15).unwrap();
        // The user changes the interval; history must not change with it.
        set_setting(&conn, "interval_minutes", "10").unwrap();
        insert_activity(&conn, &crypto, "new entry", None, false, 10).unwrap();
        let logs = logs_for_date(&conn, &crypto, &today()).unwrap();
        let total: i64 = logs.iter().map(|l| l.interval_min).sum();
        assert_eq!(total, 25); // 15 + 10, not 2 × current setting
    }

    #[test]
    fn migration_v3_defaults_targets_off_and_they_round_trip() {
        let conn = mem();
        let cats = list_categories(&conn).unwrap();
        assert!(cats.iter().all(|c| c.weekly_target_min == 0));
        update_category(&conn, cats[0].id, &cats[0].name, &cats[0].color, true, 600).unwrap();
        assert_eq!(list_categories(&conn).unwrap()[0].weekly_target_min, 600);
    }

    #[test]
    fn category_memory_matches_latest_exact_text() {
        let conn = mem();
        let crypto = crate::crypto::Crypto::test_fixed();
        let cats = list_categories(&conn).unwrap();
        insert_activity(&conn, &crypto, "Standup", Some(cats[1].id), false, 15).unwrap();
        insert_activity(&conn, &crypto, "standup ", Some(cats[2].id), false, 15).unwrap();
        insert_activity(&conn, &crypto, "deep spec", None, false, 15).unwrap();
        // Latest assignment for the normalized text wins; unknown text → None.
        assert_eq!(
            last_category_for(&conn, &crypto, "  STANDUP").unwrap(),
            Some(cats[2].id)
        );
        assert_eq!(
            last_category_for(&conn, &crypto, "deep spec").unwrap(),
            None
        );
        assert_eq!(
            last_category_for(&conn, &crypto, "never seen").unwrap(),
            None
        );
    }

    #[test]
    fn search_finds_substrings_case_insensitively_and_skips_idle() {
        let conn = mem();
        let crypto = crate::crypto::Crypto::test_fixed();
        insert_activity(&conn, &crypto, "Pricing doc review", None, false, 15).unwrap();
        insert_activity(&conn, &crypto, "email triage", None, false, 15).unwrap();
        insert_activity(&conn, &crypto, IDLE_LABEL, None, true, 15).unwrap();
        let hits = search_entries(&conn, &crypto, "PRICING", 50).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].activity, "Pricing doc review");
        assert!(search_entries(&conn, &crypto, "desk", 50)
            .unwrap()
            .is_empty());
        assert!(search_entries(&conn, &crypto, "   ", 50)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn search_respects_limit_newest_first() {
        let conn = mem();
        let crypto = crate::crypto::Crypto::test_fixed();
        for i in 0..5 {
            insert_activity(&conn, &crypto, &format!("task {i}"), None, false, 15).unwrap();
        }
        let hits = search_entries(&conn, &crypto, "task", 3).unwrap();
        assert_eq!(hits.len(), 3);
        assert_eq!(hits[0].activity, "task 4"); // newest first
    }

    #[test]
    fn streaks_count_runs_and_tolerate_an_unlogged_today() {
        let s = |d: &[&str], today: &str| {
            let v: Vec<String> = d.iter().map(|x| x.to_string()).collect();
            streaks_from_dates(&v, today)
        };
        // No data.
        let z = s(&[], "2026-06-10");
        assert_eq!((z.current, z.best, z.days_logged), (0, 0, 0));
        // Run ends today.
        let a = s(&["2026-06-10", "2026-06-09", "2026-06-08"], "2026-06-10");
        assert_eq!((a.current, a.best, a.days_logged), (3, 3, 3));
        // Run ends yesterday — still current (today's log hasn't started).
        let b = s(&["2026-06-09", "2026-06-08"], "2026-06-10");
        assert_eq!(b.current, 2);
        // Run ended two days ago — broken; best still remembers it.
        let c = s(&["2026-06-08", "2026-06-07"], "2026-06-10");
        assert_eq!((c.current, c.best), (0, 2));
        // Older longer run sets best; newest short run is current.
        let d = s(
            &["2026-06-10", "2026-06-05", "2026-06-04", "2026-06-03"],
            "2026-06-10",
        );
        assert_eq!((d.current, d.best, d.days_logged), (1, 3, 4));
    }
}
