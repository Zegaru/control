#!/usr/bin/env node
/**
 * Assemble a portable Windows zip from a release build.
 *
 * Expects `pnpm --filter @control/shell build` to have run so that
 * target/release/Control.exe sits beside bundled `apps/` and `node/`.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const releaseDir = join(root, 'apps', 'shell', 'src-tauri', 'target', 'release')
const tauriConf = JSON.parse(
  readFileSync(join(root, 'apps', 'shell', 'src-tauri', 'tauri.conf.json'), 'utf8'),
)
const version = tauriConf.version
const distRelease = join(root, 'dist-release')
const folderName = `Control-${version}-portable-win-x64`
const outDir = join(distRelease, folderName)
const zipPath = join(distRelease, `${folderName}.zip`)

const exe = join(releaseDir, 'Control.exe')
const apps = join(releaseDir, 'apps')
const node = join(releaseDir, 'node')

for (const [label, path] of [
  ['Control.exe', exe],
  ['apps/', apps],
  ['node/', node],
]) {
  if (!existsSync(path)) {
    console.error(`[make-portable] missing ${label} at ${path}`)
    console.error('[make-portable] run pnpm --filter @control/shell build first')
    process.exit(1)
  }
}

mkdirSync(distRelease, { recursive: true })
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

cpSync(exe, join(outDir, 'Control.exe'))
cpSync(apps, join(outDir, 'apps'), { recursive: true })
cpSync(node, join(outDir, 'node'), { recursive: true })

rmSync(zipPath, { force: true })
const ps = `Compress-Archive -LiteralPath '${outDir.replace(/'/g, "''")}' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`
const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { stdio: 'inherit' })
if (r.status !== 0) {
  process.exit(r.status ?? 1)
}

console.log('[make-portable] wrote', zipPath)
