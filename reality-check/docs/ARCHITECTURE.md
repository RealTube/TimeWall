# Hima — Architecture

Hima is a Tauri 2 desktop app: a small Rust core owns scheduling, storage, and
encryption; a React 19 frontend renders three windows' worth of UI over a typed
IPC boundary. Nothing talks to the network.

```
┌─────────────────────────────── OS ───────────────────────────────┐
│  Keychain / Credential Manager        Tray        Notifications  │
└───────▲──────────────────────────────▲─▲────────────────▲────────┘
        │ 256-bit key                  │ │                │
┌───────┴───────────────  Rust core (src-tauri)  ─────────┴────────┐
│  crypto.rs ──── XChaCha20-Poly1305 seal/open of activity text    │
│  db.rs ──────── SQLite (WAL) · migrations · CRUD · aggregations  │
│  backup.rs ──── encrypted backup format · CSV parsing (portable) │
│  timer.rs ───── 5 s tick · wall-clock target · idle · schedule   │
│  commands.rs ── validated IPC commands (the only API surface)    │
│  tray.rs ────── tray icon/menu · lib.rs: plugins & lifecycle     │
└────────▲─────────────────────▲───────────────────────▲───────────┘
         │ invoke (typed)      │ events                │ window ops
┌────────┴─────────────────────┴───────────────────────┴───────────┐
│                    React frontend (src/)                         │
│   main window: Dashboard · Insights · Settings · Onboarding      │
│   prompt window: the floating check-in card                      │
└───────────────────────────────────────────────────────────────────┘
```

## Process & window model

Two pre-declared webview windows (`tauri.conf.json`):

| Window | Purpose | Behavior |
|---|---|---|
| `main` | Dashboard / Insights / Settings | Starts hidden; closing **hides** it (tray app pattern). Single-instance plugin re-focuses it on a second launch. |
| `prompt` | The check-in card | Frameless, transparent, always-on-top, skip-taskbar, OS acrylic/vibrancy. Shown by the scheduler, hidden on submit/snooze. |

The scheduler lives in the Rust process, not the webview — prompts fire even
when every window is closed. Quitting is only possible from the tray.

## Scheduling (timer.rs)

The core design decision: **the next prompt is a persisted wall-clock
timestamp** (`next_prompt_at` in settings), not an in-process timer.

- A detached thread ticks every 5 s and calls the pure function
  `evaluate_due(now, next_at, interval_secs, align) -> (fire, new_next)`.
- Sleep/hibernate/reboot: on wake, `now` is far past `next_at` → exactly one
  fire, then re-arm at the next boundary. No storms, no drift.
- `align` snaps targets to interval boundaries of the clock (:00/:15/:30/:45
  for 15 min) — matching the classic kitchen-timer method.
- Each tick is wrapped in `catch_unwind`; a panic is logged and the loop
  survives (NFR-3).

Gates evaluated *at fire time*, in order:

1. `paused` — manual pause; nothing happens.
2. `paused_until` — temporary pause (tray "Pause for 1 hour"); when expired
   the marker self-clears and the timer re-arms.
3. **Schedule** — `within_schedule(...)` (pure, unit-tested) checks enabled
   flag, ISO weekday CSV, and a minutes-of-day window that supports overnight
   ranges (22:00–06:00). Outside: silent skip, nothing recorded.
4. **Idle** — if user input has been absent past the threshold, the interval
   is recorded as *Away from desk* (`was_idle = 1`) and no UI appears.
5. Otherwise: show + focus the prompt window, emit `time-to-log`, and raise a
   notification fallback (Windows may deny focus stealing).

## Storage (db.rs)

Single `rusqlite::Connection` in WAL mode behind a `Mutex` in Tauri managed
state (`AppState`), shared by commands and the timer thread. Locks are held
only for the duration of one statement batch.

```sql
categories(id, name, color, is_productive, sort_order, weekly_target_min)
activity_log(id, date 'YYYY-MM-DD' local, time 'HH:MM:SS' local,
             logged_at_ts unix, activity_enc BLOB,   -- ciphertext
             category_id → categories ON DELETE SET NULL,
             was_idle, interval_min)
settings(key PRIMARY KEY, value)                      -- typed at the edges
indexes: activity_log(date), activity_log(logged_at_ts)
```

Design notes:

- **Only the activity text is encrypted.** Timestamps, category ids, flags
  stay plain so every aggregate (totals, heatmap, category split) runs as
  indexed SQL without a decrypt pass. Aggregations that need the text (top
  activities, focus blocks, export) do one ordered scan + decrypt in Rust.
- `interval_min` is stored **per row**, so changing the interval later never
  rewrites history — every row knows how much time it represents.
- `date`/`time` are local (what the user means by "today"); `logged_at_ts` is
  UTC for ordering.
- Migrations: `PRAGMA user_version`-keyed, append-only blocks
  (v1 = base schema + seeds, v2 = schedule/pause keys,
  v3 = `categories.weekly_target_min`). Defaults use `INSERT OR IGNORE` so
  re-runs are harmless.
- **Category memory (FR-11)** is a query, not a table: `last_category_for`
  scans the most recent categorized entries (newest first, capped) for an
  exact normalized text match. No learned state to migrate or get stale —
  re-categorizing once immediately becomes the new memory.
- **Search (FR-15)** is a single ordered scan + decrypt that stops at the
  result limit; the query string never touches disk. **Streaks (FR-13)** read
  only `DISTINCT date` (indexed) and run through the pure, unit-tested
  `streaks_from_dates`.
- **Merge engine (FR-17/18)**: backup restore and CSV import share
  `merge_entries`, which is additive and idempotent — the dedupe key is the
  *moment* `(date, time)`, deliberately not the text: keying on text would
  re-import locally-edited rows as twins and double-count their time (§2.2).
  Categories resolve by case-insensitive name and are created when missing;
  the whole merge runs in one transaction. `answer_stats` splits a range into
  answered / missed / away (decrypting idle rows only) for the Findings card.

## Backup & import (backup.rs)

The data-portability module is pure (no Tauri types) and fully unit-tested:

- **Backup file**: `HIMABKP1 ‖ salt(16) ‖ nonce(24) ‖ AEAD(JSON payload)`.
  The key is Argon2id(passphrase, salt) — independent of the OS keychain, so
  a backup outlives the machine. Payload carries entries (categories by
  *name*, so ids never need to match), category definitions, and the
  allow-listed portable settings (`db::PORTABLE_SETTING_KEYS`).
- **CSV parsing**: header-driven (case-insensitive), BOM-tolerant, RFC 4180
  via the `csv` crate. `date`/`time`/`activity` required; `category`,
  `was_away`, `interval_minutes` honored — Hima's own export round-trips.
  Invalid rows are counted and skipped, never guessed at.
- Commands (`backup_create`, `backup_restore`, `import_csv`) own the native
  dialogs and the DB lock; the format itself never touches Tauri.

## Encryption (crypto.rs)

- 256-bit key generated on first run, stored **only** in the OS credential
  store (`keyring`: Windows Credential Manager / macOS Keychain).
- Every activity string is sealed with **XChaCha20-Poly1305** under a fresh
  random 24-byte nonce; stored as `nonce ‖ ciphertext` in the BLOB column.
- AEAD means tampering with the DB file fails decryption loudly (tested).
- Threat model and trade-offs: see [SECURITY.md](SECURITY.md).

## IPC surface (commands.rs)

Commands are thin, validated wrappers — the webview never sees SQL or the key.
Highlights (full list in `lib.rs::generate_handler!`):

| Group | Commands |
|---|---|
| Logging | `log_activity` (infers a remembered category when none is given), `get_todays_logs`, `get_logs_for_date`, `get_recent_activities`, `update_activity`, `delete_activity` |
| Scheduling | `get_settings`, `set_interval`, `update_setting` (allow-list + per-key validation), `set_pause`, `pause_for`, `snooze`, `get_next_prompt_at` |
| Categories | `list_categories`, `add_category`, `update_category` (incl. weekly target, range-checked), `delete_category` |
| Insights | `get_day_totals` (worked/away/productive), `get_category_breakdown`, `get_hourly_heatmap`, `get_top_activities`, `get_focus_stats`, `search_entries`, `get_streaks`, `get_answer_stats` |
| Data | `export_csv` (native save dialog, BOM, RFC 4180 escaping), `save_report` (native save dialog, size-capped Markdown), `erase_all_entries`, `backup_create` / `backup_restore` (passphrase-encrypted, additive merge), `import_csv` (additive merge + invalid-row count) |
| System | `set_autostart`, `get_autostart` |

The tray's "Check in now" (FR-10) is not an IPC command at all — it lives in
`tray.rs`, re-arms `next_prompt_at`, and surfaces the prompt window directly,
keeping the webview-reachable surface minimal (NFR-5).

Conventions: every command returns `Result<_, String>` with a human-readable
message; inputs are trimmed, length-capped, and range-checked; mutations emit
a `refresh-dashboard` event so all open views stay live.

## Frontend (src/)

- **`lib/api.ts`** — the only place `invoke` is called; fully typed against
  `lib/types.ts`, which mirrors the serde structs. In a plain browser
  (`npm run dev`) it transparently falls back to `lib/devMock.ts` fixtures.
- **State**: server state lives in the Rust core; screens fetch on mount and
  re-fetch on the `refresh-dashboard` event. The only client state is the
  theme (zustand), persisted as a setting.
- **Screens** are routed with a hash router (`/` Dashboard, `/insights`,
  `/settings` inside the sidebar layout; `/prompt` standalone for the prompt
  window).
- **Insights aggregation contract**: heavy lifting (grouping, ranking, block
  detection) happens in Rust; the frontend only shapes and renders. Charts
  are hand-rolled SVG/CSS — no chart library, keeping the bundle small and
  the visuals exactly on the design system.

## Performance posture (NFR-2)

- Idle cost: one SQL read per 5 s tick on a settings table of ~15 rows.
- Aggregates are `GROUP BY` over indexed columns; the decrypt-pass paths
  (top activities, focus, export) are O(rows in range) with a single
  prepared statement.
- The frontend ships one JS bundle (~140 kB gzip); charts add zero deps.

## Testing strategy (NFR-7)

| Layer | What is tested | Where |
|---|---|---|
| Scheduler | fire/re-arm decisions, alignment, sleep-gap, schedule windows (incl. overnight, malformed CSV) | `timer.rs` |
| Crypto | round-trip, nonce uniqueness, tamper rejection, key-based cipher mismatch | `crypto.rs` |
| Backup format | seal/open round-trip, ciphertext opacity, wrong-passphrase & tamper rejection, CSV header/row validation, export round-trip, quoted fields | `backup.rs` |
| Store | migrations & seeds (incl. v3 targets), upserts, totals split (worked/away/productive), heatmap, top-activity grouping, focus blocks/switches, category memory, search (matching, limits, idle exclusion), streak runs, export rows, erase, merge dedupe/idempotency, category mapping & creation, answer-rate split | `db.rs` |
| Commands | CSV escaping, setting validation | `commands.rs` |
| Frontend | duration/date math, week/month/year anchors, signed deltas, trend week-bucketing ranges, countdowns, findings rules & confidence floors, ghost-completion matching | `src/lib/*.test.ts` (Vitest) |

CI (`.github/workflows/ci.yml`) runs typecheck, Vitest, the production build,
`cargo fmt --check`, `clippy -D warnings`, and `cargo test` on every push/PR.
