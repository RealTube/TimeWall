# Hima — Security & Privacy Model

Hima's value proposition depends on trust: it asks the user to write down what
they do all day. This document states exactly what is protected, against whom,
and what is explicitly out of scope.

## Privacy guarantees

1. **Local-only.** Hima makes no network requests at runtime. There is no
   account, no sync, no update phone-home, no telemetry, no crash reporting.
2. **You type it, we keep it.** The only content stored is the text the user
   types (plus timestamps, interval length, category id, idle flag). Hima
   never reads window titles, app usage, browser history, or the screen.
3. **Data leaves only by explicit export.** The CSV export and Markdown
   report write to a path the user picks in a native save dialog; those files
   are plaintext by design (that is their purpose) and become the user's
   responsibility. The encrypted backup (below) is the one export that stays
   ciphertext end-to-end.

## Encryption at rest

- **What:** every `activity_log.activity_enc` value — the user's words.
- **How:** XChaCha20-Poly1305 (AEAD). Each encryption uses a fresh random
  24-byte nonce; blobs are stored as `nonce ‖ ciphertext`. AEAD authentication
  means any tampering with stored ciphertext fails decryption (unit-tested).
- **Key:** a 256-bit key generated on first run with the OS CSPRNG and stored
  in the platform credential store via `keyring` — Windows Credential Manager
  or macOS Keychain. The key never exists in a file beside the database.
- **What is *not* encrypted:** dates, times, category ids, the idle flag, and
  settings. This is a deliberate trade-off (documented in ARCHITECTURE) so
  aggregates run as indexed SQL. The *content* is protected; the *shape* of
  the week (that something happened at 14:15) is not.

## Encrypted backups (1.2)

The keychain-bound key is exactly right against the local threat model — and
it means the database alone is unreadable anywhere else. Backups exist so the
user's history can survive a dead disk or move to a new machine *without*
weakening the at-rest story:

- **File format:** `HIMABKP1 ‖ salt(16) ‖ nonce(24) ‖ ciphertext`. The payload
  (entries, categories, portable settings as JSON) is sealed with
  XChaCha20-Poly1305.
- **Key:** derived from a user-chosen passphrase (≥ 8 chars) with **Argon2id**
  (19 MiB, t=2, p=1 — the RustCrypto defaults) and a fresh random salt per
  backup. The OS keychain is not involved; the passphrase is the only key.
- **Passphrase handling:** lives in memory for the duration of the command;
  never persisted, never logged. There is no recovery path — a forgotten
  passphrase means an unreadable backup, by design.
- **Restore is additive:** existing (date, time) rows are never overwritten;
  settings are restored only through the same allow-list + validation as any
  settings write; machine state (`paused`, `next_prompt_at`, `onboarded`)
  never travels.
- **Tampering:** AEAD authentication rejects modified backups outright; a
  wrong passphrase and a corrupted file are deliberately indistinguishable.
- **CSV import** accepts plaintext the user already has (their old
  spreadsheet, a Hima export). It reads one user-picked file, validates every
  row, and never writes anything back to that file.

## Threat model

| Threat | Protected? | Mechanism / note |
|---|---|---|
| DB file copied off disk (backup leak, stolen drive without OS-level user compromise) | **Yes** | Activity text is ciphertext; the key is in the OS credential store, not beside the file. |
| Casual snooping by another local account | **Yes** | DB lives in the per-user app-data dir; key is per-user in the credential store. |
| DB tampering (forged or altered entries) | **Detected** | AEAD authentication fails on modified blobs. |
| Malicious webview content / XSS-style escalation | **Mitigated** | Strict CSP (no remote sources, `frame-ancestors 'none'`, `object-src 'none'`); minimal Tauri capability set; the webview can only call the allow-listed, validated commands — it never sees SQL or the key. |
| SQL injection | **Mitigated** | Parameterized statements only; settings writes go through a key allow-list with per-key validation; inputs are trimmed and length-capped. |
| Backup file stolen in transit or at rest (email, USB stick, cloud drive) | **Yes** | Argon2id-derived key + AEAD; brute force is gated by the passphrase's strength and a memory-hard KDF. |
| Weak backup passphrase | **Partially** | The app enforces ≥ 8 characters; ultimate strength is the user's choice — stated in the UI. |
| Malware running *as the user*, or an attacker with the user's unlocked session | **No** | Such an attacker can read the credential store like the app does. This is outside any local app's threat model. |
| Forensic traffic analysis of timestamps/categories | **No** | Metadata is plaintext by design (see above). |
| Memory inspection of a running process | **No** | Decrypted strings exist in process memory while displayed. |

## Application hardening

- **CSP** (`tauri.conf.json`): `default-src 'self'`; no remote script, style,
  or connect targets beyond the Tauri IPC endpoints; `base-uri 'self'`.
- **Capabilities**: only `core:default` is granted to the two windows; the
  dialog plugin is invoked from Rust, so no dialog permission is exposed to
  the webview at all.
- **Command surface**: every command validates inputs (length caps: 200 chars
  activity, 40 chars category; numeric range checks; settings allow-list) and
  returns errors as values — no panics across the IPC boundary.
- **Scheduler isolation**: timer ticks run under `catch_unwind`; a logic error
  cannot kill the resident process.
- **Single instance**: a second process hands off and exits, preventing two
  schedulers racing on one database (WAL + busy timeout also guards this).

## Data lifecycle

| Event | Effect |
|---|---|
| First run | Key generated → credential store; `hima.db` created in the per-user app-data directory. |
| Erase all entries (Settings → Data) | `DELETE FROM activity_log`; categories/settings stay. WAL checkpointing reclaims pages over time; free pages may persist until vacuum — a full purge is uninstall (below). |
| Uninstall | Remove the app, delete the app-data directory (`hima.db*`), and delete the `com.gevor.reality-check` entry from the credential store. Without the key, any surviving DB copy is unreadable. |

## Reporting a vulnerability

Open a GitHub issue titled "security" without exploit details and a maintainer
will follow up privately, or email the maintainer directly. Please allow a
reasonable disclosure window before publishing details.
