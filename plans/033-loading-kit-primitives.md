# Plan 033: Add shared loading primitives to the UI kit

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 81b2809..HEAD -- apps/ui/src/components/kit.tsx apps/ui/src/index.css`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `81b2809`, 2026-07-22

## Why this matters

CONTROL’s industrial bezel UI has good **busy** feedback for actions (rocker amber, button labels like `Saving…`), but **initial query loads** have no shared visual language. Views either show bare `Loading…` text or, worse, flash empty-state copy. Plans 034–035 need a small kit of skeleton / instrument-loading components so every view can show pending without inventing one-off markup.

## Current state

- `apps/ui/src/components/kit.tsx` — shared UI kit (`Led`, `Panel`, `Chip`, `RockerToggle`, …). No `Skeleton`, `ViewLoading`, or panel-level loading helper. Ends around `NavItem` (~L817–841).
- `Led` already supports `status="starting"` + `pulse` (amber pulse) — reuse for loading affordance:

```50:77:apps/ui/src/components/kit.tsx
export function Led({
  status,
  pulse,
  ring,
  className,
}: {
  status: RunStatus | 'idle';
  pulse?: boolean;
  ring?: boolean;
  className?: string;
}) {
  // ...
          pulse && 'animate-pulse',
```

- `apps/ui/src/index.css` — under `@media (prefers-reduced-motion: reduce)`, `.animate-pulse { animation: none !important; }` (~L1064). Skeletons that use `animate-pulse` automatically calm down for reduced-motion users; do not add a second motion system.
- Design language (match existing): `font-ui`, uppercase tracking, `bezel-recessed` / `bg-bezel` / `border-panel-edge`, phosphor/amber LEDs. **Do not** introduce a generic circular spinner, Inter/system fonts, or purple/glow “AI” loaders.
- Repo has **no** React component unit tests under `apps/ui` (Vitest covers daemon/shared only). Do not invent a RTL harness in this plan — verification is typecheck + lint + export presence.

## Commands you will need

| Purpose   | Command              | Expected on success      |
|-----------|----------------------|--------------------------|
| Typecheck | `pnpm typecheck`     | exit 0                   |
| Lint      | `pnpm lint`          | exit 0                   |
| UI types  | `pnpm --filter @control/ui typecheck` | exit 0     |

## Scope

**In scope** (the only files you should modify):
- `apps/ui/src/components/kit.tsx` — add and export loading primitives
- `plans/README.md` — status row for 033 only

**Out of scope** (do NOT touch):
- Any view (`Dashboard`, `PortsView`, `GroupsView`, `DockerView`, `SettingsView`, `ProjectDetail`, `App.tsx`) — wiring is plans **034** and **035**
- `apps/ui/src/index.css` — reuse existing `animate-pulse` / bezel tokens; no new global animation classes unless typecheck somehow requires it (prefer Tailwind utilities already in use)
- Mutation busy labels (`Saving…`, rocker `busy`) — already correct
- New test files / Vitest React setup

## Git workflow

- Branch: `advisor/033-loading-kit-primitives`
- Commit style (from recent history): imperative sentence, e.g. `Add kit Skeleton and ViewLoading for query pending states.`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add `Skeleton`, `ViewLoading`, and `PanelLoading` to kit

In `apps/ui/src/components/kit.tsx`, after `Panel` (or immediately before `NavItem` if that keeps the file clearer), add **exactly these three** exports (names must match — 034/035 will import them):

1. **`Skeleton`** — inert block for layout placeholders:
   - Props: `{ className?: string }`
   - `aria-hidden`
   - Classes: recessed fill that reads as “instrument blank”, e.g. `rounded-md bg-ink-faint/10` (or `bg-panel-edge/40` if that matches nearby panels better — pick one and stay consistent) + `animate-pulse`
   - Compose with `cn()` like other kit components

2. **`ViewLoading`** — full-view / Suspense / early-return pending:
   - Props: `{ label?: string }` default label `"Loading"`
   - `role="status"` + `aria-live="polite"`
   - Layout: horizontal row with `<Led status="starting" pulse ring />` + `font-ui text-sm uppercase tracking-[0.18em] text-ink-dim` label
   - Padding: `p-4` so it can replace today’s bare text in `App` / `ProjectDetail`

3. **`PanelLoading`** — inside a `Panel` body while a list query is pending:
   - Props: `{ rows?: number }` default `4`
   - `role="status"` + `aria-label="Loading"` (or live region)
   - Renders `rows` of `<Skeleton className="h-10 w-full" />` in a vertical `space-y-2` stack (optionally one narrower trailing skeleton for visual rhythm)

Do **not** add a fourth primitive here (e.g. project-card skeleton) — that belongs in plan 035 if needed, optionally as `ProjectModule` `variant="loading"` in that plan’s scope.

**Verify**: `rg -n "export function (Skeleton|ViewLoading|PanelLoading)" apps/ui/src/components/kit.tsx` → three matches.

### Step 2: Typecheck and lint

**Verify**: `pnpm --filter @control/ui typecheck` → exit 0  
**Verify**: `pnpm lint` → exit 0 (fix any Biome issues in `kit.tsx` only)

## Test plan

- No new automated tests (no UI Vitest harness). Manual check deferred to 034/035 wiring.
- Executor confirms symbols are exported and typecheck passes.

## Done criteria

- [ ] `Skeleton`, `ViewLoading`, and `PanelLoading` are exported from `apps/ui/src/components/kit.tsx`
- [ ] `pnpm --filter @control/ui typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row for 033 → `DONE`

## STOP conditions

Stop and report back (do not improvise) if:

- `kit.tsx` no longer exports `Led` / `Panel` / `cn` usage as described (drift).
- Satisfying the design seems to require a new dependency (spinner library, Framer Motion, etc.) — refuse; CSS + existing `Led` only.
- You believe views must be wired in this same PR — they must not; stop and wait for 034/035.

## Maintenance notes

- Reviewers: primitives must stay visually quiet and match bezels; reject generic spinners.
- Future list views should import `PanelLoading` / `ViewLoading` instead of inventing `Loading…` text.
- Plans **034** and **035** consume these exports; renaming them after merge will break those plans’ instructions.
