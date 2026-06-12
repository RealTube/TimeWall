# Hima — the automated time audit

> *"Set a kitchen timer for 15 minutes. Every time it rings, write one or two
> words about what you just did. After a week, the spreadsheet tells you where
> your time actually goes — and it's rarely what you'd guess."*

Hima automates that classic time audit (Drucker's "know thy time", popularized
by Alex Hormozi) so you never touch the timer or the spreadsheet. It lives in
your tray, quietly asks **"What did you just do?"** on your interval, takes a
1–2 word answer in a single keystroke, and turns a week of honest samples into
the few answers the audit exists for:

- **How much did I actually work — and how much of it was productive work?**
- **When do I actually work?** (hour-of-day × weekday heatmap)
- **What, by name, ate my week?** (top activities, ranked by time)
- **How fragmented is my focus?** (focus blocks & context switches)

Everything stays on your machine, **encrypted at rest**. No account, no cloud,
no telemetry — and no spying: Hima never reads your screen, window titles, or
browsing. It only ever stores the words you type.

## How it works

1. **A glass prompt appears on your interval** (default: every 15 minutes,
   snapped to :00/:15/:30/:45). Type a word or two, hit **Enter** — done in
   under three seconds. Repeating yourself? One click on a recent-entry chip.
   Busy? **Esc** snoozes it for five minutes.
2. **Honest by construction.** Away from your desk past the idle threshold?
   The interval is logged as *Away from desk*, never as work. Laptop slept
   through six prompts? You get one prompt on wake, not six.
3. **Your hours, on your schedule.** Restrict prompts to working days and
   hours; pause for lunch from the tray ("Pause for 1 hour" resumes itself).
4. **The reality check.** The Insights view shows your week or month: daily
   bars (click any day to read its full journal), the time-of-day heatmap,
   top activities, focus profile, and the productive-vs-busywork split.
5. **The weekly ritual.** Every period is compared to the last one, an
   8-week trend shows your direction, and "Where the time moved" names the
   activities that grew and shrank. Your audit streak is right in the hero.
6. **Zero-effort categories.** Tag "standup" as Meetings once — every later
   "standup" categorizes itself. Optional weekly targets per category show as
   a quiet tick, never an alarm. And after two typed characters the prompt
   ghost-completes your most recent matching entry — **Tab**, **Enter**, done.
7. **Total recall.** `Ctrl/⌘ K` searches every word you've ever logged,
   on-device, and jumps to that day's journal.
8. **The long view.** A **Year** period turns the audit into a year-in-pixels
   mosaic — every day a cell, click any one to reopen that week — and a
   **"What stands out"** card says the period's patterns in plain words
   ("Your heaviest hour is 9–10 AM, and Tuesdays carry the most time"),
   computed on-device, never by a cloud.
9. **It's your data — durably.** Export any range to CSV, save a Markdown
   report for a coach, **back up everything into one passphrase-encrypted
   file that restores on any machine**, import your old kitchen-timer
   spreadsheet — or erase everything with two clicks.

## Install

Grab the installer for your platform from the
[releases page](../../releases), or build from source:

```bash
git clone <this repo> && cd reality-check
npm install
npm run tauri build      # installers land in src-tauri/target/release/bundle/
```

Prerequisites for building: Node 22+, Rust stable, and the
[Tauri 2 platform prerequisites](https://tauri.app/start/prerequisites/).

## Develop

```bash
npm run tauri dev    # the full desktop app, hot-reloading
npm run dev          # UI only, in a browser, against dev fixtures
npm run typecheck    # strict TypeScript
npm test             # Vitest unit tests
cargo test --manifest-path src-tauri/Cargo.toml   # Rust unit tests
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow — CI enforces
typecheck, tests, build, `cargo fmt`, and `clippy -D warnings`.

## Documentation

| Doc | What's in it |
|---|---|
| [docs/PRD.md](docs/PRD.md) | The requirements: problem, principles, research, functional/non-functional requirements, and the 1.0 gap analysis |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Process/window model, sleep-safe scheduler, storage & migration design, IPC surface, testing strategy |
| [docs/DESIGN.md](docs/DESIGN.md) | The design system and the *why* behind every screen, control, and placement |
| [docs/SECURITY.md](docs/SECURITY.md) | Privacy guarantees, encryption design, and the explicit threat model |
| [CHANGELOG.md](CHANGELOG.md) | Release history |

## Technology

Tauri 2 (Rust core) + React 19 + TypeScript + Tailwind v4. SQLite (WAL) with
XChaCha20-Poly1305 encryption of all activity text; the key lives in the OS
keychain (Windows Credential Manager / macOS Keychain). Installer ~10 MB —
it's a system webview, not a bundled browser.

## Privacy, in one paragraph

Hima makes zero network requests. The only content it stores is the text you
type, AEAD-encrypted on disk with a key that never leaves your OS credential
store. Aggregates (hours, heatmaps, rankings, findings) are computed locally. Export
is the only way data leaves the app, and it goes where you point it — and the
backup file stays encrypted end-to-end, locked by a passphrase only you know.
Deleting your data is a first-class feature, not a support ticket.

## License

[MIT](LICENSE) © 2026 Gevor
