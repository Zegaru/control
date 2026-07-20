# Plan 006: Calm Overview sampling and WebSocket refetch storms

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat f1729ab..HEAD -- apps/daemon/src/projectMetrics.ts apps/daemon/src/hostPorts.ts apps/daemon/src/docker.ts apps/daemon/src/ports.ts apps/daemon/src/registry.ts apps/ui/src/useWs.ts apps/ui/src/views/Dashboard.tsx apps/ui/src/useAllActions.ts apps/ui/src/api.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans/005-metrics-and-chrome-perf.md (cached metric HTTP reads); plans/001-verification-baseline.md recommended
- **Category**: perf
- **Planned at**: commit `f1729ab`, 2026-07-19

## Why this matters

With Overview open on Windows, CONTROL repeatedly:

1. Spawns PowerShell for **all processes** (`projectMetrics.ts`) and a **second** PowerShell for listen ports (`hostPorts.ts`) on ~2s cadences.
2. Hits Docker `listContainers` (+ per-container stats) from metrics, ports, and `/docker/containers` in the same window.
3. On every `run.status` WS event, invalidates `projects`, `runs`, `tree`, and `ports` (`useWs.ts`), refetching **per-project trees** via `useQueries` N+1 (`Dashboard.tsx:148-153`).
4. Daemon `getProjectTree` / `listProjects` also N+1 SQLite `getActiveRun` per action (`registry.ts`).

This plan reduces duplicate host/Docker work and stops refetch storms without a full registry rewrite.

## Current state

**Host process scan** (`projectMetrics.ts:45-60`): `Get-CimInstance Win32_Process` every sample, 2s cache.

**Host ports** (`hostPorts.ts:14-48`): separate PowerShell with `Get-Process` + `Win32_Process` + `Get-NetTCPConnection`, 2s TTL; non-win32 returns `[]`.

**WS invalidation** (`useWs.ts:68-86`):

```ts
case 'run.status': {
  ...
  qc.invalidateQueries({ queryKey: ['projects'] })
  qc.invalidateQueries({ queryKey: ['runs'] })
  qc.invalidateQueries({ queryKey: ['tree'] })
  qc.invalidateQueries({ queryKey: ['ports'] })
}
```

**Dashboard trees** (`Dashboard.tsx:148-153`): one HTTP tree fetch per project.

**Registry** (`registry.ts:99-116`, `309-318`, `523-535`): per-action `getActiveRun` queries.

**DESIGN**: WSL2 Docker ports must stay attributed via Docker API precedence (do not “fix” by trusting host netstat for container ports).

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Typecheck | `pnpm typecheck` | exit 0              |
| Tests     | `pnpm test`      | exit 0              |

## Scope

**In scope**:
- `apps/daemon/src/hostPorts.ts`
- `apps/daemon/src/projectMetrics.ts`
- `apps/daemon/src/docker.ts` (short-TTL list cache / in-flight coalesce)
- `apps/daemon/src/ports.ts` (only if needed to consume cached containers)
- `apps/daemon/src/registry.ts` — batch active-run lookup **only** (no full module split)
- `apps/ui/src/useWs.ts`
- `apps/ui/src/views/Dashboard.tsx` / `apps/ui/src/api.ts` / `useAllActions.ts` — bulk trees **or** narrower invalidation
- Tests for pure merge/batch helpers

**Out of scope**:
- Splitting `registry.ts` into multiple files (deferred tech-debt)
- Cross-platform host ports (plan 010 direction)
- Changing Docker attribution precedence rules
- Redesigning Dashboard layout/visuals

## Git workflow

- Branch: `advisor/006-overview-fetch-and-sampling`
- Commit style: one commit per step group if large (sampling vs WS vs SQL).
- Example: `Coalesce Overview Docker and host sampling; narrow WS invalidation.`
- Do NOT push unless instructed.

## Steps

### Step 1: Coalesce Windows process enumeration

Introduce a small shared module e.g. `apps/daemon/src/hostProcessSnapshot.ts` that:

- Runs at most one PowerShell (or `ps`) process table fetch per TTL (2–3s)
- Returns rows both metrics and (if useful) ports can consume

Wire `projectMetrics.loadProcesses` to use it. For `hostPorts`, either:

- Keep its specialized listen-port PowerShell but ensure metrics HTTP path no longer double-triggers full scans when plan 005 already uses cache, **and** raise ports TTL slightly if still overlapping, **or**
- Prefer: one combined PowerShell that returns listen ports + needed process fields (more work; only if the shared snapshot approach is insufficient).

Minimum bar for this step: while Overview is open, **do not** run two full `Win32_Process` enumerations on independent timers without sharing cache. Document the chosen approach in the commit message.

**Verify**: `rg -n "Get-CimInstance Win32_Process" apps/daemon/src/` → ideally one module owns it; metrics imports the shared helper.

### Step 2: Short-TTL Docker list coalesce

In `docker.ts`, wrap `listContainers` with:

- In-flight promise dedupe (concurrent callers share one request)
- TTL cache ~1–2s for the resolved list

Ensure `ports.ts` / `projectMetrics` / routes all go through this wrapper (they likely already call `listContainers` — make that the single entry).

**Verify**: Add a unit test with a mock counter proving two parallel calls → one underlying fetch. `pnpm test` passes.

### Step 3: Narrow WS invalidation

In `useWs.ts` for `run.status`:

1. Invalidate `['runs']` and the specific `['tree', projectId]` if `projectId` is on the event (check `WsEvent` shape in `packages/shared` — if project id is not present, invalidate `['tree']` but **debounce** 100–200ms).
2. Do **not** invalidate `['ports']` on every status unless ports actually changed — rely on existing `ports.changed` event (`useWs.ts:88-90`).
3. Invalidate `['projects']` only when status changes would affect summary counts — or debounce it with trees.

Patching query caches from the event payload is encouraged if straightforward (`setQueryData`); do not invent a new state management library.

**Verify**: `rg -n "invalidateQueries\\(\\{ queryKey: \\['ports'\\]" apps/ui/src/useWs.ts` → not inside `run.status` branch. `pnpm typecheck`.

### Step 4: Batch active runs in registry (SQL)

Replace per-action `getActiveRun` loops in `listProjects` / `getProjectTree` with:

1. One query: all runs where status in `ACTIVE_RUN_STATUSES`, ordered by `startedAt` desc.
2. Build `Map<actionId, Run>` keeping first (newest) per action.
3. Look up from the map inside the loops.

Keep `getActiveRun(actionId)` for single-action callers (may still be one query).

**Verify**: Characterization test of map-building helper; `pnpm typecheck`.

### Step 5 (optional if time): Bulk trees endpoint

If Dashboard still does N HTTP tree calls and Step 3 is insufficient:

- Add `GET /projects/trees` returning `ProjectTree[]` for all projects (or ids query param).
- Switch Dashboard / `useAllActions` to one query.

Skip this step if Steps 1–4 already meet done criteria and N projects is typically <5; note deferral in maintenance.

**Verify** (if implemented): `rg -n "projects/trees" apps/daemon/src/routes.ts apps/ui/src/api.ts` → present; Dashboard uses it.

### Step 6: Update index

Mark plan 006 DONE (note any skipped optional step in README status note).

## Test plan

- Docker list coalesce single-flight
- Active-run map helper picks newest run per action
- Optional: waitFor debounce helper
- Do not require live Docker/PowerShell in CI

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0
- [ ] Shared or coalesced Win32 process enumeration (no independent duplicate full scans without cache sharing)
- [ ] `listContainers` has TTL and/or single-flight
- [ ] `run.status` handler does not invalidate ports on every status
- [ ] `listProjects` / `getProjectTree` do not call `getActiveRun` per action in a loop (`rg` the functions)
- [ ] Scope respected; `plans/README.md` updated

## STOP conditions

- Changing port attribution order would be required to share host/Docker data — STOP; keep DESIGN WSL2 precedence.
- Registry batching requires drizzle API you cannot express — use two queries (all active runs + existing selects), not raw SQL strings with user input.
- UI invalidation narrowing leaves Overview clearly stale after start/stop in manual check — restore projects/tree invalidation with debounce rather than inventing new architecture.

## Maintenance notes

- Reviewer: manually start/stop a run and confirm Overview LEDs + port map update within ~2s.
- Full registry split remains deferred; this plan only batches reads.
- Plan 010 may add non-Windows `hostPorts`; keep the snapshot module platform-switched.
