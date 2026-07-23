#!/usr/bin/env node
/**
 * Stage a self-contained CONTROL_HOME tree for the Tauri shell installer.
 *
 * Layout:
 *   apps/shell/runtime/
 *     node/node.exe               — vendored Node win-x64 (release builds)
 *     apps/daemon/dist/index.js   — esbuild bundle (JS deps inlined)
 *     apps/daemon/node_modules/   — better-sqlite3 + node-pty only
 *     apps/daemon/package.json
 *     apps/ui/dist/               — Vite SPA
 *
 * Native modules are installed with the vendored Node so their .node binaries
 * match the runtime ABI. Full staging (including native compile) requires
 * Windows — release CI runs on windows-latest.
 */
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import {
  cpSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline } from 'node:stream/promises'

// Must match esbuild `target: 'node22'` and CI `node-version: 22`.
// Bump deliberately; re-stage natives whenever this changes.
const BUNDLED_NODE_VERSION = '22.17.0'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(root, 'apps', 'shell', 'package.json'))
const esbuild = require('esbuild')

const runtime = join(root, 'apps', 'shell', 'runtime')
const nodeDir = join(runtime, 'node')
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
    shell: false,
    ...opts,
  })
  if (r.status !== 0) {
    process.exit(r.status ?? 1)
  }
}

async function downloadFile(url, dest) {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`GET ${url} → ${res.status}`)
  }
  await pipeline(res.body, createWriteStream(dest))
}

async function stageBundledNode() {
  const zipName = `node-v${BUNDLED_NODE_VERSION}-win-x64.zip`
  const url = `https://nodejs.org/dist/v${BUNDLED_NODE_VERSION}/${zipName}`
  const tempRoot = join(tmpdir(), `control-node-${BUNDLED_NODE_VERSION}-${Date.now()}`)
  const zipPath = join(tempRoot, zipName)
  const extractDir = join(tempRoot, 'extract')

  mkdirSync(tempRoot, { recursive: true })
  mkdirSync(nodeDir, { recursive: true })

  console.log('[stage-runtime] downloading', url)
  await downloadFile(url, zipPath)

  mkdirSync(extractDir, { recursive: true })
  if (process.platform === 'win32') {
    const ps = `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`
    const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { stdio: 'inherit' })
    if (r.status !== 0) {
      process.exit(r.status ?? 1)
    }
  } else {
    const r = spawnSync('unzip', ['-q', zipPath, '-d', extractDir], { stdio: 'inherit' })
    if (r.status !== 0) {
      console.error('[stage-runtime] unzip failed — install unzip or run stage-runtime on Windows')
      process.exit(r.status ?? 1)
    }
  }

  const extractedRoot = join(extractDir, `node-v${BUNDLED_NODE_VERSION}-win-x64`)
  if (!existsSync(join(extractedRoot, 'node.exe'))) {
    console.error('[stage-runtime] missing node.exe after extract:', extractedRoot)
    process.exit(1)
  }

  // Copy, don't rename — GitHub Actions puts TEMP on C: and the workspace
  // on D:, so renameSync fails with EXDEV (cross-device link not permitted).
  for (const name of readdirSync(extractedRoot)) {
    const from = join(extractedRoot, name)
    const to = join(nodeDir, name)
    cpSync(from, to, { recursive: true })
  }

  writeFileSync(join(nodeDir, 'VERSION.txt'), `${BUNDLED_NODE_VERSION}\n`)
  rmSync(tempRoot, { recursive: true, force: true })
  console.log('[stage-runtime] vendored Node', BUNDLED_NODE_VERSION, '→', nodeDir)
}

function installNativeModules() {
  if (process.platform !== 'win32') {
    console.error(
      '[stage-runtime] native module install requires Windows (release CI uses windows-latest)',
    )
    process.exit(1)
  }

  const bundledNode = join(nodeDir, 'node.exe')
  const bundledNpm = join(nodeDir, 'npm.cmd')
  if (!existsSync(bundledNode) || !existsSync(bundledNpm)) {
    console.error('[stage-runtime] bundled Node missing — run stageBundledNode first')
    process.exit(1)
  }

  console.log('[stage-runtime] installing native modules with bundled Node')
  const pathKey = process.platform === 'win32' ? 'Path' : 'PATH'
  const nodeBin = dirname(bundledNode)
  const pathPrefix = process.env[pathKey] ? `${nodeBin};${process.env[pathKey]}` : nodeBin

  run(bundledNpm, ['install', '--omit=dev', '--no-fund', '--no-audit'], {
    cwd: daemonRuntime,
    env: { ...process.env, [pathKey]: pathPrefix },
    shell: true,
  })
}

console.log('[stage-runtime] cleaning', runtime)
rmSync(runtime, { recursive: true, force: true })
mkdirSync(join(daemonRuntime, 'dist'), { recursive: true })

await stageBundledNode()

console.log('[stage-runtime] building @control/ui')
run('pnpm', ['--filter', '@control/ui', 'build'], { shell: true })

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
  external: ['better-sqlite3', 'node-pty'],
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  plugins: [
    {
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

installNativeModules()

console.log('[stage-runtime] copying UI dist')
mkdirSync(dirname(uiDest), { recursive: true })
cpSync(uiSrc, uiDest, { recursive: true })

writeFileSync(join(runtime, '.control-home'), 'control-runtime\n')

console.log('[stage-runtime] ready:', runtime)
