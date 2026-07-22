# Plan 038: Open past-run logs from ActionEditor history

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 81b2809..HEAD -- apps/ui/src/components/ActionEditor.tsx apps/ui/src/components/ActionRow.tsx apps/ui/src/components/RunDrawer.tsx apps/ui/src/api.ts apps/daemon/src/routes.ts apps/daemon/src/registry.ts packages/shared/src/index.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (serialize with **032** if both edit `ActionEditor` in one branch)
- **Category**: direction
- **Planned at**: commit `81b2809`, 2026-07-22

## Why this matters

FR-5 / FR-13 promise recent-run logs after exit. The daemon already persists `logFile` per run and serves `GET /api/runs/:id/logs` for dead runs (`routes.ts` falls back to `tailFile`). ActionEditor lists recent runs (status, time, exit code) but the rows are inert — operators cannot open the log that answers “what broke last time?” without having kept the Run drawer open while it was live.

## Current state

- History UI is display-only (`apps/ui/src/components/ActionEditor.tsx`):

```125:136:apps/ui/src/components/ActionEditor.tsx
        {history.data && history.data.length > 0 ? (
          <div className="space-y-1">
            {history.data.map((r) => (
              <div key={r.id} className="flex items-center gap-3 text-[12px] text-ink-dim">
                <span className="w-16 uppercase" style={{ color: statusColor(r.status) }}>
                  {statusLabel(r.status)}
                </span>
                <span>{new Date(r.startedAt).toLocaleTimeString()}</span>
                {r.exitedAt && <span>· {Math.round((r.exitedAt - r.startedAt) / 1000)}s</span>}
                {r.exitCode != null && <span>· exit {r.exitCode}</span>}
              </div>
            ))}
```

- `ActionRow` already receives `onOpenRun` and opens the editor without passing that callback into `ActionEditor`.
- `RunDrawer` resolves the run **only** from `api.activeRuns()`:

```19:20:apps/ui/src/components/RunDrawer.tsx
  const runs = useQuery({queryKey: ['runs'], queryFn: api.activeRuns});
  const run = runs.data?.find((r) => r.id === runId);
```

  For a dead run, `run` is `undefined`: Stop buttons hide (OK), status shows idle (misleading), but `LogPanel` still calls `api.runLogs(runId)` which works for files on disk.

- Daemon has `getRun(id)` in `registry.ts` but **no** `GET /api/runs/:id` route (only list active + logs + stop).

**Product decisions (locked)**

1. History rows become buttons; click → `onOpenRun(r.id)` and close the ActionEditor modal.
2. Thread `onOpenRun` from `ActionRow` → `ActionEditor`.
3. Add `GET /api/runs/:id` returning the `Run` JSON via existing `getRun` (404 if missing).
4. `RunDrawer` loads that endpoint when the run is not in the active list (or always use it as source of truth for header metadata). Hide Stop / Force Kill unless `isActiveStatus(run.status)`.
5. Do not build a second log viewer — reuse `LogPanel` inside `RunDrawer`.
6. No pagination / search of full history beyond existing `listRunsForAction` limit.

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Typecheck | `pnpm typecheck` | exit 0              |
| Lint      | `pnpm lint`      | exit 0              |
| Tests     | `pnpm test`      | all pass            |

## Scope

**In scope**:

- `apps/daemon/src/routes.ts` — `GET /runs/:id`
- `apps/ui/src/api.ts` — `getRun(id: string)`
- `apps/ui/src/components/RunDrawer.tsx` — fetch run by id; gate stop buttons with `isActiveStatus`
- `apps/ui/src/components/ActionEditor.tsx` — `onOpenRun` prop; clickable history rows
- `apps/ui/src/components/ActionRow.tsx` — pass `onOpenRun` into `ActionEditor`
- `plans/README.md` — status

**Out of scope**:

- Changing log retention / ring buffer / plan 030 tail caps
- Container log history
- Diffing two runs
- Plan 032 env-file UI in the same ActionEditor edit (rebase if needed)
- New Vitest UI suite

## Git workflow

- Branch: `advisor/038-past-run-logs`
- Commit message example: `Open past run logs from action history.`
- Do NOT push/PR unless asked

## Steps

### Step 1: GET /runs/:id

In `routes.ts`, near other `/runs` routes:

```ts
api.get('/runs/:id', (c) => {
  const run = getRun(c.req.param('id'))
  if (!run) throw new HttpError(404, 'Run not found')
  return c.json(run)
})
```

Ensure `getRun` / `HttpError` already imported (they are).

**Verify**: `pnpm typecheck` → exit 0

### Step 2: UI API + RunDrawer

Add `getRun: (id: string) => req<Run>(`/runs/${id}`)`.

In `RunDrawer`:

```ts
const active = useQuery({ queryKey: ['runs'], queryFn: api.activeRuns })
const detail = useQuery({
  queryKey: ['run', runId],
  queryFn: () => api.getRun(runId),
  enabled: !!runId,
})
const run = active.data?.find((r) => r.id === runId) ?? detail.data
```

Import `isActiveStatus` from `@control/shared`. Only render Stop / Force Kill when `run && isActiveStatus(run.status)`.

**Verify**: `pnpm typecheck` → exit 0

### Step 3: ActionEditor history → open run

Add prop `onOpenRun?: (runId: string) => void`.

Replace the inert history `div` with a `Button variant="ghost"` (or `<button>`) per row that:

- calls `onOpenRun?.(r.id)`
- calls `onOpenChange(false)` to close the editor so the drawer is visible

If `onOpenRun` is undefined, keep rows non-clickable (defensive).

Wire `ActionRow`: `<ActionEditor … onOpenRun={onOpenRun} />`.

**Verify**: `pnpm typecheck` && `pnpm lint` → exit 0

### Step 4: Index

Mark 038 DONE in `plans/README.md`.

## Test plan

Manual: run an action, stop it, open Edit → Recent runs → click row → RunDrawer shows prior log text; Stop buttons absent for exited runs. Live run from ActionRow name click still works.

Optional daemon smoke: no new test file required; if you want one characterization, a routes-level test is **not** established in this repo — do not invent a new HTTP test harness.

`pnpm test` must stay green.

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0
- [ ] `GET /api/runs/:id` returns run JSON / 404
- [ ] History row opens RunDrawer with log content for a dead run that has `logFile`
- [ ] Stop controls hidden for non-active statuses
- [ ] No files outside in-scope list modified
- [ ] `plans/README.md` status DONE

## STOP conditions

- `getRun` does not return `logFile` / status fields needed by the drawer — STOP and report schema drift.
- Dead-run logs endpoint returns empty for runs that should have files (retention deleted them) — still open the drawer; show empty log (LogPanel already handles). Do not change retention.
- ActionEditor was heavily redesigned by plan 032 on the same branch and conflicts — finish or rebase 032 first; do not delete env-file UI to land this.

## Maintenance notes

- Reviewers: clicking history should not start/stop the action.
- Follow-up: surface “view last log” from Overview failure notifications (ControlStrip `_notifications` is a separate direction item — not this plan).
