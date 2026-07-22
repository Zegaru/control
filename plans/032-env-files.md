# Plan 032: Per-action `.env` file selection at spawn

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 81b2809..HEAD -- packages/shared/src/index.ts apps/daemon/src/db/schema.ts apps/daemon/src/db/index.ts apps/daemon/src/supervisor.ts apps/daemon/src/registry.ts apps/daemon/src/routes.ts apps/ui/src/api.ts apps/ui/src/components/ActionEditor.tsx DESIGN.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `81b2809`, 2026-07-22

## Why this matters

Real projects put secrets and local config in `.env` / `.env.local`. CONTROL today only merges `process.env`, an optional start-body environment map (`runtimeEnv`), and per-action `envOverrides` typed into the UI. Operators either duplicate those keys into overrides or rely on the ambient shell — both fight the product promise of one-click start from a cold daemon. DESIGN §12 deferred this past MVP; the env-files spike recommends shipping it next.

## Current state

- Spawn env merge (`apps/daemon/src/supervisor.ts`):

```260:269:apps/daemon/src/supervisor.ts
  private buildEnv(action: Action, runtimeEnv?: Record<string, string>): Record<string, string> {
    const env: Record<string, string> = {}
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined) env[k] = v
    }
    if (runtimeEnv) Object.assign(env, runtimeEnv)
    if (action.envOverrides) Object.assign(env, action.envOverrides)
    // Nudge tools toward emitting color even though stdout is a pipe.
    env.FORCE_COLOR = env.FORCE_COLOR ?? '1'
    return env
  }
```

- Action schema has `envOverrides` but **no** `envFiles` (`packages/shared/src/index.ts` `actionSchema` / `patchActionBodySchema`; `apps/daemon/src/db/schema.ts` `actions` table).
- Column adds for existing DBs use `ensureColumn` in `apps/daemon/src/db/index.ts` (see `port_labels` pattern).
- Re-scan preserves user fields and must also preserve `envFiles` once added (`apps/daemon/src/registry.ts` ~290–296 upsert comment lists `envOverrides`, `healthUrl`, `portHint` — extend that comment + `toAction` / `patchAction`).
- UI edits overrides as `KEY=value` lines in `apps/ui/src/components/ActionEditor.tsx` (~110–118); no file picker.
- `resolveActionCwd(action)` in `registry.ts` returns the absolute module directory used as spawn cwd.

**Product decisions (locked)**

1. **Storage**: `actions.env_files` JSON column → `envFiles: string[]` on the Action (relative **basenames or module-relative posix paths** like `.env.local` or `config/.env` — see security). Default `[]` / omit empty.
2. **Merge order**: `process.env` → each selected env file (in array order) → `runtimeEnv` (start body / project environment) → `action.envOverrides` → `FORCE_COLOR` nudge. Later layers win.
3. **Discovery**: top-level files in the action cwd whose names match `/^\.env(\..+)?$/` (e.g. `.env`, `.env.local`, `.env.development`). No recursive walk.
4. **UI**: ActionEditor checkbox list of discovered candidates + persist selection on Save via `patchAction`. Empty selection clears `envFiles` to `[]` or `null` (treat both as none).
5. **Parsing**: hand-rolled dotenv subset in a new `apps/daemon/src/envFile.ts` — no new npm dependency. Support: blank lines, `#` comments, `KEY=value`, optional single/double quotes around values, ignore `export ` prefix. Do **not** expand `${VAR}` interpolations in v1.
6. **Security**: resolve each path with `path.resolve(cwd, rel)`; reject if the resolved path is outside the **project root** (not merely cwd). Reject any `rel` containing `..` segments after normalize. Never log file contents.
7. **Secrets in UI**: NFR-8 — do not display parsed file values; only show filenames selected. Existing envOverrides textarea behavior unchanged (already shows values the user typed).

**DESIGN vocabulary**: DESIGN.md §12 “Env file handling”; NFR-8 secrets hygiene (mask overrides in UI by default is aspirational — do not expand masking scope here).

**Conventions**

- Zod in `packages/shared`; drizzle + `ensureColumn` + `CREATE_TABLES_SQL` together.
- Characterization tests with Vitest under `apps/daemon/src/*.test.ts` (model after `scanner.test.ts` / `ports.test.ts`).
- Commit style: imperative sentence, e.g. `Add per-action .env file loading at spawn.`

## Commands you will need

| Purpose   | Command                                      | Expected on success |
|-----------|----------------------------------------------|---------------------|
| Typecheck | `pnpm typecheck`                             | exit 0              |
| Tests     | `pnpm test -- envFile` then `pnpm test`      | all pass            |
| Lint      | `pnpm lint`                                  | exit 0              |

## Scope

**In scope** (the only files you should modify):

- `packages/shared/src/index.ts` — `actionSchema`, `createActionBodySchema`, `patchActionBodySchema`
- `apps/daemon/src/db/schema.ts` — column + `CREATE_TABLES_SQL`
- `apps/daemon/src/db/index.ts` — `ensureColumn('actions', 'env_files', …)`
- `apps/daemon/src/envFile.ts` (create) — parse, list candidates, safe resolve+load
- `apps/daemon/src/envFile.test.ts` (create)
- `apps/daemon/src/supervisor.ts` — `buildEnv` loads `action.envFiles`
- `apps/daemon/src/registry.ts` — `toAction`, `patchAction`, `createAction`, re-scan preserve note; optional `listEnvFileCandidatesForAction`
- `apps/daemon/src/routes.ts` — `GET /actions/:id/env-files` → `{ candidates: string[] }`
- `apps/ui/src/api.ts` — `envFileCandidates(id)`, patch body typing via shared
- `apps/ui/src/components/ActionEditor.tsx` — candidate checkboxes + save `envFiles`
- `DESIGN.md` — §12: mark env-file selection as shipped (one short sentence; do not rewrite the section)
- `plans/README.md` — status row
- `plans/spikes/env-files.md` — one-line “implemented in 032” note at top (optional)

**Out of scope**:

- Secret scrubbing in logs / ring buffers
- Recursive `.env` discovery, direnv, `dotenv-expand`
- Auto-selecting `.env.local` without user choice
- Changing project **environments** CRUD or power-start selection UX
- Compose/container env files
- Plans 036–038 (may also touch `ActionEditor` — serialize if stacking)

## Git workflow

- Branch: `advisor/032-env-files`
- Commit per logical unit; do NOT push/PR unless asked

## Steps

### Step 1: Shared schema + DB column

Add `envFiles: z.array(z.string().min(1)).nullable().optional()` to `actionSchema`, `createActionBodySchema`, and `patchActionBodySchema`.

Add drizzle column `envFiles: text('env_files', { mode: 'json' }).$type<string[]>()` and the same in `CREATE_TABLES_SQL` as `env_files TEXT`. Call `ensureColumn('actions', 'env_files', 'env_files TEXT')`.

Wire `toAction` / `createAction` / `patchAction` to read/write it (default `null` or `[]` — pick one and stay consistent; prefer `null` when empty like `envOverrides`).

**Verify**: `pnpm typecheck` → exit 0 (may fail until supervisor/UI updated — finish Step 2–3 before requiring green if needed; prefer keeping compile green by stubbing `envFiles` through the stack in this step).

### Step 2: `envFile.ts` + tests

Implement and export:

- `parseDotEnv(content: string): Record<string, string>`
- `listEnvFileCandidates(cwd: string): string[]` — sorted basenames matching `/^\.env(\..+)?$/`
- `loadActionEnvFiles(projectRoot: string, cwd: string, relPaths: string[]): Record<string, string>` — resolve+read+parse in order; skip missing files silently; throw `HttpError(400, …)` on path escape

**Verify**: `pnpm test -- envFile` → new tests pass for: basic parse, comments, quotes, candidate listing, `..` rejection, outside-root rejection, merge order of two files.

### Step 3: Supervisor merge

In `buildEnv`, after copying `process.env` and **before** `runtimeEnv`:

```ts
const fileEnv = loadActionEnvFiles(projectRoot, cwd, action.envFiles ?? [])
Object.assign(env, fileEnv)
```

You need `projectRoot` + cwd: use `resolveActionCwd(action)` and look up the project via the action’s module (same pattern as `getRunMeta` / existing helpers in `supervisor.ts`). If cwd/root cannot be resolved, skip file load (do not throw at spawn).

**Verify**: unit-test `loadActionEnvFiles` thoroughly; optional thin test that documents merge order in `envFile.test.ts` comments. Full `pnpm test` still green.

### Step 4: Candidates API

`GET /api/actions/:id/env-files` → `{ candidates: string[] }` using cwd from `resolveActionCwd`. 404 if action missing.

Add `api.envFileCandidates(id)` in the UI client.

**Verify**: `pnpm typecheck` → exit 0

### Step 5: ActionEditor UI

When the modal opens, fetch candidates. Render a short “Env files” section with checkboxes (filename only). Initialize checked state from `action.envFiles ?? []`. On Save, include `envFiles: checked` (or `null` if none) in `patchAction`.

Keep the existing KEY=value overrides textarea below; label it so it’s clear overrides win over files.

**Verify**: `pnpm typecheck` && `pnpm lint` → exit 0

### Step 6: Docs + index

Update DESIGN §12 bullet to note per-action env file selection is implemented (picker + merge order). Update `plans/README.md` status for 032 → DONE.

**Verify**: `rg -n "env file|envFiles" DESIGN.md` shows the shipped note; README status cell is DONE.

## Test plan

New `apps/daemon/src/envFile.test.ts`:

- parse: `FOO=bar`, `# comment`, `export FOO=bar`, `FOO="b a r"`, empty lines
- candidates: only `.env*` basenames; ignore `env.txt`
- security: `../.env` rejected; absolute path rejected; path escaping project root rejected
- load order: file A then file B → B wins on duplicate keys

No UI Vitest harness — manual check: ActionEditor shows candidates for a module with `.env.local`, save, start action, confirm process sees vars (operator may verify mentally / with a throwaway `node -e "console.log(process.env.FOO)"` custom action).

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0; `envFile` tests exist and pass
- [ ] `pnpm lint` exits 0
- [ ] Spawn merge order is process → files → runtimeEnv → overrides
- [ ] Path traversal cannot read outside project root
- [ ] Re-scan does not wipe `envFiles`
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated to DONE

## STOP conditions

- `buildEnv` signature or start route no longer passes `runtimeEnv` as assumed.
- Adding a column requires a full migration framework beyond `ensureColumn` (unexpected).
- Fix appears to need a new npm `dotenv` dependency to meet requirements — STOP; hand-parse is mandatory for this plan.
- You need to touch compose/Docker env to make host actions work — out of scope; report instead.

## Maintenance notes

- Reviewers: scrutinize path containment on Windows (`path.relative` / case folding).
- If env-files later gain `${}` expansion, keep it opt-in — expansion + ambient `process.env` is a footgun.
- Plans **038** also edits `ActionEditor` — land 032 first or rebase carefully.
- Follow-up (not this plan): mask `envOverrides` values in UI (NFR-8).
