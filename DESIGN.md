# CONTROL — Design & Requirements



A local-first dev server manager: one UI to see every dev server you have running across all your projects, and start/stop them with one click — host processes and Docker stacks alike.



Status: **implemented through M6** (see [README.md](./README.md) Status). Former working name: Switchboard. Stack: TypeScript daemon + React UI + optional Tauri shell (`apps/shell`).



---



## 1. Goals



- Single pane of glass for all dev servers across projects: what's running, on which port, healthy or not.

- One-click start/stop for any project's dev workflow, including multi-step "bring the whole stack up" flows.

- Zero-config onboarding: point it at a folder, it detects the stack and suggests runnable actions.

- Survive its own UI: closing the browser tab (or the daemon crashing) never kills or loses track of your servers.



### Non-goals



- Not a production process manager (no clustering, zero-downtime reload, or deployment).

- Not a terminal replacement — logs are viewable by default; optional **Attach** sends stdin to a live host run’s PTY (default off; adopted runs unsupported). Not a free-standing shell or full terminal emulator.

- Not multi-user / remote. Localhost, single developer, v1 has no auth.

- Not a Docker Desktop replacement — it reads and controls containers relevant to registered projects, nothing more.



---



## 2. Architecture



Two long-lived pieces plus an optional future shell:



```

┌─────────────────────────┐        REST + WebSocket        ┌──────────────────┐

│  Daemon (Node service)  │ ◄────────────────────────────► │  Web UI (SPA)    │

│  - project registry     │                                │  Vite + React    │

│  - scanner/detection    │                                │  localhost:4400  │

│  - process supervisor   │                                └──────────────────┘

│  - docker bridge        │        Tauri tray shell (`apps/shell`) → same UI

│  - port map             │

│  listens 127.0.0.1:4400 │──── node-pty ──► host processes (vite, workers, …)

└─────────────────────────┘──── dockerode ─► Docker Engine API (compose stacks)

```



- **Daemon** owns all state and side effects. The UI is a thin client; every feature must be reachable via the API.

- Daemon serves the built SPA itself in production mode (one port, no CORS pain); in dev the SPA runs on Vite with a proxy.

- **M6 (shipped)**: Tauri shell (`apps/shell`) whose webview points at the daemon, adding tray icon + autostart. No business logic in the shell.



### Repo layout (pnpm workspace)



```

apps/daemon/      # Node service: Hono + WS, supervisor, scanner, docker bridge

apps/ui/          # Vite + React + Tailwind + TanStack Query + xterm.js

apps/shell/       # Tauri desktop shell (tray, autostart, daemon spawn/adopt)

packages/shared/  # Zod schemas + TS types shared by daemon and UI (API contracts)

```



---



## 3. Tech stack



| Concern | Choice | Notes |

|---|---|---|

| Language | TypeScript everywhere | strict, ES2022 |

| Daemon HTTP | Hono (or Fastify) | REST + WebSocket upgrade |

| Process spawn | node-pty | ConPTY on Windows; preserves colors/spinners. Native module — pin the daemon Node version |

| Process kill | tree-kill | `taskkill /PID x /T /F` on Windows; kills the cmd→node child tree |

| One-shot commands | execa | scans, git info, port queries |

| Docker | dockerode | Engine API: container list/state/logs, compose via labels |

| DB | SQLite via better-sqlite3 + drizzle | registry, favorites, run history; single file in the daemon's data dir |

| UI framework | React 19 + Vite (SPA) | TanStack Router + Query; no SSR |

| Styling | Tailwind | |

| Log rendering | @xterm/xterm | fed raw PTY bytes over WS |

| Validation | Zod (in packages/shared) | one schema source for API contracts |



---



## 4. Data model



Three-layer hierarchy — **Project → Module → Action** — plus runtime **Runs**.



```

projects   id, name, rootPath, favorite, icon?, createdAt, lastScanAt

modules    id, projectId, relPath ('' = root), name, detectedStacks (json), hidden

actions    id, moduleId, naturalKey, name, command, cwd?, type, source,

           favorite, hidden, envOverrides (json), portHint?, healthUrl?

runs       id, actionId, pid?, status, startedAt, exitedAt?, exitCode?,

           ports (json), logFile?

groups     id, projectId?, name, steps (json: ordered [{actionId, waitFor: 'healthy'|'exit'|'none'}])

```



- `actions.type`: `script` (package.json/Makefile/etc.) | `compose` (docker compose stack/service) | `custom` (user-defined command).

- `actions.source`: `detected` | `custom`. **Detected actions carry a stable `naturalKey`** (`moduleRelPath + ':' + sourceKind + ':' + scriptName`). Re-scans upsert by naturalKey and never touch user-owned fields (`favorite`, `hidden`, renamed `name`, `envOverrides`, `healthUrl`). This is the rule that makes re-scanning safe.

- `runs.status`: `starting → running → healthy | unhealthy` and terminal `exited | failed | killed`; plus `adopted` (see §6).

- `groups` are launch profiles: ordered steps with wait conditions ("start infra, wait healthy, then web + worker"). A group can span modules; project-level groups cover the original "start them all" ask.



---



## 5. Detection engine



Pure TS module in the daemon. Input: a project root. Output: modules + suggested actions. Runs on project add and on demand ("Re-scan").



### Module discovery (nested/multi-folder projects)



1. Root is always a module.

2. Expand workspaces: `pnpm-workspace.yaml` globs, `package.json#workspaces`, `turbo.json`, `nx.json`, `lerna.json`.

3. Recursive marker-file scan (depth ≤ 4) for sub-apps workspaces miss (e.g. `mobile/` with its own lockfile, `infrastructure/docker/`).

4. Ignore: `node_modules`, `.git`, `dist`, `build`, `.next`, `target`, `__pycache__`, user-configurable globs. Stop at nested `.git` boundaries (that's a different project).



### Marker table (per module)



| Marker | Stack inference | Suggested actions |

|---|---|---|

| `package.json` | Node; lockfile → pm (pnpm-lock.yaml / yarn.lock / package-lock.json / bun.lockb) | every script, run via detected pm |

| `docker-compose*.yml`, `compose.yaml` | Compose stack | `up -d`, `down`, per-service up; stack becomes a container-backed action |

| `Makefile`, `justfile` | Make/Just | each target |

| `Cargo.toml` | Rust | `cargo run`, `cargo test`, `cargo build` |

| `go.mod` | Go | `go run .`, `go test ./...` |

| `pyproject.toml` (+ uv.lock / poetry.lock) | Python | declared scripts; `uv run` / `poetry run` |

| `manage.py` | Django | `runserver` |

| `app.json` + `eas.json`, `metro.config.js` | Expo / React Native | `start`, `run:android` |

| `android/gradlew`, `ios/*.xcworkspace` | Mobile native | gradle tasks (xcode actions flagged mac-only) |

| `.claude/launch.json` | explicit dev-server config | import entries directly (highest-confidence signal) |



### Runnability heuristics



- Script names matching `dev|start|serve|watch|preview` → classified **primary** (surfaced prominently, auto-suggested as favorites on first scan).

- `build|test|lint|typecheck|format` → **secondary** (available, collapsed by default).

- Long-running vs one-shot matters for supervision: primary actions are treated as servers (health checks, ports); secondary as tasks (exit code is the result).



---



## 6. Process supervision



The deliberately-small core the daemon owns:



- **Spawn**: node-pty, `cwd` = action's module path, env = process env + `envOverrides`. On Windows, resolve `.cmd` shims (pnpm/npm/yarn) — spawn via `cmd.exe /c <command>` or resolve the shim path explicitly; node-pty does not do shell resolution for you.

- **Logs**: per-run ring buffer (default 5 MB / 10k lines) streamed to WS subscribers; optionally mirrored to a log file per run (retention: last N runs per action, default 5).

- **Stop**: write `\x03` (Ctrl-C) to the PTY, wait 5 s for graceful exit, then `tree-kill`. Always tree-kill on "force stop".

- **Health**: `starting` until port listens (from `portHint` or discovered); optional `healthUrl` HTTP 200 check promotes to `healthy`. Port open ≠ healthy — keep both signals.

- **Port discovery**: `Get-NetTCPConnection -State Listen` mapped to the run's PID tree (host processes); dockerode port bindings (containers). WSL2-relayed ports all belong to the relay process — attribution for those MUST come from the Docker API, never netstat.

- **Reconciliation / adoption**: on daemon start, walk the `runs` table: PID alive + expected port listening → mark `adopted` (stop + port status supported; PTY log stream is lost — documented limitation). PID dead → mark `exited` retroactively. Never trust stored PIDs without probing.

- **Crash safety**: runs are written to SQLite at spawn time, before the first log line, so a daemon crash can't orphan-and-forget.



Container-backed actions (`type: compose`) bypass all of the above: dockerode provides state, health, ports, and log streams.



---



## 7. API design



Bind `127.0.0.1` only. No auth in v1 (localhost trust); token auth is a later flag if LAN access is ever wanted.



### REST



```

GET    /api/projects                     list (with favorite flags, active-run counts)

POST   /api/projects                     register { rootPath } → triggers initial scan

POST   /api/projects/:id/scan            re-scan (override-preserving)

PATCH  /api/projects/:id                 rename, favorite, icon

DELETE /api/projects/:id                 unregister (never touches the folder)



GET    /api/projects/:id/tree            modules + actions, nested

PATCH  /api/modules/:id                  hide, rename

POST   /api/actions                      create custom action

PATCH  /api/actions/:id                  favorite, hide, rename, env, healthUrl, portHint

POST   /api/actions/:id/start            → run id

POST   /api/runs/:id/stop                graceful; ?force=true → tree-kill

GET    /api/runs?active=true             all active runs across projects

GET    /api/runs/:id/logs?tail=1000      ring-buffer snapshot (WS for live)



GET    /api/groups / POST / PATCH / DELETE

POST   /api/groups/:id/start             ordered start honoring waitFor

POST   /api/groups/:id/stop              reverse-order stop



GET    /api/ports                        unified port map (host runs + containers + external/unknown)

GET    /api/docker/containers            containers relevant to registered projects

```



### WebSocket (`/ws`, multiplexed JSON events)



```

run.status   { runId, status, ports }

run.log      { runId, chunk }            (subscribe per run)

ports.changed

docker.event { containerId, status }

scan.done    { projectId }

```



All request/response shapes defined as Zod schemas in `packages/shared` — the daemon validates, the UI infers types.



---



## 8. UI



Five screens; the dashboard is the product.



1. **Dashboard** — favorite actions as buttons grouped by project ("ent-agi: ▶ infra ▶ web ▶ worker"), launch-group buttons, an active-runs strip (name, uptime, port badges, health dot, stop), and port-conflict warnings.

2. **Project detail** — module tree (root, apps/web, services/worker, …), actions per module with star toggles, primary/secondary separation, re-scan button, group editor.

3. **Run view** — xterm log pane, status/uptime/exit code, port badges (click → open in browser), stop / force stop / restart.

4. **Port map** — every listening port → owner (run, container, or "external/unknown" with PID + process name).

5. **Settings** — scan roots, ignore globs, log retention, daemon port, theme.



Design notes: dark-mode first; status semantics by color (gray idle, blue starting, green healthy, amber unhealthy/adopted, red failed); every list keyboard-navigable; command palette (Ctrl-K → fuzzy "start ent-agi web") is cheap and high-value once actions are in SQLite.



---



## 9. Requirements



### Functional



- **FR-1** Register a project by folder path; unregister without touching disk.

- **FR-2** Scan detects modules (workspaces + nested markers) and suggests actions per the marker table (§5).

- **FR-3** Re-scan preserves all user edits via naturalKey overrides (§4).

- **FR-4** Start/stop any action; stop is graceful-then-force; force always kills the full process tree.

- **FR-5** Live log streaming per run; scrollback from ring buffer; recent-run logs retrievable after exit.

- **FR-6** Favorite projects and favorite actions; dashboard surfaces favorites across all projects.

- **FR-7** Launch groups: ordered multi-action start with wait-for-healthy/exit conditions; reverse-order stop.

- **FR-8** Compose stacks are first-class actions: state, health, ports, logs via Docker API.

- **FR-9** Unified port map attributing every listening dev port to a run, container, or external process.

- **FR-10** Health model distinguishes port-open from HTTP-healthy; UI shows the distinction.

- **FR-11** Daemon restart reconciles: still-running servers are adopted (stoppable, port-visible), dead ones marked exited.

- **FR-12** Custom actions: arbitrary command + cwd + env, same lifecycle as detected ones.

- **FR-13** Run history per action (last N runs: duration, exit code, log file).

- **FR-14** Multiple simultaneous runs across projects; port-conflict detection warns before starting an action whose portHint is taken.



### Non-functional



- **NFR-1** Windows 11 first (ConPTY, taskkill, Get-NetTCPConnection, WSL2-aware port attribution); macOS/Linux should work via node-pty but are not v1 test targets.

- **NFR-2** Daemon binds 127.0.0.1 only; no remote surface.

- **NFR-3** Closing the UI never affects running servers; daemon is the only supervisor.

- **NFR-4** Bounded memory: log ring buffers capped per run; idle daemon < ~150 MB RSS.

- **NFR-5** UI reflects run-status changes < 500 ms (WS push, no polling).

- **NFR-6** Scan of a large monorepo (~2k dirs after ignores) < 3 s.

- **NFR-7** SQLite is the single source of truth; daemon is crash-safe per §6.

- **NFR-8** Secrets hygiene: env override values masked in UI by default; logs are stored as-is (documented).



---



## 10. Milestones



- **M0 — Scaffold**: pnpm workspace, daemon skeleton (Hono + WS), SPA skeleton, shared Zod contracts, SQLite + drizzle migrations.

- **M1 — Supervision core**: manual project + custom action; start/stop with PTY logs over WS; tree-kill; run records. *(Proves the hardest layer first.)*

- **M2 — Detection**: scanner, modules, suggested actions, naturalKey override-preserving re-scan.

- **M3 — Favorites + Dashboard**: star flags, dashboard grid, active-runs strip.

- **M4 — Docker + ports**: dockerode bridge, compose actions, unified port map, conflict warnings.

- **M5 — Orchestration + resilience**: launch groups, health checks, adoption/reconciliation, run history, command palette.

- **M6 (optional) — Shell**: Tauri tray wrapper, autostart via Task Scheduler, "open UI" / quick-start tray menu.



Each milestone ends usable. M1–M3 is the MVP that replaces the current pain.



---



## 11. Risks & open questions



- **Name**: Switchboard is a placeholder (candidates: Switchboard, DevDeck, Helm).

- **node-pty native builds**: pin Node version; document rebuild step. If it becomes painful, fallback is plain `child_process` + strip-ansi (lose colors, keep everything else).

- **Ctrl-C semantics on Windows**: `\x03` via ConPTY works for most Node servers but not all runtimes; force-kill path must always be reliable — treat graceful stop as best-effort.

- **Monorepo task runners**: should `turbo run dev` at root be preferred over per-module scripts? v1: detect both, let favorites decide.

- **Env file handling**: per-action selection of `.env` files (this repo's `.env.local` pattern) — deferred past MVP; envOverrides covers the gap.

- **Log privacy**: dev logs can contain tokens; retention is local-only and capped, but no scrubbing in v1.

- **Compose project attribution**: map containers to projects via compose labels (`com.docker.compose.project`) matched against detected compose files' project names.
