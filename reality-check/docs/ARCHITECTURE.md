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
categories(id, name, color, is_productive, sort_order)
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
  (v1 = base schema + seeds, v2 = schedule/pause keys). Defaults use
  `INSERT OR IGNORE` so re-runs are harmless.

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
| Logging | `log_activity`, `get_todays_logs`, `get_logs_for_date`, `get_recent_activities`, `update_activity`, `delete_activity` |
| Scheduling | `get_settings`, `set_interval`, `update_setting` (allow-list + per-key validation), `set_pause`, `pause_for`, `snooze`, `get_next_prompt_at` |
| Categories | `list_categories`, `add_category`, `update_category`, `delete_category` |
| Insights | `get_day_totals`, `get_category_breakdown`, `get_hourly_heatmap`, `get_top_activities`, `get_focus_stats` |
| Data | `export_csv` (native save dialog, BOM, RFC 4180 escaping), `erase_all_entries` |
| System | `set_autostart`, `get_autostart` |

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
| Crypto | round-trip, nonce uniqueness, tamper rejection | `crypto.rs` |
| Store | migrations & seeds, upserts, totals split, heatmap, top-activity grouping, focus blocks/switches, export rows, erase | `db.rs` |
| Commands | CSV escaping, setting validation | `commands.rs` |
| Frontend | duration/date math, week/month anchors, countdowns | `src/lib/utils.test.ts` (Vitest) |

CI (`.github/workflows/ci.yml`) runs typecheck, Vitest, the production build,
`cargo fmt --check`, `clippy -D warnings`, and `cargo test` on every push/PR.
