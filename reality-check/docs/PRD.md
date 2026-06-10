# Hima — Product Requirements Document

| | |
|---|---|
| **Product** | Hima — the automated time audit |
| **Version** | 1.0 |
| **Status** | Approved — implemented |
| **Last updated** | 2026-06-10 |
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
