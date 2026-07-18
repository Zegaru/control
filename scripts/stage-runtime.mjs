#!/usr/bin/env node
/**
 * Stage a self-contained CONTROL_HOME tree for the Tauri shell installer.
 *
 * Layout:
 *   apps/shell/runtime/
 *     apps/daemon/dist/index.js   — esbuild bundle (JS deps inlined)
 *     apps/daemon/node_modules/   — better-sqlite3 + node-pty only
 *     apps/daemon/package.json
 *     apps/ui/dist/               — Vite SPA
 *
 * Native modules are installed fresh into the staging dir so their .node
 * binaries match the build machine (Windows x64 for the NSIS target).
 */
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(root, 'apps', 'shell', 'package.json'))
const esbuild = require('esbuild')

const runtime = join(root, 'apps', 'shell', 'runtime')
const daemonRuntime = join(runtime, 'apps', 'daemon')
const uiSrc = join(root, 'apps', 'ui', 'dist')
const uiDest = join(runtime, 'apps', 'ui', 'dist')

const daemonPkg = JSON.parse(
  readFileSync(join(root, 'apps', 'daemon', 'package.json'), 'utf8'),
)

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    ...opts,
  })
  if (r.status !== 0) {
    process.exit(r.status ?? 1)
  }
}

console.log('[stage-runtime] cleaning', runtime)
rmSync(runtime, { recursive: true, force: true })
mkdirSync(join(daemonRuntime, 'dist'), { recursive: true })

console.log('[stage-runtime] building @control/ui')
run('pnpm', ['--filter', '@control/ui', 'build'])

if (!existsSync(join(uiSrc, 'index.html'))) {
  console.error('[stage-runtime] missing apps/ui/dist — UI build failed?')
  process.exit(1)
}

console.log('[stage-runtime] bundling daemon → dist/index.js')
await esbuild.build({
  absWorkingDir: root,
  entryPoints: [join(root, 'apps', 'daemon', 'src', 'index.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: join(daemonRuntime, 'dist', 'index.js'),
  // Native addons must load from node_modules (their .node binaries).
  external: ['better-sqlite3', 'node-pty'],
  // CJS deps (e.g. tree-kill) call require(); bridge that in the ESM bundle.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  plugins: [
    {
      // dockerode optionally pulls ssh2 / cpu-features; we disable those in the
      // workspace — stub them so the bundle does not hard-require missing natives.
      name: 'stub-optional-docker-ssh',
      setup(build) {
        for (const id of ['ssh2', 'cpu-features']) {
          build.onResolve({ filter: new RegExp(`^${id}$`) }, () => ({
            path: id,
            namespace: 'control-stub',
          }))
        }
        build.onLoad({ filter: /.*/, namespace: 'control-stub' }, () => ({
          contents: 'module.exports = {};',
          loader: 'js',
        }))
      },
    },
  ],
  logLevel: 'info',
})

writeFileSync(
  join(daemonRuntime, 'package.json'),
  JSON.stringify(
    {
      name: 'control-daemon-runtime',
      private: true,
      type: 'module',
      dependencies: {
        'better-sqlite3': daemonPkg.dependencies['better-sqlite3'],
        'node-pty': daemonPkg.dependencies['node-pty'],
      },
    },
    null,
    2,
  ) + '\n',
)

console.log('[stage-runtime] installing native modules into staging')
// Use npm here so install scripts always run (pnpm 11 blocks builds unless
// allowBuilds is configured; a throwaway staging tree shouldn't need that).
run('npm', ['install', '--omit=dev', '--no-fund', '--no-audit'], {
  cwd: daemonRuntime,
})

console.log('[stage-runtime] copying UI dist')
mkdirSync(dirname(uiDest), { recursive: true })
cpSync(uiSrc, uiDest, { recursive: true })

// Marker so find_control_home can recognize a staged tree without pnpm-workspace.yaml.
writeFileSync(join(runtime, '.control-home'), 'control-runtime\n')

console.log('[stage-runtime] ready:', runtime)
