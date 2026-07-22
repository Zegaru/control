# Plan 037: Hide action / module controls in the UI

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 81b2809..HEAD -- apps/ui/src/api.ts apps/ui/src/components/ActionRow.tsx apps/ui/src/views/ProjectDetail.tsx apps/daemon/src/registry.ts apps/daemon/src/routes.ts packages/shared/src/index.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `81b2809`, 2026-07-22

## Why this matters

Detection often surfaces build/lint/test scripts operators never want on the Project Detail surface. The data model and API already support `hidden` on modules and actions (`patchActionBodySchema.hidden`, `patchModuleBodySchema.hidden`, registry `patchAction` / `patchModule`). The UI filters hidden **actions** out of lists but never sets the flag — and it does not filter or toggle hidden **modules** at all. Favorites work; hide is a dead API.

## Current state

- Action favorite toggle pattern to mirror (`apps/ui/src/components/ActionRow.tsx`):

```49:53:apps/ui/src/components/ActionRow.tsx
  const toggleFav = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await api.patchAction(action.id, {favorite: !action.favorite});
    invalidate();
  };
```

- Project Detail already skips hidden actions when rendering:

```445:446:apps/ui/src/views/ProjectDetail.tsx
                  const primary = mod.actions.filter((a) => !a.hidden && a.primary);
                  const secondary = mod.actions.filter((a) => !a.hidden && !a.primary);
```

- Modules are rendered with `p.modules.map` — **no** `!mod.hidden` filter.
- Daemon: `PATCH /api/modules/:id` exists (`routes.ts` ~160–162); `patchModule` writes `hidden` (`registry.ts` ~468–474).
- UI `apps/ui/src/api.ts` has `patchAction` but **no** `patchModule`.
- Shared schemas already include `hidden` on patch bodies — do not reinvent.

**Product decisions (locked)**

1. **Hide action**: icon button on `ActionRow` (next to favorite). Uses Phosphor `EyeSlash` (or `Eye` when hidden). Calls `api.patchAction(id, { hidden: true })` from the normal list. Once hidden, the row disappears from the default list.
2. **Unhide / discoverability**: Project Detail gets a text toggle **“Show hidden”** (default off). When on, list **only** includes `hidden` actions (and hidden modules’ contents), each with an **Unhide** control (`hidden: false`). This avoids cluttering the main list with ghost rows while still making unhide possible.
3. **Hide module**: when `showModuleHeader` is true (multi-module projects), module header gets a “Hide module” ghost/icon button → `api.patchModule(id, { hidden: true })`. Default view filters `!mod.hidden`. With “Show hidden” on, show hidden modules with Unhide.
4. Single-root-module projects: still allow hiding **actions**; hiding the sole root module is allowed but then the commands panel shows empty + hint to “Show hidden” — acceptable.
5. No changes to Dashboard favorite grid beyond existing `!a.hidden` filters (already present). No bulk hide. No daemon changes unless `patchModule` is mysteriously broken (it is not — verify only).

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Typecheck | `pnpm typecheck` | exit 0              |
| Lint      | `pnpm lint`      | exit 0              |
| Tests     | `pnpm test`      | all pass (no new required) |

## Scope

**In scope**:

- `apps/ui/src/api.ts` — add `patchModule(id, body: PatchModuleBody)`
- `apps/ui/src/components/ActionRow.tsx` — hide / unhide control; optional `showHidden` affordance via props if needed
- `apps/ui/src/views/ProjectDetail.tsx` — “Show hidden” toggle; filter modules; module hide/unhide button
- `plans/README.md` — status

**Out of scope**:

- Daemon/registry/schema changes (already done)
- Hiding from Dashboard / Command Palette separately (palette should continue to skip hidden via existing filters if any; do not expand palette UX)
- Soft-delete / archive semantics beyond boolean `hidden`
- Settings screen for hidden items
- Plan 032/038 ActionEditor work

## Git workflow

- Branch: `advisor/037-hide-action-module-ui`
- Commit message example: `Add hide controls for actions and modules.`
- Do NOT push/PR unless asked

## Steps

### Step 1: API client

Import `PatchModuleBody` from `@control/shared` (same pattern as `PatchActionBody`). Add:

```ts
patchModule: (id: string, body: PatchModuleBody) =>
  req<Module>(`/modules/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
```

Ensure `Module` type is already imported or import it.

**Verify**: `pnpm typecheck` → exit 0

### Step 2: ActionRow hide/unhide

Add `variant?: 'default' | 'hidden'` (or `allowUnhide?: boolean`).

- Default: EyeSlash button → `patchAction({ hidden: true })` + invalidate (reuse existing `invalidate()`).
- Hidden variant: button → `patchAction({ hidden: false })`.

Match icon button styling used by Star / GearSix. `title="Hide action"` / `"Show action"`.

**Verify**: `pnpm typecheck` → exit 0

### Step 3: ProjectDetail wiring

- State: `const [showHidden, setShowHidden] = useState(false)` near other view state.
- Toolbar control near the commands panel title/right slot: toggle label `Show hidden` / `Hide hidden`.
- Filter modules:

```ts
const modules = showHidden
  ? p.modules.filter((m) => m.hidden || m.actions.some((a) => a.hidden))
  : p.modules.filter((m) => !m.hidden);
```

(Adjust if a non-hidden module has only hidden actions — when `showHidden`, still show that module so actions can be unhidden. Prefer: when `showHidden`, map all modules but filter actions to `a.hidden`; when not, filter `!mod.hidden` and `!a.hidden` as today.)

Locked behavior detail:

| Mode | Modules shown | Actions shown |
|------|---------------|---------------|
| default | `!mod.hidden` | `!a.hidden` |
| show hidden | all modules that are hidden **or** have ≥1 hidden action | `a.hidden` only |

- Module header: add Hide (default mode) / Unhide (show-hidden mode when `mod.hidden`) calling `api.patchModule`.
- Pass `variant="hidden"` to `ActionRow` in show-hidden mode.

Empty copy when default mode has no visible actions: keep existing empty states; if everything is hidden, add one line: “All commands are hidden. Use Show hidden to restore.”

**Verify**: `pnpm typecheck` && `pnpm lint` → exit 0

### Step 4: Index

Mark plan 037 DONE in `plans/README.md`.

## Test plan

No UI test harness. Manual (operator): hide an action → disappears; Show hidden → Unhide → returns; hide a module in a multi-module project → section disappears; unhide works. `pnpm test` remains green (daemon untouched).

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0
- [ ] `api.patchModule` exists and is used
- [ ] Default Project Detail view never lists `hidden` actions/modules
- [ ] Show-hidden mode can restore both
- [ ] No daemon file changes (unless drift forced a tiny fix — report in PR notes)
- [ ] `plans/README.md` status DONE

## STOP conditions

- `PATCH /modules/:id` returns errors for `hidden` (API regression) — fix only if trivial; otherwise STOP and report.
- “Show hidden” UX seems to require a new Settings page — do not; keep the toggle on Project Detail.
- Tempted to hide from Overview cards differently — out of scope (Overview already filters `!a.hidden`).

## Maintenance notes

- Reviewers: ensure Command Palette / Overview still ignore hidden actions (grep `a.hidden` — already filtered in Dashboard).
- Re-scan must continue to preserve `hidden` (already true in registry upsert).
