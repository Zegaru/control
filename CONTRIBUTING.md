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

## Checks before a PR

These must pass:

```bash
pnpm typecheck
pnpm test
pnpm lint
```

## Pull request expectations

- Keep diffs focused; match existing style (Biome formats/lints the tree)
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
