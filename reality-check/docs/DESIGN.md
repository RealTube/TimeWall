# Hima — Design System & UX Rationale

This document explains *why* the interface looks and behaves the way it does,
so future changes stay coherent. The north star: **a considerate assistant,
not a surveillance tool** — calm surfaces, honest numbers, zero ceremony.

## 1. Principles

1. **Three seconds.** The prompt is the product; every design decision is
   subordinate to answering it in one line + Enter (PRD §2.1).
2. **Deference (HIG).** Content — the user's own words and hours — is the
   hero. Chrome is quiet: hairline borders, soft shadows, muted labels.
3. **Honesty in data display.** Away time is always visible (never hidden to
   flatter the user), tabular numerals everywhere so figures don't dance,
   charts share one scale per view.
4. **Progressive disclosure.** Defaults work out of the box; complexity
   (schedule, categories, export) lives in flat, scannable settings rows that
   appear only when relevant (the schedule's day/hour rows render only when
   the schedule is on).
5. **No guilt mechanics.** No streak fire, no red "you failed" states, no
   nagging copy. The tone of every string is a colleague, not a coach.

## 2. Foundations

### Color — semantic tokens only
Components never use raw hex; they use tokens defined in `styles/global.css`
and re-themed by a single `.dark` class:

| Token | Role |
|---|---|
| `bg / surface / surface-2` | window, card, and inset levels |
| `fg / muted` | primary and secondary text |
| `border` | hairlines, empty chart cells |
| `accent` | one brand blue: actions, selection, "worked" bars |
| `productive` (green) / `busywork` (amber) | the audit's two verdicts |
| `idle` (gray) | away time — deliberately *neutral*, not red: being away is not a failure |

Category colors are user data (an 8-color palette), not theme tokens.

### Typography
- System font stack (SF Pro on macOS, Segoe UI Variable on Windows) — native
  feel for free, per HIG/Fluent.
- One type scale per screen: a 30–48 px hero figure, 15 px body, 13 px
  secondary, 11 px uppercase tracking-wide section labels.
- `tabular-nums` on every number that can change (hours, countdowns, times).

### Space, shape, elevation
- 8-pt spacing rhythm; cards are `rounded-2xl` with a hairline border plus
  `shadow-soft`; the floating prompt uses `rounded-3xl` + `shadow-float` +
  OS material (acrylic on Windows, vibrancy on macOS) so it reads as a
  *system* surface, not a webpage.
- Motion: one easing (`cubic-bezier(0.16,1,0.3,1)`), 200–300 ms, used for
  enter/exit only. Count-up on the hours hero is capped at 600 ms and
  finishes deterministically even when rAF is throttled.

## 3. The windows

### 3.1 Prompt (the hero)
A centered glass card, ~660×400, always-on-top:

```
┌──────────────────────────────────────────────┐
│ ● REALITY CHECK                        14:30 │  ← context, time
│ What did you just do?                        │  ← one question
│ ▌                                            │  ← 30 px input, auto-focused
│ ─────────────────────────────────────────────│
│ (Deep Work)(Meetings)(Sales)(Admin)…         │  ← optional category chips
│ AGAIN  (Outreach emails)(Code review)…       │  ← 1-tap repeat chips
│ ↵ Log it                     esc Snooze 5 min│  ← the only two actions
└──────────────────────────────────────────────┘
```

Decisions:
- **Input first, auto-focused, giant type** — typing is the primary path;
  the answer should feel weightier than the chrome around it.
- **Ghost completion (1.2, FR-21)**: after two typed characters, the rest of
  the best recent match appears as faint inline text; **Tab** (or → at the
  end of the line) accepts it. Rendered by re-drawing the typed text
  invisibly in the same metrics so the ghost begins exactly at the caret —
  no dropdown, no list to arbitrate, zero new controls. Prefix-only matching
  on purpose: a ghost that guesses wrong would cost more trust than the
  keystrokes it saves. The same input powers the dashboard quick log.
- **"Again" chips** exploit the strongest regularity in audit data
  (consecutive identical answers): repeat = one click, zero typing.
- **Category is optional** — a tap toggle, never a required field. The audit
  survives uncategorized entries; it does not survive friction.
- **Esc = snooze, not dismiss-and-forget**: the prompt returns in 5 minutes,
  so the record gains a gap only if the user chooses one.
- Keyboard legend at the bottom edge (HIG: teach shortcuts in place).
- After 5 missed-by-sleeping intervals, nothing stacks: the scheduler fires
  at most once on wake (see ARCHITECTURE).

### 3.2 Dashboard ("Today")
Answers "how is today going?" at a glance, newest first:

- Hero: animated decimal hours + check-in count + away time; a progress ring
  against an 8 h reference (a *reference*, not a goal — no failure color).
- A **timer status pill** (next check-in countdown / paused until …) keeps
  the resident scheduler legible — trust comes from visibility.
- A **category distribution strip** (stacked bar + legend) mirrors the same
  colors used everywhere else.
- A **quick-log composer** sits above the timeline (1.1, FR-10): same input
  grammar as the prompt — one line, Enter, a return-key glyph that appears
  only once there is something to log. It looks like the first row of the
  journal because that is what it becomes.
- Timeline rows: time → category dot → text. **Edit/delete affordances appear
  on hover only** (deference; the journal reads as a document, acts as a
  table). Enter saves, Esc cancels — same grammar as the prompt.
- Idle rows are dimmed with a moon glyph: present, not shameful.

### 3.3 Insights
One column, one question per card, every card with an empty state that says
what will appear and how to earn it:

1. **Period switcher** (Week | Month | Year segmented control) + chevron
   navigation, future disabled — placed top-right, where both HIG and Fluent
   put view controls; the title stays put so switching feels like
   re-filtering, not navigating. A **Report** button sits beside them: the
   review's exit door (save the visible period as Markdown) lives where the
   review happens, not in Settings. A year report tables months, not 366
   days.
2. **Hero**: total hours + productive-share ring (green — verdict color).
   Below the verdict, two quiet lines added in 1.1: the **comparison** to the
   previous period ("+2h 15m vs last week · productive share up 3 pts" — a
   delta, never a judgment) and the **audit streak** pill ("Day 12 of your
   audit · best run 15"). The streak is method progress in the method's own
   vocabulary; deliberately no flame, no broken-streak state — it simply
   reappears at day 1.
3. **What stands out** (1.2, FR-20): up to three sentences computed from the
   period's own aggregates — heaviest hour + fullest weekday, a ≥20% focus
   shift, the answer rate, the most productive weekday. Sentences, because a
   chart still asks the user to do the reading; below each rule's confidence
   floor the card simply omits the line (and below all of them, the card).
   A data-quality caveat ("30% of prompts went unanswered…") always sorts
   first — it qualifies every number beneath it. The hint says "computed
   on-device from your own entries": the same privacy promise, at the moment
   a user might suspect an AI cloud.
4. **Daily hours** (week/month): worked bars with away stacked translucent
   above, 8 h dashed reference, **click-to-drill into the day's journal** —
   aggregate first, evidence one click away. In **year** view this slot
   becomes **Your year** (1.2, FR-19): a weeks × weekdays pixel mosaic,
   opacity ∝ worked time, future days dimmed, month labels over the columns
   that contain a 1st. Clicking a day switches to that week with the day's
   journal open — the mosaic is a door, not a poster.
5. **Last 8 weeks** trend (1.1): two lines on one scale — worked (accent,
   with a soft area fill) and productive (verdict green) — because "is it
   getting better?" is a two-line question. Hand-rolled SVG like every other
   chart; week-start labels every other point so the axis never crowds.
6. **Where the time moved** (1.1): two columns, "More time on" / "Less time
   on", three named activities each with signed deltas in tabular numerals.
   Arrows are muted, not colored — more time on something is not inherently
   good or bad; the audit names the shift and the user judges it.
7. **When you work** heatmap: rows Mon–Sun, columns trimmed to lived-in
   hours, opacity ∝ minutes, exact value in the tooltip. (The single most
   requested time-audit view; RescueTime's equivalent is its most cited.)
8. **Focus**: three stat tiles (avg block / longest block / switches per
   day) with a one-line definition under the card title — a metric a user
   can't define is a metric they won't trust.
9. **Top activities**: ranked list, time + share-of-total, hairline bars.
10. **By category**: the same bars, now period-aware. In week view a category
   with a target shows a thin tick on its track and "6h of 10h" in place of
   the plain figure — the target is a *lens*, so it renders as a landmark on
   the existing bar, never as a second progress bar demanding completion.

### 3.4 Settings
Flat grouped rows (HIG style): label + hint left, control right; **every
control commits instantly** — no Save button anywhere in the app.

- Controls follow platform grammar: toggles for binary, steppers for small
  ranges, segmented control for theme, native `<select>` for times (free
  keyboard/screen-reader support), round day chips (M T W T F S S) for the
  schedule. Category rows carry a compact hours stepper for the optional
  weekly target — "—" means off, and the section's footnote says what targets
  are (a quiet lens) and what they will never do (alert).
- **Data** section: CSV export as three scoped buttons (This week / This
  month / All time) → native save dialog → "Saved to …" confirmation in
  place. Erase uses an **inline two-step confirm** (button arms for 4 s,
  turns red, asks for the second click) — a modal would be both more
  annoying and easier to click through on autopilot.
- **Import from CSV** (1.2): one button, native open dialog, and an honest
  inline tally afterwards ("Imported 86 · 3 already here · 1 unreadable row
  skipped"). No mapping wizard: the columns Hima understands are the ones
  the method produces, and its own export round-trips.
- **Encrypted backup** (1.2): passphrase field + "Back up… / Restore…"
  inline — both disabled until 8 characters, because the passphrase *is* the
  key and the hint says so ("Keep the passphrase: it is the only key").
  Restore needs no confirm step: it is additive by construction, and the
  result line states exactly what happened. Errors (wrong passphrase) show
  in the same quiet line, in the busywork color — recoverable, not alarming.
- The privacy promise is restated at the bottom of Settings where the data
  controls live — the place a skeptical user will look for it.

### 3.5 Search palette (1.1)
`⌘/Ctrl K` anywhere (or the sidebar's Search field) opens a glass palette over
a dimmed, blurred backdrop — the same material family as the prompt, because
both are "ask Hima something" surfaces:

- One large input, results grouped under Today / Yesterday / weekday
  headings, matches tinted with the accent (a tint, not a highlighter).
- Fully keyboard-driven: ↑↓ move, ↵ opens that day's full journal in
  Insights, Esc dismisses. The footer teaches exactly those three keys.
- The footer's idle line — "Your journal, searched on-device" — restates the
  privacy promise at the moment of use.

### 3.6 Onboarding
Three screens, < 30 s, no account: promise (with the privacy note up front),
rhythm (interval presets + quarter-hour snap), launch-at-login. Dots show
progress; everything is skippable-fast because the defaults are the method's
defaults (15 min, aligned, autostart on).

## 4. Interaction grammar (cross-cutting)

- Enter confirms, Esc cancels/snoozes — identical in prompt, inline edit,
  and category add.
- Hover reveals row actions; nothing destructive is reachable in one click.
- Live regions: all views listen to `refresh-dashboard` and update without
  user action — the app never shows stale numbers next to a running timer.
- Accessibility: `role="switch"` + `aria-checked` on toggles,
  `aria-pressed` on day chips, focus rings on inputs, AA contrast in both
  themes, full keyboard paths for the core loop.

## 5. Voice & copy

Short, concrete, second person, no exclamation marks. Examples in product:
"What did you just do?", "Away from desk", "No check-ins yet today",
"Outside the schedule Hima stays silent and records nothing." Numbers carry
units ("3.75 hours", "45m"); ratios say what they are ("62% productive").
