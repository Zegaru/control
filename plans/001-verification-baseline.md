# Plan 001: Add a one-command verification baseline with characterization tests

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat f1729ab..HEAD -- package.json pnpm-workspace.yaml apps/daemon/package.json apps/daemon/src/scanner.ts apps/daemon/src/health.ts apps/daemon/src/ports.ts packages/shared/package.json packages/shared/src/index.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `f1729ab`, 2026-07-19

## Why this matters

CONTROL has zero automated tests and no `pnpm test` script. The product is a process supervisor (start/stop/adopt/ports/groups); every later plan touches that surface. Without a harness and a few characterization tests on pure modules, executors cannot prove they did not break FR-11, port precedence, or scan ignore rules. This plan establishes Vitest at the workspace root, wires `pnpm test`, and lands the first pure-unit tests that later plans extend.

## Current state

- Root `package.json` scripts are only `dev` / `build` / `typecheck` / `start` — no `test`, no lint.
- Package manager: **pnpm** (`packageManager: "pnpm@11.5.3"`), workspace via `pnpm-workspace.yaml`.
- Verification today: `pnpm typecheck` (passes as of plan writing).
- Pure, high-value modules with no I/O (or injectable I/O):
  - `apps/daemon/src/scanner.ts` — exports `matchesIgnore` (lines 34–46)
  - `apps/daemon/src/health.ts` — `isPortListening` / `isHttpHealthy` (network; prefer testing URL allowlist helpers once plan 004 lands, or skip health network tests here)
  - `packages/shared/src/index.ts` — Zod schemas + `isActiveStatus` / `ACTIVE_RUN_STATUSES`
- No existing test files to copy; invent Vitest layout consistent with monorepo.

`matchesIgnore` excerpt (`apps/daemon/src/scanner.ts`):

```ts
export function matchesIgnore(entryName: string, relPosix: string, patterns: string[]): boolean {
  for (const raw of patterns) {
    const p = raw.trim()
    if (!p) continue
    if (!p.includes('*') && !p.includes('?') && !p.includes('/')) {
      if (entryName === p) return true
    40|      continue
    }
    // ...glob To RegExp...
  }
  return false
}
```

Shared status helpers (`packages/shared/src/index.ts:28-50`):

```ts
export const runStatusSchema = z.enum([
  'starting', 'running', 'healthy', 'unhealthy',
  'exited', 'failed', 'killed', 'adopted',
])
export const ACTIVE_RUN_STATUSES: RunStatus[] = [
  'starting', 'running', 'healthy', 'unhealthy', 'adopted',
]
export function isActiveStatus(status: RunStatus): boolean {
  return ACTIVE_RUN_STATUSES.includes(status)
}
```

**Conventions**: TypeScript ESM (`"type": "module"`), imports use `.js` extension in daemon source. Prefer Vitest in Node environment. Commit messages are imperative sentences (e.g. `Add host and per-project CPU/MEM metrics to dashboard gauges.`).

**Design constraint** (from `DESIGN.md`): daemon owns state; tests should not require a running daemon or Docker for this plan.

## Commands you will need

| Purpose   | Command                         | Expected on success      |
|-----------|---------------------------------|--------------------------|
| Install   | `pnpm install`                  | exit 0                   |
| Typecheck | `pnpm typecheck`                | exit 0, no errors        |
| Tests     | `pnpm test`                     | exit 0, all pass         |
| Filter    | `pnpm test -- matchesIgnore`    | matching tests pass      |

## Scope

**In scope**:
- Root `package.json` (add `test` script + vitest/devDependency)
- New Vitest config at repo root (e.g. `vitest.config.ts`)
- New test files under `apps/daemon/src/**/*.test.ts` and/or `packages/shared/src/**/*.test.ts`
- Optionally `apps/daemon/package.json` / `packages/shared/package.json` if workspace-filtered scripts are cleaner — prefer root `pnpm test` that runs all packages

**Out of scope**:
- Live node-pty / dockerode / PowerShell integration tests
- ESLint/Biome (plan 009)
- CI workflow (plan 009; may reference `pnpm test` once this lands)
- Refactors of scanner/supervisor production code beyond exporting a tiny helper if required for testability (prefer testing existing exports)

## Git workflow

- Branch: `advisor/001-verification-baseline`
- Commit style: imperative sentence, e.g. `Add Vitest baseline and scanner characterization tests.`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add Vitest to the workspace

1. From repo root, add Vitest as a root `devDependency` (compatible with Node ≥22 / Vite 6 already in UI).
2. Add root script: `"test": "vitest run"`.
3. Add `vitest.config.ts` at root that:
   - `environment: 'node'`
   - includes `apps/**/src/**/*.test.ts` and `packages/**/src/**/*.test.ts`
   - resolves workspace package `@control/shared` (Vite/vitest default usually works with pnpm)

**Verify**: `pnpm test` → exits 0 with “no test files found” or equivalent empty-suite success (or fail only because zero files — if Vitest errors on zero files, proceed immediately to Step 2).

### Step 2: Characterization tests for `matchesIgnore`

Create `apps/daemon/src/scanner.test.ts` importing `{ matchesIgnore }` from `./scanner.ts` (or `./scanner.js` if the project requires `.js` in imports — match how other daemon files import).

Cases (minimum):
1. Exact basename match: `node_modules` with pattern `node_modules` → true
2. Glob `**/.git/**` or `.git` style patterns used by `DEFAULT_IGNORE_GLOBS` from `@control/shared` — assert at least one real default pattern ignores a typical path
3. Non-match: `src` against `node_modules` → false
4. Empty / whitespace patterns ignored

**Verify**: `pnpm test -- scanner` → all pass.

### Step 3: Characterization tests for shared run-status helpers

Create `packages/shared/src/status.test.ts` (or `index.test.ts`) covering:
1. `isActiveStatus('healthy')` / `'adopted'` → true
2. `isActiveStatus('exited')` / `'failed'` / `'killed'` → false
3. `ACTIVE_RUN_STATUSES` includes `unhealthy` and `adopted`

Optional: one Zod parse happy-path for `runStatusSchema` / a small body schema.

**Verify**: `pnpm test` → all pass; `pnpm typecheck` → exit 0.

### Step 4: Document the command in root README (one line)

In `README.md` Quick start / Run pieces section, add:

```bash
pnpm test             # vitest characterization suite
```

**Verify**: `rg -n "pnpm test" README.md` → at least one hit.

### Step 5: Update plan index

Set plan 001 status to DONE in `plans/README.md`.

**Verify**: `rg -n "001.*DONE" plans/README.md` → match.

## Test plan

- New: `apps/daemon/src/scanner.test.ts` — ignore matching cases above
- New: `packages/shared/src/status.test.ts` — active status cases above
- No prior test pattern exists; keep tests flat and dependency-free
- Verification: `pnpm test` → all pass (≥6 assertions across files)

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0 with real tests (not an empty suite)
- [ ] Root `package.json` has `"test": "vitest run"` (or equivalent that runs the suite once)
- [ ] README mentions `pnpm test`
- [ ] No production behavior changes except optional trivial exports
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- Vitest cannot resolve `@control/shared` after two config attempts — stop and report (do not rewrite the shared package layout).
- You feel pressure to add Docker/PTY tests — those belong in later plans; stop expanding scope.
- `pnpm typecheck` starts failing due to Vitest types — fix via `vitest/globals` types or explicit imports; if still broken after two tries, STOP.

## Maintenance notes

- Plans 002–006 should add tests next to the modules they change (`reconcile.test.ts`, `groupRunner.test.ts`, etc.).
- Prefer pure functions; when testing supervisor, inject `pidAlive` / kill helpers rather than spawning real processes.
- Reviewer: reject any PR that adds a test script but zero assertions.
