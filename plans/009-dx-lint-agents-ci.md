# Plan 009: Add AGENTS.md, lint/format baseline, and minimal CI

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat f1729ab..HEAD -- package.json pnpm-workspace.yaml README.md .github apps/daemon/package.json apps/ui/package.json packages/shared/package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/001-verification-baseline.md (CI should run `pnpm test`)
- **Category**: dx
- **Planned at**: commit `f1729ab`, 2026-07-19

## Why this matters

There is no `.github` CI, no ESLint/Biome/Prettier, and no `AGENTS.md`/`CLAUDE.md`. Agents and humans rediscover pnpm workspace layout, ports (`4400`/`5173`), `CONTROL_*` env vars, and “don’t start long-lived servers” conventions every session. PRs have no remote typecheck/test gate.

## Current state

- Root scripts: `dev`, `build`, `typecheck`, `start` (+ `test` after plan 001).
- No eslint/prettier/biome/editorconfig found at plan time.
- No `.github/workflows`.
- README documents `pnpm install`, `pnpm dev`, `CONTROL_DATA_DIR`, `CONTROL_PORT`.
- User/agent convention in this repo’s operator rules: assume app already running; never start it in automation — encode that in AGENTS.md.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Install   | `pnpm install`     | exit 0              |
| Typecheck | `pnpm typecheck`   | exit 0              |
| Test      | `pnpm test`        | exit 0              |
| Lint      | `pnpm lint`        | exit 0              |

## Scope

**In scope**:
- New `AGENTS.md` at repo root
- Lint/format toolchain (prefer **Biome** single tool for lint+format on TS/TSX/JSON, or ESLint+Prettier if Biome fights Tailwind v4 — pick one and stick to it)
- Root `package.json` scripts: `lint`, optionally `format`
- `.github/workflows/ci.yml` — install, typecheck, test, lint
- Minimal config files for the chosen linter; `.editorconfig` optional
- README one-liner for lint if useful

**Out of scope**:
- Mass reformatting of the entire UI design system in the same PR if it creates a huge unrelated diff — if first `lint --write` touches hundreds of files, either (a) land format in a dedicated commit labeled format-only, or (b) start with `lint` check rules that do not require full reformat. Prefer (a) only if operator accepts; otherwise configure lint with gradual rules.
- Changing product behavior
- Publishing GitHub issues
- Configuring pre-commit hooks (optional mention in AGENTS only)

## Git workflow

- Branch: `advisor/009-dx-lint-agents-ci`
- Commit example: `Add AGENTS.md, Biome lint, and GitHub Actions CI.`
- Do NOT push unless instructed.

## Steps

### Step 1: Write AGENTS.md

Create `AGENTS.md` including at least:

1. What CONTROL is (one paragraph)
2. Workspace packages: `apps/daemon`, `apps/ui`, `apps/shell`, `packages/shared`
3. Package manager: pnpm; Node ≥22
4. Commands: `pnpm install`, `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm dev` (note: **do not start `pnpm dev` in agent sessions unless the user asks** — assume already running)
5. Env: `CONTROL_DATA_DIR`, `CONTROL_PORT`, `CONTROL_HOST` (loopback only — see plan 004)
6. Ports: daemon `4400`, UI Vite `5173`
7. State location: `~/.control/`
8. Point to `DESIGN.md` + `plans/` for intent and advisor plans
9. Native modules: node-pty, better-sqlite3 need build scripts (already in `pnpm-workspace.yaml` allowBuilds)

**Verify**: file exists; `rg -n "pnpm typecheck|CONTROL_DATA_DIR|4400" AGENTS.md` → hits.

### Step 2: Add lint/format

1. Add Biome (recommended) as root devDependency.
2. `biome.json` with formatter + linter for `apps/**/*.ts`, `apps/**/*.tsx`, `packages/**/*.ts`; ignore `node_modules`, `dist`, `apps/shell/src-tauri/gen`, `apps/shell/runtime`.
3. Scripts: `"lint": "biome check ."`, `"format": "biome check --write ."` (or equivalent).
4. Fix **only** issues that block `pnpm lint` in files you must touch — avoid drive-by refactors. If the codebase is too noisy, narrow `biome.json` to `recommended` with noisy rules off until green.

**Verify**: `pnpm lint` → exit 0.

### Step 3: Add CI workflow

Create `.github/workflows/ci.yml`:

- Trigger: pull_request + push to `main`
- Node 22 + pnpm via official actions
- Steps: checkout, pnpm install, `pnpm typecheck`, `pnpm test`, `pnpm lint`
- `cache: pnpm`

Do not require Tauri/MSVC on CI.

**Verify**: YAML validates structurally; locally run the same three commands in order.

### Step 4: README pointer

Add AGENTS.md / `pnpm lint` to README layout or Quick start briefly.

**Verify**: `rg -n "AGENTS.md|pnpm lint" README.md` → hit.

### Step 5: Update index

Mark plan 009 DONE.

## Test plan

- CI commands are the test: typecheck + test + lint
- No new product tests required beyond plan 001 suite remaining green

## Done criteria

- [ ] `AGENTS.md` exists with commands/env/ports
- [ ] `pnpm lint` exits 0
- [ ] `pnpm typecheck` and `pnpm test` exit 0
- [ ] `.github/workflows/ci.yml` runs typecheck, test, lint
- [ ] No Tauri build in CI
- [ ] Scope respected; `plans/README.md` updated

## STOP conditions

- Biome cannot parse Tailwind v4 CSS — exclude `*.css` from Biome and do not block the plan on CSS linting.
- Lint requires reformatting >50 files and operator did not approve a format commit — narrow rules to error-only correctness lint, defer format.
- `pnpm test` missing because plan 001 not done — STOP and do 001 first (dependency).

## Maintenance notes

- Reviewer: ensure CI uses `pnpm/action-setup` + `actions/setup-node` with `cache: pnpm`.
- Follow-up: pre-commit / lefthook optional; not required here.
- When plan 004 lands, keep AGENTS.md CONTROL_HOST loopback note in sync.
