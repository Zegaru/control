# Plan 002: Make adopted runs stoppable and align reconcile with DESIGN

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat f1729ab..HEAD -- apps/daemon/src/reconcile.ts apps/daemon/src/supervisor.ts apps/daemon/src/routes.ts apps/daemon/src/projectPower.ts apps/daemon/src/groupRunner.ts packages/shared/src/index.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/001-verification-baseline.md (characterization tests should exist so you can add `reconcile` / stop tests)
- **Category**: bug
- **Planned at**: commit `f1729ab`, 2026-07-19

## Why this matters

FR-11 and the shared Run docstring promise that after a daemon restart, surviving processes are **adopted** and remain **stoppable**. Today reconcile marks survivors `adopted`, but `supervisor.stop` returns false unless an in-memory PTY handle exists. Project power OFF and group stop also gate on `supervisor.isLive`, so adopted runs become unkillable zombies in the UI. Separately, reconcile uses `alive || portsUp`, while DESIGN requires PID alive (+ port as confirmation) — port-only adoption creates ghosts when another process reuses the port.

## Current state

**DESIGN.md §6 / FR-11** (quote for vocabulary):

> on daemon start, walk the `runs` table: PID alive + expected port listening → mark `adopted` (stop + port status supported; PTY log stream is lost — documented limitation). PID dead → mark `exited` retroactively.

**Reconciliation** (`apps/daemon/src/reconcile.ts:31-45`):

```ts
if (alive || portsUp) {
  db.update(schema.runs).set({ status: 'adopted' }).where(eq(schema.runs.id, run.id)).run()
} else {
  db.update(schema.runs)
    .set({ status: 'exited', exitedAt: Date.now() })
    .where(eq(schema.runs.id, run.id))
    .run()
}
```

Comment at lines 17–22 claims stop support; `pidAlive` is already local in this file (lines 7–15).

**Stop path** (`apps/daemon/src/supervisor.ts:116-119`):

```ts
stop(runId: string, force = false): boolean {
  const handle = this.handles.get(runId)
  if (!handle || !handle.proc) return false
```

`isLive` (`supervisor.ts:145-147`) is `this.handles.has(runId)` only.

**Power / group** (`projectPower.ts:51-61`, `groupRunner.ts:47-48`) only call `supervisor.stop` when `supervisor.isLive(run.id)`.

**API** (`routes.ts:168-172`): stop returns 404 when `supervisor.stop` returns false.

**Conventions**: `HttpError` from `registry.ts`; tree-kill via existing `forceKill` private method; use `tree-kill` already depended on by daemon.

## Commands you will need

| Purpose   | Command                | Expected on success |
|-----------|------------------------|---------------------|
| Typecheck | `pnpm typecheck`       | exit 0              |
| Tests     | `pnpm test`            | exit 0              |

## Scope

**In scope**:
- `apps/daemon/src/reconcile.ts`
- `apps/daemon/src/supervisor.ts`
- `apps/daemon/src/routes.ts` (only if stop must load run from DB before calling supervisor)
- `apps/daemon/src/projectPower.ts`
- `apps/daemon/src/groupRunner.ts`
- New tests: `apps/daemon/src/reconcile.test.ts` and/or `apps/daemon/src/supervisor.adopted-stop.test.ts` (mock `process.kill` / treeKill)

**Out of scope**:
- Restoring live log streaming for adopted runs (documented limitation)
- Shell/Tauri daemon lifecycle (plan 007)
- Duplicate-start / unhealthy / group wait (plan 003)
- Changing `ACTIVE_RUN_STATUSES` membership

## Git workflow

- Branch: `advisor/002-adopted-runs-stoppable`
- Commit example: `Stop adopted runs after daemon restart and tighten reconcile.`
- Do NOT push unless instructed.

## Steps

### Step 1: Tighten reconcile to require a live PID

Change the survivor condition to require `alive` (PID present and `pidAlive`).

Recommended logic:
- If `alive` → set `adopted` (optionally still record whether ports are up for logging; do not adopt on ports alone).
- If `!alive` → set `exited` with `exitedAt: Date.now()`, even if `portsUp` is true.

Update the file comment to match DESIGN (PID required; ports are soft confirmation only).

**Verify**: Unit tests in Step 4 cover both branches; `pnpm typecheck` still passes after later steps.

### Step 2: Teach `supervisor.stop` to kill adopted runs by stored PID

Implement a path when there is no live handle (or handle with null proc):

1. Load the run from DB via `getRun(runId)` (already in `registry.ts`).
2. If run is missing or not in an active status → return false.
3. If `run.pid == null` → return false (cannot safely kill).
4. Re-probe with the same `pidAlive` semantics as reconcile (extract shared helper to `apps/daemon/src/pid.ts` or export from reconcile — prefer a tiny `pid.ts` to avoid circular imports).
5. If not alive → mark run exited/killed appropriately and return true (idempotent stop) OR return false with clear 404 — prefer: finalize as `killed`/`exited` if already dead so UI clears; document choice in commit message.
6. If alive → `treeKill(run.pid, …)`, set stopping state, update DB status to `killed` (or let a lightweight finalize path run). There will be no `onExit` from node-pty — you **must** finalize the DB row yourself (status, `exitedAt`, clear from any in-memory maps).

Also update `isLive(runId)` **or** change callers: power/group/stop API must treat DB-active adopted runs as stoppable. Cleanest approach:
- Add `supervisor.canStop(runId): boolean` / make `stop` handle DB-backed PIDs, and change `projectPower` / `groupRunner` to call `stop` whenever there is an active run (`getActiveRun` / `isActiveStatus`), not only `isLive`.

**Verify**: `rg -n "supervisor.isLive" apps/daemon/src/projectPower.ts apps/daemon/src/groupRunner.ts` → either removed for stop paths or paired with adopted DB stop. Stop paths must not require an in-memory handle.

### Step 3: Align HTTP stop errors

`POST /runs/:id/stop` should:
- Call the new stop path.
- Return 404 only when the run id is unknown or already terminal with no PID to reap.
- Prefer 200 `{ ok: true }` when an adopted PID was tree-killed.

**Verify**: `pnpm typecheck` → exit 0.

### Step 4: Tests

Add tests (Vitest from plan 001):

**reconcile.test.ts** (mock DB or extract pure decision function):

Prefer extracting:

```ts
export function decideReconcileStatus(input: {
  pid: number | null
  alive: boolean
  portsUp: boolean
}): 'adopted' | 'exited'
```

Cases:
1. alive + portsUp → adopted
2. alive + !portsUp → adopted (PID wins per this plan)
3. !alive + portsUp → exited (regression for OR bug)
4. !alive + !portsUp → exited

**supervisor adopted stop**: mock `treeKill` and `getRun`; assert kill called with stored pid when no handle.

**Verify**: `pnpm test` → all pass including new cases.

### Step 5: Update index

Mark plan 002 DONE in `plans/README.md`.

## Test plan

- `decideReconcileStatus` / reconcile cases above (especially `!alive && portsUp → exited`)
- Adopted stop calls tree-kill with DB pid when no PTY handle
- Power-stop path invokes stop for adopted active runs (unit or thin integration with mocks)
- Pattern: follow plan 001 Vitest files; no real processes

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0; new reconcile decision tests pass
- [ ] `rg -n "alive \|\| portsUp" apps/daemon/src/reconcile.ts` returns no matches
- [ ] `supervisor.stop` can succeed without `handles.get(runId)?.proc`
- [ ] `projectPower` / `groupRunner` stop adopted runs (not only `isLive`)
- [ ] No files outside in-scope list modified
- [ ] `plans/README.md` updated

## STOP conditions

- Cannot safely share `pidAlive` without creating an import cycle — extract `pid.ts`; if still cyclic after one extract, STOP.
- You believe you need to kill by port alone (no PID) — STOP; that is explicitly out of scope (unsafe).
- Drift: `stop` already handles adopted runs differently than excerpts — re-read and report.

## Maintenance notes

- PID reuse race: always re-`pidAlive` immediately before `treeKill`; reviewers should check that.
- Follow-up: optional “adopt into handle” for graceful Ctrl-C; this plan only requires force/tree-kill reliability.
- Plan 007 (shell) still needs its own orphan-daemon fix; do not conflate.
