# CONTROL — Local Dev Command Center

One UI to see and manage every dev server across your projects — host processes
and (soon) Docker stacks alike. A local-first daemon owns process supervision;
a React SPA is a thin client over it, so closing the UI never kills your servers.

See [DESIGN.md](./DESIGN.md) for the full design & requirements.

## Status

Milestones **M0–M5** are implemented (M2/M3 as complete working slices):

- ✅ pnpm workspace: `apps/daemon`, `apps/ui`, `packages/shared` (Zod contracts)
- ✅ Daemon: Hono REST + WebSocket, SQLite (better-sqlite3 + drizzle, lightweight column migrations)
- ✅ Supervision (M1): node-pty spawn, ring-buffer logs over WS, graceful-then-tree-kill
- ✅ Detection (M2): modules (nested workspaces) + actions (package.json, compose, Makefile, Cargo, Go, Python)
- ✅ Override-preserving re-scan (favorites/renames survive)
- ✅ Favorites, dashboard, project detail, run log viewer (xterm.js), port map (M3)
- ✅ Startup reconciliation (adopt surviving runs)
- ✅ Docker (M4): dockerode bridge — container state/health/ports, live container
  log streaming (demuxed), containers mapped to projects by compose label,
  Docker events → live refresh
- ✅ Unified port map (M4): every listening port attributed to a managed run, a
  Docker container, or an external host process (`Get-NetTCPConnection`, Windows).
  Precedence is WSL2-aware — Docker-forwarded ports stay attributed to the
  container via the Docker API, never the relay process that owns them at the OS
  level. Port-conflict warnings now cover container/external occupancy too.
- ✅ Orchestration (M5): launch groups (ordered steps with wait-for-healthy/exit),
  group builder UI, action editor (portHint / healthUrl / env + run history),
  per-project multi-compose-project claiming, and a Ctrl/Cmd-K command palette
- ⏳ Next: Tauri tray + autostart (M6)

## Quick start

```bash
pnpm install          # native modules (node-pty, better-sqlite3) build here
pnpm dev              # daemon (:4400) + UI dev server (:5173) together
```

Open http://localhost:5173, click **Add Project**, and point it at a repo folder.

Run pieces individually:

```bash
pnpm dev:daemon       # daemon only
pnpm dev:ui           # UI dev server only (proxies /api + /ws to :4400)
pnpm typecheck        # all packages
```

Production single-origin mode: `pnpm --filter @control/ui build` then
`pnpm start` — the daemon serves the built SPA from `apps/ui/dist` at :4400.

## Layout

```
apps/daemon/     Node supervision daemon (Hono + WS, node-pty, dockerode, SQLite)
apps/ui/         Vite + React + Tailwind + TanStack Query + xterm.js
packages/shared/ Zod schemas + types shared across the API boundary
```

Daemon state lives in `~/.control/` (SQLite db + per-run log files). Override the
location with `CONTROL_DATA_DIR`, the port with `CONTROL_PORT`.
