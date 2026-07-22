# Plan 040: Sync split-terminal UI proxy to the live daemon port + document env

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat f47f402..HEAD -- scripts/run-daemon-dev.mjs scripts/control-port.mjs scripts/dev.mjs apps/ui/vite.config.ts README.md AGENTS.md .gitignore`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (can land in parallel with **039**; soft-conflict on
  `scripts/run-daemon-dev.mjs` — rebase if both touch that file)
- **Category**: dx
- **Planned at**: commit `f47f402`, 2026-07-22

## Why this matters

`pnpm dev` shares one `CONTROL_PORT` / `CONTROL_DAEMON_URL` across daemon and
UI via `scripts/dev.mjs`. Split terminals (`pnpm dev:daemon` then
`pnpm dev:ui`) do **not**: if `:4400` is held by a non-CONTROL process,
`ensureDevPort` bumps to `:4401+` on the daemon child only, while Vite still
proxies to `:4400`. The UI looks “broken” with no obvious error. Docs also
omit `CONTROL_DAEMON_URL` / `CONTROL_DEV`, and `.gitignore` allows
`.env.example` but the file is missing.

## Current state

- Port bump (daemon only sees the result):

```184:214:scripts/control-port.mjs
export async function ensureDevPort(preferred = preferredPort()) {
  // …
  // may return preferred+1 … preferred+MAX_PORT_BUMP
}
```

- Combined dev sets env for both children (`scripts/dev.mjs:24-34`).
- Split daemon sets env **only on the spawned child**
  (`scripts/run-daemon-dev.mjs:28-36`) — parent shell and a second terminal
  never see the bumped port.
- Vite proxy:

```5:16:apps/ui/vite.config.ts
const DAEMON =
  process.env.CONTROL_DAEMON_URL ??
  `http://127.0.0.1:${process.env.CONTROL_PORT ?? 4400}`
// … proxy /api and /ws to DAEMON
```

- README Quick start claims `dev:ui` proxies to `:4400` always
  (`README.md:54`).
- AGENTS.md Environment table documents only
  `CONTROL_DATA_DIR`, `CONTROL_PORT`, `CONTROL_HOST`, `CONTROL_HOME`
  (`AGENTS.md:39-44`).
- `CONTROL_DAEMON_URL` used in `scripts/dev.mjs`, `run-daemon-dev.mjs`,
  `apps/ui/vite.config.ts`.
- `CONTROL_DEV` used in `apps/daemon/src/index.ts:47` (no-store cache for SPA
  assets when serving `ui/dist`).
- `.gitignore`:

```27:30:.gitignore
# env
.env
.env.*
!.env.example
```

  No `.env.example` exists in the repo today.
- Commit style: imperative sentence (e.g. `Add env-file candidates API and ActionEditor picker.`).

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Typecheck | `pnpm typecheck` | exit 0              |
| Tests     | `pnpm test`      | exit 0              |
| Lint      | `pnpm lint`      | exit 0              |
| Syntax    | `node --check scripts/<file>.mjs` | exit 0     |

Do not start `pnpm dev` unless the operator asks.

## Scope

**In scope**:
- `scripts/control-port.mjs` — add helpers to resolve repo-root
  `.control-dev-port` path, write port, read port (optional clear)
- `scripts/run-daemon-dev.mjs` — after `ensureDevPort`, write the port file;
  log a one-line split-terminal tip with the chosen port
- `apps/ui/vite.config.ts` — if `CONTROL_DAEMON_URL` / `CONTROL_PORT` unset,
  read `.control-dev-port` from repo root before defaulting to `4400`
- `.gitignore` — ignore `.control-dev-port`
- `.env.example` — create (documented vars only; no secrets)
- `README.md` — fix `dev:ui` proxy wording; mention port file / env for split
  terminals; prefer `pnpm dev`
- `AGENTS.md` — extend Environment table with `CONTROL_DAEMON_URL`,
  `CONTROL_DEV`
- `plans/README.md` — status for 040

**Out of scope**:
- Changing Tauri shell hardcoded `:4400` (separate finding; not this plan)
- Daemon watch / `tsx watch` (plan **039**)
- CONTRIBUTING “dev loop” section / `test:watch` (plan **041**)
- Changing `ensureDevPort` bump algorithm or kill semantics
- Committing real `.env` files
- Pre-commit hooks

## Git workflow

- Branch: `advisor/040-split-dev-port-sync`
- Commit style: imperative sentence
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Port file helpers in `control-port.mjs`

Add (near the bottom of the module, exporting them):

- `devPortFilePath(repoRoot)` → `join(repoRoot, '.control-dev-port')`
- `writeDevPort(repoRoot, port)` → write `${port}\n` as utf8 (create/overwrite)
- `readDevPort(repoRoot)` → parse integer 1–65535 from file, or `null` if
  missing / invalid (do not throw on missing file)

Use `node:fs` sync APIs (`writeFileSync`, `readFileSync`, `existsSync`) to keep
the module sync-friendly for Vite config. Import `join` from `node:path` if
not already imported — **check the file**; today it may not import `path`/`fs`
yet. Add only what you need.

Do **not** change `ensureDevPort` / `preferredPort` behavior.

**Verify**:

```bash
rg -n "writeDevPort|readDevPort|devPortFilePath" scripts/control-port.mjs
node --check scripts/control-port.mjs
```

→ helpers present; exit 0.

### Step 2: Write the port file from daemon `dev`

In `scripts/run-daemon-dev.mjs`, after a successful `ensureDevPort()`:

1. Compute `repoRoot = join(here, '..')` (scripts → repo root).
2. `writeDevPort(repoRoot, port)`.
3. `console.log` a tip, e.g.:

   `[control] daemon on :${port} — for a second terminal: set CONTROL_PORT=${port} (or rely on .control-dev-port)`

If plan **039** already changed this file to `tsx watch`, keep that argv;
only add the write + log. If rebase conflict, preserve watch argv and add
port-file lines after `ensureDevPort`.

Optional: on parent `child` exit when **not** using a long-lived watch
supervisor that exits only on Ctrl+C — do **not** delete the port file on
every watch child restart (the outer `run-daemon-dev` process stays up). Only
consider unlink on the outer process exit if easy (`process.on('exit', …)`);
skipping unlink is acceptable (stale file is overridden on next daemon dev
start).

**Verify**:

```bash
rg -n "writeDevPort|control-dev-port|CONTROL_PORT=" scripts/run-daemon-dev.mjs
node --check scripts/run-daemon-dev.mjs
```

→ write + tip present; exit 0.

### Step 3: Teach Vite to read `.control-dev-port`

In `apps/ui/vite.config.ts`:

1. Resolve repo root as `fileURLToPath` + `join(…, '../..')` from
   `apps/ui/vite.config.ts` (ui → apps → repo), or
   `join(dirname(fileURLToPath(import.meta.url)), '../..')`.
2. Resolve `DAEMON` in this order:
   1. `process.env.CONTROL_DAEMON_URL` if set
   2. else if `process.env.CONTROL_PORT` set →
      `http://127.0.0.1:${CONTROL_PORT}`
   3. else `readDevPort(repoRoot)` → if non-null,
      `http://127.0.0.1:${port}`
   4. else `http://127.0.0.1:4400`

Prefer importing `readDevPort` from `../../scripts/control-port.mjs` (Vite
config can import local ESM). If that import fails under Vite’s config loader,
inline a 5-line `readFileSync` of `../../.control-dev-port` instead — do not
add a new dependency.

Keep existing `/api` and `/ws` proxy block.

**Verify**:

```bash
rg -n "CONTROL_DAEMON_URL|CONTROL_PORT|control-dev-port|readDevPort" apps/ui/vite.config.ts
pnpm --filter @control/ui typecheck
```

→ resolution order present; typecheck exit 0.

### Step 4: Gitignore the port file

Add `.control-dev-port` to `.gitignore` (near the env section is fine).

**Verify**:

```bash
rg -n "control-dev-port" .gitignore
```

→ one match.

### Step 5: Add `.env.example`

Create repo-root `.env.example` with comments only — no real secrets:

```bash
# Optional overrides for local CONTROL development.
# Copy to `.env` if you want; most contributors just use `pnpm dev`.

# CONTROL_PORT=4400
# CONTROL_HOST=127.0.0.1
# CONTROL_DATA_DIR=
# CONTROL_DAEMON_URL=http://127.0.0.1:4400
# CONTROL_HOME=
# CONTROL_DEV=1
```

**Verify**: file exists; `rg -n "CONTROL_DAEMON_URL|CONTROL_DEV" .env.example` hits.

### Step 6: Docs — README + AGENTS

**README.md**:
- Change the `pnpm dev:ui` gloss so it does **not** hardcode “always :4400”.
  State: proxies to `CONTROL_DAEMON_URL` or `CONTROL_PORT`, else
  `.control-dev-port` written by `dev:daemon`, else `4400`.
- Note preferred path remains `pnpm dev` (shared env, no desync).
- Mention env vars are listed in AGENTS + `.env.example`.

**AGENTS.md** Environment table — add rows:

| Variable | Purpose |
|----------|---------|
| `CONTROL_DAEMON_URL` | UI Vite proxy target (`http://127.0.0.1:<port>`). Set by `pnpm dev`. |
| `CONTROL_DEV` | When `1`, daemon-served SPA assets use `Cache-Control: no-store` (shell debug sets this). |

**Verify**:

```bash
rg -n "CONTROL_DAEMON_URL|control-dev-port|CONTROL_DEV" README.md AGENTS.md .env.example
```

→ docs + example cover both vars; README no longer claims unconditional `:4400`
for `dev:ui` only.

### Step 7: Quality gates + index

```bash
pnpm typecheck
pnpm test
pnpm lint
```

→ exit 0.

Update `plans/README.md` row **040** → `DONE`.

## Test plan

- No new Vitest tests required (script + Vite config).
- Optional manual (operator-asked only):
  1. Hold `:4400` with a non-CONTROL listener (or set `CONTROL_PORT=4400` busy).
  2. Terminal A: `pnpm dev:daemon` → logs bumped port; `.control-dev-port`
     contains that port.
  3. Terminal B: `pnpm dev:ui` **without** env → Vite proxies to bumped port;
     UI `/api/health` works via proxy.

## Done criteria

- [ ] `writeDevPort` / `readDevPort` exist; daemon `dev` writes
      `.control-dev-port` after `ensureDevPort`
- [ ] `apps/ui/vite.config.ts` falls back to that file when env unset
- [ ] `.control-dev-port` is gitignored; `.env.example` exists and is tracked
- [ ] README + AGENTS document `CONTROL_DAEMON_URL`, split-terminal behavior,
      and no longer claim unconditional `:4400` for `dev:ui`
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm lint` exit 0
- [ ] No out-of-scope files modified
- [ ] `plans/README.md` **040** → `DONE`

## STOP conditions

- Drift shows Vite proxy already reads a port file or a different discovery
  mechanism — align with existing approach instead of adding a second file.
- Importing `scripts/control-port.mjs` from `vite.config.ts` fails under Vite
  (e.g. `spawnSync` / powershell side effects at import time). If import alone
  triggers port scans: **STOP** or fall back to inlined `readFileSync` only
  (do not call `ensureDevPort` / `listeningPids` from Vite config).
- Fix seems to require changing Tauri `DAEMON_ORIGIN` — out of scope; report.
- Verification fails twice after a reasonable fix attempt.

## Maintenance notes

- Reviewers: ensure Vite config never calls `ensureDevPort` (would kill/bump
  ports when starting UI alone).
- Stale `.control-dev-port` after a crash points UI at a dead port until the
  next `dev:daemon` — acceptable; env vars always win.
- Plan **041** may link CONTRIBUTING to these env vars — keep AGENTS table
  authoritative.
