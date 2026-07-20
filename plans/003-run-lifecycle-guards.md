# Plan 003: Harden run lifecycle — duplicate starts, unhealthy, group waits

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat f1729ab..HEAD -- apps/daemon/src/routes.ts apps/daemon/src/supervisor.ts apps/daemon/src/groupRunner.ts packages/shared/src/index.ts apps/ui/src/components/kit.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/001-verification-baseline.md
- **Category**: bug
- **Planned at**: commit `f1729ab`, 2026-07-19

## Why this matters

Three related lifecycle holes sit in the start/health/group path:

1. `POST /actions/:id/start` never checks `getActiveRun`, so double-clicks spawn invisible zombie processes (groups/power already skip double-start).
2. Health watch never sets `unhealthy` and never demotes after `healthy`, though the schema and UI already know that status.
3. Group `waitForStep` silently continues after a 60s timeout **and** after `failed`/`killed`, so dependent steps start on a broken stack.

## Current state

**Duplicate start** (`apps/daemon/src/routes.ts:145-158`):

```ts
api.post('/actions/:id/start', async (c) => {
  const action = getAction(c.req.param('id'))
  if (!action) throw new HttpError(404, 'Action not found')
  const force = c.req.query('force') === 'true'
  if (action.portHint && !force && (await claimedPorts()).has(action.portHint)) {
    return c.json({ error: 'port_conflict', ... }, 409)
  }
  // no getActiveRun check
  return c.json(supervisor.start(action, body.env), 201)
})
```

Contrast `groupRunner.ts:19-21` and `projectPower.ts:27` which skip when active.

**Health watch** (`supervisor.ts:218-236`): only `healthy` or `running`; never `unhealthy`.

**Shared contract** (`packages/shared/src/index.ts:22-36`): lifecycle includes `healthy | unhealthy`; UI already styles unhealthy (e.g. kit LEDs).

**Group wait** (`groupRunner.ts:28-41`):

```ts
while (Date.now() < deadline) {
  const run = getRun(runId)
  if (!run) return
  if (waitFor === 'healthy' && run.status === 'healthy') return
  if (waitFor === 'exit' && (run.status === 'exited' || run.status === 'failed')) return
  if (run.status === 'failed' || run.status === 'killed') return  // silent success!
  await sleep(POLL_MS)
}
// timeout: fall through with no throw
```

**DESIGN.md**: Port open ≠ healthy; optional healthUrl promotes to healthy; amber = unhealthy.

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Typecheck | `pnpm typecheck` | exit 0              |
| Tests     | `pnpm test`      | exit 0              |

## Scope

**In scope**:
- `apps/daemon/src/routes.ts` — start guard
- `apps/daemon/src/supervisor.ts` — unhealthy transitions
- `apps/daemon/src/groupRunner.ts` — fail on timeout / failed step
- Tests for group wait + health transition helper if extracted
- Optional small UI copy only if an error toast already exists for 409 — do not redesign UI

**Out of scope**:
- Adopted-run stopping (plan 002)
- `healthUrl` SSRF allowlist (plan 004) — may land before/after; do not block
- Changing `WAIT_TIMEOUT_MS` default unless tests need injectability
- New restart endpoint beyond `?force=true` semantics below

## Git workflow

- Branch: `advisor/003-run-lifecycle-guards`
- Commit example: `Reject duplicate starts, demote unhealthy runs, and fail group waits.`
- Do NOT push unless instructed.

## Steps

### Step 1: Reject duplicate active starts

In `POST /actions/:id/start`, after loading the action:

```ts
const existing = getActiveRun(action.id)
if (existing && !force) {
  return c.json(
    {
      error: 'already_running',
      runId: existing.id,
      message: 'Action already has an active run',
    },
    409,
  )
}
```

When `force === true` and an active run exists: stop it first (await/stop best-effort), then start — or document that `force` only bypasses port conflict and still 409s on active run. **Preferred**: `force` stops the existing active run then starts (mirrors user intent of “start anyway”).

Import `getActiveRun` from `./registry.js` (already used elsewhere in routes via other imports — add to the import list).

**Verify**: `rg -n "already_running|getActiveRun" apps/daemon/src/routes.ts` → both present near start handler.

### Step 2: Implement `unhealthy` in health watch

In `beginHealthWatch` interval callback, after computing `healthy`:

- Track whether we are past an initial grace window (e.g. 5–10s after watch start, or 3 failed polls). Reuse constants near `HEALTH_POLL_MS`.
- If `healthy` → `setStatus(..., 'healthy', ...)`.
- Else if health signals exist (`portHint` or `healthUrl`) and grace elapsed → `setStatus(..., 'unhealthy', ...)`.
- Else if `portUp` only → `running` (keep current nuance).
- Else while still in grace and starting → leave `starting`/`running` as today.

Critical: allow **healthy → unhealthy** and **unhealthy → healthy** transitions (do not early-return forever after first healthy).

For actions with neither portHint nor healthUrl, keep the existing “running after 1200ms” path untouched.

**Verify**: Extract a pure function if possible, e.g. `nextHealthStatus({ healthy, portUp, hadHealthSignals, graceElapsed, current })`, and unit-test transitions.

### Step 3: Fail group waits loudly

Change `waitForStep` to:

1. On `failed` / `killed` while waiting for `healthy`: **throw** `HttpError` or `Error` with a clear message (group start should abort).
2. On timeout: **throw** (do not continue the for-loop in `startGroup`).
3. On `waitFor === 'exit'`: keep success on `exited` or `failed` as today if that matches product intent for one-shot tasks — but do **not** treat `killed` as success unless DESIGN says so. Prefer: exit wait succeeds on `exited` only; `failed`/`killed` throw when waiting for exit. If existing callers rely on failed-as-exit, keep `exited | failed` success but still throw on timeout.

Ensure `startGroup` does not catch-and-swallow; `routes.ts` group start should surface the error via `app.onError`.

Optional improvement (only if trivial): when `waitFor === 'healthy'` and the action has no healthUrl/portHint, treat `running` as success after the no-signal path sets running — document in comment. If non-trivial, SKIP and leave as known limitation (timeout will throw).

**Verify**: `pnpm test` with groupRunner tests (Step 4).

### Step 4: Tests

1. **routes / start policy** — pure helper `assertCanStart(existing, force)` if extracted; cases: none→ok, active+!force→conflict, active+force→ok.
2. **health transitions** — healthy↔unhealthy matrix.
3. **waitForStep** — mock `getRun` sequence: timeout throws; failed while waiting healthy throws; healthy returns.

**Verify**: `pnpm test` → exit 0; `pnpm typecheck` → exit 0.

### Step 5: Update index

Mark plan 003 DONE.

## Test plan

- Duplicate-start 409 without force
- Force path stops-or-allows restart (match chosen semantics; assert in test name)
- `nextHealthStatus` demotes healthy→unhealthy
- Group wait timeout throws; failed step throws
- Model after plan 001 Vitest style

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0 with new lifecycle tests
- [ ] Start route checks `getActiveRun` before `supervisor.start`
- [ ] `rg -n "unhealthy" apps/daemon/src/supervisor.ts` shows a `setStatus` (or equivalent) path
- [ ] `waitForStep` does not fall through silently on timeout (`rg -n "WAIT_TIMEOUT" -A20 apps/daemon/src/groupRunner.ts` shows throw)
- [ ] Scope respected; `plans/README.md` updated

## STOP conditions

- UI requires a new error-surface component for 409 — do not build one; return JSON only (existing clients may already show API errors).
- Health watch refactor seems to need rewriting all of supervisor — stay inside `beginHealthWatch` / small helper; otherwise STOP.
- Plan 002 not merged and you need adopted-stop for force-restart — implement force as stop-via-supervisor only for live handles, or depend on 002; do not reimplement adopted kill here.

## Maintenance notes

- Reviewers: ensure rapid healthy↔unhealthy does not flood WS events into a query storm (plan 006 may debounce); if needed, only emit on status change (supervisor `setStatus` should already no-op on same status — verify and keep that guard).
- Follow-up: group-level partial rollback (stop already-started steps on failure) is nice-to-have; this plan only aborts starting further steps.
