# Hima

A local-first time-audit desktop app. Hima quietly prompts you at a set interval to log what you're actually doing, classifies each entry, and turns the day into a single **reality score** — so you can see how much of your time becomes real output versus how much leaks away.

Built with **Tauri 2** (Rust) + **React 19** + **TypeScript**. All data lives in a local SQLite database on your machine; nothing is sent anywhere.

## How it works

1. A background **daemon** pops a small prompt window every *interval* minutes (configurable).
2. You type one line describing what you were doing. It's saved to the activity log with a timestamp and a duration.
3. Hima **categorizes** the entry by keywords, and the dashboard rolls the day up into a reality score, a streak, and progress toward your daily goal.
4. Pause prompting when you need to; export everything to CSV when you want your raw data.

## Categories

Every activity is sorted into one of five buckets ([`categorize.rs`](src-tauri/src/categorize.rs)):

| Category   | Meaning                              | Examples                                  |
|------------|--------------------------------------|-------------------------------------------|
| `output`   | Deep / creative work that ships      | code, design, writing, sales, content     |
| `input`    | Coordination overhead                | meetings, email, slack, reviews           |
| `recovery` | Intentional rest                     | lunch, walk, gym, sleep                   |
| `leak`     | Attention drains                     | scrolling, social, doomscroll, distraction|
| `unknown`  | Unmatched — recategorize manually    | —                                         |

You can override any auto-category from the log table.

## Reality score

The day's minutes are weighted by category and normalized to **0–100**
([`lib/format.ts`](src/lib/format.ts)):

```
output ×1.0   input ×0.5   recovery ×0.3   leak ×0   unknown ×0
score = round( weighted_minutes / total_minutes × 100 )
```

A high score means most of your logged time was real output; a low score means it leaked.

## Features

- **Reality score** — daily and weekly, with category breakdown bars.
- **Streaks** — consecutive days meeting a configurable minimum number of logs.
- **Daily goal** — target output minutes (1 min – 24 h) with progress tracking.
- **Pause control** — pause prompting for N minutes or until tomorrow, from the tray or dashboard.
- **System tray** — quick status and controls; window hides to tray instead of quitting.
- **CSV export** — dump the full log via a native save dialog (`hima-export-<date>.csv`).
- **Today / Week views** — drill into a single day or scan the trailing week.

## Architecture

### Backend (`src-tauri/src/`)

| Module           | Responsibility                                              |
|------------------|-------------------------------------------------------------|
| `main.rs`        | App bootstrap, command registration, daemon/tray setup      |
| `commands/`      | Tauri command handlers: `logs`, `settings`, `insights`, `pause`, `export` |
| `db/`            | Connection, `migrations`, and `queries`                     |
| `categorize.rs`  | Keyword-based activity classifier                           |
| `daemon.rs`      | Background interval prompter                                 |
| `tray.rs`        | System tray menu + pause state                              |
| `windows.rs`     | Window behavior (hide-on-close)                             |
| `state.rs`       | Shared `AppState` (DB + daemon handle + pause status)       |
| `error.rs`       | `AppError` / `AppResult`                                     |

### Frontend (`src/`)

- `dashboard/` — `Dashboard`, `components/` (RealityScoreCard, CategoryBar, CategoryBadge, StreakCard, GoalCard, LogTable, PauseControl, SettingsPanel, ExportButton, Sidebar), and `views/` (TodayView, WeekView).
- `prompt/` — the interval prompt window.
- `hooks/` — typed IPC hooks (`useLogs`, `useWeek`, `useStreak`, `useGoal`, `usePause`, `useSettings`, `useRecentActivities`).
- `lib/` — `ipc.ts` (typed `invoke` wrappers) and `format.ts` (score math + formatting).
- `types/` — shared TypeScript types.

### Data model (SQLite)

- `activity_log(id, date, time, activity, duration, category)`
- `settings(key, value)` — holds `interval`, `daily_goal_minutes`, `streak_min_logs`.

## Tauri commands

`get_todays_logs`, `get_logs_in_range`, `log_activity`, `update_log_category`,
`get_recent_activities`, `get_interval`, `set_interval`, `get_streak`,
`get_daily_goal`, `set_daily_goal`, `get_streak_min_logs`, `set_streak_min_logs`,
`pause_daemon`, `resume_daemon`, `get_pause_status`, `export_csv`,
`suggest_export_filename`.

## Development

```bash
cd reality-check
npm install
npm run tauri dev      # run the app with hot reload
npm run tauri build    # produce a release bundle
```

Frontend-only (no Rust shell):

```bash
npm run dev
npm run build
```

### Recommended IDE setup

[VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer).
