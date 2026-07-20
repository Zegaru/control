# Plan 004: Localhost security hardening (bind, healthUrl, container logs)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat f1729ab..HEAD -- apps/daemon/src/config.ts apps/daemon/src/index.ts apps/daemon/src/health.ts apps/daemon/src/wsHub.ts apps/daemon/src/docker.ts packages/shared/src/index.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/001-verification-baseline.md
- **Category**: security
- **Planned at**: commit `f1729ab`, 2026-07-19

## Why this matters

CONTROL is intentionally unauthenticated on loopback (DESIGN NFR-2). Three implementation gaps break that trust model:

1. `CONTROL_HOST` can be set to `0.0.0.0` / LAN IPs with no guard — exposing process spawn and Docker control.
2. `healthUrl` is fetched server-side with no host allowlist (SSRF).
3. WebSocket `subscribe.container` streams logs for any Docker container id with no project attribution check.

Do **not** add general auth in this plan. Do **not** reproduce any secret values if found.

## Current state

**DESIGN.md NFR-2 / bind note**:

> Bind `127.0.0.1` only. No auth in v1 (localhost trust); token auth is a later flag if LAN access is ever wanted.

**Config** (`apps/daemon/src/config.ts:15-16`):

```ts
/** Bind loopback only — this is a single-developer local tool (NFR-2). */
export const HOST = process.env.CONTROL_HOST ?? '127.0.0.1'
```

**Health fetch** (`apps/daemon/src/health.ts:22-28`):

```ts
export async function isHttpHealthy(url: string, timeoutMs = 2000): Promise<boolean> {
  ...
  const res = await fetch(url, { signal: controller.signal, redirect: 'manual' })
```

Schemas allow any URL: `healthUrl: z.string().url()...` in `packages/shared/src/index.ts`.

**WS container subscribe** (`apps/daemon/src/wsHub.ts:60-68`): calls `streamContainerLogs(msg.containerId, …)` with no project check. `docker.ts` `streamContainerLogs` uses `getContainer(containerId).logs(...)`.

**By design (do not “fix”)**: missing auth when bound to loopback.

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Typecheck | `pnpm typecheck` | exit 0              |
| Tests     | `pnpm test`      | exit 0              |

## Scope

**In scope**:
- `apps/daemon/src/config.ts` (+ maybe `index.ts` startup check)
- `apps/daemon/src/health.ts` (+ shared validation helper)
- `packages/shared/src/index.ts` — tighten `healthUrl` schema **or** validate in daemon only (prefer shared helper used by both Zod refine and daemon)
- `apps/daemon/src/wsHub.ts`
- `apps/daemon/src/docker.ts` / `registry.ts` only as needed to resolve container→project
- Tests for host allowlist + healthUrl parser + subscribe denial
- One-line README note under env vars if documented

**Out of scope**:
- Token auth / multi-user
- Changing CORS beyond existing Vite origins
- Blocking run log subscribe for unmanaged run ids (optional later)
- Editing DESIGN beyond a tiny NFR clarification if you already touch docs in plan 008 — prefer leaving DESIGN to plan 008; only update README env if needed

## Git workflow

- Branch: `advisor/004-localhost-security-hardening`
- Commit example: `Restrict daemon bind, healthUrl targets, and container log subscribe.`
- Do NOT push unless instructed.

## Steps

### Step 1: Enforce loopback bind

In `config.ts`, after resolving `HOST`:

1. Normalize and allow only: `127.0.0.1`, `localhost`, `::1` (and optionally `0:0:0:0:0:0:0:1`).
2. If `CONTROL_HOST` is set to anything else:
   - Default behavior: **throw / `process.exit(1)`** at startup with a clear message citing NFR-2.
3. Optional escape hatch (only if you implement it fully): `CONTROL_ALLOW_NON_LOOPBACK=1` prints a loud stderr warning and continues — document in README. If implementing the escape hatch feels ambiguous, **omit it** and hard-fail only.

Call the check from `config.ts` at module load or at the start of `main()` in `index.ts` before `serve`.

**Verify**: Unit-test a pure `assertLoopbackHost(host: string): void` / `isLoopbackHost`. Manual: do not bind 0.0.0.0 in automated tests.

### Step 2: Restrict healthUrl

Add `isAllowedHealthUrl(url: string): boolean` in `health.ts` (or `packages/shared`):

- Protocol: `http:` or `https:` only
- Hostname: `127.0.0.1`, `localhost`, `::1` only
- Reject credentials in URL, non-default weird ports optional (allow any port on loopback)
- Reject clear LAN/metadata hosts (`169.254.169.254`, `10.`, `192.168.`, etc.) even if somehow parsed — hostname allowlist is enough if strict

In `isHttpHealthy`: if not allowed, return `false` immediately (and optionally `console.warn` once).

Tighten Zod with `.refine(isAllowedHealthUrl)` on patch/create schemas that accept `healthUrl`, **or** validate in daemon route/patch only. Prefer shared refine so UI gets the same rule if it shares schemas.

**Verify**: Tests — `http://127.0.0.1:3000/health` ok; `http://example.com/` false; `http://169.254.169.254/` false; `file:///etc/passwd` false.

### Step 3: Scope container log subscription

In `wsHub.ts` `subscribe.container` handler:

1. Resolve whether `containerId` belongs to a registered project. Reuse `listContainers(buildComposeProjectMatcher())` from docker/registry (same as routes), or a cheaper `getContainerProjectId(id)` if one exists / you add a small helper.
2. If the container is not attributed to any known project (`projectId == null`), **do not** start the stream (optionally send a tiny error event — only if `WsEvent` already has a suitable type; otherwise silent ignore matching current catch behavior).
3. Do not expand to “stream all containers” behind a flag in this plan.

**Verify**: Unit-test the gate function with mock list results; `pnpm typecheck`.

### Step 4: README env note

If README documents `CONTROL_HOST` / `CONTROL_PORT`, state that `CONTROL_HOST` must be loopback. If not documented, add one sentence near data-dir env mention.

**Verify**: `rg -n "CONTROL_HOST" README.md` → mentions loopback restriction.

### Step 5: Update index

Mark plan 004 DONE.

## Test plan

- `isLoopbackHost` / assert cases
- `isAllowedHealthUrl` cases listed above
- Container subscribe allow/deny given mock attributions
- No tests that print or embed secrets

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0 with new security helper tests
- [ ] Non-loopback `CONTROL_HOST` fails startup (or documented escape hatch only)
- [ ] `isHttpHealthy` does not `fetch` disallowed URLs (`rg -n "fetch\\(url" apps/daemon/src/health.ts` preceded by allowlist check)
- [ ] `subscribe.container` checks project attribution
- [ ] Scope respected; `plans/README.md` updated

## STOP conditions

- Product owner appears to require LAN bind as a supported mode without auth — STOP and report; do not invent token auth here.
- Container attribution API cannot identify project without expensive Docker calls every subscribe — use existing `listContainers` cache if present; if none and performance is concerning, STOP after noting need for plan 006-style cache rather than skipping the check.
- Any committed credential discovered — report `file:line` + type only; do not copy the value into the plan or commit.

## Maintenance notes

- If token auth is added later, revisit bind allowlist (LAN + auth becomes coherent).
- Reviewer: ensure Zod refine messages are user-readable in ActionEditor validation.
- Plan 008 may sync DESIGN wording; keep behavior aligned with NFR-2.
