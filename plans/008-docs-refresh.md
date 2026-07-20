# Plan 008: Refresh stale DESIGN and README docs to match shipped product

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat f1729ab..HEAD -- README.md DESIGN.md apps/ui/DESIGN.md apps/daemon/src/scanner.ts apps/ui/src/views/SettingsView.tsx apps/ui/src/views/Dashboard.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `f1729ab`, 2026-07-19

## Why this matters

`DESIGN.md` still titles the product “Switchboard”, says status is “design complete, not started”, and describes Tauri as future — while README Status lists M0–M6 as done (including shell + Docker). `apps/ui/DESIGN.md` still claims metrics gauges are unwired though Dashboard already polls host/project metrics. Stale design docs actively mislead humans and agents about what exists vs backlog.

## Current state

**Root DESIGN.md** (lines 1–9 area): working name Switchboard; “design complete, not started”; architecture diagram still says “later: … Tauri tray shell”; layout omits `apps/shell`.

**Detection table** (`DESIGN.md` ~217–235): lists `justfile`, Expo/RN markers, `.claude/launch.json`, turbo/nx/lerna expansion — scanner implements package/compose/Make/Cargo/Go/pyproject/Django subset (`apps/daemon/src/scanner.ts`).

**Settings** (`DESIGN.md` ~392): mentions scan roots / theme; `SettingsView.tsx` implements ignore globs, log retention, shell autostart (verify by reading file when executing).

**README.md**: Status correctly lists M0–M6; lead paragraph may still say Docker “(soon)” — fix if present.

**apps/ui/DESIGN.md** (~138–145): checklist unchecked for wiring CPU/mem metrics; Dashboard already uses `api.hostMetrics` / `api.projectMetrics`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Sanity  | `rg -n "not started|Switchboard|\\(soon\\)" README.md DESIGN.md apps/ui/DESIGN.md` | after edit: no false “not started”; Switchboard only in historical note if kept |

## Scope

**In scope**:
- `DESIGN.md`
- `README.md` (intro / accuracy only)
- `apps/ui/DESIGN.md`

**Out of scope**:
- Implementing missing detection markers (plan 010)
- Changing runtime code
- Writing AGENTS.md (plan 009)
- Full API reference rewrite — only fix false claims and mark backlog clearly

## Git workflow

- Branch: `advisor/008-docs-refresh`
- Commit example: `Align DESIGN docs with shipped CONTROL milestones.`
- Do NOT push unless instructed.

## Steps

### Step 1: Retitle and restatus root DESIGN.md

1. Title → **CONTROL** (mention Switchboard once as former working name if desired).
2. Status → design + implementation through **M6 shipped** as of README; link to README Status.
3. Update architecture diagram text: Tauri shell exists at `apps/shell`; daemon + UI as today.
4. Repo layout: add `apps/shell`.
5. Open questions: mark Name as resolved to CONTROL (or “settled for now”); keep env-file / PTY / monorepo-runner questions as open (point to plan 010).

**Verify**: `rg -n "not started" DESIGN.md` → no matches. `rg -n "apps/shell" DESIGN.md` → match.

### Step 2: Label detection + settings honestly

In detection section: split table into **Implemented** vs **Backlog** based on `scanner.ts` reality:

Implemented examples: `package.json`, compose files, `Makefile` (not justfile unless code has it), Cargo, Go, pyproject/Django as in scanner.

Backlog: `justfile`, Expo/RN, `.claude/launch.json`, turbo/nx/lerna workspace expansion — label “not implemented”.

Settings section: document actual SettingsView surface; move theme/scan-roots to backlog if not built.

Environments: add a short note that project environments exist post-design (shared schemas + registry) even if §7 API list is incomplete — either amend §7 with environment routes or add “Added after design” bullet.

**Verify**: `rg -n "Backlog|not implemented" DESIGN.md` → present near detection. Spot-check one backlog marker is not claimed as shipped.

### Step 3: Fix README intro contradictions

Ensure the opening paragraph does not say Docker is future if M4 is done. Keep Quick start accurate (`pnpm test` only if plan 001 already merged — if not, do not invent it).

**Verify**: `rg -n "Docker" README.md` — intro does not say “(soon)” for Docker.

### Step 4: Update apps/ui/DESIGN.md checklist

1. Check off / rewrite metrics wiring as done (point at Dashboard gauges).
2. Soften “visual shells until wired” principle to match current state.
3. Leave MasterPower / product open questions as open if still accurate.

**Verify**: `rg -n "until wired|Wire real CPU" apps/ui/DESIGN.md` → no outdated unchecked claim that metrics are unwired.

### Step 5: Update index

Mark plan 008 DONE.

## Test plan

- Docs only; no code tests.
- Self-check: an agent reading DESIGN alone would not believe the product is unimplemented.

## Done criteria

- [ ] DESIGN status reflects shipped M0–M6
- [ ] Detection markers distinguish implemented vs backlog
- [ ] README intro consistent with Status
- [ ] UI DESIGN metrics checklist matches Dashboard
- [ ] No runtime code changes
- [ ] `plans/README.md` updated

## STOP conditions

- Conflict between README and code about whether a feature exists — trust **code**, document code, and note the conflict in the PR/commit body.
- Urge to implement backlog markers while editing docs — that is plan 010; STOP expanding.

## Maintenance notes

- After plan 010 spikes land, move markers from Backlog → Implemented in DESIGN.
- Reviewer: reject doc PRs that reintroduce “not started” without removing shipped shell/docker claims.
