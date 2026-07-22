# AGENTS.md — CONTROL workspace guide

CONTROL is a local-first dev command center: run and track every local service without living in a console. A Node daemon supervises host processes and Docker stacks; a React SPA is the thin client. Product intent: [DESIGN.md](./DESIGN.md).

## Layout

| Package | Role |
|---------|------|
| `apps/daemon` | Hono REST + WebSocket, SQLite, node-pty supervisor, dockerode |
| `apps/ui` | Vite + React + Tailwind + TanStack Query |
| `apps/shell` | Tauri desktop shell (tray, autostart, daemon spawn/adopt) |
| `packages/shared` | Zod schemas + shared types |

## Tooling

- Package manager: **pnpm** (`packageManager: pnpm@11.5.3`)
- Node: **≥22**
- Styling: **TailwindCSS**

## Commands

```bash
pnpm install
pnpm typecheck    # all workspace packages
pnpm test         # Vitest characterization suite
pnpm lint         # Biome check
pnpm dev          # daemon + UI — do not start unless the user asks
pnpm dev:daemon   # clear stale CONTROL or bump CONTROL_PORT (4401…) then start
pnpm kill:daemon  # free CONTROL_PORT only if a CONTROL daemon owns it
pnpm dev:ui
pnpm build
pnpm start        # production: daemon serves built UI on :4400
```

Assume the app is **already running** during agent sessions unless the user explicitly asks you to start it.

## Environment

| Variable | Purpose |
|----------|---------|
| `CONTROL_DATA_DIR` | Daemon state dir (default `~/.control`) |
| `CONTROL_PORT` | Daemon port (default `4400`) |
| `CONTROL_HOST` | Bind host — **loopback only** (`127.0.0.1`, `localhost`, `::1`) |
| `CONTROL_HOME` | Shell: path to CONTROL tree with `apps/daemon` |

## Ports

- Daemon: `4400`
- UI dev server: `5173` (proxies `/api` + `/ws` to daemon)

## Plans

Implementation plans from `/improve` live in [`plans/`](plans/). Read the relevant plan fully before executing; update `plans/README.md` status when done.

## Native modules

`better-sqlite3` and `node-pty` compile on install. Build scripts are allowlisted in `pnpm-workspace.yaml`.
