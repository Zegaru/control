#!/usr/bin/env node
/**
 * Bump CONTROL version across the monorepo.
 *
 * Usage: node scripts/bump-version.mjs <x.y.z>
 *
 * Updates:
 *   - root + workspace package.json "version"
 *   - apps/daemon/src/version.ts
 *   - apps/shell/src-tauri/Cargo.toml
 *   - apps/shell/src-tauri/tauri.conf.json
 *
 * Does not edit CHANGELOG.md — update that by hand before tagging.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const next = process.argv[2]

if (!next || !/^\d+\.\d+\.\d+$/.test(next)) {
  console.error('Usage: node scripts/bump-version.mjs <x.y.z>')
  process.exit(1)
}

function read(rel) {
  return readFileSync(join(root, rel), 'utf8')
}

function write(rel, text) {
  writeFileSync(join(root, rel), text)
  console.log('updated', rel)
}

const packageJsonPaths = [
  'package.json',
  'apps/daemon/package.json',
  'apps/ui/package.json',
  'apps/shell/package.json',
  'packages/shared/package.json',
]

for (const rel of packageJsonPaths) {
  const pkg = JSON.parse(read(rel))
  pkg.version = next
  write(rel, `${JSON.stringify(pkg, null, 2)}\n`)
}

write(
  'apps/daemon/src/version.ts',
  `export const version = '${next}'\n`,
)

{
  const rel = 'apps/shell/src-tauri/Cargo.toml'
  const text = read(rel).replace(/^version = "[^"]+"/m, `version = "${next}"`)
  write(rel, text)
}

{
  const rel = 'apps/shell/src-tauri/tauri.conf.json'
  const conf = JSON.parse(read(rel))
  conf.version = next
  write(rel, `${JSON.stringify(conf, null, 2)}\n`)
}

console.log(`\nBumped to ${next}. Update CHANGELOG.md, commit, then:`)
console.log(`  git tag -a v${next} -m "v${next}"`)
console.log(`  git push origin main --tags`)
