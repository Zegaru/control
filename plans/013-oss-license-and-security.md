# Plan 013: Ship MIT LICENSE, package license fields, and SECURITY.md

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 5cb94aa..HEAD -- package.json apps/daemon/package.json apps/ui/package.json apps/shell/package.json packages/shared/package.json README.md DESIGN.md LICENSE SECURITY.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `5cb94aa`, 2026-07-22

## Why this matters

CONTROL is about to go public with no `LICENSE` and no vulnerability-reporting path. GitHub will show “No license,” orgs cannot adopt the code cleanly, and the localhost-trust / no-auth model (by design) is only documented inside `DESIGN.md`. This plan makes the legal + security contract explicit for outsiders without changing runtime behavior.

**License choice (locked for this plan):** MIT. If the operator later wants Apache-2.0 instead, stop and ask — do not invent a dual license.

## Current state

- No root `LICENSE` or `SECURITY.md` (confirmed absent).
- Root `package.json` (excerpt):

```json
{
  "name": "control",
  "version": "0.1.0",
  "private": true,
  "description": "CONTROL — Local Dev Command Center. One UI to see and manage every dev server across your projects."
}
```

- Workspace packages (`apps/daemon`, `apps/ui`, `apps/shell`, `packages/shared`) also lack `"license"`. Keeping `"private": true` is correct — this is an app monorepo, not an npm publish.
- No git remotes may exist yet (`git remote -v` was empty at plan time). Do **not** invent a GitHub URL.
- Threat model (by design — do not “fix” by adding auth):

From `DESIGN.md` (~line 293 / NFR-2):

> Bind `127.0.0.1` only. No auth in v1 (localhost trust); token auth is a later flag if LAN access is ever wanted.

From `DESIGN.md` (~line 511):

> Log privacy: dev logs can contain tokens; retention is local-only and capped, but no scrubbing in v1.

- Plan 004 already hardened loopback bind / healthUrl / container log scoping in code; this plan only **documents** the model for consumers.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Remotes | `git remote -v` | may be empty; used only for optional metadata |
| Typecheck | `pnpm typecheck` | exit 0 (sanity; no code changes expected) |
| Lint | `pnpm lint` | exit 0 |

## Scope

**In scope**:
- Create `LICENSE` (MIT, copyright year **2026**, copyright holder: use the git author name from `git log -1 --format='%an'` on HEAD, or “CONTROL contributors” if that looks wrong / empty — prefer a real person/org name when available)
- Create `SECURITY.md`
- Add `"license": "MIT"` to root + all workspace `package.json` files listed above
- Optionally add `"repository"` / `"bugs"` / `"homepage"` **only if** `git remote get-url origin` succeeds; derive HTTPS GitHub URLs from that remote
- Minimal README footer / links: License + Security (one short paragraph or link list — full README rewrite is plan 014)

**Out of scope**:
- Changing daemon auth, bind rules, or any runtime security code
- `NOTICE` / third-party attribution for the NSIS bundle (deferred; separate future plan)
- `CHANGELOG`, release workflow, code signing
- `CONTRIBUTING` / issue templates (plan 015)
- Rewriting `DESIGN.md`
- Setting `private: false` or publishing to npm

## Git workflow

- Branch: `advisor/013-oss-license-and-security`
- Commit example: `Add MIT license and public security policy.`
- Do NOT push unless instructed.

## Steps

### Step 1: Add MIT LICENSE

Create root `LICENSE` with the standard MIT text. Copyright line:

`Copyright (c) 2026 <holder>`

Resolve `<holder>` as described in Scope. Use the full canonical MIT permission notice + warranty disclaimer (OSI / GitHub MIT template is fine).

**Verify**: `test -f LICENSE && head -n 1 LICENSE` → contains `MIT License` (or equivalent first line). `rg -n "Copyright \(c\) 2026" LICENSE` → hit.

### Step 2: Add license fields to package manifests

Add `"license": "MIT"` to:

- `package.json`
- `apps/daemon/package.json`
- `apps/ui/package.json`
- `apps/shell/package.json`
- `packages/shared/package.json`

Place it near the top-level metadata (`name` / `version` / `private` / `description`), matching JSON style already used (2-space indent).

If `git remote get-url origin` returns a GitHub URL, also set on the **root** `package.json` only:

```json
"repository": { "type": "git", "url": "git+https://github.com/<owner>/<repo>.git" },
"bugs": { "url": "https://github.com/<owner>/<repo>/issues" },
"homepage": "https://github.com/<owner>/<repo>#readme"
```

If there is **no** origin remote, skip these three fields entirely (do not invent).

**Verify**: `rg -n '"license": "MIT"' package.json apps/daemon/package.json apps/ui/package.json apps/shell/package.json packages/shared/package.json` → 5 hits.

### Step 3: Write SECURITY.md

Create `SECURITY.md` with these sections (keep it short — roughly one screen):

1. **Supported versions** — document that the `main` branch / latest tagged release (when tags exist) is what you accept reports against; pre-1.0 means best-effort.
2. **Threat model (intentional)** — CONTROL is a **local-first, single-developer** tool:
   - Daemon binds **loopback only** (`127.0.0.1` / `localhost` / `::1` via `CONTROL_HOST`)
   - **No authentication** in v1 (localhost trust) — cite DESIGN NFR-2 in prose, not as a bug
   - Any local user/process that can reach the daemon can start/stop projects and read run logs
   - Run logs may contain secrets from child processes; stored under `CONTROL_DATA_DIR` (default `~/.control`); no scrubbing in v1
   - Do **not** expose the daemon on a non-loopback interface
3. **Reporting a vulnerability** — instruct reporters to open a **private** GitHub Security Advisory if the repo supports it, **or** email/contact placeholder: if no remote/contact exists, write “Open a private GitHub security advisory on this repository once published; until then contact the maintainer via the GitHub profile that owns the repo.” Do not invent a personal email address.
4. **Please include** — CONTROL version / commit, OS, steps to reproduce, impact (e.g. SSRF, bind escape, path traversal). Do **not** include a runnable exploit walkthrough template.
5. **Out of scope reports** — “daemon has no auth on localhost” is **by design** (unless accompanied by a bind/escape that reaches non-loopback or a concrete local privilege issue beyond the documented model).

**Verify**: `rg -n "loopback|No authentication|SECURITY|vulnerability" SECURITY.md` → hits. File must **not** claim auth exists.

### Step 4: Link from README

At the bottom of `README.md` (or after the intro links), add a short **License & security** note:

- License: MIT — link `LICENSE`
- Security policy / threat model: link `SECURITY.md`
- Keep to ≤5 lines. Do not rewrite Platforms / Prerequisites here (plan 014).

**Verify**: `rg -n "LICENSE|SECURITY.md" README.md` → hits.

### Step 5: Sanity

**Verify**: `pnpm lint` → exit 0. `pnpm typecheck` → exit 0.

## Test plan

- No new automated tests (docs/metadata only).
- Manual: open `LICENSE` and `SECURITY.md` and confirm they read as consumer-facing, not internal design notes.

## Done criteria

- [ ] `LICENSE` exists with MIT text and 2026 copyright
- [ ] `"license": "MIT"` on all five package manifests
- [ ] `SECURITY.md` documents loopback trust, no-auth-by-design, reporting path, log privacy
- [ ] `README.md` links to LICENSE + SECURITY.md
- [ ] No repository URL invented when remotes are missing
- [ ] No runtime/source behavior changes outside docs/manifests
- [ ] `plans/README.md` status row for 013 → DONE

## STOP conditions

- Operator says the license must not be MIT.
- A `LICENSE` or `SECURITY.md` already exists with conflicting terms — reconcile with operator, do not overwrite silently.
- Adding fields would require publishing packages or flipping `private` to false.
- Drift check shows in-scope files already partially OSS-licensed differently.

## Maintenance notes

- When the GitHub remote is created, re-run Step 2’s optional `repository`/`bugs`/`homepage` block.
- Prefer GitHub Private Vulnerability Reporting once the repo is public.
- Plan 014 will expand README; keep this plan’s license/security links intact.
- Auth / LAN access remains a future product flag per DESIGN — update SECURITY.md if that ships.
