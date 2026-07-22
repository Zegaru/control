# Plan 041: Add `test:watch` and a clear CONTRIBUTING / AGENTS dev-loop section

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat f47f402..HEAD -- package.json CONTRIBUTING.md AGENTS.md README.md biome.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: **039** (daemon watch wording), soft on **040** (env /
  `.control-dev-port` / `CONTROL_DAEMON_URL` — quote AGENTS if 040 landed)
- **Category**: dx
- **Planned at**: commit `f47f402`, 2026-07-22

## Why this matters

Contributors get `pnpm install` → `pnpm dev` but no written “edit → feedback”
loop. Tests only expose `vitest run` (no watch script). CONTRIBUTING claims
“Biome formats/lints the tree” while `biome.json` has `"formatter": {
"enabled": false }` — misleading. This plan adds `test:watch` / `lint:fix`
scripts and a short, accurate Dev loop section so clone-to-develop matches
reality after **039**/**040**.

## Current state

- Root scripts (`package.json:12-21`):

```json
"test": "vitest run",
"lint": "biome check .",
```

  No `test:watch`, no `lint:fix`.

- Vitest config (`vitest.config.ts`) already includes
  `apps/**/src/**/*.test.ts` and `packages/**/src/**/*.test.ts` — `vitest`
  with no subcommand enters watch in a TTY; for scripts use
  `"test:watch": "vitest"` (Vitest 4 default watch when not `run`).
- Biome (`biome.json:35-37`): formatter **disabled**; assist disabled.
  Linter correctness preset only.
- CONTRIBUTING (`CONTRIBUTING.md:41-46`):

```markdown
- Keep diffs focused; match existing style (Biome formats/lints the tree)
```

- CONTRIBUTING Setup is only `pnpm install` / `pnpm dev` — no HMR, daemon
  restart, or test watch guidance.
- AGENTS.md Commands list `pnpm test` but not watch; after **039** should
  mention daemon watch; after **040** env table includes
  `CONTROL_DAEMON_URL` / `CONTROL_DEV`.
- Commit style: imperative sentence.

## Commands you will need

| Purpose    | Command                         | Expected on success        |
|------------|---------------------------------|----------------------------|
| Typecheck  | `pnpm typecheck`                | exit 0                     |
| Tests once | `pnpm test`                     | exit 0                     |
| Lint       | `pnpm lint`                     | exit 0                     |
| Lint write | `pnpm lint:fix` (after add)   | exit 0 (or only pre-existing issues — see STOP) |

Do not leave `vitest` watch running in CI/automation; do not start `pnpm dev`
unless the operator asks.

## Scope

**In scope**:
- `package.json` — add `test:watch` and `lint:fix` scripts
- `CONTRIBUTING.md` — fix Biome wording; add **Dev loop** section; mention
  `test:watch` / `lint:fix` in Checks or Dev loop
- `AGENTS.md` — add `test:watch` (and `lint:fix` if space) to Commands
- `README.md` — optional one-line under Quick start individual commands for
  `pnpm test:watch` (keep short)
- `plans/README.md` — status for 041

**Out of scope**:
- Enabling Biome `formatter` or reformatting the tree
- Adding husky / lefthook / pre-commit hooks
- Changing Vitest include patterns or adding new tests
- Implementing daemon watch or port file (039 / 040)
- `.editorconfig` / `.nvmrc` / VS Code extensions

## Git workflow

- Branch: `advisor/041-dev-loop-scripts`
- Commit style: imperative sentence
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add root scripts

In root `package.json` `scripts`, add:

```json
"test:watch": "vitest",
"lint:fix": "biome check --write ."
```

Keep existing `"test": "vitest run"` and `"lint": "biome check ."`.

**Verify**:

```bash
node -e "const p=require('./package.json'); if(p.scripts['test:watch']!=='vitest') process.exit(1); if(p.scripts['lint:fix']!=='biome check --write .') process.exit(1);"
```

→ exit 0.

### Step 2: Fix CONTRIBUTING + add Dev loop

In `CONTRIBUTING.md`:

1. Replace “Biome formats/lints the tree” with accurate text, e.g. “Biome
   lints the tree (`pnpm lint`); the Biome formatter is currently off — match
   nearby file style. Safe auto-fixes: `pnpm lint:fix`.”

2. After **Setup**, add a **Dev loop** section (~10–20 lines) covering:

   | Surface | Feedback |
   |---------|----------|
   | Prefer | `pnpm dev` (daemon + UI, shared port) |
   | UI (`apps/ui`) | Vite HMR — no full restart |
   | Daemon (`apps/daemon`) | `tsx watch` via `dev:daemon` (**039**) — process restarts on edit; SQLite persists; supervised runs may die or be re-adopted |
   | Shared (`packages/shared`) | Source exports — UI picks up via Vite; daemon reloads on watch restart |
   | Tests | `pnpm test:watch` for TDD; `pnpm test` before PR |
   | Split terminals | After **040**: set `CONTROL_PORT` / `CONTROL_DAEMON_URL`, or rely on `.control-dev-port`; see AGENTS.md |

   If **039** or **040** are not yet merged when you execute: still describe
   the **intended** end state above, but verify against live README/AGENTS —
   if daemon is still no-watch, write “manual restart of `pnpm dev:daemon`”
   and **STOP** only if the operator required 039 first (this plan’s Depends
   on says 039 — prefer waiting / stacking after 039).

3. Under **Checks before a PR**, you may mention `pnpm test:watch` as optional
   during development (PR gate remains `typecheck` / `test` / `lint`).

**Verify**:

```bash
rg -n "Dev loop|test:watch|lint:fix|formatter is currently off|Vite HMR" CONTRIBUTING.md
```

→ Dev loop present; no claim that Biome formats the tree.

### Step 3: AGENTS (+ optional README)

In `AGENTS.md` Commands block, add:

```bash
pnpm test:watch  # Vitest watch mode
pnpm lint:fix   # Biome check --write (safe fixes; formatter still off)
```

Keep the note that agents must not start `pnpm dev` unless asked.

Optional: README individual-commands list — one line for `pnpm test:watch`.

**Verify**:

```bash
rg -n "test:watch|lint:fix" AGENTS.md package.json
```

→ hits in both.

### Step 4: Quality gates

```bash
pnpm typecheck
pnpm test
pnpm lint
```

→ exit 0.

Smoke `lint:fix` once:

```bash
pnpm lint:fix
```

→ exit 0. If it rewrites many files solely because formatter got enabled:
**STOP** — you must not enable the formatter. `lint:fix` should only apply
lint safe-fixes with formatter still disabled.

Do **not** commit unrelated mass fixes; if `lint:fix` changes files outside
docs/scripts from this plan, revert those diffs and report.

Update `plans/README.md` **041** → `DONE`.

## Test plan

- No new characterization tests.
- Confirm `pnpm test` still runs once and exits (watch script must not replace
  `test`).
- Do not leave `pnpm test:watch` running in the executor session.

## Done criteria

- [ ] `package.json` has `test:watch` → `vitest` and `lint:fix` →
      `biome check --write .`
- [ ] `pnpm test` still equals `vitest run`
- [ ] CONTRIBUTING has **Dev loop**; Biome formatter claim corrected
- [ ] AGENTS lists the new scripts
- [ ] `biome.json` formatter remains `"enabled": false`
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm lint` exit 0
- [ ] No out-of-scope files modified (no formatter enable, no husky)
- [ ] `plans/README.md` **041** → `DONE`

## STOP conditions

- **039** not done and operator insisted this plan wait — stop rather than
  documenting false daemon watch behavior.
- Enabling Biome formatter seems “required” for `lint:fix` — it is not;
  keep formatter off.
- `pnpm lint:fix` produces a huge unrelated diff — revert, report.
- Vitest 4 on this repo does not watch with bare `vitest` (exits immediately):
  try `"test:watch": "vitest --watch"` once; if still broken, STOP and report
  (do not add vitest UI or playwright).
- Verification fails twice after a reasonable fix attempt.

## Maintenance notes

- Reviewers: Dev loop should stay short; link AGENTS for env details rather
  than duplicating the full table.
- When Biome formatter is eventually enabled, update CONTRIBUTING and consider
  a dedicated format script — out of scope here.
- Native-module install troubleshooting remains a separate finding (not this
  plan).
