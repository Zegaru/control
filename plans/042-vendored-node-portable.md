# Plan 042: Vendor Node into NSIS + ship a portable Windows zip

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 7fe4019..HEAD -- scripts/stage-runtime.mjs apps/shell/src-tauri/src/main.rs apps/shell/src-tauri/tauri.release.conf.json apps/shell/README.md README.md CONTRIBUTING.md .github/workflows/release.yml .gitignore`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `7fe4019`, 2026-07-22

## Why this matters

The Windows NSIS installer (`Control_*_x64-setup.exe`) stages the daemon UI and native addons but still launches the daemon with **system** `node.exe` from PATH (`apps/shell/src-tauri/src/main.rs`). That is unusual for a desktop app and blocks non-developer users. Vendoring an official Node win-x64 binary into the staged runtime — and building `better-sqlite3` / `node-pty` against **that same** binary — makes the installer fully independent. The same layout enables a **portable zip** (unzip + run `Control.exe`) with almost no extra product work.

## Current state

**Shell resolves Node from PATH only** (`main.rs` ~78–99):

```rust
fn node_program() -> PathBuf {
    #[cfg(windows)]
    {
        if let Some(path) = which_node_exe() {
            return path;
        }
    }
    PathBuf::from("node")
}
```

`spawn_daemon(home)` calls `Command::new(node_program())` and does **not** look under `home` for a bundled Node (`main.rs` ~107–174). Failure copy still says “is Node.js ≥22 on PATH?” (~396).

**Staging** (`scripts/stage-runtime.mjs`):

- Builds UI, esbuild-bundles daemon to `apps/shell/runtime/apps/daemon/dist/index.js` (`target: 'node22'`, externals: `better-sqlite3`, `node-pty`)
- `npm install` in staging for natives only
- Copies UI dist; writes `.control-home` at `runtime/` root
- **Does not** download or copy any `node.exe`

**Release resources** (`apps/shell/src-tauri/tauri.release.conf.json`):

```json
"resources": {
  "../runtime/apps": "apps"
}
```

Only `apps/` is embedded — no `node/` tree.

**Release workflow** (`.github/workflows/release.yml`): builds shell, uploads NSIS `*.exe` + `SHA256SUMS`. No portable zip.

**Docs**: README / `apps/shell/README.md` / CONTRIBUTING state Node ≥22 required on PATH for the desktop app.

**Constraints (do not violate):**

- Staged `.node` natives **must** be compiled with the **exact** Node major/ABI you ship (pin one Node 22.x win-x64 build).
- Dev (`tauri dev` / debug): keep using monorepo + system/dev Node + `tsx` path; do **not** require vendored Node for day-to-day `pnpm --filter @control/shell dev`.
- Do **not** mutate the user’s global PATH; only point the child process at the bundled `node.exe`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Stage only | `pnpm --filter @control/shell stage-runtime` | `apps/shell/runtime/node/node.exe` exists; natives under `runtime/apps/daemon/node_modules` |
| Full Windows package | `pnpm --filter @control/shell build` | NSIS under `apps/shell/src-tauri/target/release/bundle/nsis/` |
| Typecheck (JS) | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 (warnings OK if pre-existing) |
| Smoke Node version | `apps/shell/runtime/node/node.exe -v` | prints the pinned `v22.x.x` |

## Scope

**In scope**:

- `scripts/stage-runtime.mjs` — download/pin Node win-x64; install natives with that Node; lay out `runtime/node/`
- `apps/shell/src-tauri/tauri.release.conf.json` — also map `../runtime/node` → `node`
- `apps/shell/src-tauri/src/main.rs` — prefer `$CONTROL_HOME/node/node.exe` (Windows: `node.exe`) before PATH; pass `home` into resolver; update error string for release builds
- Optional small helper script `scripts/make-portable.mjs` (or inline step in release workflow) to assemble + zip portable layout
- `.github/workflows/release.yml` — produce and upload portable zip + include in GitHub Release assets; keep NSIS
- Docs: `README.md`, `apps/shell/README.md`, `CONTRIBUTING.md` (cutting a release / install paths) — remove “system Node required for desktop app”; note portable zip; keep Node required for **contributor** `pnpm` workflows
- `.gitignore` — ensure `apps/shell/runtime/` still covers vendored Node (already ignored); do **not** commit Node binaries

**Out of scope**:

- Code signing / SmartScreen reputation
- Tauri auto-updater
- macOS/Linux bundles or vendored Node for non-Windows
- Changing daemon to non-Node runtime
- `CONTROL_DATA_DIR` beside exe (“USB portable state”) — keep `~/.control`; mention as future note only
- Rewriting CI test matrix
- Re-tagging `v0.1.0` (operator cuts a new version after this lands)

## Git workflow

- Branch: `advisor/042-vendored-node-portable`
- Commit example: `Vendor Node into the Windows shell runtime and add a portable zip.`
- Do NOT push unless instructed.

## Steps

### Step 1: Pin and stage official Node win-x64

In `scripts/stage-runtime.mjs`:

1. Add a constant near the top, e.g.:

   ```js
   // Must match esbuild `target: 'node22'` and CI `node-version: 22`.
   // Bump deliberately; re-stage natives whenever this changes.
   const BUNDLED_NODE_VERSION = '22.17.0' // pick a current 22.x from https://nodejs.org/dist/ — verify the zip exists
   ```

   Before locking the string, verify with a HEAD request or browser that  
   `https://nodejs.org/dist/v${BUNDLED_NODE_VERSION}/node-v${BUNDLED_NODE_VERSION}-win-x64.zip` returns 200. If 404, pick the latest 22.x that exists.

2. After cleaning `runtime/`, download that zip into a temp dir (Node built-ins `https`/`fetch` + `fs`, or `powershell Expand-Archive` on Windows). Prefer pure Node so Linux CI agents that only *typecheck* aren’t required to stage — **staging Node is Windows-oriented**; if `process.platform !== 'win32'`, either:
   - **STOP and skip download** with a clear console message that full stage-runtime for release is Windows-only, **or**
   - still download the win-x64 zip on any OS (zip is just files) so macOS/Linux maintainers can prepare the tree — **prefer downloading win-x64 zip on any host** so the staged tree is correct; natives `npm install` for win32 `.node` files should run with the **extracted** `node.exe` via Wine only on Windows.  

   **Lock this plan’s rule:** `stage-runtime` **requires Windows** (or at least runs the native `npm install` using the extracted `node.exe` only when `process.platform === 'win32'`). On non-Windows: download + extract Node into `runtime/node` for layout completeness is optional; **native module install must run on Windows** (release CI is `windows-latest`). Document that in the script header.

3. Extract so the layout is:

   ```
   apps/shell/runtime/node/node.exe
   apps/shell/runtime/node/…   # rest of official win-x64 distribution (npm, LICENSE, etc.)
   ```

   Official zip contains a top folder `node-vVERSION-win-x64/` — flatten or rename so `runtime/node/node.exe` exists (do not leave an extra nesting level that breaks resolution).

4. Change the staging `npm install` to invoke **that** Node’s npm, e.g. on Windows:

   ```js
   const bundledNode = join(runtime, 'node', 'node.exe')
   const bundledNpmCli = join(runtime, 'node', 'node_modules', 'npm', 'bin', 'npm-cli.js')
   // run: bundledNode bundledNpmCli install --omit=dev ...
   ```

   or `cmd /c` with PATH prepended to `runtime/node` for that spawn only. Goal: `better-sqlite3` / `node-pty` compile against the bundled ABI.

5. Keep existing esbuild + UI copy + `.control-home` behavior.

6. Write `runtime/node/VERSION.txt` (or similar) containing `BUNDLED_NODE_VERSION` for support/debug.

**Verify** (on Windows):

```bash
pnpm --filter @control/shell stage-runtime
apps/shell/runtime/node/node.exe -v
# expect v22.x.x matching the pin
test -f apps/shell/runtime/apps/daemon/dist/index.js
# natives present:
ls apps/shell/runtime/apps/daemon/node_modules/better-sqlite3
ls apps/shell/runtime/apps/daemon/node_modules/node-pty
```

### Step 2: Bundle `node/` as a Tauri resource

Update `apps/shell/src-tauri/tauri.release.conf.json`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "bundle": {
    "resources": {
      "../runtime/apps": "apps",
      "../runtime/node": "node"
    }
  }
}
```

**Verify**: after a release build, the installed/resource tree includes both `apps/` and `node/node.exe`. Inspect `apps/shell/src-tauri/target/release/` and/or NSIS output contents (or run the built `Control.exe` once and confirm daemon log shows the bundled path).

### Step 3: Prefer bundled Node in the shell

In `apps/shell/src-tauri/src/main.rs`:

1. Change resolution to take `home: &Path`:

   ```rust
   fn node_program(home: &Path) -> PathBuf {
       #[cfg(windows)]
       {
           let bundled = home.join("node").join("node.exe");
           if bundled.is_file() {
               return bundled;
           }
       }
       #[cfg(not(windows))]
       {
           let bundled = home.join("node").join("node");
           if bundled.is_file() {
               return bundled;
           }
       }
       // existing PATH / "node" fallback for monorepo dev
       …
   }
   ```

2. In `spawn_daemon`, use `Command::new(node_program(home))`.

3. Update the user-visible failure string (~396): for missing bundled Node **and** missing PATH Node, say something like:  
   `Daemon did not start — bundled Node missing and no node on PATH. See %TEMP%\control-daemon.log`  
   Do not claim “install Node ≥22” as the primary fix for **release** builds once bundling ships; PATH remains a **dev** fallback.

4. Optionally log which Node binary was chosen in the daemon log header (path), to ease support.

**Verify**:

- Debug/`tauri dev`: still works with monorepo + system Node (no `runtime/node` required).
- After `pnpm --filter @control/shell build`, launching the release `Control.exe` with **PATH stripped of Node** still starts the daemon (manual: temporarily rename/remove node from PATH in a test shell, or set PATH to minimal system dirs only).

### Step 4: Portable zip assembly

Add `scripts/make-portable.mjs` (or equivalent) that runs **after** a successful shell release build and staging:

**Inputs:**

- `apps/shell/src-tauri/target/release/Control.exe`
- `apps/shell/runtime/apps/`
- `apps/shell/runtime/node/`

**Output layout** (example):

```
dist-release/Control-<version>-portable-win-x64/
  Control.exe
  apps/…
  node/…
```

Zip to `dist-release/Control-<version>-portable-win-x64.zip`.

Version string: read from `apps/shell/src-tauri/tauri.conf.json` `"version"` (or root `package.json`).

**Important:** Confirm that when users run portable `Control.exe`, `app.path().resource_dir()` resolves to the folder that contains `apps/` and `node/`. If Tauri expects resources under a `resources/` subdirectory next to the exe, either:

- assemble the zip in that exact layout, **or**
- set `CONTROL_HOME` via a tiny `Control.cmd` wrapper (prefer fixing layout to match `resource_dir` — no wrapper unless STOP).

Inspect how the NSIS-installed app lays out files (or Tauri docs for Windows resource_dir) and **match that** in the zip. If unclear after one local build, STOP and report the on-disk layout you observed under `target/release` / a test install.

**Verify**: unzip portable zip to a temp dir, run `Control.exe` with Node removed from PATH, UI loads at the daemon origin.

### Step 5: Release workflow uploads portable zip

Update `.github/workflows/release.yml`:

1. After NSIS build + collect NSIS exe, run portable assembly (node script).
2. Ensure `dist-release/` contains:
   - `Control_*_x64-setup.exe` (NSIS)
   - `Control-*-portable-win-x64.zip`
   - `SHA256SUMS` covering **all** of the above
3. Artifact upload + `softprops/action-gh-release` already glob `dist-release/*` — keep that.

**Verify**: workflow YAML validates; on next tag (operator), Release assets include both installer and zip. Executor does **not** need to publish a tag unless asked.

### Step 6: Docs

Update:

- Root `README.md` — Native Windows app: **no system Node** for installer/portable; Node still required for contributor `pnpm` flows; link both artifacts from Releases
- `apps/shell/README.md` — remove “Node ≥22 on PATH at runtime” as a hard requirement for installed builds; document bundled Node + portable zip
- `CONTRIBUTING.md` — cutting a release: mention portable zip asset; bump flow unchanged

**Verify**: `rg -n "Node ≥22 still required on PATH at runtime|Node ≥22 on PATH at runtime" README.md apps/shell/README.md` → no stale claims about the **installed** app. Contributor prerequisites may still mention Node.

### Step 7: Sanity

```bash
pnpm typecheck
pnpm lint
```

On Windows (required for full confidence):

```bash
pnpm --filter @control/shell stage-runtime
pnpm --filter @control/shell build
# then portable script + PATH-less smoke if feasible
```

## Test plan

- No new Vitest unit tests required (packaging).
- Manual / CI:
  1. Staged `runtime/node/node.exe -v` matches pin
  2. Release `Control.exe` starts daemon with Node absent from PATH
  3. Portable zip same smoke
  4. Dev `pnpm --filter @control/shell dev` still uses monorepo/tsx path
- Regression: daemon still serves UI; tray Quit/Restart still works (owned vs adopted daemon — do not change that policy)

## Done criteria

- [ ] `stage-runtime` vendors pinned Node 22.x win-x64 under `runtime/node/` and builds natives with it
- [ ] `tauri.release.conf.json` embeds `apps` **and** `node`
- [ ] Shell prefers `$CONTROL_HOME/node/node.exe` before PATH
- [ ] Release workflow produces NSIS **and** portable zip + checksums
- [ ] Docs no longer require system Node for the desktop installer/portable
- [ ] `apps/shell/runtime/` remains gitignored (no Node binaries committed)
- [ ] `plans/README.md` status row for 042 → DONE

## STOP conditions

- Official Node zip URL 404s for the chosen version and no alternate 22.x works
- Native modules fail to build against bundled Node and the failure is not a missing MSVC toolchain on the build machine
- Portable/`resource_dir` layout cannot be made to find `apps/` + `node/` without a fragile wrapper — report observed paths
- Fix appears to require rewriting the daemon off Node or embedding SEA/pkg
- Operator asks for macOS/Linux portable in the same change set

## Maintenance notes

- Bumping `BUNDLED_NODE_VERSION` requires a full Windows re-stage and a new release; note it next to the constant and in CONTRIBUTING release steps
- Keep CI `setup-node` major aligned with the bundled major (22)
- Signing (Authenticode) still deferred; portable zip gets the same SmartScreen story as NSIS
- Future: optional `CONTROL_DATA_DIR` beside exe for USB-style portability; not part of this plan
- Reviewer should confirm Release assets on the next tagged version include both installer and zip
