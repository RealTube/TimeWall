# Hima — Product Requirements Document

| | |
|---|---|
| **Product** | Hima — the automated time audit |
| **Version** | 1.2 |
| **Status** | Approved — implemented (1.0 §1–10; 1.1 §11; 1.2 §12) |
| **Last updated** | 2026-06-12 |
| **Platforms** | Windows 10/11, macOS 12+ (Linux best-effort) |

---

## 1. Problem statement

The most reliable way to find out where your time goes is also the most primitive:
set a kitchen timer for 15 minutes, and every time it rings, write one or two words
in a spreadsheet about what you just did. After a week, the spreadsheet tells you
the truth — and it is rarely what you would have guessed.

The method (popularized by Alex Hormozi, and a direct descendant of Peter Drucker's
"know thy time" audit) works because it samples *reality* instead of *memory*.
People misremember their day by hours; interval sampling doesn't.

The method fails in practice for mechanical reasons:

1. **The timer is annoying to operate.** You forget to restart it, it rings during
   meetings, it doesn't know you went to lunch.
2. **The spreadsheet is friction.** Alt-tabbing to Excel, finding the row, typing
   the timestamp — 20 seconds of overhead per entry, 32 times a day.
3. **The data is write-only.** Raw rows in a sheet don't answer the questions the
   audit exists for: *When am I actually productive? What eats my afternoons?
   How fragmented is my focus?*
4. **It's sensitive.** A plaintext log of everything you do is a privacy liability
   on a shared or managed machine.

**Hima automates the entire loop**: a resident desktop app that prompts on the
interval, takes a 1–2 word answer in one keystroke, knows when you were away,
encrypts everything on-device, and turns the raw samples into the small set of
answers the audit was for.

## 2. Product principles

These decide every tie-break in design and scope:

1. **The prompt is the product.** Answering must cost < 3 seconds. Every feature
   is judged by whether it adds friction to the prompt. (This is why there is no
   "required" category picker, no multi-field form, no confirmation dialog.)
2. **Honest numbers or no numbers.** Idle time is never counted as work. We never
   extrapolate or guess. A gap in the data is shown as a gap.
3. **You type it, we keep it.** No screen scraping, no window-title spying, no
   network. The user's words are the only content, and they are encrypted at rest.
   Trust is a feature.
4. **Calm software.** Hima lives in the tray, interrupts only when asked to, and
   respects working hours. It should feel like a considerate assistant, not a
   surveillance tool or a gamified slot machine.
5. **Dashboards answer questions.** Every chart must answer a question a real
   user asks. No vanity metrics, no streak-fire emoji.

## 3. Research summary

### 3.1 Method research
- **Drucker (The Effective Executive):** time logs must be recorded *as they
  happen*, not reconstructed; review weekly; act on the findings.
- **Hormozi's kitchen-timer audit:** 15-minute sampling, 1–2 word entries, one
  week minimum, then categorize and cut. Hima's defaults mirror this: 15-minute
  interval, quarter-hour alignment, weekly review view.
- **Experience-sampling method (ESM) literature:** response burden is the main
  threat to validity — prompts must be answerable in seconds, and missed prompts
  must not corrupt the record (they are recorded as *away/missed*, not silently
  dropped).

### 3.2 Competitive scan
| Product | What it gets right | What Hima deliberately does differently |
|---|---|---|
| RescueTime / Rize | Automatic capture, time-of-day insights | Captures by spying on apps/windows; cloud accounts. Hima samples *the user's own words*, locally. |
| Toggl Track | One-click timers, clean reports | Requires manual start/stop discipline — the exact discipline the audit method exists to avoid. |
| ATracker / Hours | Pretty category wheels | Same start/stop problem; mobile-first. |
| Excel sheet + timer | The ground truth method | Everything in §1. Hima must export back to CSV/Excel so users never feel locked in. |

Key patterns adopted from the best-in-class: time-of-day × weekday heatmap
(RescueTime's single most-cited view), top-activities ranking, focus/fragmentation
metric (Rize), week/month period navigation with a "this week" anchor.

### 3.3 Platform & HIG research (how it should look and behave)
- **Apple HIG:** system font stack, tabular numerals for all data figures,
  progressive disclosure in settings (rows with inline hints, not modal trees),
  destructive actions isolated and red, toggles for binary state / steppers for
  small numeric ranges / segmented controls for 2–4 exclusive options.
- **Windows 11 Fluent:** acrylic/mica material on the floating prompt, respect
  for focus-assist (notification fallback rather than focus-stealing).
- **Both:** dark/light/system theming; close button hides to tray for resident
  utilities (Slack/Teams pattern); tray menu carries the emergency controls
  (pause, quit) so the app never has to be "found" to be controlled.

## 4. Personas

- **The operator (primary).** Founder / IC who suspects their week leaks. Wants
  the audit with zero ceremony. Reviews the week on Friday. Cares about: prompt
  speed, honest totals, the heatmap, export to share with a coach.
- **The deep-work guard.** Engineer/writer who wants to know how fragmented
  their focus is. Cares about: focus-block length, context-switch counts,
  schedule limits (never prompt after 18:00), snooze.
- **The privacy-conscious professional.** Works on a corporate or shared machine.
  Cares about: local-only, encryption at rest, easy full erase, no telemetry.

## 5. Functional requirements

Priorities: **P0** = ship-blocking, **P1** = required for 1.0, **P2** = nice-to-have.

### FR-1 Interval prompt (P0)
1. A floating, always-on-top prompt window appears on the configured interval
   (default 15 min), pre-focused on a single text input.
2. Submitting with **Enter** logs the entry and dismisses the window. Total
   interaction cost target: one line of text + one keystroke.
3. The prompt offers **recent-entry chips** (last unique answers) — one click
   re-logs a repeated activity — and optional **category chips**.
4. **Esc snoozes** the prompt (default 5 min) without logging.
5. If the OS blocks focus stealing, a system notification is raised as a fallback.
6. Prompt copy stays human ("What did you just do?"), never guilt-tripping.

### FR-2 Scheduling engine (P0)
1. Interval configurable 1–240 min; optional **alignment to clock boundaries**
   (:00/:15/:30/:45) — on by default to match the classic method.
2. The schedule target is **persisted wall-clock time**, so laptop sleep,
   hibernate, or reboot never produces a storm of missed prompts: on wake, at
   most one prompt fires and the timer re-arms.
3. **Idle detection:** if the user has been idle past a threshold (default 5 min)
   when the timer fires, the interval is recorded as *Away from desk* — not
   logged as work, and no window is shown.
4. **Pause/resume** from sidebar and tray; **pause for 1 hour** from tray
   (lunch/meeting case) that resumes automatically.
5. **Active schedule (work hours):** optionally restrict prompting to selected
   weekdays and a start–end time window. Outside the window Hima stays silent
   and records nothing. *(New in 1.0 — see §9.)*

### FR-3 Capture & journal (P0)
1. Entries store: local date, local time, UTC timestamp, text (encrypted),
   optional category, idle flag, and the interval length they cover.
2. Today's timeline on the dashboard: newest first, with time, category dot,
   text; inline **edit** and **delete** on hover.
3. Past days are browsable from Insights (day drill-down). *(New in 1.0.)*
4. Input is length-capped (200 chars) and whitespace-validated.

### FR-4 Categories (P1)
1. Default set seeded on first run (Deep Work, Meetings, Sales, Admin,
   Email & Comms, Break, Distraction), each with a color and a
   **productive/busywork** flag.
2. User can add, rename, recolor, re-flag, and delete categories; deleting a
   category never deletes entries (they become uncategorized).

### FR-5 Insights — the reality check (P0)
Every view answers a named question:

| View | Question it answers |
|---|---|
| **Hours hero + productive ring** | "How much did I actually work, and how much of it was productive work?" |
| **Daily bars (worked vs away)** | "Which days leaked?" — clicking a bar drills into that day's full log. |
| **Time-of-day heatmap** (hour × weekday) | "When do I actually work?" — the single highest-value audit view. |
| **Top activities** | "What, by name, ate my week?" — ranked by total time with share-of-week. |
| **Focus profile** | "How fragmented am I?" — average focus-block length and context switches per day. |
| **Category breakdown** | "How does my time split across the kinds of work?" |

1. Period navigation: **Week** and **Month**, with previous/next and an anchor
   back to the current period; future periods are unreachable.
2. All aggregations run over indexed SQL or a single decrypt pass; Insights must
   render in < 200 ms for a year of data (NFR-2).
3. Empty states explain what will appear and how to make it appear.

### FR-6 Export & data ownership (P0)
1. **CSV export** (UTF-8 with BOM so Excel opens it correctly) via a native
   save dialog: columns `date, time, activity, category, productive, was_away,
   interval_minutes`. Scope choices: this week, this month, all time.
   This closes the loop with the original spreadsheet method. *(New in 1.0.)*
2. **Erase all entries**: a guarded, double-confirmed destructive action that
   deletes every log row. Categories and settings survive. *(New in 1.0.)*
3. No export ever leaves the machine by itself; there is no sync, no cloud.

### FR-7 Resident app behavior (P0)
1. Single instance — a second launch focuses the running one.
2. Closing the dashboard hides it; the tray icon is the app's permanent home
   (left-click opens dashboard; menu: Open, Pause/Resume, Pause for 1 hour, Quit).
3. Optional launch-at-login (default offered during onboarding).
4. Quit from the tray is the only way to stop the scheduler.

### FR-8 Onboarding (P1)
Three screens, under 30 seconds total: (1) what Hima does + privacy promise,
(2) pick interval & alignment, (3) launch-at-login. No account, no email, no tour.

### FR-9 Settings (P1)
Grouped, flat, inline-hinted (HIG progressive disclosure): Timer (interval,
alignment, away threshold, pause), Schedule (work hours), Appearance (theme),
Startup (autostart), Categories (inline CRUD), Data (export, erase). Every
control commits immediately — there is no Save button anywhere in the app.

## 6. Non-functional requirements

- **NFR-1 Privacy:** no network I/O at runtime; no telemetry; no analytics;
  activity text encrypted at rest (XChaCha20-Poly1305, AEAD) with the key in
  the OS credential store (Windows Credential Manager / macOS Keychain), never
  in a file beside the database.
- **NFR-2 Performance:** prompt window visible-to-typeable < 150 ms; dashboard
  cold load < 500 ms; insights aggregation < 200 ms at 35k entries (~1 year at
  15-min sampling); idle CPU ≈ 0 (5 s scheduler tick doing one SQL read).
- **NFR-3 Reliability:** the scheduler thread is panic-isolated (a tick crash
  is logged, never fatal); SQLite in WAL mode with busy timeout; versioned
  migrations (`PRAGMA user_version`) that never edit shipped blocks.
- **NFR-4 Footprint:** Tauri (system webview), not Electron — installer < 15 MB,
  RSS < 150 MB.
- **NFR-5 Security:** strict CSP, parameterized SQL only, allow-listed settings
  keys, length-capped inputs, minimal Tauri capability surface.
- **NFR-6 Accessibility:** full keyboard operation of prompt and settings;
  ARIA roles on switches; WCAG AA contrast in both themes; respects
  reduced-motion. Tabular numerals so figures don't jitter.
- **NFR-7 Quality gates:** unit tests for all pure logic (scheduler decisions,
  schedule windows, crypto round-trips, aggregations, CSV escaping, date math);
  CI runs typecheck, frontend build, `cargo test`, `cargo clippy`, `cargo fmt`.

## 7. Explicitly out of scope (1.0)

- Automatic activity detection (window titles, browser history) — violates §2.3.
- Cloud sync / accounts / teams — violates §2.3; revisit only as E2E-encrypted.
- Mobile apps.
- Pomodoro / task management / to-do features — Hima audits time, it doesn't
  manage it.
- AI auto-categorization — candidate for 1.1 as a fully local model only.
- Goals/budgets per category — 1.1 candidate (with the same "no guilt" framing).

## 8. Success metrics (self-measurable, local)

- **Adoption of the method:** a user reaching 5 consecutive logged days has a
  working audit (the original method's bar). Visible to the user in Insights.
- **Prompt cost:** median time from prompt-shown to logged < 5 s (observable in
  a debug log; not telemetered).
- **Data trust:** away-time present in every multi-hour session (idle detection
  is working); zero plaintext activity bytes in `hima.db` (verified by test).

## 9. Requirements review — gap analysis vs. v0.1

Per process, the requirements were re-reviewed against the v0.1 implementation
before 1.0 was scoped. The audit found v0.1 satisfied FR-1, FR-2.1–2.4, FR-3.1–3.2,
FR-4, FR-7, FR-8 and parts of FR-5, but had these gaps — all promoted into 1.0
requirements above:

| # | Gap found | Disposition |
|---|---|---|
| G-1 | **No export.** The method Hima automates *ends in a spreadsheet*; users had no way to get their data out. | Added FR-6.1 (CSV, Excel-safe BOM, native save dialog). **P0.** |
| G-2 | **No work-hours schedule.** v0.1 prompted at 23:00 on Sundays unless manually paused. Biggest single source of prompt fatigue. | Added FR-2.5 (active days + time window). **P0.** |
| G-3 | **Past days invisible.** History showed aggregates only; the underlying journal of any previous day was unreachable. | Added FR-3.3 / FR-5 day drill-down. **P0.** |
| G-4 | **Insights too shallow for the audit's core questions.** No time-of-day view, no named top activities, no fragmentation measure. | Added FR-5 heatmap, top activities, focus profile. **P0.** |
| G-5 | **No month view.** Drucker's review cadence includes monthly. | Added FR-5.1 Week/Month periods. **P1.** |
| G-6 | **No data deletion.** Privacy promise without an erase button is incomplete. | Added FR-6.2. **P0.** |
| G-7 | **No temporary pause.** Lunch required manual pause + remembering to resume. | Added FR-2.4 "pause for 1 hour". **P1.** |
| G-8 | **No CI / no frontend tests / repo contained build artifacts.** | Added NFR-7; repo hygiene enforced. **P0.** |

## 10. Release criteria (1.0)

1. All P0 requirements implemented and demonstrated.
2. `cargo test` and frontend typecheck/build green in CI.
3. Documentation complete: README (user-facing), ARCHITECTURE, DESIGN,
   SECURITY, CONTRIBUTING, CHANGELOG.
4. Fresh-install path verified: onboarding → first prompt → first insight →
   export → erase.

---

## 11. Hima 1.1 — "The Ritual"

### 11.1 Why this release

1.0 made the audit effortless to **collect**. Field reality after a few weeks of
use shows the loop still leaks in three places, all *after* collection:

1. **The numbers don't answer "is it getting better?"** Insights shows one
   period at a time. Drucker's method is explicit that the value is in the
   *review and comparison* — a week in isolation is trivia; a week against the
   previous one is a decision.
2. **Categorizing is a tax users stop paying.** The category chips cost a click
   per prompt, so after day three most entries arrive uncategorized and the
   productive/busywork split degrades. The fix must respect §2.1 — *zero* added
   prompt friction — which rules out any mandatory picker and any cloud AI
   (§2.3). What's left is the obviously right thing: **remember what the user
   already told us.** If "standup" was Meetings last time, it is Meetings now.
3. **The journal is write-only between reviews.** "When did I last touch the
   pricing doc?" is a question the data can answer and the UI cannot. A
   private, local, instant search turns the journal from a log into a memory.

1.1 also pays down two promises 1.0 wrote but didn't keep: §8 defines the
5-consecutive-day adoption bar but never shows it to the user, and §7 explicitly
deferred goals/budgets and auto-categorization to 1.1.

**Release theme:** turn the data users already have into a weekly *ritual* —
compare, review, share, adjust — without adding one second to the prompt.

### 11.2 New functional requirements

#### FR-10 Check in anytime (P1)
The timer owns the cadence, but reality doesn't wait for :15.
1. **Tray → "Check in now"** surfaces the prompt immediately and re-arms the
   schedule (no double prompt a minute later).
2. **Dashboard quick log:** a composer above the timeline logs an entry with
   one line + Enter — same length cap, same validation as the prompt.
3. Neither path may skew honesty rules: manual entries still cover one
   interval, never more.

#### FR-11 Remembered categories (P0)
1. When an entry is logged **without** a category, Hima assigns the category
   the user most recently gave the *same text* (case- and
   whitespace-insensitive match).
2. Inference is deterministic, local, and instant — a lookup over the user's
   own history. No model, no fuzzy guessing: a wrong guess costs trust (§2.2),
   an exact-match memory cannot guess wrong.
3. An explicit chip selection always wins over memory. Editing an entry never
   rewrites other entries.
4. The prompt UI is unchanged — this is invisible infrastructure.

#### FR-12 Trends — "is it getting better?" (P0)
1. The Insights hero compares the visible period to the **previous** one:
   worked-hours delta and productive-share delta, phrased neutrally
   ("2h 15m more than last week", never "you fell behind").
2. A **Trend** card charts the last 8 weeks of worked vs productive hours, so
   direction is visible at a glance.
3. A **"Where the time moved"** card names the activities that gained and lost
   the most time vs the previous period (top 3 each, minimum one interval of
   change). This is the audit's actionable output: cut by name, not by vibe.

#### FR-13 The audit streak (P1)
1. Insights surfaces **consecutive logged days** (a day counts with ≥ 1
   non-away check-in) and the best run — §8's adoption metric, finally visible.
2. Framing is calm method-progress ("Day 12 of your audit"), not gamification:
   no fire emoji, no broken-streak shaming, no notifications (§2.4, §2.5).

#### FR-14 Weekly report (P1)
1. One click in Insights saves the visible period as a **Markdown report**
   (native save dialog): hours, productive share, daily table, top activities,
   focus profile, category split.
2. Built for the coach/accountability-partner workflow from §4; plain text so
   it pastes into anything. Like CSV, it leaves the machine only by the user's
   hand (§2.3).

#### FR-15 Journal search (P0)
1. **Ctrl/⌘ K** (and a sidebar entry) opens a search palette over the entire
   journal: case-insensitive substring over decrypted entries, newest first,
   grouped by day, keyboard-navigable.
2. Selecting a result jumps to that day's full journal in Insights.
3. Search runs entirely in-process over the encrypted store; the query is never
   persisted. Results within 250 ms at a year of data (NFR-2 extension).

#### FR-16 Gentle weekly targets (P2)
1. A category may carry an optional **weekly target** (hours/week, default
   off). Set inline in Settings → Categories.
2. The week view shows quiet progress against the target ("6h of 10h") and a
   tick on the category bar — informational, never red, never notifying.
   Budgets in Hima are a *lens*, not an alarm (§2.4).
3. Targets are ignored in month view (a month target is a different product
   decision; out of scope).

### 11.3 Non-functional deltas

- **NFR-2 (performance):** journal search < 250 ms and report generation
  < 100 ms at 35k entries; all other budgets unchanged.
- **NFR-1/-5 (privacy & security):** no new I/O surface beyond one
  `save_report` dialog command (mirrors `export_csv`); search queries live only
  in memory; report content is generated from data already on screen.
- **Schema:** migration v3 is additive (`categories.weekly_target_min`,
  default 0). Shipped migration blocks remain untouched (NFR-3).

### 11.4 Explicitly out of scope (1.1)

- Fuzzy/semantic matching for category memory — exact match only until real
  usage shows it's insufficient.
- Streak notifications or any "don't break the chain" mechanics.
- Per-day or per-month targets; target alerts of any kind.
- Everything in §7 that isn't named above (cloud, mobile, task management).

### 11.5 Release criteria (1.1)

1. FR-10…FR-16 implemented; P0s demonstrated on a fresh profile and on a
   database migrated from 1.0.
2. New pure logic (streaks, category inference, search, target math, trend
   bucketing) unit-tested; CI fully green (typecheck, Vitest, build,
   `cargo test`, `clippy -D warnings`, `fmt --check`).
3. Docs updated: PRD (this section), ARCHITECTURE (new commands + migration),
   DESIGN (new components), CHANGELOG, README.
4. Prompt interaction cost unchanged: zero new controls in the prompt window.

---

## 12. Hima 1.2 — "The Long Game"

### 12.1 Why this release

1.1 made the weekly ritual real. Re-auditing the product against its own
principles (§2) and the field (RescueTime/Rize's rhythm coaching,
ActivityWatch's data-ownership bar, Daylio's year-at-a-glance) exposes the
next three leaks — all about the audit's *lifespan*, not its mechanics:

1. **The data is mortal.** Activity text is encrypted with a key that lives
   only in this machine's OS keychain (§NFR-1). That is exactly right against
   the threat model — and it means a dead disk, a reinstalled OS, or a new
   laptop silently destroys months of irreplaceable personal history. "It's
   your data" (§2.3) is half-true while the user cannot carry it. The same
   wall blocks the other direction: someone arriving *from* the original
   kitchen-timer spreadsheet cannot bring their history with them.
2. **The horizon stops at a month.** Drucker's cadence is weekly *and*
   annual; the audit's biggest payoff — "what did my year actually look
   like?" — has no view. (Adjacent products confirm the pull: a
   year-in-pixels mosaic is Daylio's single most-loved feature.)
3. **The charts still require interpretation.** Competitors ship AI "coaching"
   summaries of your day. Hima's privacy-respecting answer is better: the
   patterns worth naming (your heaviest hours, your fullest day, a focus
   shift, an unanswered-prompt rate that undermines the totals) are
   *deterministic* — they can be computed locally and said in plain words.
   A chart answers a question; a finding answers it out loud.

And one debt to §2.1: the prompt can still get faster. Most check-ins repeat
recent answers; finishing them should cost one keystroke, not retyping.

**Release theme:** the audit becomes durable (backup, restore, import) and
long-sighted (the year view, findings) — while the prompt gets *cheaper*.

### 12.2 New functional requirements

#### FR-17 Encrypted backup & restore (P0)
1. **Back up** writes every entry, category, and (portable) setting into a
   single file through a native save dialog, encrypted with a key derived
   from a user-chosen passphrase (Argon2id → XChaCha20-Poly1305). The OS
   keychain is never required to read a backup — the passphrase is the key.
2. **Restore** opens a backup through a native open dialog, decrypts with the
   passphrase, and **merges**: entries already present (same local date +
   time) are skipped, never duplicated or overwritten; categories are matched
   by name (case-insensitive) and created when missing; local category
   config wins over the backup's. Restore is additive by construction — it
   cannot destroy anything.
3. Machine-state settings (`paused`, `paused_until`, `next_prompt_at`,
   `onboarded`) never travel; portable preferences (interval, schedule,
   theme, …) restore only through the same allow-list as `update_setting`.
4. Passphrases are required to be ≥ 8 characters, live only in memory, and
   are never persisted or logged. A wrong passphrase fails loudly and
   changes nothing.
5. Honest summary after restore: entries imported, entries skipped,
   categories added.

#### FR-18 CSV import (P0)
1. A native open dialog accepts a CSV with headers; `date`, `time`, and
   `activity` are required, `category`, `was_away`, `interval_minutes` are
   honored when present. Hima's own CSV export round-trips losslessly.
2. Same merge semantics as FR-17.2 (dedupe on date+time, categories by
   name). Malformed rows are skipped and counted, never guessed at (§2.2).
3. Imported rows respect every honesty rule: their recorded interval is
   stored as-is (default 15), away rows stay away.

#### FR-19 The year view (P0)
1. Insights gains a **Year** period beside Week and Month: previous/next
   navigation, no future years, all existing cards aggregate over the year.
2. The daily-bars slot shows a **year-in-pixels mosaic** (weeks × weekdays,
   GitHub-contribution layout): each day's cell intensity is its worked
   time; hover names the day with worked/productive hours; clicking a day
   jumps to that week with the day's journal open — the mosaic is a door,
   not a poster.
3. The Markdown report for a year summarizes by **month**, not by day.
4. Weekly targets remain week-only (§FR-16.3).

#### FR-20 Findings — the audit, said out loud (P1)
1. Insights shows a **"What stands out"** card: up to three plain-language
   observations computed deterministically from the visible period.
2. Launch rules (each with a confidence floor, silent below it):
   - **Rhythm:** the heaviest hour-of-day and fullest weekday (≥ 5 h of
     data in the period).
   - **Focus shift:** average focus-block length vs the previous period
     (≥ 20 % change, both periods with data).
   - **Answer rate:** share of prompts answered vs missed (≥ 20 asks);
     praised when ≥ 95 %, flagged as an undercount risk when < 80 %.
   - **Productive peak:** the weekday with the most productive time
     (week/month, ≥ 1 h productive).
3. Copy stays neutral and informational (§2.4): a finding names a pattern,
   never issues advice, guilt, or alarm. No model, no cloud, no guessing —
   every sentence is reproducible arithmetic over the user's own rows.

#### FR-21 Ghost autocomplete in the prompt (P1)
1. While typing in the prompt (and the dashboard quick log), the rest of the
   best match from the user's recent entries appears inline as ghost text;
   **Tab** (or **→** at the end of input) accepts it; every other key
   behaves exactly as before. Zero new controls (§11.5.4) — typing "st" and
   pressing Tab + Enter logs "standup" in three keystrokes.
2. Matching is prefix-based, case-insensitive, most-recent-first, over the
   same recent-entries source as the chips. No fuzziness — a ghost that
   guesses wrong costs trust (§2.2).

### 12.3 Non-functional deltas

- **NFR-1/-5 (privacy & security):** backup/restore/import add three dialog
  commands; nothing else touches the I/O surface. Backup files are
  ciphertext end-to-end (magic + salt + nonce + AEAD payload, documented in
  SECURITY.md); the passphrase-derived key never touches disk or keychain.
- **NFR-2 (performance):** year aggregation stays a single indexed range
  scan; the pixels mosaic renders ≤ 366 cells. Backup of 35 k entries
  completes < 3 s (Argon2id dominates, by design).
- **Schema:** no migration — 1.2 ships on schema v3.

### 12.4 Explicitly out of scope (1.2)

- A configurable global check-in hotkey (recorder UX + per-OS conflict
  handling deserve their own release; 1.3 candidate).
- Automatic/scheduled backups; cloud sync of backups.
- Editing or selectively restoring inside a backup file.
- Mood/energy capture at the prompt (friction; different product).
- Everything in §7 and §11.4 not named above.

### 12.5 Release criteria (1.2)

1. FR-17…FR-21 implemented; P0s demonstrated on a fresh profile and on a
   1.1 database; backup→wipe→restore round-trips losslessly (settings
   allow-list aside) and CSV export→import is idempotent.
2. New pure logic (backup format & merge, CSV parsing, year date math,
   findings rules, completion matching) unit-tested in Rust/Vitest; CI fully
   green (typecheck, Vitest, build, `cargo test`, `clippy -D warnings`,
   `fmt --check`).
3. Docs updated: PRD (this section), ARCHITECTURE (backup format, new
   commands), SECURITY (backup threat model), DESIGN (year mosaic, findings,
   ghost text), CHANGELOG, README.
4. Prompt interaction cost strictly decreased: no new controls, repeated
   entries complete in fewer keystrokes.
