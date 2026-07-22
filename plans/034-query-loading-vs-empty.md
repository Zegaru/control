# Plan 034: Distinguish query loading, empty, and error in list views + project detail

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 81b2809..HEAD -- apps/ui/src/App.tsx apps/ui/src/views/PortsView.tsx apps/ui/src/views/GroupsView.tsx apps/ui/src/views/DockerView.tsx apps/ui/src/views/SettingsView.tsx apps/ui/src/views/ProjectDetail.tsx apps/ui/src/components/kit.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
>
> **Prerequisite**: Plan **033** must be `DONE` — `Skeleton`, `ViewLoading`, and
> `PanelLoading` must already be exported from `apps/ui/src/components/kit.tsx`.
> If missing, STOP and execute 033 first.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/033-loading-kit-primitives.md
- **Category**: bug
- **Planned at**: commit `81b2809`, 2026-07-22

## Why this matters

Several views treat “query has not returned yet” the same as “result is empty,” so cold loads flash **false empty states** (`No ports in use.`, `No launch groups yet.`, `No containers.`, `No ignore patterns.`). Separately, route Suspense and project detail use bare `Loading…` text, and a failed project-tree fetch stays on `Loading…` forever. Operators should see instrument-style pending UI while loading, honest empty copy only after success, and an error message when the query failed.

## Current state

### False empties (loading ≡ empty)

**PortsView** — `ports.data ?? []` then empty message:

```18:66:apps/ui/src/views/PortsView.tsx
  const all = ports.data ?? [];
  // ...
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-faint">No ports in use.</p>
          ) : (
```

**GroupsView** — same pattern:

```46:51:apps/ui/src/views/GroupsView.tsx
      {(groups.data ?? []).length === 0 && (
        <Panel>
          <p className="py-6 text-center text-sm text-ink-faint">
            No launch groups yet.
          </p>
        </Panel>
      )}
```

**DockerView** — when engine is available but `containers` still pending, `list = []` shows empty:

```52:144:apps/ui/src/views/DockerView.tsx
  const list = containers.data ?? [];
  // ...
      {available && list.length === 0 && (
        <Panel>
          <p className="py-6 text-center text-sm text-ink-faint">No containers.</p>
        </Panel>
      )}
```

**SettingsView** — ignore globs flash empty before settings load:

```112:114:apps/ui/src/views/SettingsView.tsx
          <div className="bezel-recessed flex min-h-30 flex-wrap content-start gap-1.5 rounded-md border border-panel-edge/60 px-3 py-3">
            {(settings?.ignoreGlobs ?? []).length === 0 ? (
              <span className="text-xs text-ink-faint">No ignore patterns.</span>
```

(Retention already pulses an LED when `!settings` — keep that; only fix the ignore-list false empty.)

### Bare text + error conflation

```35:37:apps/ui/src/App.tsx
function ViewFallback() {
  return <div className="p-4 font-ui text-sm text-ink-dim">Loading…</div>;
}
```

```105:105:apps/ui/src/views/ProjectDetail.tsx
  if (!tree.data) return <div className="text-sm text-ink-dim">Loading…</div>;
```

`tree` is a `useQuery` — when `tree.isError`, `!tree.data` is still true, so errors look like infinite loading. There is **no** `isError` handling in UI views today.

### Conventions

- TanStack Query v5: use `isPending` (initial load with no data) or `isLoading`; prefer `isPending` for “first fetch, no cached data.” Do **not** treat `isFetching` background refetch as a full-panel loading state (would flash on every poll).
- Empty copy stays user-facing (already rewritten for end users) — only gate when it shows.
- Import loading components from `../components/kit.js` (or `./components/kit.js` in App) like other kit exports.
- Mutation button labels (`Scanning…`, `Saving…`) are **out of scope** — leave them.

## Commands you will need

| Purpose   | Command              | Expected on success |
|-----------|----------------------|---------------------|
| Typecheck | `pnpm typecheck`     | exit 0              |
| Lint      | `pnpm lint`          | exit 0              |
| Grep old  | see Done criteria    | zero unwanted hits  |

## Scope

**In scope**:
- `apps/ui/src/App.tsx` — `ViewFallback` only
- `apps/ui/src/views/PortsView.tsx`
- `apps/ui/src/views/GroupsView.tsx`
- `apps/ui/src/views/DockerView.tsx`
- `apps/ui/src/views/SettingsView.tsx` — ignore-glob list pending only
- `apps/ui/src/views/ProjectDetail.tsx` — early return for pending / error
- `plans/README.md` — status row for 034

**Out of scope**:
- `apps/ui/src/views/Dashboard.tsx` — plan **035**
- `apps/ui/src/components/kit.tsx` — unless 033 exports are missing (then STOP)
- `RunDrawer` / `ContainerDrawer` / `LogPanel` idle LEDs while data arrives — defer; low impact
- Changing empty-state **copy** wording (only when it appears)
- Adding React Testing Library / new test packages

## Git workflow

- Branch: `advisor/034-query-loading-states` (or continue on the 033 branch if stacking)
- Commit style: `Show panel loading instead of false empty states on Ports and Groups.` (imperative)
- Do NOT push or open a PR unless asked

## Steps

### Step 0: Confirm 033 primitives exist

**Verify**: `rg -n "export function (Skeleton|ViewLoading|PanelLoading)" apps/ui/src/components/kit.tsx` → three matches.  
If not, STOP — run plan 033.

### Step 1: Replace App Suspense fallback

In `apps/ui/src/App.tsx`, change `ViewFallback` to render `<ViewLoading />` (import from `./components/kit.js`). Remove the plain `Loading…` div.

**Verify**: `rg -n "Loading…" apps/ui/src/App.tsx` → no matches.

### Step 2: PortsView — pending vs empty vs data

- Import `PanelLoading`.
- When `ports.isPending` (and no `ports.data`), render `<PanelLoading />` inside the existing Port Map panel body (replace the table/empty branch for that case only).
- When `ports.isError`, show a short danger-colored message (reuse danger banner classes from `App.tsx` `DaemonBanner` or a simple `text-danger text-sm` line) — do not invent a toast system.
- Empty (`No ports in use.`) only when `ports.isSuccess` (or `ports.data` defined) and filtered `rows.length === 0`.
- Chip counts may stay `0` during pending (acceptable) or hide chips while pending — pick one; prefer leaving chips as-is to minimize churn.

**Verify**: `rg -n "No ports in use" -n apps/ui/src/views/PortsView.tsx` still exists once, and the surrounding condition references success/data-defined, not merely `rows.length === 0` on `?? []` alone. Mentally: empty must not run when `isPending`.

### Step 3: GroupsView — pending vs empty

- When `groups.isPending`, render a `Panel` containing `<PanelLoading />` (or ViewLoading) instead of the “No launch groups yet.” panel.
- Empty panel only when data is defined and length 0.
- Keep the header “Launch Groups” panel + New Group button as today.

**Verify**: empty copy is not rendered solely from `(groups.data ?? []).length === 0` without a pending guard.

### Step 4: DockerView — containers pending vs empty

- When `available && containers.isPending`, show a `Panel` with `<PanelLoading />` (not “No containers.”).
- “No containers.” only when `available && containers.isSuccess && list.length === 0` (or `data` defined and empty).
- Engine panel / rocker busy states: leave unchanged.

**Verify**: `rg -n "No containers" apps/ui/src/views/DockerView.tsx` — empty gated on success/data, not pending.

### Step 5: SettingsView — ignore list pending

- When `settingsQ.isPending` (or `!settings`), show 2–3 small `<Skeleton className="h-6 w-24" />` chips in the ignore area instead of “No ignore patterns.”
- “No ignore patterns.” only when settings loaded and `ignoreGlobs.length === 0`.
- Do not disable the whole Settings page; retention LED pulse can remain.

**Verify**: “No ignore patterns.” is not shown while `settings` is undefined.

### Step 6: ProjectDetail — pending vs error vs data

Replace the single early return:

```tsx
if (tree.isPending) return <ViewLoading label="Loading project" />;
if (tree.isError) {
  return (
    <div className="p-4 text-sm text-danger" role="alert">
      Could not load this project. {tree.error instanceof Error ? tree.error.message : 'Try going back.'}
      {/* optional: Button back via onBack */}
    </div>
  );
}
if (!tree.data) return <ViewLoading label="Loading project" />; // defensive
```

Prefer calling `onBack` from a ghost Button on the error state so the user is not stuck. Keep the rest of the view unchanged after `const p = tree.data`.

**Verify**: `rg -n "Loading…" apps/ui/src/views/ProjectDetail.tsx` → no matches.  
**Verify**: `rg -n "isError" apps/ui/src/views/ProjectDetail.tsx` → at least one match.

### Step 7: Typecheck + lint

**Verify**: `pnpm typecheck` → exit 0  
**Verify**: `pnpm lint` → exit 0

## Test plan

- No new Vitest files (UI has no component test harness).
- Manual (operator or executor with UI running — do **not** start `pnpm dev` unless asked):
  1. Hard-refresh Ports / Groups / Docker / Settings — should see panel skeletons briefly, not empty copy, when the daemon is up but the query is in flight.
  2. Open a valid project — `ViewLoading` then content.
  3. (Optional) Force a bad `projectId` in navigation if easy — error alert, not infinite Loading.

## Done criteria

- [ ] `rg -n "Loading…" apps/ui/src/App.tsx apps/ui/src/views/ProjectDetail.tsx` → no matches
- [ ] Ports / Groups / Docker / Settings empty messages are not shown while their primary query is `isPending`
- [ ] `ProjectDetail` handles `tree.isError` with a visible error (not Loading)
- [ ] `pnpm typecheck` and `pnpm lint` exit 0
- [ ] `Dashboard.tsx` untouched in this plan’s diff
- [ ] `plans/README.md` status row for 034 → `DONE`

## STOP conditions

- Plan 033 primitives missing.
- Fixing Docker seems to require changing daemon container APIs — UI-only gating is enough; STOP if you think otherwise.
- You are tempted to “fix” Dashboard cold load here — that is 035; leave it.

## Maintenance notes

- Any new list view using `data ?? []` must gate empty on `!isPending` / data defined.
- Background `refetchInterval` must not swap the whole panel to `PanelLoading` — only initial pending.
- Reviewer: watch for `isFetching` misuse (poll flicker).
