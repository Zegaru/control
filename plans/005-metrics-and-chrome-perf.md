# Plan 005: Serve cached metrics and stop AgentStatus React churn

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat f1729ab..HEAD -- apps/daemon/src/routes.ts apps/daemon/src/hostMetrics.ts apps/daemon/src/projectMetrics.ts apps/ui/src/components/kit.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (tests from 001 helpful but not required for the metrics route change)
- **Category**: perf
- **Planned at**: commit `f1729ab`, 2026-07-19

## Why this matters

Overview polls `/host/metrics` every 1.5s and `/projects/metrics` every 2s while the daemon already runs background samplers. The HTTP handlers call `sampleNow()` / `sampleProjectMetricsNow()`, doubling CPU work on the machine CONTROL is meant to monitor. Independently, `AgentStatus` in the nav runs `setInterval(..., 55)` updating React state ~18×/sec for a decorative SVG wave — constant main-thread churn on every screen.

## Current state

**Routes** (`apps/daemon/src/routes.ts:65-74`):

```ts
api.get('/host/metrics', async (c) => {
  return c.json(await sampleNow())
})
api.get('/projects/metrics', async (c) => c.json(await sampleProjectMetricsNow()))
```

**Already available** (`hostMetrics.ts:96-98`, `projectMetrics.ts:210+`):

```ts
export function getHostMetrics(): HostMetrics {
  return latest
}
```

`index.ts` already calls `startHostMetrics()` / `startProjectMetrics()` at boot.

**UI poll** (`Dashboard.tsx:127-135`): refetchInterval 1500 / 2000.

**AgentStatus** (`kit.tsx:777-790`):

```ts
useEffect(() => {
  if (!online) return;
  ...
  const id = window.setInterval(() => {
    ...
    setWavePoints(agentSamplesToPoints(samples));
  }, 55);
  return () => window.clearInterval(id);
}, [online]);
```

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Typecheck | `pnpm typecheck` | exit 0              |

## Scope

**In scope**:
- `apps/daemon/src/routes.ts` — use getters
- `apps/ui/src/components/kit.tsx` — AgentStatus wave without React state thrash
- Optional: export getters already exist; do not change sample intervals unless needed for empty-initial snapshot

**Out of scope**:
- PowerShell / Docker sampling coalescing (plan 006)
- WS invalidation narrowing (plan 006)
- Dashboard layout refactors
- Changing UI poll intervals (cached reads make current intervals cheap)

## Git workflow

- Branch: `advisor/005-metrics-and-chrome-perf`
- Commit example: `Serve cached metrics snapshots and animate AgentStatus without React churn.`
- Do NOT push unless instructed.

## Steps

### Step 1: Point metrics routes at caches

```ts
import { getHostMetrics } from './hostMetrics.js'
import { getProjectMetrics } from './projectMetrics.js'

api.get('/host/metrics', (c) => c.json(getHostMetrics()))
api.get('/projects/metrics', (c) => c.json(getProjectMetrics()))
```

Remove unused `sampleNow` / `sampleProjectMetricsNow` imports from routes.

If cold start can return zeros before first background tick: that is acceptable (background starts in `main` before serve callback; first sample is kicked in `startHostMetrics`). Do not reintroduce `sample*Now` on every request.

**Verify**: `rg -n "sampleNow|sampleProjectMetricsNow" apps/daemon/src/routes.ts` → no matches. `pnpm typecheck` → exit 0.

### Step 2: Rewrite AgentStatus wave without 55ms setState

Choose one approach (pick the simplest that preserves visuals):

**Preferred**: CSS/SVG animation (SMIL `<animate>` or CSS on a polyline) with no React state, OR `requestAnimationFrame` that mutates an SVG `<polyline>` via `ref` (`setAttribute`) without `setWavePoints`.

Keep the LED / label behavior unchanged. Honor `prefers-reduced-motion` if easy (static midline when reduced motion).

**Verify**: `rg -n "setInterval\\(.*55" apps/ui/src/components/kit.tsx` → no matches. `rg -n "setWavePoints" apps/ui/src/components/kit.tsx` → no matches (or only initial unused removed). `pnpm typecheck` → exit 0.

### Step 3: Update index

Mark plan 005 DONE.

## Test plan

- No mandatory new tests (visual + route wiring). If plan 001 exists, optional assert that routes module imports getters (skip if awkward).
- Manual smoke (operator): open Overview, confirm gauges still move over a few seconds after daemon start.

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] Metrics routes use `getHostMetrics` / `getProjectMetrics`
- [ ] No `setInterval(..., 55)` React state loop in AgentStatus
- [ ] Scope respected; `plans/README.md` updated

## STOP conditions

- Getters do not exist / return stale empty forever because background samplers were removed — STOP and report.
- AgentStatus redesign expands into a kit-wide animation system — STOP; only fix this component.

## Maintenance notes

- Plan 006 may further reduce Windows sampling cost; this plan only removes double-sample on HTTP.
- Reviewer: confirm first paint after daemon boot shows non-null metrics within ~2s.
