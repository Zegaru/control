# Plan 007: Fix Tauri shell daemon adopt/quit lifecycle

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat f1729ab..HEAD -- apps/shell/src-tauri/src/main.rs apps/daemon/src/index.ts apps/daemon/src/routes.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (independent of JS plans; coordinate manually if daemon `/api/health` shape changes)
- **Category**: bug
- **Planned at**: commit `f1729ab`, 2026-07-19

## Why this matters

The Tauri shell always `spawn_daemon`, then `wait_for_daemon` only TCP-connects `127.0.0.1:4400`. If a daemon is already bound, the new Node process exits (`EADDRINUSE` in `apps/daemon/src/index.ts`), but the shell still loads the UI against the **old** daemon while `DaemonState` may hold a dead/short-lived Child. `kill_daemon` / Quit only kills that Child — leaving the real daemon running (orphan). Restart/tray lifecycle becomes confusing.

## Current state

**Spawn always** (`apps/shell/src-tauri/src/main.rs` ~84-141, setup path): always spawns; no pre-probe of healthy CONTROL.

**Wait** (`main.rs:144-153`): TCP connect loop only — no HTTP `/api/health` check, no ownership check.

**Kill** (`main.rs:201-208`):

```rust
fn kill_daemon(app: &AppHandle) {
    let child = state.0.lock().unwrap().take();
    if let Some(mut child) = child {
        let _ = child.kill();
    }
}
```

**Daemon** (`index.ts:70-78`): second instance exits on `EADDRINUSE`.

**Health API** (`routes.ts:63`): `GET /api/health` → `{ ok: true, version }`.

**DESIGN**: Shell should not own business logic; supervising the daemon process is in-scope for the shell.

## Commands you will need

| Purpose        | Command                                      | Expected on success        |
|----------------|----------------------------------------------|----------------------------|
| Typecheck JS   | `pnpm typecheck`                             | exit 0 (if JS touched)     |
| Rust check     | `cd apps/shell/src-tauri && cargo check`      | exit 0                     |

(Do not run full `tauri build` unless operator asks — app assumed runnable locally.)

## Scope

**In scope**:
- `apps/shell/src-tauri/src/main.rs` (and tiny helper modules under `src-tauri/src/` if you split for clarity)
- Optional: daemon endpoint only if you need a dedicated “shutdown” POST — prefer using existing process kill + health; add `POST /api/shutdown` **only** if Quit must gracefully close the adopted daemon the shell did not spawn. If you add it, also touch `apps/daemon/src/routes.ts` + `index.ts` shutdown wiring.

**Out of scope**:
- NSIS installer / staging scripts
- Moving business logic into Rust
- Fixing adopted-run stop inside the daemon (plan 002)
- Changing default ports without updating both sides

## Git workflow

- Branch: `advisor/007-shell-daemon-lifecycle`
- Commit example: `Adopt an already-running CONTROL daemon in the Tauri shell.`
- Do NOT push unless instructed.

## Steps

### Step 1: Probe before spawn

Before `spawn_daemon`:

1. Try TCP connect to `127.0.0.1:4400` (use existing `DAEMON_ADDR` constants).
2. If connected, HTTP GET `http://127.0.0.1:4400/api/health` and parse JSON for `ok: true` (ureq/reqwest/std — use whatever dependency already exists in `Cargo.toml`; if none, std `TcpStream` + minimal HTTP/1.1 write/read is acceptable for localhost).
3. If healthy CONTROL:
   - **Do not spawn**
   - Store `None` in `DaemonState` **or** introduce an enum `DaemonHandle::{ Child(Child), External }` so Quit can decide policy
4. If port open but health fails: STOP behavior = treat as conflict — show error in UI status element; do not attach blindly.
5. If port closed: spawn as today and keep Child.

**Verify**: `cargo check` in `apps/shell/src-tauri` → exit 0.

### Step 2: Define Quit / Restart policy

Document in code comments and implement:

| Situation | Restart | Quit |
|-----------|---------|------|
| Shell-spawned Child | kill Child, respawn | kill Child |
| External/adopted daemon | spawn only if health down; else reuse | **do not** kill external by default OR call graceful shutdown API |

**Preferred Quit for adopted**: leave daemon running (dev servers stay up — matches “UI is thin client”). Tray “Quit” exits UI only.

**Preferred Restart for adopted**: call health; if ok, just reload webview; if you must bounce daemon, require shell-owned Child.

If product clearly needs Quit to stop daemon always, add `POST /api/shutdown` that calls existing `shutdown()` in `index.ts`, and invoke it for both owned and adopted cases. Pick one policy and test mentally against DESIGN “closing UI never kills servers” — **Quitting the tray app may still be expected to leave the daemon**; match README/shell README if they specify. Default for this plan: **Quit does not kill an adopted external daemon; Quit kills only a Child the shell spawned.**

**Verify**: comments in `main.rs` state the policy in ≤10 lines; `cargo check` passes.

### Step 3: Restart path

Update `restart_daemon` to:

1. If Child present → kill, spawn, wait, load.
2. If External → either reload webview only, or HTTP shutdown + spawn if shutdown endpoint exists.

**Verify**: `cargo check`.

### Step 4: Update shell README

`apps/shell/README.md` — note adopt behavior and Quit policy in 2–4 sentences.

**Verify**: `rg -n "adopt|already.running|Quit" apps/shell/README.md` → hit.

### Step 5: Update index

Mark plan 007 DONE.

## Test plan

- Automated Rust tests are optional; if easy, unit-test a pure “decision” function:
  - `port_closed → Spawn`
  - `health_ok → Adopt`
  - `port_open_health_bad → Error`
- Manual (operator): start `pnpm dev:daemon`, launch shell, confirm no second daemon / no crash; Quit leaves daemon; shell-owned path still kills on Quit.

## Done criteria

- [ ] `cargo check` in `apps/shell/src-tauri` exits 0
- [ ] Shell does not always spawn when `/api/health` already ok
- [ ] Quit policy implemented and documented (README + comment)
- [ ] `pnpm typecheck` exits 0 if daemon JS changed
- [ ] Scope respected; `plans/README.md` updated

## STOP conditions

- Adding HTTP client requires major Cargo churn conflicting with Tauri 2 — use raw TCP HTTP/1.1 for health GET only.
- Unclear whether installer-embedded daemon must always be killed on Quit — implement Child-only kill + document; do not kill arbitrary PIDs listening on 4400 (unsafe).
- Port is configurable via `CONTROL_PORT` — if shell hardcodes 4400, read the same default as shared (`4400`) and note env parity as follow-up if shell cannot read env easily; do not silently bind mismatched ports.

## Maintenance notes

- Reviewer: test both “daemon already up” and “cold start” paths on Windows.
- Follow-up: honor `CONTROL_PORT` in the shell if not already.
- Complements plan 002 (adopted runs inside daemon) but does not replace it.
