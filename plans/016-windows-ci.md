# Plan 016: Run CI on Windows as well as Ubuntu

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 5cb94aa..HEAD -- .github/workflows/ci.yml package.json pnpm-workspace.yaml vitest.config.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (soft: README Platforms in plan 014 may mention CI afterward)
- **Category**: dx
- **Planned at**: commit `5cb94aa`, 2026-07-22

## Why this matters

CONTROL is **Windows-first** (DESIGN NFR-1). CI today runs only on `ubuntu-latest`, so the primary OS never compiles native modules or runs tests in GitHub Actions. Linux-green PRs can still break Windows-specific paths (`hostPorts.ts`, ConPTY assumptions, path handling). For an open-source release, contributors need a signal that Windows is actually verified.

## Current state

`.github/workflows/ci.yml` (full file at plan time):

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 11.5.3

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install
        run: pnpm install

      - name: Typecheck
        run: pnpm typecheck

      - name: Test
        run: pnpm test

      - name: Lint
        run: pnpm lint
```

- Native modules allowed to build: `better-sqlite3`, `node-pty` (`pnpm-workspace.yaml`).
- `getHostListeningPorts` returns `[]` on non-Windows (`apps/daemon/src/hostPorts.ts`) — tests must already tolerate that or be Windows-gated; do not expand product scope here.
- Shell/Tauri build is **out of scope** for this CI plan (slow; needs Rust + MSVC). JS monorepo verify only.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Local verify | `pnpm typecheck && pnpm test && pnpm lint` | exit 0 |
| Workflow lint (optional) | visual YAML review | valid Actions syntax |

## Scope

**In scope**:
- `.github/workflows/ci.yml` — add a Windows job (matrix or second job)
- Only if required to get Windows green: tiny test skips / path fixes that are clearly CI-environment bugs (document in PR). Prefer fixing the workflow (MSVC, pnpm config) over weakening tests.
- Optional one-line README note under Platforms: “CI: `ubuntu-latest` + `windows-latest`” if README already has Platforms (plan 014)

**Out of scope**:
- Building `apps/shell` / Tauri / NSIS in CI
- macOS CI runners
- Code signing / release uploads
- Changing product behavior of port scanning on Linux
- Adding Docker-in-Docker service containers unless a test already requires Docker (current suite should not)

## Git workflow

- Branch: `advisor/016-windows-ci`
- Commit example: `Run typecheck, tests, and lint on Windows CI.`
- Do NOT push unless instructed. **Note:** Windows job correctness is only fully proven after push to GitHub Actions; locally on Windows, run the same pnpm commands.

## Steps

### Step 1: Expand the workflow to a matrix

Replace the single `verify` job with a matrix (preferred) **or** two nearly identical jobs. Requirements:

- `runs-on: ${{ matrix.os }}` with `os: [ubuntu-latest, windows-latest]`
- Keep Node 22 + pnpm 11.5.3 + `cache: pnpm`
- Steps remain: checkout → pnpm/action-setup → setup-node → `pnpm install` → `pnpm typecheck` → `pnpm test` → `pnpm lint`
- On Windows runners, native module compile needs the default Visual Studio generators that GitHub’s `windows-latest` image already provides — do **not** add a full VS install action unless install fails; if `pnpm install` fails compiling `better-sqlite3` / `node-pty`, then add the minimal documented fix (often `strategy.fail-fast: false` plus ensuring build tools). Prefer:

```yaml
strategy:
  fail-fast: false
  matrix:
    os: [ubuntu-latest, windows-latest]
```

so one OS failure doesn’t cancel the other mid-diagnosis.

**Verify (local YAML)**: `rg -n "windows-latest|matrix" .github/workflows/ci.yml` → hits. Confirm `ubuntu-latest` retained.

### Step 2: Windows shell / path caveats

- Prefer `run: pnpm …` without bash-only constructs.
- Do not use `shell: bash` unless necessary; default PowerShell on Windows is fine for simple `pnpm` commands.
- Avoid `working-directory` paths with assumptions that break on `\`.

**Verify**: workflow file contains no `&&`-heavy bash that isn’t portable — GitHub Actions `run` with multiple commands should use separate `run` steps (already the case) or a matrix-safe approach.

### Step 3: Local confirmation

On the executor machine:

```bash
pnpm typecheck
pnpm test
pnpm lint
```

All must exit 0. If the executor is on Windows, that is strong signal; if on Linux/macOS, still require the workflow matrix change and note that Actions must confirm Windows.

**Verify**: commands above exit 0.

### Step 4: README Platforms touch (optional)

If `README.md` has a **Platforms** section, add one sentence that CI runs on Ubuntu and Windows for `typecheck` / `test` / `lint`. Do not claim full product E2E coverage.

**Verify**: if edited, `rg -n "windows-latest|Windows CI|CI:" README.md` → hit.

## Test plan

- No new unit tests required.
- After merge/push, confirm GitHub Actions shows two OS results green.
- If Windows fails on native compile: capture the log, apply the smallest toolchain fix in the workflow, re-run — do not delete native deps.

## Done criteria

- [ ] `.github/workflows/ci.yml` runs verify on `ubuntu-latest` and `windows-latest`
- [ ] `fail-fast: false` (or equivalent) so both OSes report
- [ ] Local `pnpm typecheck`, `pnpm test`, `pnpm lint` still pass
- [ ] No Tauri/shell build added to CI
- [ ] `plans/README.md` status row for 016 → DONE

## STOP conditions

- Windows job requires substantial product code changes (not just CI/toolchain) — stop and report; open a follow-up rather than silently skipping half the suite.
- `pnpm install` on Windows CI fails for reasons that suggest `pnpm-workspace.yaml` allowBuilds regression — fix allowlist, don’t disable native modules.
- Operator asks to drop Ubuntu — keep both unless explicitly overridden.

## Maintenance notes

- Windows runners are slower/costlier; keep the job to install + typecheck + test + lint.
- When shell release CI is added later, use a separate workflow (Rust cache, signing secrets).
- Characterization tests that shell out to PowerShell should stay Windows-only (`process.platform === 'win32'`) — don’t force them on Ubuntu.
