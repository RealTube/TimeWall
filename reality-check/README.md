# Hima — your 15-minute reality check

Hima automates Alex Hormozi's kitchen-timer time audit: every little while it
quietly asks *"what did you just do?"*, you answer in 1–2 words, and over a week
it shows where your time **actually** went — privately, on-device, encrypted.

It runs in the system tray / menu bar all day. A frictionless prompt appears on
your chosen interval; logging takes one keystroke (or one tap on a recent entry).

## What it does

- **Smart reminder, you type.** No screen-reading or app-spying — Hima only ever
  stores the words you type. A glass prompt window appears on the interval with
  recent-entry chips (1-tap re-log) and category chips.
- **Honest data.** If you're idle past a threshold, the interval is marked *away*
  instead of being logged as work — so the numbers don't lie.
- **History & insights.** Per-day worked-vs-away bars, a productive-vs-busywork
  ratio, and a category breakdown: the visual "reality check."
- **Always-on & resilient.** Single-instance, launch-at-login, close-to-tray, and
  a wall-clock scheduler that survives sleep/hibernate (fires once on wake, never
  storms).

## Architecture

Tauri 2 (Rust) + React 19 + TypeScript + Vite + Tailwind v4.

**Backend** (`src-tauri/src/`)
- `crypto.rs` — XChaCha20-Poly1305 encryption; key in the OS keychain (`keyring`).
- `db.rs` — single keyed SQLite connection (WAL) behind a `Mutex`, hand-rolled
  `user_version` migrations, CRUD + aggregation. Activity text is encrypted at rest.
- `timer.rs` — panic-isolated scheduler using a persisted wall-clock `next_prompt_at`
  (sleep/hibernate-safe). Pure `evaluate_due` is unit-tested.
- `commands.rs` — thin, validated Tauri commands.
- `tray.rs`, `lib.rs` — tray menu, plugins (single-instance, autostart, log,
  notification), close-to-tray, first-run window reveal, prompt-window vibrancy.

**Frontend** (`src/`)
- `lib/` — typed `api` wrapper, types, theme, zustand store, `utils`.
- `styles/global.css` — Tailwind v4 design tokens (light/dark/system, semantic
  colors via CSS variables).
- `components/`, `components/ui/` — shell (Sidebar/Layout) + primitives.
- `screens/` — `Prompt` (the hero), `Dashboard`, `History`, `Settings`, `Onboarding`.

## Security & privacy

- **Local-only.** No account, no network calls, no telemetry.
- **Encrypted at rest.** Activity text is AEAD-encrypted; the 256-bit key lives in
  Windows Credential Manager / macOS Keychain, never on disk in plaintext.
- **Hardened webview.** Strict CSP, minimal capabilities, parameterized SQL,
  length-capped input. Data lives in the per-user app-data dir (`hima.db`).

## Develop

```bash
npm install
npm run tauri dev     # run the desktop app
npm run dev           # frontend only in a browser (uses DEV fixtures)
```

## Test

```bash
cargo test --manifest-path src-tauri/Cargo.toml    # crypto, scheduler, db
npm run build                                       # type-check + bundle frontend
```

## Build & release

```bash
npm run tauri build   # produces installers for the current OS
```

Code-signing/notarization (Windows Authenticode, macOS notarization) require your
own certificates — add them to `tauri.conf.json` / CI when releasing.

## Roadmap (fast-follow)

- Export to `.xlsx` / `.csv` (the original spreadsheet artifact).
- Code-signing + notarization config and a branded app icon.
