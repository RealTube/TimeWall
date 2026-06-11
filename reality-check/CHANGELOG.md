# Changelog

All notable changes to Hima are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/).

## [1.1.0] — 2026-06-10

"The Ritual" release: the data you already collect becomes a weekly review —
compare, search, share, adjust — with zero new friction at the prompt.
Scoped in [PRD §11](docs/PRD.md#11-hima-11--the-ritual).

### Added
- **Remembered categories** — log "standup" once as Meetings and every later
  "standup" categorizes itself. Deterministic, local, exact-match; an explicit
  chip always wins.
- **Trends in Insights**:
  - Hero comparison vs the previous period ("+2h 15m vs last week ·
    productive share up 3 pts").
  - **Last 8 weeks** chart — worked vs productive hours per week.
  - **Where the time moved** — the activities that gained and lost the most
    time vs the previous period, by name.
- **Journal search** — `⌘/Ctrl K` opens an on-device search palette over every
  entry; ↵ jumps to that day's full journal. Queries never touch disk.
- **Audit streak** — consecutive logged days (and best run) in the Insights
  hero. Calm copy; no gamification.
- **Markdown report** — save any visible period (totals, days, top
  activities, focus, categories) via a native save dialog, for coaches and
  accountability partners.
- **Check in anytime** — "Check in now" in the tray (re-arms the schedule) and
  a quick-log composer on the dashboard timeline.
- **Gentle weekly targets** — optional hours-per-week per category, set inline
  in Settings; week view shows a quiet tick and "6h of 10h". Never red, never
  notifies.
- Design system: keyboard-only focus rings, `prefers-reduced-motion` support,
  accent caret, ambient header light, search-highlight styling.

### Changed
- Day totals now carry productive minutes, so the hero ring, trend, and
  report all share one definition of "productive".
- Database schema migrated to v3 (additive; existing data is preserved).

## [1.0.0] — 2026-06-10

The "reality check" release: Hima graduates from a logger into a full time
audit. Scoped by the [PRD gap analysis](docs/PRD.md#9-requirements-review--gap-analysis-vs-v01).

### Added
- **Insights** screen (replaces History), answering the audit's core questions:
  - Week **and month** periods with previous/next navigation.
  - **Time-of-day heatmap** — worked minutes by hour × weekday ("when do I
    actually work?").
  - **Top activities** — named activities ranked by total time with
    share-of-period.
  - **Focus profile** — average focus-block length, longest block, and
    context switches per day.
  - **Day drill-down** — click any daily bar to read that day's full journal.
- **CSV export** with a native save dialog (UTF-8 BOM, Excel-ready) for week,
  month, or all time — the audit returns to the spreadsheet it came from.
- **Work-hours schedule** — restrict prompts to chosen weekdays and a
  start–end window (supports overnight windows); outside it Hima is silent.
- **Pause for 1 hour** in the tray menu; resumes by itself.
- **Next check-in** countdown and a **today-by-category** distribution strip
  on the dashboard.
- **Erase all entries** with an inline two-step confirmation.
- Frontend unit tests (Vitest), expanded Rust test suite (35 tests total),
  GitHub Actions CI (typecheck, tests, build, fmt, clippy).
- Documentation suite: PRD, architecture, design system, security model,
  contributing guide.

### Changed
- Settings gained Schedule and Data sections; every control still commits
  immediately (no Save button).
- Database schema migrated to v2 (additive; existing data is preserved).
- Version aligned to 1.0.0 across the app, crate, and bundle config.

### Fixed
- Build artifacts (`*.db`, `*.xlsx`) removed from version control.

## [0.1.0] — 2026-06-08

Initial release: interval prompt with recent/category chips, encrypted SQLite
store (XChaCha20-Poly1305, key in the OS keychain), sleep-safe wall-clock
scheduler with idle detection, tray-resident lifecycle, dashboard timeline,
weekly history, categories, onboarding, dark/light/system themes.
