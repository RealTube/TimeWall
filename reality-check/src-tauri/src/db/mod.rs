pub mod migrations;
pub mod queries;

use crate::error::AppResult;
use rusqlite::Connection;
use std::path::Path;

pub const DB_FILENAME: &str = "reality_check.db";

pub fn open<P: AsRef<Path>>(path: P) -> AppResult<Connection> {
    let conn = Connection::open(path)?;
    conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")?;
    migrations::run(&conn)?;
    Ok(conn)
}
