# Plan 010: Direction spikes — env files, PTY attach, detection markers, cross-platform ports

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **This is a design/spike plan, not a build-everything plan.** Deliverables are
> short design notes + optional proof-of-concept behind flags — not full product
> features unless a spike subsection explicitly says to ship a minimal slice.
>
> **Drift check (run first)**: `git diff --stat f1729ab..HEAD -- DESIGN.md apps/daemon/src/scanner.ts apps/daemon/src/supervisor.ts apps/daemon/src/hostPorts.ts apps/ui/src/components/LogPanel.tsx apps/ui/src/components/ActionEditor.tsx packages/shared/src/index.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: L (coarse — four spikes; expect multi-day if all built; spike-only is M)
- **Risk**: MED
- **Depends on**: plans/008-docs-refresh.md (so backlog labels are honest); plans/001 recommended
- **Category**: direction
- **Planned at**: commit `f1729ab`, 2026-07-19

## Why this matters

DESIGN.md and code asymmetries point to four grounded next bets — not generic ideas:

1. Per-action `.env` / `.env.local` selection (explicitly deferred in DESIGN §11).
2. Optional PTY stdin (“can come later”; logs are read-only except Ctrl-C on stop).
3. Unfinished detection markers (justfile, Expo, `.claude/launch.json`, turbo/nx).
4. Non-Windows host port attribution (`hostPorts.ts` returns `[]` off win32; NFR-1 deferred macOS/Linux).

This plan produces **decision-ready writeups** under `plans/spikes/` (create folder) and, only where cheap, a vertical slice behind clear boundaries.

## Current state

**DESIGN §11** (`DESIGN.md:507`):

> Env file handling: per-action selection of `.env` files … deferred past MVP; envOverrides covers the gap.

**PTY** (`DESIGN.md:37`): interactive REPL out of scope for v1; PTY write can come later. `supervisor.stop` writes `\x03`; `LogPanel` only displays stream.

**Detection** (`DESIGN.md:217-235` vs `scanner.ts`): subset implemented; `.claude/launch.json` called highest-confidence in DESIGN but absent in scanner.

**Ports** (`hostPorts.ts:42`): `if (process.platform !== 'win32') return []`.

**Environments**: shared schemas + registry already support per-project env maps — file loading is the gap.

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Typecheck | `pnpm typecheck` | exit 0 (if code POC) |
| Tests     | `pnpm test`      | exit 0              |

## Scope

**In scope**:
- New markdown spikes: `plans/spikes/env-files.md`, `pty-attach.md`, `detection-markers.md`, `cross-platform-ports.md`
- Optional minimal POCs **only** if a spike’s “POC bar” section is checked and stays within listed files
- Touch `DESIGN.md` backlog pointers only if plan 008 already landed

**Out of scope**:
- Full terminal emulator product
- Multi-user auth
- Replacing Docker Desktop
- Large scanner rewrites without a spike decision
- Shipping all four features in one PR

## Git workflow

- Branch: `advisor/010-direction-spikes`
- Prefer one commit per spike doc; separate commits for any POC code
- Example: `Document env-file and PTY attach design spikes.`
- Do NOT push unless instructed.

## Steps

### Step 1: Spike — per-action env file selection

Write `plans/spikes/env-files.md` covering:

1. **Problem**: `envOverrides` editor vs repo `.env.local` workflow
2. **Merge order proposal**: `process.env` → file(s) → environment map → action `envOverrides` (or justify alternative)
3. **Path rules**: files relative to module cwd; deny `..` escape outside project root
4. **UI**: ActionEditor multi-select of discovered `.env*` files
5. **Security**: local-only; no scrubbing (DESIGN); never commit file contents into tests
6. **Open questions**: dotenv parsing library vs hand parse; secret redaction in logs (explicitly out)
7. **Effort estimate** to build after spike: S/M/L
8. **Recommendation**: ship / defer / need prototype

**POC bar (optional)**: pure function `resolveEnvFiles(cwd, names) → Record<string,string>` with tests; do not wire UI unless trivial.

**Verify**: spike file exists with Recommendation section.

### Step 2: Spike — optional PTY attach

Write `plans/spikes/pty-attach.md`:

1. WS message `run.stdin` { runId, data } gated behind explicit Attach toggle in LogPanel
2. Daemon: only accept stdin for runs with live PTY handle (not adopted)
3. Security: loopback trust only; disable by default; confirm destructive risk copy in UI
4. Non-goal: full terminal (resize, alt screen) — optional later
5. Recommendation + effort

**POC bar (optional)**: schema + daemon handler that writes to `handle.proc.write` when a feature flag/settings bit is on — no UI polish required.

**Verify**: spike exists; states adopted runs cannot attach.

### Step 3: Spike — detection markers priority

Write `plans/spikes/detection-markers.md`:

1. Inventory DESIGN markers vs `scanner.ts` (table)
2. Recommended order: (1) `.claude/launch.json` import, (2) package workspace glob expansion (`pnpm-workspace`/`package.json` workspaces), (3) `justfile`, (4) Expo heuristics
3. Answer DESIGN open question: turbo root `dev` vs per-module — propose “detect both; favorites decide”
4. False-positive risks per marker
5. Recommendation for first implementation PR scope (one marker only)

**POC bar (optional)**: parser for `.claude/launch.json` → `DetectedAction[]` with tests; no registry merge yet.

**Verify**: spike picks a single “first PR” marker.

### Step 4: Spike — cross-platform host ports

Write `plans/spikes/cross-platform-ports.md`:

1. Current Windows command + WSL2 Docker precedence constraints (cite DESIGN / `hostPorts.ts` comments)
2. macOS proposal: `lsof -nP -iTCP -sTCP:LISTEN` parsing
3. Linux proposal: `ss -lptn` or `lsof`
4. Shared `HostPort` shape unchanged
5. Test strategy without CI Docker (fixture stdout parsers)
6. Recommendation: defer until Windows path stable / ship parser-only now

**POC bar (optional)**: parse fixture `ss`/`lsof` output in unit tests; do not enable by default on Darwin in production until fixtures pass.

**Verify**: spike exists with parser approach + precedence note.

### Step 5: Index the spikes

Add a short section to `plans/README.md` under Direction listing the four spike files and their recommendations (one line each) once written.

Mark plan 010 DONE when all four spike docs exist with Recommendation sections (POCs optional).

## Test plan

- Any POC pure parsers get Vitest coverage
- No tests that read the operator’s real `.env` files from disk in CI

## Done criteria

- [ ] Four spike markdown files exist under `plans/spikes/` each with a **Recommendation** heading
- [ ] Each spike cites concrete repo evidence (file paths)
- [ ] No full feature ship required
- [ ] If POC code landed: `pnpm typecheck` and `pnpm test` exit 0; scope files listed in the spike
- [ ] `plans/README.md` updated

## STOP conditions

- Spike turns into implementing all markers + PTY UI + dotenv in one PR — STOP; split follow-up plans instead.
- PTY attach POC would work on adopted runs without a handle — do not implement; document limitation.
- Env file POC would read paths outside the project root — STOP and fix design.

## Maintenance notes

- After a spike says “ship”, open a new numbered plan (011+) for implementation — do not overload this file.
- Reviewer: treat recommendations as advisor input; product owner chooses.
- Deferred tech-debt (registry/kit split) is intentionally not in this direction pack — see README rejected/deferred list.
