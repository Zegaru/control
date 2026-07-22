# Plan 015: Add CONTRIBUTING, Code of Conduct, and GitHub issue/PR templates

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 5cb94aa..HEAD -- CONTRIBUTING.md CODE_OF_CONDUCT.md .github README.md AGENTS.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/013-oss-license-and-security.md (reference SECURITY.md); plans/014-oss-readme.md (README Contributing link — soft dependency, can land either order if links are updated)
- **Category**: dx
- **Planned at**: commit `5cb94aa`, 2026-07-22

## Why this matters

A public repo with only CI and no contribution guide produces drive-by PRs without tests, platform context, or security hygiene. Lightweight community files are the difference between “I dumped my zip on GitHub” and a project people can contribute to safely.

## Current state

- `.github/` contains only `workflows/ci.yml` (from plan 009).
- No `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, issue templates, or PR template.
- Contributor commands already exist and must be cited verbatim from `AGENTS.md` / root `package.json`:
  - `pnpm install` / `pnpm typecheck` / `pnpm test` / `pnpm lint`
  - Do **not** tell contributors that agents should start `pnpm dev` unbidden — for humans, `pnpm dev` is the normal way to run the app.
- Windows-first platform note must match README/DESIGN NFR-1.
- Security reports belong in `SECURITY.md`, not public issues for vulnerabilities.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| List github | `find .github -type f` | includes templates after edit |
| Lint | `pnpm lint` | exit 0 |

## Scope

**In scope**:
- `CONTRIBUTING.md` (root)
- `CODE_OF_CONDUCT.md` (root) — use Contributor Covenant v2.1 text (standard); enforcement contact: “repository maintainers via GitHub” — do **not** invent a personal email
- `.github/PULL_REQUEST_TEMPLATE.md`
- `.github/ISSUE_TEMPLATE/bug_report.md`
- `.github/ISSUE_TEMPLATE/feature_request.md`
- `.github/ISSUE_TEMPLATE/config.yml` — disable blank issues **or** leave enabled with a note pointing security to SECURITY.md; prefer config that links Security policy
- Update root `README.md` Contributing section to link `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md` if not already correct

**Out of scope**:
- `CODEOWNERS` (optional later; skip unless operator already has GitHub handles ready)
- Changing CI workflows (plan 016)
- Adding commit hooks / DCO sign-off requirements
- Triage bots, label syncers, Release Please

## Git workflow

- Branch: `advisor/015-oss-contributing`
- Commit example: `Add contributing guide, CoC, and GitHub templates.`
- Do NOT push unless instructed.

## Steps

### Step 1: Write CONTRIBUTING.md

Include at least:

1. **Welcome** — one paragraph; Windows 11 primary; macOS/Linux best effort
2. **Prerequisites** — Node ≥22, pnpm 11.5.3, native build tools (point at root README Prerequisites)
3. **Setup**
   ```bash
   pnpm install
   pnpm dev
   ```
   Open http://localhost:5173
4. **Checks before PR** (must pass):
   ```bash
   pnpm typecheck
   pnpm test
   pnpm lint
   ```
5. **PR expectations** — small focused diffs; match existing style (Biome); no drive-by refactors; don’t commit `.env`, secrets, or `~/.control` data; don’t start long-lived unrelated services in CI
6. **Security** — report vulnerabilities per [`SECURITY.md`](./SECURITY.md); do not file public issues for undisclosed vulns
7. **Architecture pointers** — `DESIGN.md`, `AGENTS.md`; `plans/` is historical agent handoff, not required reading for most contributors
8. **Native shell** — optional; see `apps/shell/README.md`

**Verify**: `rg -n "pnpm test|SECURITY.md|Windows" CONTRIBUTING.md` → hits.

### Step 2: Add Code of Conduct

Add `CODE_OF_CONDUCT.md` using [Contributor Covenant 2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/) (full text). Enforcement: repository maintainers through GitHub (issues/contact form / moderation tools) — no fabricated email.

In `CONTRIBUTING.md`, link the CoC in one sentence.

**Verify**: `rg -n "Contributor Covenant|Enforcement" CODE_OF_CONDUCT.md` → hits.

### Step 3: GitHub templates

**PR template** (`.github/PULL_REQUEST_TEMPLATE.md`):

```markdown
## Summary
<!-- What and why -->

## Test plan
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm lint`
- [ ] Manual: <!-- UI / daemon path exercised -->

## Notes
<!-- Platforms tested (Windows / other). Breaking changes? -->
```

**Bug report** — ask for: CONTROL version/commit, OS, Node version, steps, expected vs actual, relevant daemon logs **with secrets redacted**.

**Feature request** — ask for: problem, proposed approach, alternatives, Windows-first constraint awareness.

**config.yml** — add `contact_links` entry pointing to Security policy (`SECURITY.md` / GitHub Security tab wording).

**Verify**: `find .github -type f | sort` → includes the new template paths.

### Step 4: README link

Ensure README **Contributing** points at `CONTRIBUTING.md` (and optionally CoC). Remove any “coming soon” wording left by plan 014.

**Verify**: `rg -n "CONTRIBUTING.md" README.md` → hit.

## Test plan

- Docs only. Spot-check that templates render as GitHub expects (valid markdown front matter if using YAML issue forms — plain markdown templates are fine and preferred here for simplicity).

## Done criteria

- [ ] `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md` exist and cross-link
- [ ] PR + bug + feature templates exist under `.github/`
- [ ] Security reports directed to SECURITY.md / contact_links
- [ ] README links CONTRIBUTING.md
- [ ] `plans/README.md` status row for 015 → DONE

## STOP conditions

- Operator wants a custom CoC with a specific email you don’t have — ask rather than invent.
- Templates already exist with different structure — extend, don’t blindly overwrite operator-customized files.

## Maintenance notes

- When the GitHub org/user email for CoC enforcement is known, update the Enforcement section once.
- Good first issues: label manually after publish; no bot required for v0.1.
