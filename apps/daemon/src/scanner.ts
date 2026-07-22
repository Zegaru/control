import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join, relative, sep } from 'node:path'
import { DEFAULT_IGNORE_GLOBS, type DetectedStack } from '@control/shared'

const PRIMARY_RE = /^(dev|start|serve|watch|preview)(:|$)/i

/** Convert a simple glob (`*`, `**`, `?`) into a RegExp. */
function globToRegExp(glob: string): RegExp {
  const normalized = glob.replace(/\\/g, '/')
  let out = '^'
  for (let i = 0; i < normalized.length; i++) {
    const c = normalized[i]!
    if (c === '*') {
      if (normalized[i + 1] === '*') {
        out += '.*'
        i++
        if (normalized[i + 1] === '/') i++
      } else {
        out += '[^/]*'
      }
    } else if (c === '?') {
      out += '[^/]'
    } else if ('.+^${}()|[]\\'.includes(c)) {
      out += `\\${c}`
    } else {
      out += c
    }
  }
  out += '$'
  return new RegExp(out, 'i')
}

/** Match basename or posix-relative path against ignore patterns. */
export function matchesIgnore(entryName: string, relPosix: string, patterns: string[]): boolean {
  for (const raw of patterns) {
    const p = raw.trim()
    if (!p) continue
    if (!p.includes('*') && !p.includes('?') && !p.includes('/')) {
      if (entryName === p) return true
      continue
    }
    const re = globToRegExp(p)
    if (re.test(entryName) || re.test(relPosix)) return true
  }
  return false
}

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

function existsInDir(dir: string, name: string): boolean {
  return existsSync(join(dir, name))
}

function findFileEnding(dir: string, suffix: string): string | null {
  try {
    for (const name of readdirSync(dir)) {
      if (name.endsWith(suffix)) return name
    }
  } catch {
    /* unreadable dir */
  }
  return null
}

function hasTerraformFiles(dir: string): boolean {
  try {
    return readdirSync(dir).some((name) => name.endsWith('.tf'))
  } catch {
    return false
  }
}

function gradleWrapperCommand(dir: string): string {
  if (process.platform === 'win32') {
    return existsInDir(dir, 'gradlew.bat') ? 'gradlew.bat' : 'gradle'
  }
  return existsInDir(dir, 'gradlew') ? './gradlew' : 'gradle'
}

function slugifyLaunchName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, '-')
}

function joinLaunchCommand(executable: string, args: string[]): string {
  const quoted = args.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg))
  return [executable, ...quoted].join(' ')
}

/** Parse `.claude/launch.json` into primary script actions (no env/cwd import). */
function parseClaudeLaunchActions(
  dir: string,
  keyPrefix: string,
): { stack: boolean; actions: DetectedAction[] } {
  const launchPath = join(dir, '.claude', 'launch.json')
  const data = readJson(launchPath)
  if (!data) return { stack: false, actions: [] }

  const actions: DetectedAction[] = []
  const configs = data.configurations
  if (!Array.isArray(configs)) return { stack: true, actions }

  for (const raw of configs) {
    if (!raw || typeof raw !== 'object') continue
    const cfg = raw as Record<string, unknown>
    const name = typeof cfg.name === 'string' ? cfg.name.trim() : ''
    const runtimeExecutable =
      typeof cfg.runtimeExecutable === 'string' ? cfg.runtimeExecutable.trim() : ''
    if (!name || !runtimeExecutable) continue

    const runtimeArgs = Array.isArray(cfg.runtimeArgs)
      ? cfg.runtimeArgs.filter((a): a is string => typeof a === 'string')
      : []
    const slug = slugifyLaunchName(name)
    const action: DetectedAction = {
      naturalKey: `${keyPrefix}:claude-launch:${slug}`,
      name,
      command: joinLaunchCommand(runtimeExecutable, runtimeArgs),
      type: 'script',
      primary: true,
    }
    if (typeof cfg.port === 'number' && Number.isFinite(cfg.port) && cfg.port > 0) {
      action.portHint = cfg.port
    }
    actions.push(action)
  }

  return { stack: true, actions }
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
      const quoted = scriptName.includes(':') ? `"${scriptName}"` : scriptName
      actions.push({
        naturalKey: `${keyPrefix}:script:${scriptName}`,
        name: scriptName,
        command: `${pm} run ${quoted}`,
        type: 'script',
        primary: PRIMARY_RE.test(scriptName),
      })
    }
  }

  // --- Deno ---
  const denoConfigPath = existsInDir(dir, 'deno.json')
    ? join(dir, 'deno.json')
    : existsInDir(dir, 'deno.jsonc')
      ? join(dir, 'deno.jsonc')
      : null
  if (denoConfigPath) {
    stacks.push({ kind: 'deno', confidence: 1 })
    const denoCfg = readJson(denoConfigPath)
    const tasks = (denoCfg?.tasks ?? {}) as Record<string, string>
    for (const taskName of Object.keys(tasks)) {
      actions.push({
        naturalKey: `${keyPrefix}:deno:task:${taskName}`,
        name: taskName,
        command: `deno task ${taskName}`,
        type: 'script',
        primary: PRIMARY_RE.test(taskName),
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

  // --- Java / Kotlin (Maven) ---
  if (existsInDir(dir, 'pom.xml')) {
    stacks.push({ kind: 'maven', confidence: 1 })
    actions.push(
      {
        naturalKey: `${keyPrefix}:mvn:spring-boot:run`,
        name: 'mvn spring-boot:run',
        command: 'mvn spring-boot:run',
        type: 'script',
        primary: true,
      },
      {
        naturalKey: `${keyPrefix}:mvn:test`,
        name: 'mvn test',
        command: 'mvn test',
        type: 'script',
        primary: false,
      },
    )
  }

  // --- Java / Kotlin (Gradle) ---
  if (existsInDir(dir, 'build.gradle') || existsInDir(dir, 'build.gradle.kts')) {
    const gradle = gradleWrapperCommand(dir)
    stacks.push({ kind: 'gradle', confidence: 1 })
    actions.push(
      {
        naturalKey: `${keyPrefix}:gradle:bootRun`,
        name: 'gradle bootRun',
        command: `${gradle} bootRun`,
        type: 'script',
        primary: true,
      },
      {
        naturalKey: `${keyPrefix}:gradle:test`,
        name: 'gradle test',
        command: `${gradle} test`,
        type: 'script',
        primary: false,
      },
    )
  }

  // --- Dart / Flutter ---
  if (existsInDir(dir, 'pubspec.yaml')) {
    const flutter =
      existsInDir(dir, 'android') ||
      existsInDir(dir, 'ios') ||
      existsInDir(dir, 'macos') ||
      existsInDir(dir, 'web')
    stacks.push({ kind: flutter ? 'flutter' : 'dart', confidence: 1 })
    if (flutter) {
      actions.push({
        naturalKey: `${keyPrefix}:flutter:run`,
        name: 'flutter run',
        command: 'flutter run',
        type: 'script',
        primary: true,
      })
    } else {
      actions.push({
        naturalKey: `${keyPrefix}:dart:run`,
        name: 'dart run',
        command: 'dart run',
        type: 'script',
        primary: true,
      })
    }
  }

  // --- Ruby ---
  if (existsInDir(dir, 'Gemfile')) {
    stacks.push({ kind: 'ruby', packageManager: 'bundler', confidence: 1 })
    if (existsInDir(dir, 'config/application.rb')) {
      actions.push({
        naturalKey: `${keyPrefix}:rails:server`,
        name: 'rails server',
        command: 'bundle exec rails server',
        type: 'script',
        primary: true,
      })
    }
  }

  // --- PHP ---
  const composerPath = join(dir, 'composer.json')
  if (existsSync(composerPath)) {
    const composer = readJson(composerPath)
    stacks.push({ kind: 'php', confidence: 1 })
    const scripts = (composer?.scripts ?? {}) as Record<string, unknown>
    for (const scriptName of Object.keys(scripts)) {
      actions.push({
        naturalKey: `${keyPrefix}:composer:${scriptName}`,
        name: scriptName,
        command: `composer run-script ${scriptName}`,
        type: 'script',
        primary: PRIMARY_RE.test(scriptName),
      })
    }
    if (existsInDir(dir, 'artisan')) {
      actions.push({
        naturalKey: `${keyPrefix}:artisan:serve`,
        name: 'artisan serve',
        command: 'php artisan serve',
        type: 'script',
        primary: true,
      })
    }
  }

  // --- Elixir ---
  if (existsInDir(dir, 'mix.exs')) {
    stacks.push({ kind: 'elixir', confidence: 1 })
    actions.push(
      {
        naturalKey: `${keyPrefix}:mix:phx.server`,
        name: 'mix phx.server',
        command: 'mix phx.server',
        type: 'script',
        primary: true,
      },
      {
        naturalKey: `${keyPrefix}:mix:test`,
        name: 'mix test',
        command: 'mix test',
        type: 'script',
        primary: false,
      },
    )
  }

  // --- Scala ---
  if (existsInDir(dir, 'build.sbt')) {
    stacks.push({ kind: 'scala', confidence: 1 })
    actions.push({
      naturalKey: `${keyPrefix}:sbt:run`,
      name: 'sbt run',
      command: 'sbt run',
      type: 'script',
      primary: true,
    })
  }

  // --- Haskell ---
  if (existsInDir(dir, 'stack.yaml')) {
    stacks.push({ kind: 'haskell', packageManager: 'stack', confidence: 1 })
    actions.push({
      naturalKey: `${keyPrefix}:stack:run`,
      name: 'stack run',
      command: 'stack run',
      type: 'script',
      primary: true,
    })
  } else if (existsInDir(dir, 'package.yaml') || findFileEnding(dir, '.cabal')) {
    stacks.push({ kind: 'haskell', packageManager: 'cabal', confidence: 0.9 })
  }

  // --- Zig ---
  if (existsInDir(dir, 'build.zig')) {
    stacks.push({ kind: 'zig', confidence: 1 })
    actions.push({
      naturalKey: `${keyPrefix}:zig:run`,
      name: 'zig build run',
      command: 'zig build run',
      type: 'script',
      primary: true,
    })
  }

  // --- Swift ---
  if (existsInDir(dir, 'Package.swift')) {
    stacks.push({ kind: 'swift', confidence: 1 })
    actions.push({
      naturalKey: `${keyPrefix}:swift:run`,
      name: 'swift run',
      command: 'swift run',
      type: 'script',
      primary: true,
    })
  }

  // --- CMake ---
  if (existsInDir(dir, 'CMakeLists.txt')) {
    stacks.push({ kind: 'cmake', confidence: 0.9 })
  }

  // --- Terraform ---
  if (hasTerraformFiles(dir)) {
    stacks.push({ kind: 'terraform', confidence: 0.9 })
  }

  // --- Nix ---
  if (existsInDir(dir, 'flake.nix')) {
    stacks.push({ kind: 'nix', confidence: 1 })
    actions.push({
      naturalKey: `${keyPrefix}:nix:develop`,
      name: 'nix develop',
      command: 'nix develop',
      type: 'script',
      primary: false,
    })
  }

  // --- just ---
  if (existsInDir(dir, 'justfile') || existsInDir(dir, 'Justfile')) {
    stacks.push({ kind: 'just', confidence: 0.9 })
  }

  // --- Task ---
  if (
    existsInDir(dir, 'Taskfile.yml') ||
    existsInDir(dir, 'Taskfile.yaml') ||
    existsInDir(dir, 'taskfile.yml')
  ) {
    stacks.push({ kind: 'task', confidence: 0.9 })
  }

  // --- Expo ---
  const appJson = readJson(join(dir, 'app.json'))
  if (appJson?.expo || existsInDir(dir, 'eas.json')) {
    stacks.push({ kind: 'expo', confidence: 1 })
    actions.push({
      naturalKey: `${keyPrefix}:expo:start`,
      name: 'expo start',
      command: 'npx expo start',
      type: 'script',
      primary: true,
    })
  }

  // --- .NET ---
  let dotnetProject: string | null = null
  let hasSln = false
  try {
    for (const name of readdirSync(dir)) {
      if (!dotnetProject && (name.endsWith('.csproj') || name.endsWith('.fsproj'))) {
        dotnetProject = name
      }
      if (name.endsWith('.sln')) hasSln = true
    }
  } catch {
    /* unreadable dir */
  }
  if (dotnetProject) {
    stacks.push({ kind: 'dotnet', confidence: 1 })
    actions.push(
      {
        naturalKey: `${keyPrefix}:dotnet:run`,
        name: 'dotnet run',
        command: `dotnet run --project ${dotnetProject}`,
        type: 'script',
        primary: true,
      },
      {
        naturalKey: `${keyPrefix}:dotnet:watch`,
        name: 'dotnet watch',
        command: `dotnet watch --project ${dotnetProject} run`,
        type: 'script',
        primary: false,
      },
    )
  } else if (hasSln) {
    stacks.push({ kind: 'dotnet', confidence: 1 })
  }

  // --- Python ---
  const hasPyproject = existsInDir(dir, 'pyproject.toml')
  const hasPipfile = existsInDir(dir, 'Pipfile')
  const hasRequirements = existsInDir(dir, 'requirements.txt')
  const hasSetupPy = existsInDir(dir, 'setup.py')
  const hasManagePy = existsInDir(dir, 'manage.py')
  if (hasPyproject || hasPipfile || hasRequirements || hasSetupPy || hasManagePy) {
    const runner = existsInDir(dir, 'uv.lock')
      ? 'uv run'
      : existsInDir(dir, 'poetry.lock')
        ? 'poetry run'
        : hasPipfile
          ? 'pipenv run'
          : null
    stacks.push({
      kind: 'python',
      packageManager: runner ?? undefined,
      confidence: hasPyproject ? 0.8 : 0.7,
    })
    if (hasManagePy) {
      actions.push({
        naturalKey: `${keyPrefix}:django:runserver`,
        name: 'runserver',
        command: `${runner ? `${runner} ` : ''}python manage.py runserver`,
        type: 'script',
        primary: true,
      })
    }
  }

  // --- Claude Code launch.json ---
  const claudeLaunch = parseClaudeLaunchActions(dir, keyPrefix)
  if (claudeLaunch.stack) {
    stacks.push({ kind: 'claude-launch', confidence: 1 })
    actions.push(...claudeLaunch.actions)
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
export function scanProject(
  rootPath: string,
  maxDepth = 4,
  ignoreGlobs: readonly string[] = DEFAULT_IGNORE_GLOBS,
): DetectedModule[] {
  const modules: DetectedModule[] = []
  const patterns = [...ignoreGlobs]
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
      const full = join(dir, entry)
      const relPosix = relative(rootPath, full).split(sep).join('/')
      if (matchesIgnore(entry, relPosix, patterns)) continue
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
