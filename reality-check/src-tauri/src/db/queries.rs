use crate::error::AppResult;
use rusqlite::Connection;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct ActivityLog {
    pub id: i64,
    pub date: String,
    pub time: String,
    pub activity: String,
    pub duration: u32,
    pub category: String,
}

pub fn get_setting(conn: &Connection, key: &str) -> AppResult<Option<String>> {
    let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
    let mut rows = stmt.query([key])?;
    if let Some(row) = rows.next()? {
        Ok(Some(row.get(0)?))
    } else {
        Ok(None)
    }
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> AppResult<()> {
    conn.execute(
        "INSERT INTO settings(key, value) VALUES(?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [key, value],
    )?;
    Ok(())
}

pub fn get_u32_setting(conn: &Connection, key: &str, fallback: u32) -> AppResult<u32> {
    Ok(get_setting(conn, key)?
        .and_then(|s| s.parse().ok())
        .unwrap_or(fallback))
}

pub fn get_interval_minutes(conn: &Connection) -> AppResult<u32> {
    get_u32_setting(conn, "interval_minutes", 15)
}

pub fn get_daily_goal_minutes(conn: &Connection) -> AppResult<u32> {
    get_u32_setting(conn, "daily_goal_minutes", 240)
}

pub fn get_streak_min_logs(conn: &Connection) -> AppResult<u32> {
    get_u32_setting(conn, "streak_min_logs", 4)
}

pub fn insert_log(
    conn: &Connection,
    date: &str,
    time: &str,
    activity: &str,
    duration: u32,
    category: &str,
) -> AppResult<i64> {
    conn.execute(
        "INSERT INTO activity_log (date, time, activity, duration, category)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        (date, time, activity, duration, category),
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn update_log_category(conn: &Connection, id: i64, category: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE activity_log SET category = ?1 WHERE id = ?2",
        (category, id),
    )?;
    Ok(())
}

fn map_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ActivityLog> {
    let category: Option<String> = row.get(5)?;
    Ok(ActivityLog {
        id: row.get(0)?,
        date: row.get(1)?,
        time: row.get(2)?,
        activity: row.get(3)?,
        duration: row.get::<_, i64>(4)? as u32,
        category: category.unwrap_or_else(|| "unknown".into()),
    })
}

const SELECT_COLUMNS: &str =
    "id, date, time, activity, COALESCE(duration, 15), COALESCE(category, 'unknown')";

pub fn logs_for_date(conn: &Connection, date: &str) -> AppResult<Vec<ActivityLog>> {
    let sql = format!(
        "SELECT {SELECT_COLUMNS} FROM activity_log WHERE date = ?1 ORDER BY time DESC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([date], map_row)?;
    let mut out = Vec::new();
    for log in rows {
        out.push(log?);
    }
    Ok(out)
}

pub fn logs_in_range(
    conn: &Connection,
    start_date: &str,
    end_date: &str,
) -> AppResult<Vec<ActivityLog>> {
    let sql = format!(
        "SELECT {SELECT_COLUMNS} FROM activity_log
         WHERE date >= ?1 AND date <= ?2
         ORDER BY date ASC, time ASC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([start_date, end_date], map_row)?;
    let mut out = Vec::new();
    for log in rows {
        out.push(log?);
    }
    Ok(out)
}

pub fn all_logs(conn: &Connection) -> AppResult<Vec<ActivityLog>> {
    let sql = format!(
        "SELECT {SELECT_COLUMNS} FROM activity_log ORDER BY date DESC, time DESC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], map_row)?;
    let mut out = Vec::new();
    for log in rows {
        out.push(log?);
    }
    Ok(out)
}

pub fn count_logs_for_date(conn: &Connection, date: &str) -> AppResult<u32> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM activity_log WHERE date = ?1",
        [date],
        |row| row.get(0),
    )?;
    Ok(count as u32)
}

pub fn recent_unique_activities(conn: &Connection, limit: u32) -> AppResult<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT activity FROM activity_log
         GROUP BY activity
         ORDER BY MAX(date || ' ' || time) DESC
         LIMIT ?1",
    )?;
    let rows = stmt.query_map([limit], |row| row.get::<_, String>(0))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}
