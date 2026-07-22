# Plan 036: Import `.claude/launch.json` as detected actions

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 81b2809..HEAD -- apps/daemon/src/scanner.ts apps/daemon/src/scanner.test.ts DESIGN.md plans/spikes/detection-markers.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `81b2809`, 2026-07-22

## Why this matters

DESIGN §6 lists `.claude/launch.json` as the **highest-confidence** detection signal (explicit dev-server config). The scanner never reads it, so Claude Code–configured repos still depend on noisy `package.json` script heuristics. Importing launch configurations gives reliable primary actions with port hints and stable `naturalKey`s, with almost no false positives.

## Current state

- Detection lives in `detectModuleAt` in `apps/daemon/src/scanner.ts`. Makefile is the exemplar for “parse file → push actions”:

```193:206:apps/daemon/src/scanner.ts
  // --- Makefile ---
  const makefile = join(dir, 'Makefile')
  if (existsSync(makefile)) {
    stacks.push({ kind: 'make', confidence: 0.9 })
    for (const target of parseMakeTargets(makefile)) {
      actions.push({
        naturalKey: `${keyPrefix}:make:${target}`,
        name: `make ${target}`,
        command: `make ${target}`,
        type: 'script',
        primary: PRIMARY_RE.test(target),
      })
    }
  }
```

- Module is dropped if `stacks.length === 0` at end of `detectModuleAt` (`if (stacks.length === 0) return null`). Any launch-only directory **must** push a stack entry or the module (and its actions) disappear.
- Re-scan upserts by `naturalKey` and preserves user edits (`registry.ts` scan loop). New keys must be stable.
- Tests: `apps/daemon/src/scanner.test.ts` uses `makeProject` + `scanProject`.
- Spike: `plans/spikes/detection-markers.md` — first PR is `.claude/launch.json` only (not justfile / workspace globs / Expo).

**Observed Claude Code `launch.json` shape** (from public issues; not a committed fixture in-repo):

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "my-app",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "port": 3000
    }
  ]
}
```

Optional fields seen in the wild: `cwd`, `env`, `autoPort`, `url` (url-only = external preview — **skip** those entries).

**Product decisions (locked)**

1. Look for `.claude/launch.json` under the **module directory** being detected (same as other markers).
2. On success: `stacks.push({ kind: 'claude-launch', confidence: 1 })`.
3. For each configuration with a non-empty `name` and a usable command:
   - `naturalKey`: `${keyPrefix}:claude-launch:${slug}` where `slug` is the config `name` with characters outside `[A-Za-z0-9._-]` replaced by `-`
   - `name`: config `name` (display)
   - `command`: shell-join `runtimeExecutable` + `runtimeArgs` (string args only). On Windows, do **not** special-case `.cmd` here — supervisor already handles shim resolution for spawn.
   - `type`: `'script'`
   - `primary`: `true` (these are explicit dev servers)
   - `portHint`: numeric `port` when present and positive; else omit
4. Skip entries that lack `runtimeExecutable` (including url-only). Skip malformed JSON entirely (no stack, no throw).
5. Do **not** import `env` from launch.json into `envOverrides` (user can use plan 032 / overrides). Do **not** honor `cwd` from the file beyond documenting it — spawn cwd remains the module path (STOP if you believe this blocks real repos; report rather than inventing per-action cwd from launch.json).
6. Do **not** implement workspace glob expansion, justfile targets, or Expo expansions in this plan.

## Commands you will need

| Purpose   | Command                         | Expected on success |
|-----------|---------------------------------|---------------------|
| Typecheck | `pnpm typecheck`                | exit 0              |
| Tests     | `pnpm test -- scanner`          | all pass            |
| Lint      | `pnpm lint`                     | exit 0              |

## Scope

**In scope**:

- `apps/daemon/src/scanner.ts` — parse + detect `.claude/launch.json`
- `apps/daemon/src/scanner.test.ts` — fixtures for happy path, skip url-only, invalid JSON, portHint
- `DESIGN.md` — marker table row: mark `.claude/launch.json` as implemented (brief)
- `plans/spikes/detection-markers.md` — note launch.json done; remaining rows still open
- `plans/README.md` — status

**Out of scope**:

- `justfile` target parsing, Expo/`metro`, android/ios native rows
- pnpm/turbo/nx/lerna workspace expansion
- Writing or validating launch.json for the user
- UI changes (detection-only; actions appear after scan via existing tree)
- Importing launch `env` into CONTROL envOverrides

## Git workflow

- Branch: `advisor/036-claude-launch-json`
- Commit message example: `Detect .claude/launch.json as primary actions.`
- Do NOT push/PR unless asked

## Steps

### Step 1: Parser helper inside `scanner.ts`

Add `parseClaudeLaunchActions(dir: string, keyPrefix: string): { stack: boolean; actions: DetectedAction[] }` (or equivalent private helpers). Read `join(dir, '.claude', 'launch.json')`. Use existing `readJson`.

Build command safely: only accept `runtimeExecutable` as string; `runtimeArgs` as array of strings (ignore non-strings). Join with spaces; if an arg contains whitespace, wrap in double quotes (simple).

**Verify**: no runtime yet — proceed to tests in Step 2.

### Step 2: Call from `detectModuleAt`

Near other markers (after package.json or before the empty-stacks return), merge stack + actions. Ensure launch-only modules get a stack so they are not `return null`.

**Verify**: `pnpm test -- scanner` after Step 3.

### Step 3: Characterization tests

Using `makeProject`, write files under `.claude/launch.json` (create dirs with `mkdirSync` like the flutter test).

Cases:

1. Two configs → two actions with expected `naturalKey`s, `primary: true`, commands `npm run dev` style
2. `port: 3000` → `portHint === 3000`
3. url-only config → no action from that entry
4. invalid JSON → module may still detect other markers; launch adds nothing; scan does not throw
5. launch.json alone (no package.json) → still one module with `claude-launch` stack and actions

**Verify**: `pnpm test -- scanner` → all pass including new cases

### Step 4: Docs + index

Update DESIGN marker table / backlog label for `.claude/launch.json`. Spike file: mark item 1 done. README status → DONE.

**Verify**: `pnpm typecheck` && `pnpm lint` → exit 0

## Test plan

All new coverage in `scanner.test.ts` as listed in Step 3. No daemon registry integration test required — naturalKey upsert is existing behavior.

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test -- scanner` (and full `pnpm test`) exits 0
- [ ] `pnpm lint` exits 0
- [ ] `rg -n "claude-launch|launch\\.json" apps/daemon/src/scanner.ts` shows implementation
- [ ] No files outside in-scope list modified
- [ ] `plans/README.md` status DONE

## STOP conditions

- Real launch.json in the wild uses a radically different top-level shape (not `configurations` array) and tests cannot be written honestly — STOP and report with a sample path/shape (no secrets).
- Implementing correctly seems to require per-config `cwd` different from the module path — STOP; do not silently ignore a required cwd without reporting.
- Tempted to also implement workspace globs “while here” — out of scope.

## Maintenance notes

- Reviewers: naturalKey stability — renaming a config `name` creates a new action and drops the old on re-scan (same as Makefile targets). Acceptable.
- Follow-ups: workspace glob expansion (spike item 2), justfile targets (item 3).
