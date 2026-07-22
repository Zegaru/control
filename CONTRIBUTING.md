# Contributing to CONTROL

Thanks for taking an interest in CONTROL. This project is a local-first dev
command center: a Node daemon supervises host processes and Docker stacks; a
React SPA is the thin client.

**Platform note:** Windows 11 is the primary target. macOS and Linux are best
effort — see the root [README](./README.md) Platforms section.

By participating, you agree to follow the
[Code of Conduct](./CODE_OF_CONDUCT.md).

## Prerequisites

- Node.js ≥22
- pnpm 11.5.3 (see root `packageManager`)
- Native build tools for `better-sqlite3` and `node-pty` (see README
  Prerequisites)
- Optional desktop shell: see [`apps/shell/README.md`](./apps/shell/README.md)

## Setup

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173, click **Add Project**, and point it at a repo
folder.

## Dev loop

Prefer **`pnpm dev`** for day-to-day work — it starts the daemon and UI together
with port sync.

| Area | What happens on save |
|------|----------------------|
| **UI** (`apps/ui`) | Vite HMR — instant in-browser updates |
| **Daemon** (`apps/daemon`) | `tsx watch` auto-restarts the process; SQLite under `~/.control` persists; supervised runs may die with the restart or be re-adopted on boot |
| **Shared** (`packages/shared`) | Source exports; UI picks up changes via Vite; daemon picks them up on the next watch restart |

**Tests:** use `pnpm test:watch` for TDD during development; run `pnpm test`
before opening a PR.

**Split terminals:** if you run `pnpm dev:daemon` and `pnpm dev:ui` separately,
keep them in sync via `CONTROL_PORT`, `CONTROL_DAEMON_URL`, or the
`.control-dev-port` file written when the daemon starts — see [AGENTS.md](./AGENTS.md).

## Checks before a PR

These must pass:

```bash
pnpm typecheck
pnpm test
pnpm lint
```

Optional during development: `pnpm test:watch` (Vitest watch) and
`pnpm lint:fix` (Biome safe fixes).

## Pull request expectations

- Keep diffs focused; match existing style — Biome lints the tree (formatter is
  currently off; use `pnpm lint:fix` for safe auto-fixes)
- No drive-by refactors unrelated to the change
- Do not commit `.env` files, secrets, or daemon state from `~/.control`
- Note which OS you tested on (Windows primary)

## Security

Report vulnerabilities per [SECURITY.md](./SECURITY.md). Do not open a public
issue for an undisclosed vulnerability.

## Architecture pointers

- [DESIGN.md](./DESIGN.md) — product design and requirements
- [AGENTS.md](./AGENTS.md) — workspace layout, commands, env vars
- [`plans/`](./plans/) — historical agent/maintainer handoffs; not required
  reading for most contributions
