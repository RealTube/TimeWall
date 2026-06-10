use crate::categorize;
use crate::error::AppResult;
use rusqlite::Connection;

pub fn run(conn: &Connection) -> AppResult<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS activity_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            activity TEXT NOT NULL
        )",
        (),
    )?;

    let _ = conn.execute(
        "ALTER TABLE activity_log ADD COLUMN duration INTEGER DEFAULT 15",
        (),
    );
    let _ = conn.execute("ALTER TABLE activity_log ADD COLUMN category TEXT", ());

    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )",
        (),
    )?;

    conn.execute(
        "INSERT OR IGNORE INTO settings (key, value) VALUES ('interval_minutes', '15')",
        (),
    )?;
    conn.execute(
        "INSERT OR IGNORE INTO settings (key, value) VALUES ('daily_goal_minutes', '240')",
        (),
    )?;
    conn.execute(
        "INSERT OR IGNORE INTO settings (key, value) VALUES ('streak_min_logs', '4')",
        (),
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_activity_log_date ON activity_log(date)",
        (),
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_activity_log_category ON activity_log(category)",
        (),
    )?;

    backfill_categories(conn)?;
    Ok(())
}

fn backfill_categories(conn: &Connection) -> AppResult<()> {
    let pending: Vec<(i64, String)> = {
        let mut stmt =
            conn.prepare("SELECT id, activity FROM activity_log WHERE category IS NULL")?;
        let rows = stmt.query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)))?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        out
    };

    if pending.is_empty() {
        return Ok(());
    }

    let tx = conn.unchecked_transaction()?;
    {
        let mut stmt =
            tx.prepare("UPDATE activity_log SET category = ?1 WHERE id = ?2")?;
        for (id, activity) in &pending {
            stmt.execute((categorize::categorize(activity), id))?;
        }
    }
    tx.commit()?;
    Ok(())
}
