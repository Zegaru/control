# Plan 014: Make README usable for external installers and contributors

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 5cb94aa..HEAD -- README.md apps/shell/README.md DESIGN.md docs AGENTS.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/013-oss-license-and-security.md (keep License & security links; may already be present)
- **Category**: docs
- **Planned at**: commit `5cb94aa`, 2026-07-22

## Why this matters

The root README is accurate for an insider who already knows the stack, but a stranger cloning the repo cannot tell that **Windows 11 is the primary target**, what native toolchain `pnpm install` needs, or how the Tauri shell differs from `pnpm dev`. That produces failed first installs and false “works on my Mac” expectations. This plan turns the README into a proper open-source front door without rewriting `DESIGN.md`.

## Current state

- `README.md` today: intro, long **Status** checklist (M0–M6), **Quick start** (`pnpm install` / `pnpm dev`), layout, env vars. No **Platforms**, no **Prerequisites**, no screenshots, no pointer to `CONTRIBUTING` / shell docs beyond layout.
- Platform truth lives in `DESIGN.md` NFR-1 (~line 447):

> Windows 11 first (ConPTY, taskkill, Get-NetTCPConnection, WSL2-aware port attribution); macOS/Linux should work via node-pty but are not v1 test targets.

- Host port attribution is Windows-only in code (`apps/daemon/src/hostPorts.ts` returns `[]` when `process.platform !== 'win32'`).
- Shell prerequisites are documented in `apps/shell/README.md` (Rust, WebView2, VS 2022 C++ tools, Node ≥22) — root README should **summarize and link**, not duplicate every detail.
- Native modules: `better-sqlite3`, `node-pty` (see root `pnpm-workspace.yaml` `allowBuilds` and `AGENTS.md`).
- No `docs/screenshots/` directory yet. Do **not** generate fake AI product mockups as “screenshots.”
- `plans/` is advisor handoff history — briefly label it so newcomers don’t treat it as a product roadmap.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Lint | `pnpm lint` | exit 0 |
| Grep platforms | `rg -n "Platforms|Prerequisites|Windows 11" README.md` | hits after edit |

## Scope

**In scope**:
- `README.md` — restructure for outsiders (see Steps); keep factual Status content but consider collapsing or moving the long checklist below Quick start so the first screen is “what / platforms / install”
- Create `docs/screenshots/` with a short `docs/screenshots/README.md` explaining how to capture real UI shots (optional PNGs only if the operator already provided them or a real capture is available — never invent UI)
- One-line cross-link updates only if needed: `AGENTS.md` already points at plans — optional clarity sentence in README only

**Out of scope**:
- Rewriting `DESIGN.md` or `apps/ui/DESIGN.md`
- Implementing macOS/Linux port scanning
- Building/releasing the NSIS installer or signing
- Writing `CONTRIBUTING.md` (plan 015) — but **link** to it if it already exists after 015; if 015 not done yet, link can say “see CONTRIBUTING.md (coming)” **or** omit until 015 lands. Prefer: add `## Contributing` with “See [CONTRIBUTING.md](./CONTRIBUTING.md) once present; until then: `pnpm install && pnpm typecheck && pnpm test && pnpm lint`.” If `CONTRIBUTING.md` exists, link normally.
- Changing CI (plan 016)

## Git workflow

- Branch: `advisor/014-oss-readme`
- Commit example: `Document platforms, prerequisites, and install paths for OSS.`
- Do NOT push unless instructed.

## Steps

### Step 1: Restructure README front matter

Keep the title + one-paragraph pitch. Immediately after the intro links, add these sections **in this order** (before or instead of leading with the long Status checklist):

1. **Platforms** (honest):
   - **Primary:** Windows 11 (tested / designed for ConPTY, `taskkill`, `Get-NetTCPConnection`, WSL2-aware Docker port attribution)
   - **Best effort:** macOS and Linux — daemon/UI may run via node-pty; host port map and some process tooling are Windows-first and may be empty/limited; not v1 CI targets unless plan 016 adds coverage
2. **Prerequisites**
   - Node.js **≥22** on PATH
   - **pnpm** 11.x (repo pins `packageManager: pnpm@11.5.3`)
   - A C/C++ build toolchain for native modules on first `pnpm install` (`better-sqlite3`, `node-pty`) — on Windows: Visual Studio Build Tools with “Desktop development with C++” (or equivalent); on Unix: common build-essential / Xcode CLT
   - Optional Docker Engine/Desktop if using compose features
   - **Desktop shell (optional):** Rust + WebView2 + MSVC — details in [`apps/shell/README.md`](./apps/shell/README.md)
3. **Quick start** (keep existing commands; clarify browser URL)
4. **Install paths** (new short section):
   - **Dev (recommended for contributors):** `pnpm install` → `pnpm dev` → http://localhost:5173
   - **Production single-origin:** build UI then `pnpm start` → http://127.0.0.1:4400
   - **Native Windows app:** `pnpm --filter @control/shell build` → NSIS under `apps/shell/src-tauri/target/release/bundle/` — Node ≥22 still required on PATH at runtime; unsigned builds may trigger SmartScreen (document factually; do not promise signing)

Move the long **Status** milestone checklist **below** Quick start / Install paths (or under a collapsed-feeling `## What’s implemented` heading) so first-time readers aren’t wading through M0–M6 before install.

Preserve env var docs (`CONTROL_DATA_DIR`, `CONTROL_PORT`, `CONTROL_HOST` loopback-only).

Preserve / restore **License & security** links from plan 013 if present.

**Verify**: `rg -n "^## Platforms|^## Prerequisites|^## Quick start|Install paths|apps/shell/README" README.md` → hits. `rg -n "macOS|Linux|best effort|Windows 11" README.md` → hits.

### Step 2: Screenshots scaffolding

1. Create `docs/screenshots/README.md` stating:
   - Drop real PNG/WebP captures here (`overview.png`, `project.png`, etc.)
   - Capture from a running local UI (dev `:5173` or production `:4400`); do not commit secrets visible in logs
   - Preferred: Overview + one project/run view
2. In root `README.md`, add a **Screenshots** section that either:
   - Embeds images **if** real files exist under `docs/screenshots/*.png` (or webp), **or**
   - Says screenshots welcome / TBD and points at `docs/screenshots/` — without fake images

Do **not** call image generators to fabricate the product UI.

**Verify**: `test -f docs/screenshots/README.md`.

### Step 3: Contributor + plans clarity

Add a short **Contributing** blurb (link rules per Scope) and a one-liner that `plans/` contains historical implementation handoffs for agents/maintainers, not a public product roadmap. Point product design at `DESIGN.md`.

**Verify**: `rg -n "Contributing|plans/" README.md` → hits.

### Step 4: Sanity

**Verify**: `pnpm lint` → exit 0. README still documents `pnpm typecheck` / `pnpm test` / `pnpm lint`.

## Test plan

- Docs only — no new Vitest tests.
- Manual read-through: a new contributor should know OS expectations and the difference between `pnpm dev` and the shell installer within one screenful.

## Done criteria

- [ ] README has Platforms + Prerequisites + Install paths reflecting NFR-1 honestly
- [ ] Shell details linked to `apps/shell/README.md`
- [ ] `docs/screenshots/` exists with capture instructions; no fabricated UI images
- [ ] Status checklist retained but not blocking Quick start
- [ ] License/security links from 013 preserved if they existed
- [ ] `plans/README.md` status row for 014 → DONE

## STOP conditions

- Drift shows README already fully restructured differently — merge carefully; do not delete accurate Status facts.
- Operator insists on claiming full macOS/Linux support — refuse; document best-effort only unless code/CI catch up.
- Someone asks to add AI-generated fake screenshots — refuse.

## Maintenance notes

- When real screenshots land, embed them in README and keep files reasonably sized (&lt; ~500KB each preferred).
- When Windows CI (plan 016) lands, you may soft-update Platforms to mention CI on Windows + Ubuntu.
- Env-files / cross-platform ports work (see `plans/spikes/`) should update Platforms when shipped.
