import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join, relative, sep } from 'node:path'
import type { DetectedStack } from '@control/shared'

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.turbo',
  '.cache',
  'target',
  '__pycache__',
  '.venv',
  'venv',
  'vendor',
  'coverage',
])

const PRIMARY_RE = /^(dev|start|serve|watch|preview)(:|$)/i

export interface DetectedAction {
  naturalKey: string
  name: string
  command: string
  type: 'script' | 'compose' | 'custom'
  primary: boolean
  portHint?: number | null
}

export interface DetectedModule {
  relPath: string // '' = root
  name: string
  stacks: DetectedStack[]
  actions: DetectedAction[]
}

/** Detect the package manager for a module, falling back to the project root. */
function detectPackageManager(moduleDir: string, rootDir: string): string {
  const check = (dir: string): string | null => {
    if (existsSync(join(dir, 'pnpm-lock.yaml'))) return 'pnpm'
    if (existsSync(join(dir, 'yarn.lock'))) return 'yarn'
    if (existsSync(join(dir, 'bun.lockb'))) return 'bun'
    if (existsSync(join(dir, 'package-lock.json'))) return 'npm'
    return null
  }
  return check(moduleDir) ?? check(rootDir) ?? 'npm'
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

function findComposeFile(dir: string): string | null {
  for (const name of [
    'docker-compose.yml',
    'docker-compose.yaml',
    'compose.yml',
    'compose.yaml',
  ]) {
    if (existsSync(join(dir, name))) return name
  }
  return null
}

/** Detect stacks + actions for a single directory (one module). */
function detectModuleAt(dir: string, rootDir: string): DetectedModule | null {
  const relPath = relative(rootDir, dir).split(sep).join('/')
  const stacks: DetectedStack[] = []
  const actions: DetectedAction[] = []
  const keyPrefix = relPath || '.'

  // --- Node / package.json ---
  const pkgPath = join(dir, 'package.json')
  if (existsSync(pkgPath)) {
    const pkg = readJson(pkgPath)
    const pm = detectPackageManager(dir, rootDir)
    stacks.push({ kind: 'node', packageManager: pm, confidence: 1 })
    const scripts = (pkg?.scripts ?? {}) as Record<string, string>
    for (const scriptName of Object.keys(scripts)) {
      actions.push({
        naturalKey: `${keyPrefix}:script:${scriptName}`,
        name: scriptName,
        command: `${pm} run ${scriptName}`,
        type: 'script',
        primary: PRIMARY_RE.test(scriptName),
      })
    }
  }

  // --- Docker Compose ---
  const compose = findComposeFile(dir)
  if (compose) {
    stacks.push({ kind: 'compose', confidence: 1 })
    actions.push({
      naturalKey: `${keyPrefix}:compose:up`,
      name: 'compose up',
      command: `docker compose -f ${compose} up`,
      type: 'compose',
      primary: true,
    })
    actions.push({
      naturalKey: `${keyPrefix}:compose:down`,
      name: 'compose down',
      command: `docker compose -f ${compose} down`,
      type: 'compose',
      primary: false,
    })
  }

  // --- Makefile ---
  const makefile = join(dir, 'Makefile')
  if (existsSync(makefile)) {
    stacks.push({ kind: 'make', confidence: 0.9 })
    for (const target of parseMakeTargets(makefile)) {
      actions.push({
        naturalKey: `${keyPrefix}:make:${target}`,
        name: `make ${target}`,
        command: `make ${target}`,
        type: 'script',
        primary: PRIMARY_RE.test(target),
      })
    }
  }

  // --- Rust ---
  if (existsSync(join(dir, 'Cargo.toml'))) {
    stacks.push({ kind: 'rust', confidence: 1 })
    actions.push(
      { naturalKey: `${keyPrefix}:cargo:run`, name: 'cargo run', command: 'cargo run', type: 'script', primary: true },
      { naturalKey: `${keyPrefix}:cargo:test`, name: 'cargo test', command: 'cargo test', type: 'script', primary: false },
    )
  }

  // --- Go ---
  if (existsSync(join(dir, 'go.mod'))) {
    stacks.push({ kind: 'go', confidence: 1 })
    actions.push(
      { naturalKey: `${keyPrefix}:go:run`, name: 'go run .', command: 'go run .', type: 'script', primary: true },
      { naturalKey: `${keyPrefix}:go:test`, name: 'go test ./...', command: 'go test ./...', type: 'script', primary: false },
    )
  }

  // --- Python ---
  if (existsSync(join(dir, 'pyproject.toml'))) {
    const runner = existsSync(join(dir, 'uv.lock'))
      ? 'uv run'
      : existsSync(join(dir, 'poetry.lock'))
        ? 'poetry run'
        : null
    stacks.push({ kind: 'python', packageManager: runner ?? undefined, confidence: 0.8 })
    if (existsSync(join(dir, 'manage.py'))) {
      actions.push({
        naturalKey: `${keyPrefix}:django:runserver`,
        name: 'runserver',
        command: `${runner ? runner + ' ' : ''}python manage.py runserver`,
        type: 'script',
        primary: true,
      })
    }
  }

  if (stacks.length === 0) return null
  return {
    relPath,
    name: relPath === '' ? basename(dir) : relPath,
    stacks,
    actions,
  }
}

function parseMakeTargets(makefilePath: string): string[] {
  try {
    const content = readFileSync(makefilePath, 'utf8')
    const targets = new Set<string>()
    for (const line of content.split('\n')) {
      const m = /^([a-zA-Z][\w-]*)\s*:/.exec(line)
      if (m && m[1] && !line.includes('=')) targets.add(m[1])
    }
    return [...targets]
  } catch {
    return []
  }
}

/**
 * Scan a project root: the root itself is always a module; nested sub-apps are
 * found by a bounded recursive marker-file walk (workspaces, mobile/, infra/…).
 * Descent stops at ignored dirs and nested git repos (those are other projects).
 */
export function scanProject(rootPath: string, maxDepth = 4): DetectedModule[] {
  const modules: DetectedModule[] = []
  const rootModule = detectModuleAt(rootPath, rootPath)
  if (rootModule) modules.push(rootModule)

  const walk = (dir: string, depth: number): void => {
    if (depth > maxDepth) return
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const entry of entries) {
      if (IGNORE_DIRS.has(entry)) continue
      const full = join(dir, entry)
      let isDir = false
      try {
        isDir = statSync(full).isDirectory()
      } catch {
        continue
      }
      if (!isDir) continue
      // A nested .git marks a separate project — do not descend or claim it.
      if (existsSync(join(full, '.git'))) continue

      const detected = detectModuleAt(full, rootPath)
      if (detected) modules.push(detected)
      walk(full, depth + 1)
    }
  }

  walk(rootPath, 1)
  return modules
}
