# Contributing to Hima

Thanks for helping make the time audit effortless. This guide covers setup,
workflow, and the standards CI enforces.

## Prerequisites

- **Node.js 22+** and npm
- **Rust** (stable) — `rustup` recommended
- Platform deps for Tauri 2: see the [Tauri prerequisites](https://tauri.app/start/prerequisites/)
  (on Windows: WebView2 + MSVC build tools; on macOS: Xcode CLT)

## Getting started

```bash
npm install
npm run tauri dev     # full desktop app (Rust + React, hot reload)
npm run dev           # frontend only, in a browser, with dev fixtures
```

`npm run dev` serves the UI with mock data (`src/lib/devMock.ts`) so you can
iterate on screens without a Rust toolchain.

## Checks — run these before pushing

CI runs exactly these; green locally means green in CI:

```bash
npm run typecheck                                              # tsc, strict
npm test                                                       # vitest
npx vite build                                                 # production build
cargo fmt  --manifest-path src-tauri/Cargo.toml --check        # formatting
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml               # Rust unit tests
```

## Project layout

```
src/                  React 19 + TypeScript + Tailwind v4
  lib/                api wrapper, types, store, utils (unit-tested)
  components/         shell + UI primitives
  screens/            Prompt, Dashboard, Insights, Settings, Onboarding
src-tauri/src/        Rust backend
  crypto.rs           AEAD encryption, key in OS keychain
  db.rs               SQLite store, migrations, aggregations
  timer.rs            wall-clock scheduler + schedule window
  commands.rs         validated Tauri commands
  tray.rs, lib.rs     tray, plugins, window lifecycle
docs/                 PRD, ARCHITECTURE, DESIGN, SECURITY
```

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before touching the
scheduler or storage, and [docs/DESIGN.md](docs/DESIGN.md) before touching UI.

## Ground rules

1. **Privacy is non-negotiable.** No network calls, no telemetry, no
   plaintext activity text on disk. PRs that violate this are closed.
2. **Pure logic gets a unit test.** Scheduling decisions, date math,
   aggregations, escaping — if it's a pure function, test it.
3. **Migrations are append-only.** Add a new `if version < N` block in
   `db.rs::run_migrations`; never edit a shipped block.
4. **Validate at the command boundary.** Every Tauri command checks lengths,
   ranges, and allow-lists before touching the database.
5. **Match the design system.** Use the semantic tokens (`bg-surface`,
   `text-muted`, …) from `styles/global.css`; no hard-coded colors in
   components. Tabular numerals for all figures.
6. **The prompt stays fast.** Anything that adds friction to the check-in
   flow needs a strong argument and a PRD update.

## Commit & PR conventions

- Conventional-commit style subjects: `feat:`, `fix:`, `docs:`, `refactor:`,
  `test:`, `chore:`.
- One logical change per PR; include a short "why" in the description.
- If you change behavior described in `docs/PRD.md`, update the PRD in the
  same PR.

## Releasing

1. Update the version in `package.json`, `src-tauri/Cargo.toml`, and
   `src-tauri/tauri.conf.json` (keep them identical).
2. Add a `CHANGELOG.md` entry.
3. `npm run tauri build` produces installers under
   `src-tauri/target/release/bundle/`.
