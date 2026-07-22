import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { isAbsolute, normalize, relative, resolve, sep } from 'node:path'
import { HttpError } from './httpError.js'

const ENV_BASENAME_RE = /^\.env(\..+)?$/

/** Hand-rolled dotenv subset: blank lines, `#` comments, `KEY=value`, optional quotes, optional `export ` prefix. No `${VAR}` expansion. */
export function parseDotEnv(content: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    let rest = line
    if (rest.startsWith('export ')) rest = rest.slice(7).trimStart()
    const eq = rest.indexOf('=')
    if (eq <= 0) continue
    const key = rest.slice(0, eq).trim()
    if (!key) continue
    let value = rest.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

/** Top-level files in cwd whose names match `/^\.env(\..+)?$/`, sorted. */
export function listEnvFileCandidates(cwd: string): string[] {
  if (!existsSync(cwd)) return []
  const names: string[] = []
  for (const entry of readdirSync(cwd, { withFileTypes: true })) {
    if (entry.isFile() && ENV_BASENAME_RE.test(entry.name)) names.push(entry.name)
  }
  names.sort()
  return names
}

function assertSafeEnvRel(projectRoot: string, cwd: string, rel: string): string {
  const normalized = normalize(rel)
  if (isAbsolute(normalized) || normalized.split(sep).includes('..') || normalized.split('/').includes('..')) {
    throw new HttpError(400, `Invalid env file path: ${rel}`)
  }
  const resolved = resolve(cwd, normalized)
  const root = resolve(projectRoot)
  const relToRoot = relative(root, resolved)
  if (!relToRoot || relToRoot.startsWith('..') || isAbsolute(relToRoot)) {
    throw new HttpError(400, `Env file path escapes project root: ${rel}`)
  }
  return resolved
}

/**
 * Resolve, read, and parse env files in order. Later files win on duplicate keys.
 * Missing files are skipped. Path escape throws HttpError(400).
 */
export function loadActionEnvFiles(
  projectRoot: string,
  cwd: string,
  relPaths: string[],
): Record<string, string> {
  const merged: Record<string, string> = {}
  for (const rel of relPaths) {
    const abs = assertSafeEnvRel(projectRoot, cwd, rel)
    if (!existsSync(abs)) continue
    const parsed = parseDotEnv(readFileSync(abs, 'utf8'))
    Object.assign(merged, parsed)
  }
  return merged
}
