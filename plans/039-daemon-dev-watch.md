# Plan 039: Enable tsx watch for daemon `dev` so backend edits auto-reload

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat f47f402..HEAD -- scripts/run-daemon-dev.mjs apps/daemon/package.json README.md AGENTS.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `f47f402`, 2026-07-22

## Why this matters

`pnpm dev` / `pnpm dev:daemon` start the daemon once via `tsx src/index.ts` with
**no file watch**. Every edit under `apps/daemon` (and imported
`packages/shared` modules) requires a manual process restart. Contributors
routinely test stale code and blame UI or API bugs. UI already has Vite HMR;
this plan closes the backend half of the loop with `tsx watch`, without
changing production `start` or packaging.

## Current state

- `scripts/run-daemon-dev.mjs` — sole entry for `@control/daemon` `dev`. Resolves
  `tsx/cli`, calls `ensureDevPort()`, then spawns Node → tsx **without** `watch`:

```28:36:scripts/run-daemon-dev.mjs
const child = spawn(process.execPath, [tsxCli, 'src/index.ts'], {
  cwd: daemonRoot,
  env: {
    ...process.env,
    CONTROL_PORT: String(port),
    CONTROL_DAEMON_URL: `http://127.0.0.1:${port}`,
  },
  stdio: 'inherit',
})
```

- `apps/daemon/package.json` — `"dev": "node ../../scripts/run-daemon-dev.mjs"`;
  `"start": "tsx src/index.ts"` (production path — **do not** add watch here).
- `tsx` is already a daemon `devDependency` (^4.19.x; resolved ~4.23). CLI:

  ```
  tsx watch [flags...] <script path>
  ```

  Useful flags: `--include <glob>`, `--exclude <glob>`, `--clear-screen`
  (default true). Prefer `--clear-screen=false` so concurrently/`pnpm dev`
  prefixes stay readable across restarts.
- Daemon shutdown (`apps/daemon/src/index.ts`) only closes the HTTP server and
  exits — it does **not** stop supervised runs. On process exit, children may
  die with the tree or survive and be re-adopted by `reconcileRuns()` on the
  next boot. **Do not** expand shutdown semantics in this plan; document the
  restart tradeoff only.
- Port fingerprint regex in `scripts/control-port.mjs` matches
  `apps/daemon/src/index.ts` in the cmdline — `tsx watch src/index.ts` still
  includes that path; no regex change expected.
- Commit message style (recent): imperative sentence, no Conventional Commits
  prefix — e.g. `Add loading skeletons so query pending no longer looks empty.`

## Commands you will need

| Purpose   | Command            | Expected on success      |
|-----------|--------------------|--------------------------|
| Typecheck | `pnpm typecheck`   | exit 0                   |
| Tests     | `pnpm test`        | exit 0                   |
| Lint      | `pnpm lint`        | exit 0                   |
| Help      | `node apps/daemon/node_modules/tsx/dist/cli.mjs watch --help` | shows `tsx watch` usage |

Do **not** start `pnpm dev` unless verifying manually and the operator asked;
prefer static verification for CI-safe done criteria.

## Scope

**In scope** (the only files you should modify):
- `scripts/run-daemon-dev.mjs`
- `README.md` — one short note under Quick start / individual commands about
  daemon auto-restart on file change
- `AGENTS.md` — one line under Commands noting daemon watch in `dev:daemon`
- `plans/README.md` — status row for 039

**Out of scope** (do NOT touch):
- `apps/daemon/package.json` `start` script / production serve path
- `scripts/dev.mjs`, `scripts/control-port.mjs`, `scripts/kill-daemon.mjs`
  (port sync is plan **040**)
- Daemon graceful stop of supervised runs / registry shutdown hooks
- Nodemon, chokidar wrappers, or new dependencies
- `apps/shell` Tauri daemon spawn path
- Enabling Biome formatter / CONTRIBUTING overhaul (plan **041**)
- Starting long-lived `pnpm dev` in automation

## Git workflow

- Branch: `advisor/039-daemon-dev-watch`
- Commit style: imperative sentence (see Current state)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Switch daemon `dev` spawn to `tsx watch`

In `scripts/run-daemon-dev.mjs`, change the spawn argv from:

```js
[tsxCli, 'src/index.ts']
```

to:

```js
[
  tsxCli,
  'watch',
  '--clear-screen=false',
  // Keep shared contracts in the watch set when imported via workspace link.
  '--include',
  join(here, '..', 'packages', 'shared', 'src'),
  'src/index.ts',
]
```

(`here` is already `scripts/`; `join` is already imported.)

Keep `ensureDevPort`, env (`CONTROL_PORT`, `CONTROL_DAEMON_URL`), `cwd`,
`stdio: 'inherit'`, and the exit handler unchanged.

Update the file header comment to say it starts **tsx watch** (auto-restart on
daemon + shared src changes), not a one-shot `tsx`.

**Verify**:

```bash
rg -n "tsxCli|watch|src/index" scripts/run-daemon-dev.mjs
```

→ argv includes `'watch'`, `'--clear-screen=false'`, `'--include'`, and
`'src/index.ts'`. No bare `[tsxCli, 'src/index.ts']` only.

```bash
node --check scripts/run-daemon-dev.mjs
```

→ exit 0.

### Step 2: Document restart semantics (brief)

In `README.md`, in the “Run pieces individually” block or the sentence after
it, add ~2 lines:

- Daemon `dev` uses `tsx watch` — edits under `apps/daemon` and
  `packages/shared` restart the daemon process.
- Restart drops in-memory daemon state; SQLite under `~/.control` persists;
  supervised host processes may die with the daemon or be re-adopted on boot.

In `AGENTS.md` Commands section, adjust the `dev:daemon` comment to mention
watch/auto-restart (one line).

Do **not** claim UI and daemon share one reload story beyond that.

**Verify**:

```bash
rg -n "tsx watch|auto-restart|re-adopt" README.md AGENTS.md
```

→ at least one hit in each file (or both notes in README and one in AGENTS).

### Step 3: Static quality gates

**Verify**:

```bash
pnpm typecheck
pnpm test
pnpm lint
```

→ all exit 0.

### Step 4: Update plan index

Set plan **039** status to `DONE` in `plans/README.md`.

## Test plan

- No new Vitest tests required (dev script / process orchestration).
- Manual smoke (only if operator wants runtime proof; not a done-criteria gate):
  1. `pnpm dev:daemon` (or `pnpm dev`)
  2. Touch `apps/daemon/src/index.ts` (whitespace) → console shows watch
     rerun and daemon banner again on the same `CONTROL_PORT`
  3. Touch `packages/shared/src/index.ts` or an imported schema file → same
     restart behavior
- If step 2 smoke hits repeated `EADDRINUSE` on every watch restart and the
  daemon never comes back: **STOP** (see STOP conditions) — do not add sleep
  hacks without reporting.

## Done criteria

- [ ] `scripts/run-daemon-dev.mjs` spawns `tsx watch … src/index.ts` with
      `--clear-screen=false` and `--include` for `packages/shared/src`
- [ ] `apps/daemon` `start` script still runs without `watch`
- [ ] README + AGENTS mention daemon auto-restart / persist-vs-memory tradeoff
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm lint` exit 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row for 039 → `DONE`

## STOP conditions

Stop and report back (do not improvise) if:

- Drift check shows `run-daemon-dev.mjs` already uses watch or a different
  supervisor — reconcile with the operator instead of double-wrapping.
- `tsx watch` argv shape differs on the installed tsx major (help text no
  longer shows `watch` as a command) — do not invent nodemon.
- Manual smoke (if run) shows persistent `EADDRINUSE` after watch restart on a
  free machine — fixing bind retry / graceful run teardown is out of scope;
  report with logs.
- Fix appears to require changing `control-port.mjs` kill fingerprint or
  daemon `shutdown()` to stop all runs — report; do not expand scope.
- A step’s verification fails twice after a reasonable fix attempt.

## Maintenance notes

- Reviewers: confirm Windows ConPTY / `taskkill` path still identifies the
  daemon via cmdline (`apps/daemon/src/index.ts`) after watch.
- Future: if watch restarts orphan supervised processes painfully, add an
  explicit registry shutdown on SIGTERM (separate plan).
- Plan **040** may write a `.control-dev-port` file from the same script —
  leave a clear insertion point after `ensureDevPort`; do not invent the file
  here.
- Plan **041** will point CONTRIBUTING at this watch behavior — keep README /
  AGENTS wording accurate so 041 can quote it.
