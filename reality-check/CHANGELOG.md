# Changelog

All notable changes to Hima are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/).

## [1.2.0] — 2026-06-12

"The Long Game" release: the audit becomes durable — backup, restore, import —
and long-sighted — the year view, plain-language findings — while the prompt
gets cheaper. Scoped in [PRD §12](docs/PRD.md#12-hima-12--the-long-game).

### Added
- **Encrypted backup & restore** — your whole audit (entries, categories,
  portable settings) in one file, sealed with a passphrase (Argon2id +
  XChaCha20-Poly1305). No keychain required to read it back: a backup
  survives a dead disk or a new machine. Restore merges additively —
  duplicates skip, local category config wins, nothing is ever overwritten.
- **CSV import** — bring in the original kitchen-timer spreadsheet or a Hima
  export (which now round-trips losslessly). Honest tally afterwards:
  imported, already-present, unreadable rows.
- **The year view** — a third period in Insights with a year-in-pixels
  mosaic: every day a cell, intensity = worked time, click a day to open its
  week and journal. Year reports summarize by month.
- **What stands out** — up to three deterministic, plain-language findings
  per period: your heaviest hour and fullest weekday, focus blocks up/down
  vs the previous period, your answer rate (flagged when it undercuts the
  totals), your most productive weekday. Computed on-device from your own
  entries; silent below confidence floors.
- **Ghost autocomplete** — type two characters in the prompt (or the quick
  log) and the rest of your most recent matching entry appears inline; Tab
  accepts. "standup" is now three keystrokes. Prefix-only, never fuzzy.
- **Answer-rate tracking** — answered vs missed vs away intervals per period
  (`get_answer_stats`), the ESM data-quality metric behind the findings.

### Changed
- Insights now also loads the previous period's focus profile (for the focus
  finding) — same indexed queries, no new schema.
- Versions aligned to 1.2.0; schema stays at v3 (no migration needed).

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
- **Check in anytime** — "Check in now" in the tray and on the dashboard, plus
  a quick-log composer on the dashboard timeline. The first check-in fires
  right after onboarding instead of 15 minutes later.
- **Gentle weekly targets** — optional hours-per-week per category, set inline
  in Settings; week view shows a quiet tick and "6h of 10h". Never red, never
  notifies.
- Design system: keyboard-only focus rings, `prefers-reduced-motion` support,
  accent caret, ambient header light, search-highlight styling.
- **Missed check-ins recorded** — an unanswered prompt logs a "Missed
  check-in" row (excluded from worked time) instead of silently vanishing;
  stale prompt cards are hidden when you go idle or the schedule ends.
- **Post-hoc categorization** — every journal row (today and past-day
  drill-down) edits text *and* category, so the review step no longer
  depends on the 3-second prompt.
- **Reclaim away/missed intervals** — idle rows are editable; editing one
  clears the idle flag ("I was reading, not away").
- **Alerts settings** — system-notification toggle surfaced; the sound
  setting now drives a soft synthesized chime when the prompt appears.
- **Category recolor** — click a category's dot in Settings to change its
  color.

### Changed
- Day totals now carry productive minutes, so the hero ring, trend, and
  report all share one definition of "productive".
- Database schema migrated to v3 (additive; existing data is preserved).
- Settings steppers move in 5-minute increments above 5 minutes.
- Insights refreshes live while edits happen, and calls out when ≥25% of
  worked time is uncategorized (the productive % would be an undercount).
- An unsubmitted prompt draft survives the next interval's re-show.

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
