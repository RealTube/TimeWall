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
- Timeline rows: time → category dot → text. **Edit/delete affordances appear
  on hover only** (deference; the journal reads as a document, acts as a
  table). Enter saves, Esc cancels — same grammar as the prompt.
- Idle rows are dimmed with a moon glyph: present, not shameful.

### 3.3 Insights
One column, one question per card, every card with an empty state that says
what will appear and how to earn it:

1. **Period switcher** (Week | Month segmented control) + chevron navigation,
   future disabled — placed top-right, where both HIG and Fluent put view
   controls; the title stays put so switching feels like re-filtering, not
   navigating.
2. **Hero**: total hours + productive-share ring (green — verdict color).
3. **Daily hours**: worked bars with away stacked translucent above, 8 h
   dashed reference, **click-to-drill into the day's journal** — aggregate
   first, evidence one click away.
4. **When you work** heatmap: rows Mon–Sun, columns trimmed to lived-in
   hours, opacity ∝ minutes, exact value in the tooltip. (The single most
   requested time-audit view; RescueTime's equivalent is its most cited.)
5. **Focus**: three stat tiles (avg block / longest block / switches per
   day) with a one-line definition under the card title — a metric a user
   can't define is a metric they won't trust.
6. **Top activities**: ranked list, time + share-of-total, hairline bars.
7. **By category**: the same bars as v0.1, now period-aware.

### 3.4 Settings
Flat grouped rows (HIG style): label + hint left, control right; **every
control commits instantly** — no Save button anywhere in the app.

- Controls follow platform grammar: toggles for binary, steppers for small
  ranges, segmented control for theme, native `<select>` for times (free
  keyboard/screen-reader support), round day chips (M T W T F S S) for the
  schedule.
- **Data** section: CSV export as three scoped buttons (This week / This
  month / All time) → native save dialog → "Saved to …" confirmation in
  place. Erase uses an **inline two-step confirm** (button arms for 4 s,
  turns red, asks for the second click) — a modal would be both more
  annoying and easier to click through on autopilot.
- The privacy promise is restated at the bottom of Settings where the data
  controls live — the place a skeptical user will look for it.

### 3.5 Onboarding
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
