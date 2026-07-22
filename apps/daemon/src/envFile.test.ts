import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HttpError } from './registry.js'
import { listEnvFileCandidates, loadActionEnvFiles, parseDotEnv } from './envFile.js'

describe('parseDotEnv', () => {
  it('parses KEY=value', () => {
    expect(parseDotEnv('FOO=bar')).toEqual({ FOO: 'bar' })
  })

  it('ignores comments and blank lines', () => {
    expect(parseDotEnv('# comment\n\nFOO=bar\n')).toEqual({ FOO: 'bar' })
  })

  it('strips export prefix', () => {
    expect(parseDotEnv('export FOO=bar')).toEqual({ FOO: 'bar' })
  })

  it('strips single and double quotes around values', () => {
    expect(parseDotEnv('FOO="b a r"\nBAR=\'x y\'')).toEqual({ FOO: 'b a r', BAR: 'x y' })
  })

  it('does not expand ${VAR} interpolations', () => {
    expect(parseDotEnv('FOO=${BAR}\nBAR=baz')).toEqual({ FOO: '${BAR}', BAR: 'baz' })
  })
})

describe('listEnvFileCandidates', () => {
  it('lists only .env* basenames, sorted', () => {
    const dir = mkdtempSync(join(tmpdir(), 'control-env-'))
    writeFileSync(join(dir, '.env'), 'A=1')
    writeFileSync(join(dir, '.env.local'), 'B=2')
    writeFileSync(join(dir, '.env.development'), 'C=3')
    writeFileSync(join(dir, 'env.txt'), 'D=4')
    mkdirSync(join(dir, '.env.dir'))
    expect(listEnvFileCandidates(dir)).toEqual(['.env', '.env.development', '.env.local'])
  })
})

describe('loadActionEnvFiles', () => {
  it('merges files in order so later wins on duplicate keys', () => {
    // Merge order for spawn: process.env → files (A then B) → runtimeEnv → overrides.
    const root = mkdtempSync(join(tmpdir(), 'control-env-root-'))
    const cwd = join(root, 'app')
    mkdirSync(cwd)
    writeFileSync(join(cwd, '.env'), 'FOO=from-a\nSHARED=a')
    writeFileSync(join(cwd, '.env.local'), 'FOO=from-b\nSHARED=b')
    expect(loadActionEnvFiles(root, cwd, ['.env', '.env.local'])).toEqual({
      FOO: 'from-b',
      SHARED: 'b',
    })
  })

  it('skips missing files silently', () => {
    const root = mkdtempSync(join(tmpdir(), 'control-env-miss-'))
    writeFileSync(join(root, '.env'), 'FOO=1')
    expect(loadActionEnvFiles(root, root, ['.env', '.env.missing'])).toEqual({ FOO: '1' })
  })

  it('rejects .. segments', () => {
    const root = mkdtempSync(join(tmpdir(), 'control-env-dotdot-'))
    expect(() => loadActionEnvFiles(root, root, ['../.env'])).toThrow(HttpError)
    try {
      loadActionEnvFiles(root, root, ['../.env'])
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError)
      expect((err as HttpError).status).toBe(400)
    }
  })

  it('rejects absolute paths', () => {
    const root = mkdtempSync(join(tmpdir(), 'control-env-abs-'))
    const abs = join(root, '.env')
    expect(() => loadActionEnvFiles(root, root, [abs])).toThrow(HttpError)
  })

  it('rejects paths that escape the project root', () => {
    const parent = mkdtempSync(join(tmpdir(), 'control-env-esc-'))
    const root = join(parent, 'project')
    const outside = join(parent, 'outside.env')
    mkdirSync(root)
    writeFileSync(outside, 'SECRET=1')
    // Nested cwd under root; relative path that resolves outside root via symlink-like name
    // is blocked by .. check. Also reject module-relative path that lands outside after resolve.
    const nested = join(root, 'pkg')
    mkdirSync(nested)
    expect(() => loadActionEnvFiles(root, nested, ['../../outside.env'])).toThrow(HttpError)
  })
})
