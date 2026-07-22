# @control/shell — native desktop app (M6)

A Tauri shell that turns CONTROL into a launchable Windows program instead of a
terminal command.

## What it does

- **Spawns and supervises the daemon** — on launch it finds CONTROL_HOME
  (`CONTROL_HOME` env → bundled installer resources → monorepo walk-up) and
  starts the daemon as a hidden child process. Installed builds run
  `node apps/daemon/dist/index.js` from the staged runtime using a **bundled
  Node** under `node/node.exe`; from-repo builds fall back to system Node +
  `node --import tsx apps/daemon/src/index.ts`. The daemon serves the UI at
  `http://127.0.0.1:4400`.
- **Native window** — shows a loading screen, waits for the daemon to accept
  connections, then navigates the window to the daemon-served UI.
- **Tray icon** — Open CONTROL, Restart daemon, Start on login (toggle), Quit.
  Closing the window hides to the tray; the daemon (and your servers) keep
  running. If the shell **spawned** the daemon, Quit stops that child process.
  If a daemon was **already running** on `:4400` (adopted at launch), Quit
  exits the UI only and leaves the existing daemon running.
- **Autostart on login** — via `tauri-plugin-autostart` (Windows registry Run
  key), toggled from the tray.

## Prerequisites

- Rust toolchain + WebView2 runtime (WebView2 ships with Windows 11).
- **Windows:** Visual Studio 2022 (or Build Tools) with “Desktop development with C++”
  — `pnpm build` / `dev` auto-load `vcvars64.bat` so you don't need a Developer Prompt.
- **Building the installer** stages a vendored Node win-x64 into `runtime/node/`.
  End users of the NSIS installer or portable zip do **not** need Node on PATH.

## Develop / build

```bash
pnpm --filter @control/shell stage-runtime   # optional: build the self-contained runtime tree
pnpm --filter @control/shell dev     # tauri dev (MSVC env loaded on Windows)
pnpm --filter @control/shell build   # stages runtime + release build + NSIS installer
```

`build` runs `scripts/stage-runtime.mjs` (downloads Node 22.x win-x64, UI build,
esbuild-bundled daemon, native `better-sqlite3` / `node-pty` install into
`apps/shell/runtime/`), then compiles the Rust shell and produces an installer
under `apps/shell/src-tauri/target/release/bundle/`. The staged `apps/` and
`node/` trees are embedded as Tauri resources next to the exe.

Portable zip (after `build`): `node scripts/make-portable.mjs` →
`dist-release/Control-<version>-portable-win-x64.zip`.

To regenerate the icon set from the source glyph:

```bash
pnpm --filter @control/shell tauri icon icon-source.png
```

## Packaging (self-contained install)

The NSIS installer and portable zip ship:

- `Control.exe`
- `node/` — vendored Node.js win-x64 (daemon runtime)
- `apps/daemon/dist/index.js` (bundled daemon)
- `apps/daemon/node_modules/` (`better-sqlite3`, `node-pty`)
- `apps/ui/dist/` (SPA)

At runtime the shell sets `resource_dir` (install dir on Windows) as
CONTROL_HOME and spawns the staged daemon with the bundled Node — no git
checkout or system Node required.

Override discovery with `CONTROL_HOME` if you need to point at a custom tree.
From-repo `target/release/Control.exe` still walks up to the monorepo and
uses the TypeScript sources when no staged `dist/index.js` is present.

Daemon state still lives in `~/.control/` by default (not beside the portable
folder).
