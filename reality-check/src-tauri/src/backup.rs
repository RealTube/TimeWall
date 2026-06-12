//! Data portability: encrypted backup files (FR-17) and CSV import (FR-18).
//!
//! A backup is one file the user can carry anywhere:
//!
//! ```text
//! bytes 0..8    magic  b"HIMABKP1"  (format + version in one tag)
//! bytes 8..24   salt   16 random bytes (per backup)
//! bytes 24..    nonce || ciphertext   (XChaCha20-Poly1305 over the JSON payload)
//! ```
//!
//! The key is derived from the user's passphrase with Argon2id — the OS
//! keychain is deliberately *not* involved, so a backup survives a dead disk,
//! a reinstall, or a move to a new machine. The passphrase lives only in
//! memory for the duration of the command.

use std::collections::BTreeMap;

use chacha20poly1305::aead::{rand_core::RngCore, OsRng};
use serde::{Deserialize, Serialize};

use crate::crypto::Crypto;

pub const MAGIC: &[u8; 8] = b"HIMABKP1";
const SALT_LEN: usize = 16;

/// Everything a backup carries. Entries reference categories by *name* so the
/// file stays portable across machines whose category ids differ.
#[derive(Serialize, Deserialize)]
pub struct BackupPayload {
    pub format: u32,
    pub app_version: String,
    pub exported_at: String,
    pub categories: Vec<BackupCategory>,
    pub entries: Vec<BackupEntry>,
    /// Portable preferences only — machine state (pause, schedule arming,
    /// onboarding) never travels. Restore re-validates every key.
    pub settings: BTreeMap<String, String>,
}

#[derive(Serialize, Deserialize)]
pub struct BackupCategory {
    pub name: String,
    pub color: String,
    pub is_productive: bool,
    pub sort_order: i64,
    pub weekly_target_min: i64,
}

#[derive(Serialize, Deserialize)]
pub struct BackupEntry {
    pub date: String,
    pub time: String,
    pub ts: i64,
    pub activity: String,
    pub category: Option<String>,
    pub was_idle: bool,
    pub interval_min: i64,
}

/// Argon2id (default params: 19 MiB, t=2, p=1) → 256-bit file key.
pub fn derive_key(passphrase: &str, salt: &[u8]) -> Result<[u8; 32], String> {
    let mut key = [0u8; 32];
    argon2::Argon2::default()
        .hash_password_into(passphrase.as_bytes(), salt, &mut key)
        .map_err(|e| format!("key derivation failed: {e}"))?;
    Ok(key)
}

/// Serialize and encrypt a payload into the on-disk backup format.
pub fn seal(payload: &BackupPayload, passphrase: &str) -> Result<Vec<u8>, String> {
    let json = serde_json::to_vec(payload).map_err(|e| format!("serialize failed: {e}"))?;
    let mut salt = [0u8; SALT_LEN];
    OsRng.fill_bytes(&mut salt);
    let key = derive_key(passphrase, &salt)?;
    let blob = Crypto::from_key(&key).encrypt_bytes(&json)?;
    let mut out = Vec::with_capacity(MAGIC.len() + SALT_LEN + blob.len());
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(&salt);
    out.extend_from_slice(&blob);
    Ok(out)
}

/// Decrypt and parse a backup file. A wrong passphrase and a corrupted file
/// are indistinguishable by design (AEAD), so the error says both.
pub fn open(bytes: &[u8], passphrase: &str) -> Result<BackupPayload, String> {
    if bytes.len() < MAGIC.len() + SALT_LEN || &bytes[..MAGIC.len()] != MAGIC {
        return Err("This is not a Hima backup file".into());
    }
    let salt = &bytes[MAGIC.len()..MAGIC.len() + SALT_LEN];
    let blob = &bytes[MAGIC.len() + SALT_LEN..];
    let key = derive_key(passphrase, salt)?;
    let json = Crypto::from_key(&key)
        .decrypt_bytes(blob)
        .map_err(|_| "Wrong passphrase, or the file is damaged".to_string())?;
    serde_json::from_slice(&json).map_err(|e| format!("backup payload unreadable: {e}"))
}

// ---------------------------------------------------------------------------
// CSV import (FR-18)
// ---------------------------------------------------------------------------

/// One validated row from an imported CSV, normalized to Hima's shapes.
pub struct CsvRow {
    pub date: String,
    pub time: String,
    pub activity: String,
    pub category: Option<String>,
    pub was_idle: bool,
    pub interval_min: i64,
}

/// Parse a CSV (UTF-8, optional BOM). `date`, `time`, and `activity` headers
/// are required (case-insensitive); `category`, `was_away`, and
/// `interval_minutes` are honored when present — exactly what Hima's own
/// export writes, so export → import round-trips. Malformed rows are counted,
/// not guessed at (§2.2). Returns `(rows, invalid_count)`.
pub fn parse_csv(bytes: &[u8]) -> Result<(Vec<CsvRow>, usize), String> {
    let bytes = bytes.strip_prefix("\u{feff}".as_bytes()).unwrap_or(bytes);
    let mut reader = csv::ReaderBuilder::new().flexible(true).from_reader(bytes);

    let headers = reader
        .headers()
        .map_err(|e| format!("could not read CSV header: {e}"))?
        .clone();
    let col = |name: &str| {
        headers
            .iter()
            .position(|h| h.trim().eq_ignore_ascii_case(name))
    };
    let (Some(c_date), Some(c_time), Some(c_activity)) =
        (col("date"), col("time"), col("activity"))
    else {
        return Err("CSV needs date, time, and activity columns".into());
    };
    let c_category = col("category");
    let c_away = col("was_away").or_else(|| col("away"));
    let c_interval = col("interval_minutes").or_else(|| col("minutes"));

    let mut rows = Vec::new();
    let mut invalid = 0usize;
    for record in reader.records() {
        let Ok(record) = record else {
            invalid += 1;
            continue;
        };
        match parse_record(
            &record, c_date, c_time, c_activity, c_category, c_away, c_interval,
        ) {
            Some(row) => rows.push(row),
            None => invalid += 1,
        }
    }
    Ok((rows, invalid))
}

#[allow(clippy::too_many_arguments)]
fn parse_record(
    record: &csv::StringRecord,
    c_date: usize,
    c_time: usize,
    c_activity: usize,
    c_category: Option<usize>,
    c_away: Option<usize>,
    c_interval: Option<usize>,
) -> Option<CsvRow> {
    let field = |i: usize| record.get(i).map(str::trim).unwrap_or("");

    let date = field(c_date);
    chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d").ok()?;

    let time = normalize_time(field(c_time))?;

    let activity: String = field(c_activity).chars().take(200).collect();
    if activity.trim().is_empty() {
        return None;
    }

    let category = c_category
        .map(field)
        .filter(|s| !s.is_empty())
        .map(|s| s.chars().take(40).collect());

    let was_idle = c_away
        .map(field)
        .map(|s| matches!(s.to_ascii_lowercase().as_str(), "yes" | "true" | "1"))
        .unwrap_or(false);

    let interval_min = match c_interval.map(field).filter(|s| !s.is_empty()) {
        Some(s) => s.parse::<i64>().ok().filter(|m| (1..=240).contains(m))?,
        None => 15,
    };

    Some(CsvRow {
        date: date.to_string(),
        time,
        activity: activity.trim().to_string(),
        category,
        was_idle,
        interval_min,
    })
}

/// "9:05" / "09:05" / "09:05:30" → "HH:MM:SS", or `None` if unparseable.
fn normalize_time(s: &str) -> Option<String> {
    let t = chrono::NaiveTime::parse_from_str(s, "%H:%M:%S")
        .or_else(|_| chrono::NaiveTime::parse_from_str(s, "%H:%M"))
        .ok()?;
    Some(t.format("%H:%M:%S").to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_payload() -> BackupPayload {
        BackupPayload {
            format: 1,
            app_version: "1.2.0".into(),
            exported_at: "2026-06-12T10:00:00Z".into(),
            categories: vec![BackupCategory {
                name: "Deep Work".into(),
                color: "#5B8DEF".into(),
                is_productive: true,
                sort_order: 0,
                weekly_target_min: 600,
            }],
            entries: vec![BackupEntry {
                date: "2026-06-11".into(),
                time: "09:15:00".into(),
                ts: 1_780_000_000,
                activity: "spec review".into(),
                category: Some("Deep Work".into()),
                was_idle: false,
                interval_min: 15,
            }],
            settings: BTreeMap::from([("interval_minutes".into(), "15".into())]),
        }
    }

    #[test]
    fn backup_round_trips_through_seal_and_open() {
        let sealed = seal(&sample_payload(), "correct horse battery").unwrap();
        assert_eq!(&sealed[..8], MAGIC);
        let opened = open(&sealed, "correct horse battery").unwrap();
        assert_eq!(opened.entries.len(), 1);
        assert_eq!(opened.entries[0].activity, "spec review");
        assert_eq!(opened.categories[0].weekly_target_min, 600);
        assert_eq!(opened.settings["interval_minutes"], "15");
    }

    #[test]
    fn backup_is_ciphertext_not_plaintext() {
        let sealed = seal(&sample_payload(), "correct horse battery").unwrap();
        let hay = String::from_utf8_lossy(&sealed);
        assert!(!hay.contains("spec review"));
        assert!(!hay.contains("Deep Work"));
    }

    #[test]
    fn wrong_passphrase_fails_loudly() {
        let sealed = seal(&sample_payload(), "correct horse battery").unwrap();
        let err = open(&sealed, "wrong passphrase!").err().unwrap();
        assert!(err.contains("passphrase"), "{err}");
    }

    #[test]
    fn non_backup_bytes_are_rejected() {
        assert!(open(b"not a backup at all", "pass").is_err());
        assert!(open(b"", "pass").is_err());
    }

    #[test]
    fn tampered_backup_is_rejected() {
        let mut sealed = seal(&sample_payload(), "correct horse battery").unwrap();
        let last = sealed.len() - 1;
        sealed[last] ^= 0xff;
        assert!(open(&sealed, "correct horse battery").is_err());
    }

    #[test]
    fn csv_parses_himas_own_export_format() {
        let csv = "\u{feff}date,time,activity,category,productive,was_away,interval_minutes\n\
                   2026-06-11,09:15:00,spec review,Deep Work,yes,no,15\n\
                   2026-06-11,09:30:00,Away from desk,,,yes,15\n";
        let (rows, invalid) = parse_csv(csv.as_bytes()).unwrap();
        assert_eq!(invalid, 0);
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].activity, "spec review");
        assert_eq!(rows[0].category.as_deref(), Some("Deep Work"));
        assert!(!rows[0].was_idle);
        assert!(rows[1].was_idle);
        assert_eq!(rows[1].category, None);
    }

    #[test]
    fn csv_accepts_a_minimal_kitchen_timer_sheet() {
        let csv = "Date,Time,Activity\n2026-06-11,9:15,emails\n2026-06-11,9:30,standup\n";
        let (rows, invalid) = parse_csv(csv.as_bytes()).unwrap();
        assert_eq!(invalid, 0);
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].time, "09:15:00"); // normalized
        assert_eq!(rows[0].interval_min, 15); // default
    }

    #[test]
    fn csv_counts_invalid_rows_instead_of_guessing() {
        let csv = "date,time,activity,interval_minutes\n\
                   2026-06-11,09:15,ok,15\n\
                   not-a-date,09:30,bad date,15\n\
                   2026-06-11,25:99,bad time,15\n\
                   2026-06-11,09:45,   ,15\n\
                   2026-06-11,10:00,bad interval,999\n";
        let (rows, invalid) = parse_csv(csv.as_bytes()).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(invalid, 4);
    }

    #[test]
    fn csv_quoted_fields_with_commas_survive() {
        let csv = "date,time,activity\n2026-06-11,09:15,\"call: pricing, renewal\"\n";
        let (rows, _) = parse_csv(csv.as_bytes()).unwrap();
        assert_eq!(rows[0].activity, "call: pricing, renewal");
    }

    #[test]
    fn csv_without_required_columns_errors() {
        assert!(parse_csv(b"foo,bar\n1,2\n").is_err());
    }
}
