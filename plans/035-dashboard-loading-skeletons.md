# Plan 035: Overview cold-load project card skeletons

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 81b2809..HEAD -- apps/ui/src/views/Dashboard.tsx apps/ui/src/components/ProjectModule.tsx apps/ui/src/components/kit.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
>
> **Prerequisite**: Plan **033** must be `DONE` (`Skeleton` / `ViewLoading` /
> `PanelLoading` in kit). Plan **034** is recommended first but not hard-required
> for Dashboard-only work.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/033-loading-kit-primitives.md
- **Category**: tech-debt
- **Planned at**: commit `81b2809`, 2026-07-22

## Why this matters

On Overview cold load, `projects.data` is `undefined` until the first fetch. The empty-state panel is correctly gated (`projects.data !== undefined && length === 0`), but the **Add Project** card still renders whenever that empty condition is false — including during loading. A machine with several projects briefly looks like “no projects, only Add.” Skeleton project-card placeholders preserve the Overview composition and match the bezel language until `projects` resolves.

## Current state

```636:717:apps/ui/src/views/Dashboard.tsx
          {projects.data !== undefined && projects.data.length === 0 && (
            <div className="bezel-raised ...">
              ...
                  No projects yet
              ...
            </div>
          )}
          {(projects.data ?? []).map((p) => {
            // ... ProjectModule per project
          })}

          {!(projects.data !== undefined && projects.data.length === 0) && (
            <div className="flex w-full shrink-0 flex-col max-lg:min-h-[120px] lg:w-72 lg:self-stretch">
              <ProjectModule variant="add" onClick={() => setAdding(true)} />
            </div>
          )}
```

- `projects` query: `useQuery({queryKey: ['projects'], queryFn: api.listProjects})` (~L148).
- `ProjectModule` supports `variant = 'default' | 'add'` today (`apps/ui/src/components/ProjectModule.tsx`). Add card is a dashed bezel button (~L90–112). Default card is `bezel-raised` → `bezel-recessed` with LED header + service list (~L119+).
- Trees may still be loading after projects arrive (`treesQ`); existing code already renders cards with empty services until trees land — **do not** block the whole row on trees. This plan only covers **projects list** pending.

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Typecheck | `pnpm typecheck` | exit 0              |
| Lint      | `pnpm lint`      | exit 0              |

## Scope

**In scope**:
- `apps/ui/src/views/Dashboard.tsx` — project list loading branch
- `apps/ui/src/components/ProjectModule.tsx` — optional `variant="loading"` **or** inline skeletons in Dashboard only (prefer extending `ProjectModule` so geometry matches real cards)
- `plans/README.md` — status row for 035

**Out of scope**:
- Host metrics / sparklines / event log pending UI
- ControlStrip / Start All busy states
- Ports / Groups / Docker / Settings / ProjectDetail (034)
- Changing empty-state “No projects yet” copy or Add Project flow
- Forcing skeletons while `treesQ` is pending after projects exist

## Git workflow

- Branch: `advisor/035-dashboard-loading-skeletons`
- Commit style: `Show project card skeletons on Overview while projects load.`
- Do NOT push or open a PR unless asked

## Steps

### Step 0: Confirm kit `Skeleton` exists

**Verify**: `rg -n "export function Skeleton" apps/ui/src/components/kit.tsx` → one match.  
If missing, STOP — run 033.

### Step 1: Add a loading card shape

**Preferred**: extend `ProjectModule` with `variant="loading"`:

- Same outer shell as default (`bezel-raised` / `bezel-recessed`, `lg:w-72` wrapper stays in Dashboard).
- Non-interactive (`aria-hidden` or `role="status"` on the list container in Dashboard).
- Contents: pulsing LED row via `<Led status="starting" pulse />` + 2–3 `<Skeleton>` bars for title / path / service lines. No rocker, no click handler.
- Import `Skeleton` / `Led` from `./kit.js` (Led already imported).

**Alternative** (acceptable if `ProjectModule` change feels risky): render 3 placeholder `div`s in Dashboard with the same width classes as real cards (`lg:w-72`, `max-lg:min-h-[220px]`) using `Skeleton` only — but then STOP if the visual mismatch is large and switch to the preferred approach.

### Step 2: Wire Dashboard pending branch

In the project list `div` (`projectListRef`):

1. When `projects.isPending` (or `projects.data === undefined && !projects.isError`):
   - Render **3** loading cards (fixed count is fine; do not invent a count from cache).
   - **Do not** render `variant="add"` during this branch.
   - **Do not** render the “No projects yet” empty panel.

2. When `projects.isError`:
   - Render a compact danger message in the list area (text-sm text-danger), still allow Add card so the user can recover — or show message only. Prefer: error line + Add card.

3. Keep existing empty and loaded branches as today once `projects.data` is defined.

Suggested structure (illustrative):

```tsx
{projects.isPending && (
  <>
    <ProjectModule variant="loading" />
    <ProjectModule variant="loading" />
    <ProjectModule variant="loading" />
  </>
)}
{projects.isError && (
  <p className="text-sm text-danger" role="alert">Could not load projects.</p>
)}
{projects.data !== undefined && projects.data.length === 0 && ( /* empty */ )}
{(projects.data ?? []).map(...)}
{projects.data !== undefined && (
  <ProjectModule variant="add" ... />
)}
```

Adjust the Add-card condition so it is **not** shown during `isPending`. Showing Add when `data` is defined (including empty) is correct; on empty, today’s UI hides Add inside the empty panel CTA — preserve that behavior:

- Empty (`length === 0`): keep current empty panel with its own Add button; **do not** also show the side Add card (current code already does this via `!(data !== undefined && length === 0)`).
- Loaded with items: map + Add card.
- Pending: skeletons only.

**Verify**: `rg -n "isPending|variant=\"loading\"" apps/ui/src/views/Dashboard.tsx` → pending branch present.  
**Verify**: Add card is not rendered when `projects.isPending` is true (read the condition carefully).

### Step 3: Typecheck + lint

**Verify**: `pnpm typecheck` → exit 0  
**Verify**: `pnpm lint` → exit 0

## Test plan

- No new Vitest files.
- Manual: hard-refresh Overview with daemon up and ≥1 project — should briefly see ~3 skeleton cards, then real cards + Add; should **not** flash only the Add card. With 0 projects after load — existing empty panel unchanged.

## Done criteria

- [ ] Overview shows skeleton project cards while `projects.isPending`
- [ ] Add Project card is not the sole content during projects pending
- [ ] Empty state still only when `projects.data` is defined and empty
- [ ] `pnpm typecheck` and `pnpm lint` exit 0
- [ ] No changes to Ports/Groups/Docker/Settings/ProjectDetail/App unless required for shared types (should be none)
- [ ] `plans/README.md` status row for 035 → `DONE`

## STOP conditions

- `ProjectModule` API has diverged (no `variant`) — re-read file and adapt within this plan’s scope only.
- Fixing this seems to require changing `treesQ` or metrics polling — do not; report instead.
- You want to skeleton the entire Dashboard (gauges, event log) — out of scope; stop after project list.

## Maintenance notes

- Reviewer: ensure poll/refetch does not re-show skeletons (`isPending` only, not `isFetching`).
- If Overview gains pagination or virtualized cards, keep the same pending vs empty vs add gating.
- Deferred: tree-level skeleton inside a card when `projects` is ready but `treesQ` is still pending (optional polish; not required here).
