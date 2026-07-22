# Plan 012: Persist per-project port labels and show them on Dashboard / Port Map

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 6dfaefa..HEAD -- packages/shared/src/index.ts apps/daemon/src/db/schema.ts apps/daemon/src/db/index.ts apps/daemon/src/registry.ts apps/daemon/src/ports.ts apps/ui/src/views/ProjectDetail.tsx apps/ui/src/views/Dashboard.tsx apps/ui/src/views/PortsView.tsx DESIGN.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `6dfaefa`, 2026-07-21

## Why this matters

External ports attributed to a project currently display the OS process name (`node`, `python`, …). On a Dashboard project card that means two different services both read as "node" with only the `:3000` / `:4206` chips distinguishing them. Operators already know which port is which; CONTROL should remember a short human label per port **scoped to the project** (e.g. `3000 → frontend`, `4206 → worker`) and use it on the Dashboard and Port Map.

## Current state

- `PortOwner` already has optional `label` / `processName` / `projectId` (`packages/shared/src/index.ts` ~256–267). PortsView renders `o.label ?? o.processName`.
- `getPortMap()` in `apps/daemon/src/ports.ts` sets external `label` to the process name and attributes `projectId` via path matching — **no custom labels**:

```56:80:apps/daemon/src/ports.ts
export async function getPortMap(): Promise<PortOwner[]> {
  // ...
  for (const h of host) {
    if (byPort.has(h.port)) continue
    byPort.set(h.port, {
      port: h.port,
      owner: 'external',
      pid: h.pid,
      processName: h.name,
      label: h.name,
      projectId: pathMatcher(h.cmd) ?? null,
    })
  }
  return [...byPort.values()].sort((a, b) => a.port - b.port)
}
```

- Dashboard external rows ignore `label` and force `processName`:

```75:82:apps/ui/src/views/Dashboard.tsx
  for (const o of externalServices.filter((o) => o.projectId === projectId)) {
    services.push({
      key: `external:${o.port}`,
      name: o.processName ?? 'process',
      kind: 'container',
      status: 'running',
      ports: [o.port],
    });
  }
```

- Projects already store JSON config (`composeProjects`) with `ensureColumn` migration + `PATCH /api/projects/:id` via `patchProjectBodySchema` / `patchProject`. Project Detail has a "Docker compose projects claimed" panel — **mirror that UX** for port labels.
- Run / container `PortOwner`s today omit `projectId` (runs use action name as label; containers use compose service / name). Labels must apply when `projectId` is known; enrich run/container owners with `projectId` so the same overlay works.

**Conventions to match**

- Zod schemas live in `packages/shared/src/index.ts`; daemon maps rows in `toProject` (`apps/daemon/src/registry.ts`).
- Lightweight column adds: `ensureColumn('projects', …)` in `apps/daemon/src/db/index.ts` (see existing `compose_projects` / env id columns).
- UI: `Panel` + `TextInput` + chip remove pattern in `ProjectDetail.tsx` compose-claims block (~130–168).
- Design vocabulary (`DESIGN.md`): unified port map (FR-9); keep attribution precedence (runs > containers > external) unchanged.

**Product decision (locked for this plan)**

- Storage: `projects.portLabels` as `Record<string, string>` (string keys = decimal port numbers, values = short labels). Empty object default.
- Scope: labels are **project config**, not live-only; they persist whether or not the port is listening.
- Overlay: if a `PortOwner.projectId` is set and that project's `portLabels[String(port)]` is a non-empty trimmed string, set `label` to that string (keep `processName` as the OS name).
- Edit surface: **Project Detail only** (no click-to-rename on Dashboard in this plan).
- Do **not** invent labels from action names into `portLabels` automatically.

## Commands you will need

| Purpose   | Command                         | Expected on success      |
|-----------|---------------------------------|--------------------------|
| Typecheck | `pnpm typecheck`                | exit 0                   |
| Tests     | `pnpm test -- ports` (and full) | all pass                 |
| Lint      | `pnpm lint`                     | exit 0                   |

## Scope

**In scope** (the only files you should modify):

- `packages/shared/src/index.ts` — `projectSchema`, `patchProjectBodySchema`
- `apps/daemon/src/db/schema.ts` — drizzle column + `CREATE_TABLES_SQL` for new DBs
- `apps/daemon/src/db/index.ts` — `ensureColumn` for existing DBs
- `apps/daemon/src/registry.ts` — `toProject`, `createProject` defaults, `patchProject`
- `apps/daemon/src/ports.ts` — attach `projectId` on run/container owners; apply `portLabels` overlay
- `apps/daemon/src/ports.test.ts` (create) — characterization of overlay + precedence
- `apps/ui/src/views/ProjectDetail.tsx` — Port labels editor panel
- `apps/ui/src/views/Dashboard.tsx` — use `o.label ?? o.processName` for external service names
- `DESIGN.md` — one short note under port map / project config that projects may store port→label maps
- `plans/README.md` — status row for 012

**Out of scope** (do NOT touch):

- Inline rename / context menu on Dashboard `ProjectModule` service rows
- Changing port scan / WSL2 attribution / `hostPorts.ts`
- Auto-importing labels from `portHint` or action names
- Global (non-project) port labels
- Renaming managed action display names via this field when `projectId` is missing — fix by enriching `projectId`, not by guessing
- PTY / env-files / other direction spikes

## Git workflow

- Branch: `advisor/012-project-port-labels`
- Commit style (from recent history): imperative sentence, e.g. `Add per-project port labels for Dashboard and Port Map.`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Shared schema

In `packages/shared/src/index.ts`:

1. Add to `projectSchema`:
   ```ts
   portLabels: z.record(z.string(), z.string()).default({}),
   ```
2. Add to `patchProjectBodySchema`:
   ```ts
   portLabels: z.record(z.string(), z.string()).optional(),
   ```

Validate keys are positive integer strings when patching: either refine in Zod (`z.record(z.string().regex(/^\d+$/), z.string().trim().min(1).max(64))`) or normalize/reject in `patchProject`. Prefer schema refine so bad bodies 400 via existing parse.

**Verify**: `pnpm --filter @control/shared typecheck` → exit 0

### Step 2: Persist on projects

1. `apps/daemon/src/db/schema.ts` — add column on `projects` table:
   ```ts
   portLabels: text('port_labels', { mode: 'json' })
     .notNull()
     .$type<Record<string, string>>()
     .default(sql`'{}'`),
   ```
   And add `port_labels TEXT NOT NULL DEFAULT '{}'` to `CREATE_TABLES_SQL` projects DDL.
2. `apps/daemon/src/db/index.ts` — `ensureColumn('projects', 'port_labels', "port_labels TEXT NOT NULL DEFAULT '{}'")`
3. `apps/daemon/src/registry.ts`:
   - `toProject`: include `portLabels: r.portLabels ?? {}`
   - `createProject` insert defaults: `portLabels: {}`
   - `patchProject`: if `body.portLabels !== undefined`, set it (after schema already validated)

**Verify**: `pnpm --filter @control/daemon typecheck` → exit 0

### Step 3: Overlay labels in `getPortMap`

In `apps/daemon/src/ports.ts`:

1. When building run owners, resolve `projectId` via `actions.moduleId` → `modules.projectId`. Include `projectId` on the `PortOwner`.
2. When building container owners, set `projectId: c.projectId ?? null` (already on `ContainerInfo`).
3. After the three precedence passes, load all projects' `portLabels` once (small table). For each owner with a non-null `projectId`, if `portLabels[String(port)]` is set, assign `label` to that value.
4. Do **not** change precedence or drop `processName`.

Extract a pure helper if it helps testing, e.g.:

```ts
export function applyProjectPortLabels(
  owners: PortOwner[],
  labelsByProjectId: Map<string, Record<string, string>>,
): PortOwner[]
```

**Verify**: unit tests in Step 4 pass; `pnpm --filter @control/daemon typecheck` → exit 0

### Step 4: Characterization tests

Create `apps/daemon/src/ports.test.ts` (Vitest). Prefer testing the pure helper + thin integration if `getPortMap` is hard without host/Docker — do **not** call real PowerShell.

Cases:

1. External owner with `projectId` + matching label → `label` becomes custom; `processName` unchanged.
2. Owner without `projectId` → label unchanged.
3. Project has no entry for that port → label unchanged.
4. Empty / whitespace-only stored values are treated as absent (if normalize strips them on write, assert write path instead).

Model after existing daemon tests (e.g. `apps/daemon/src/activeRuns.test.ts` — small pure functions).

**Verify**: `pnpm test -- ports` → all pass (including new file)

### Step 5: Project Detail editor

In `apps/ui/src/views/ProjectDetail.tsx`, add a Panel near the compose-claims panel titled e.g. **Port labels**:

- Show each entry as a chip: `3000 · frontend` with ✕ to remove.
- Inputs: port (numeric) + label text; Enter or small Add button merges into `portLabels` via `api.patchProject(projectId, { portLabels: next })`.
- On success invalidate `['tree', projectId]`, `['projects']`, and `['ports']`.
- Copy tone: short help text that these rename how listening ports appear on Overview and Port Map for this project.

Reuse `TextInput` / `Button` / chip styling from the compose-claims block. Do not invent new kit primitives.

**Verify**: `pnpm --filter @control/ui typecheck` → exit 0

### Step 6: Dashboard display

In `apps/ui/src/views/Dashboard.tsx` `buildRuntimeServices`, change external service `name` to:

```ts
name: o.label ?? o.processName ?? 'process',
```

Widen the externalServices type if needed so `label` is included (it already comes from `PortOwner` via `api.ports`).

PortsView already uses `o.label ?? o.processName` — no change required unless types break.

**Verify**: `pnpm typecheck` → exit 0

### Step 7: DESIGN note

In root `DESIGN.md`, near the port map / project fields discussion, add one sentence: projects may store a `portLabels` map (port number → display name) applied when attributing ports to that project. Do not rewrite FR-9.

**Verify**: intentional doc-only; skim for accuracy.

### Step 8: Index + final gates

Update `plans/README.md` status for 012 → `DONE`.

**Verify**:

- `pnpm typecheck` → exit 0
- `pnpm test` → exit 0
- `pnpm lint` → exit 0
- `git status` — only in-scope files (+ plan index)

## Test plan

- New: `apps/daemon/src/ports.test.ts` covering overlay cases listed in Step 4.
- Manual (operator): open Filtra CRM project → set `3000=frontend`, `4206=worker` → Overview card shows those names instead of `node`; Port Map Label column matches; remove a label → falls back to process name.
- Pattern: pure-function tests like `activeRuns.test.ts`.

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0; `ports.test.ts` exists and covers overlay
- [ ] `PATCH /api/projects/:id` with `portLabels` persists and returns on project/tree payloads
- [ ] Dashboard external rows prefer custom `label` over `processName`
- [ ] Port map `label` column shows custom labels when `projectId` matches
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row for 012 updated

## STOP conditions

Stop and report back (do not improvise) if:

- Drift check shows in-scope files no longer match the excerpts above.
- Applying labels appears to require changing Windows port scanning or WSL2 relay attribution.
- `projectSchema` / project PATCH already gained a conflicting `portLabels` (or similarly named) field from another branch.
- UI work seems to require a new modal system or kit primitive beyond the compose-claims pattern.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- Reviewers: ensure empty-string labels cannot sticky-override process names; ensure keys are numeric strings only.
- If Dashboard later adds inline rename, it should PATCH the same `portLabels` map — do not fork storage.
- Env-files plan (spike → future 012 conflict resolved: **this** plan is 012; env-files implementation should take **013** when opened).
- Cross-project port collisions: overlay is scoped by `projectId`; do not apply a project's labels to unattributed external ports.
