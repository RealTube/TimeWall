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

#[derive(Serialize)]
pub struct ActivityLog {
    pub id: i64,
    pub time: String,
    pub activity: String,
    pub category_id: Option<i64>,
    pub was_idle: bool,
}

#[derive(Serialize, Clone)]
pub struct Category {
    pub id: i64,
    pub name: String,
    pub color: String,
    pub is_productive: bool,
    pub sort_order: i64,
}

#[derive(Serialize)]
pub struct DayTotal {
    pub date: String,
    pub worked_minutes: i64,
    pub idle_minutes: i64,
}

#[derive(Serialize)]
pub struct CategorySlice {
    pub category_id: Option<i64>,
    pub name: String,
    pub color: String,
    pub is_productive: bool,
    pub minutes: i64,
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
        params![date, time, ts, enc, category_id, was_idle as i64, interval_min],
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
            "SELECT id, time, activity_enc, category_id, was_idle
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
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for r in rows {
        let (id, time, enc, category_id, was_idle) = r.map_err(|e| e.to_string())?;
        let activity = crypto.decrypt(&enc).unwrap_or_else(|_| "—".to_string());
        out.push(ActivityLog {
            id,
            time,
            activity,
            category_id,
            was_idle: was_idle != 0,
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

pub fn update_activity(
    conn: &Connection,
    crypto: &Crypto,
    id: i64,
    activity: &str,
    category_id: Option<i64>,
) -> Result<(), String> {
    let enc = crypto.encrypt(activity)?;
    conn.execute(
        "UPDATE activity_log SET activity_enc = ?1, category_id = ?2 WHERE id = ?3",
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
            "SELECT id, name, color, is_productive, sort_order
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
) -> Result<(), String> {
    conn.execute(
        "UPDATE categories SET name = ?1, color = ?2, is_productive = ?3 WHERE id = ?4",
        params![name, color, is_productive as i64, id],
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
            "SELECT date,
                COALESCE(SUM(CASE WHEN was_idle = 0 THEN interval_min ELSE 0 END), 0) AS worked,
                COALESCE(SUM(CASE WHEN was_idle = 1 THEN interval_min ELSE 0 END), 0) AS idle
             FROM activity_log WHERE date BETWEEN ?1 AND ?2
             GROUP BY date ORDER BY date",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([start, end], |r| {
            Ok(DayTotal {
                date: r.get(0)?,
                worked_minutes: r.get(1)?,
                idle_minutes: r.get(2)?,
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
    fn totals_split_worked_and_idle() {
        let conn = mem();
        let crypto = crate::crypto::Crypto::test_fixed();
        insert_activity(&conn, &crypto, "work", None, false, 15).unwrap();
        insert_activity(&conn, &crypto, IDLE_LABEL, None, true, 15).unwrap();
        let today = Local::now().format("%Y-%m-%d").to_string();
        let totals = day_totals(&conn, &today, &today).unwrap();
        assert_eq!(totals.len(), 1);
        assert_eq!(totals[0].worked_minutes, 15);
        assert_eq!(totals[0].idle_minutes, 15);
    }
}
